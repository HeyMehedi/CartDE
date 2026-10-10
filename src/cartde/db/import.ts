import { csvRecords } from "../domain/csv";
import { parseMajorToMinor } from "../domain/money";
import { productInput } from "../domain/schemas";
import { slugify } from "../domain/slug";
import { createProduct } from "./products";
import { CartdeError } from "./util";

/**
 * Product CSV import (PRD PR-CAT-10). One row per variant; rows with the same `slug` (or name) form one product.
 * Columns: slug, name, description, status, category (slug), option1_name, option1_value, option2_name, option2_value,
 * option3_name, option3_value, sku, price, compare_at, stock. Prices are in major units ("1250.50").
 * Only creates new products; an existing slug is reported, never overwritten.
 */
export const IMPORT_COLUMNS = [
	"slug",
	"name",
	"description",
	"status",
	"category",
	"option1_name",
	"option1_value",
	"option2_name",
	"option2_value",
	"option3_name",
	"option3_value",
	"sku",
	"price",
	"compare_at",
	"stock",
] as const;
export const MAX_IMPORT_ROWS = 500;

export interface ImportReport {
	dry_run: boolean;
	products: { slug: string; name: string; variants: number; status: "ok" | "created" | "error"; errors: string[] }[];
	created: number;
	failed: number;
}

export async function importProductsCsv(
	db: D1Database,
	csv: string,
	opts: { dryRun: boolean; actorUserId: string | null },
): Promise<ImportReport> {
	let parsed: ReturnType<typeof csvRecords>;
	try {
		parsed = csvRecords(csv);
	} catch (err) {
		throw new CartdeError("invalid", (err as Error).message);
	}
	const { headers, records } = parsed;
	for (const required of ["name", "price"])
		if (!headers.includes(required)) throw new CartdeError("invalid", `The CSV needs a "${required}" column.`);
	if (records.length === 0) throw new CartdeError("invalid", "The CSV has no rows.");
	if (records.length > MAX_IMPORT_ROWS) throw new CartdeError("invalid", `Import at most ${MAX_IMPORT_ROWS} rows at a time.`);

	const [existing, categories] = await db.batch([
		db.prepare(`SELECT slug FROM cartde_products`),
		db.prepare(`SELECT id, slug FROM cartde_categories`),
	]);
	const taken = new Set((existing.results as { slug: string }[]).map((r) => r.slug));
	const categoryBySlug = new Map((categories.results as { id: string; slug: string }[]).map((c) => [c.slug, c.id]));

	// Group rows by product, remembering the CSV line for messages (line 1 is the header).
	const groups = new Map<string, { rows: { line: number; r: Record<string, string> }[] }>();
	records.forEach((r, i) => {
		const key = r.slug || slugify(r.name ?? "") || `row-${i + 2}`;
		const group = groups.get(key) ?? { rows: [] };
		group.rows.push({ line: i + 2, r });
		groups.set(key, group);
	});

	const report: ImportReport = { dry_run: opts.dryRun, products: [], created: 0, failed: 0 };
	for (const [slug, { rows }] of groups) {
		const first = rows[0]!.r;
		const errors: string[] = [];
		const optionNames = [1, 2, 3].map((n) => first[`option${n}_name`] ?? "").filter(Boolean);
		const options = optionNames.map((name, idx) => ({
			name,
			values: [...new Set(rows.map(({ r }) => r[`option${idx + 1}_value`] ?? "").filter(Boolean))],
		}));
		const variants = rows.map(({ line, r }) => {
			const price = parseMajorToMinor(r.price ?? "");
			if (price === null) errors.push(`Line ${line}: price "${r.price}" is not a valid amount.`);
			const compare = r.compare_at ? parseMajorToMinor(r.compare_at) : null;
			if (r.compare_at && compare === null) errors.push(`Line ${line}: compare_at "${r.compare_at}" is not a valid amount.`);
			const stock = r.stock ? Number(r.stock) : 0;
			if (!Number.isInteger(stock) || stock < 0) errors.push(`Line ${line}: stock must be a whole number, zero or more.`);
			return {
				option_values: optionNames.map((_, idx) => r[`option${idx + 1}_value`] ?? ""),
				price_minor: price ?? 0,
				compare_at_minor: compare,
				sku: r.sku || null,
				stock_qty: Number.isInteger(stock) && stock >= 0 ? stock : 0,
			};
		});
		if (taken.has(slug)) errors.push(`A product with slug "${slug}" already exists; import only creates new products.`);
		const categoryIds: string[] = [];
		if (first.category) {
			const id = categoryBySlug.get(first.category);
			if (id) categoryIds.push(id);
			else errors.push(`Category "${first.category}" does not exist. Create it first.`);
		}
		const status = first.status || "draft";
		const candidate = productInput.safeParse({
			name: first.name,
			slug,
			description_md: first.description ?? "",
			status,
			category_ids: categoryIds,
			options,
			variants,
		});
		if (!candidate.success)
			for (const issue of candidate.error.issues) errors.push(`${issue.path.join(".") || "product"}: ${issue.message}`);

		const entry = {
			slug,
			name: first.name ?? "",
			variants: variants.length,
			status: "ok" as ImportReport["products"][number]["status"],
			errors,
		};
		if (errors.length === 0 && candidate.success && !opts.dryRun) {
			try {
				await createProduct(db, candidate.data, opts.actorUserId);
				entry.status = "created";
				report.created += 1;
				taken.add(slug);
			} catch (err) {
				entry.errors.push(err instanceof Error ? err.message : "Could not create the product.");
			}
		}
		if (entry.errors.length) {
			entry.status = "error";
			report.failed += 1;
		}
		report.products.push(entry);
	}
	return report;
}
