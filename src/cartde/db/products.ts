import type { z } from "zod";
import type { productInput, stockAdjustmentInput, variantInput } from "../domain/schemas";
import { applyStockDelta, InventoryError } from "../domain/inventory";
import { uniqueSlug } from "../domain/slug";
import { validateOptions, variantTitle } from "../domain/variants";
import { CartdeError, isUniqueViolation, newId, nowIso } from "./util";

type ProductInput = z.infer<typeof productInput>;
type VariantInput = z.infer<typeof variantInput>;

export interface ProductSummary {
	id: string;
	name: string;
	slug: string;
	status: "draft" | "active" | "archived";
	featured_media_id: string | null;
	updated_at: string;
	variant_count: number;
	min_price_minor: number | null;
	total_stock: number;
}

export interface VariantRow {
	id: string;
	title: string;
	sku: string | null;
	price_minor: number;
	compare_at_minor: number | null;
	stock_qty: number;
	status: "active" | "inactive";
	position: number;
	option_values: string[];
}

export interface ProductDetail {
	id: string;
	name: string;
	slug: string;
	description_md: string;
	status: "draft" | "active" | "archived";
	featured_media_id: string | null;
	seo_title: string | null;
	seo_description: string | null;
	published_at: string | null;
	category_ids: string[];
	options: { id: string; name: string; values: { id: string; value: string }[] }[];
	variants: VariantRow[];
}

const uniqueConflict = (err: unknown): never => {
	if (isUniqueViolation(err)) {
		const sku = err instanceof Error && /sku/i.test(err.message);
		throw new CartdeError("conflict", sku ? "This SKU is already in use." : "This slug is already in use.", {
			[sku ? "sku" : "slug"]: "Already in use.",
		});
	}
	throw err;
};

async function takenSlugs(db: D1Database): Promise<Set<string>> {
	const { results } = await db.prepare(`SELECT slug FROM cartde_products`).all<{ slug: string }>();
	return new Set(results.map((r) => r.slug));
}

export async function listProducts(
	db: D1Database,
	opts: { search?: string; status?: string; limit?: number; offset?: number } = {},
): Promise<ProductSummary[]> {
	const like = opts.search ? `%${opts.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
	const { results } = await db
		.prepare(
			`SELECT p.id, p.name, p.slug, p.status, p.featured_media_id, p.updated_at,
			        COUNT(v.id) AS variant_count, MIN(v.price_minor) AS min_price_minor, COALESCE(SUM(v.stock_qty), 0) AS total_stock
			 FROM cartde_products p LEFT JOIN cartde_variants v ON v.product_id = p.id
			 WHERE (?1 IS NULL OR p.name LIKE ?1 ESCAPE '\\' OR p.slug LIKE ?1 ESCAPE '\\')
			   AND (?2 IS NULL OR p.status = ?2)
			 GROUP BY p.id ORDER BY p.updated_at DESC LIMIT ?3 OFFSET ?4`,
		)
		.bind(like, opts.status ?? null, Math.min(opts.limit ?? 50, 200), opts.offset ?? 0)
		.all<ProductSummary>();
	return results;
}

export async function getProduct(db: D1Database, id: string): Promise<ProductDetail> {
	const row = await db.prepare(`SELECT * FROM cartde_products WHERE id = ?1`).bind(id).first<Omit<ProductDetail, "category_ids" | "options" | "variants">>();
	if (!row) throw new CartdeError("not_found", "Product not found.");
	return hydrate(db, row);
}

export async function getActiveProductBySlug(db: D1Database, slug: string): Promise<ProductDetail | null> {
	const row = await db.prepare(`SELECT * FROM cartde_products WHERE slug = ?1 AND status = 'active'`).bind(slug).first<Omit<ProductDetail, "category_ids" | "options" | "variants">>();
	if (!row) return null;
	const detail = await hydrate(db, row);
	detail.variants = detail.variants.filter((v) => v.status === "active");
	return detail.variants.length ? detail : null; // FR-CAT-5
}

async function hydrate(db: D1Database, row: Omit<ProductDetail, "category_ids" | "options" | "variants">): Promise<ProductDetail> {
	const [cats, opts, vals, vars, links] = await db.batch([
		db.prepare(`SELECT category_id FROM cartde_product_categories WHERE product_id = ?1`).bind(row.id),
		db.prepare(`SELECT id, name FROM cartde_product_options WHERE product_id = ?1 ORDER BY position`).bind(row.id),
		db.prepare(`SELECT ov.id, ov.option_id, ov.value FROM cartde_product_option_values ov JOIN cartde_product_options o ON o.id = ov.option_id WHERE o.product_id = ?1 ORDER BY ov.position`).bind(row.id),
		db.prepare(`SELECT id, title, sku, price_minor, compare_at_minor, stock_qty, status, position FROM cartde_variants WHERE product_id = ?1 ORDER BY position`).bind(row.id),
		db.prepare(`SELECT vov.variant_id, ov.value, o.position AS opos FROM cartde_variant_option_values vov JOIN cartde_product_option_values ov ON ov.id = vov.option_value_id JOIN cartde_product_options o ON o.id = ov.option_id WHERE o.product_id = ?1 ORDER BY o.position`).bind(row.id),
	]);
	const valuesByVariant = new Map<string, string[]>();
	for (const l of links.results as { variant_id: string; value: string }[]) {
		valuesByVariant.set(l.variant_id, [...(valuesByVariant.get(l.variant_id) ?? []), l.value]);
	}
	return {
		...row,
		category_ids: (cats.results as { category_id: string }[]).map((c) => c.category_id),
		options: (opts.results as { id: string; name: string }[]).map((o) => ({
			...o,
			values: (vals.results as { id: string; option_id: string; value: string }[])
				.filter((v) => v.option_id === o.id)
				.map(({ id, value }) => ({ id, value })),
		})),
		variants: (vars.results as Omit<VariantRow, "option_values">[]).map((v) => ({ ...v, option_values: valuesByVariant.get(v.id) ?? [] })),
	};
}

/** Validate that variants line up with declared options; returns resolved combos or throws. */
function checkVariants(input: ProductInput): void {
	const problems = validateOptions(input.options);
	const seen = new Set<string>();
	input.variants.forEach((v, i) => {
		if (v.option_values.length !== input.options.length) {
			problems.push(`Variant ${i + 1} must pick one value for each of the ${input.options.length} option(s).`);
			return;
		}
		v.option_values.forEach((val, idx) => {
			if (!input.options[idx]!.values.some((x) => x.toLowerCase() === val.toLowerCase())) {
				problems.push(`Variant ${i + 1}: "${val}" is not a value of option "${input.options[idx]!.name}".`);
			}
		});
		const key = v.option_values.join("\u0000").toLowerCase();
		if (seen.has(key)) problems.push(`Variant ${i + 1} duplicates another variant.`);
		seen.add(key);
	});
	const skus = input.variants.map((v) => v.sku).filter((s): s is string => !!s);
	if (new Set(skus).size !== skus.length) problems.push("SKUs must be unique within the product.");
	if (problems.length) throw new CartdeError("invalid", problems[0]!, { variants: problems.join(" ") });
}

export async function createProduct(db: D1Database, input: ProductInput, actorUserId: string | null = null): Promise<ProductDetail> {
	checkVariants(input);
	const id = newId();
	const now = nowIso();
	const slug = input.slug ?? uniqueSlug(input.name, await takenSlugs(db));
	const stmts: D1PreparedStatement[] = [
		db
			.prepare(
				`INSERT INTO cartde_products (id, name, slug, description_md, status, featured_media_id, seo_title, seo_description, published_at, created_at, updated_at)
				 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)`,
			)
			.bind(id, input.name, slug, input.description_md, input.status, input.featured_media_id ?? null, input.seo_title ?? null, input.seo_description ?? null, input.status === "active" ? now : null, now),
	];
	for (const categoryId of input.category_ids) {
		stmts.push(db.prepare(`INSERT INTO cartde_product_categories (product_id, category_id) VALUES (?1,?2)`).bind(id, categoryId));
	}
	const valueIds = new Map<string, string>(); // "optionIndex:value(lower)" -> id
	input.options.forEach((option, oi) => {
		const optionId = newId();
		stmts.push(db.prepare(`INSERT INTO cartde_product_options (id, product_id, name, position) VALUES (?1,?2,?3,?4)`).bind(optionId, id, option.name, oi));
		option.values.forEach((value, vi) => {
			const valueId = newId();
			valueIds.set(`${oi}:${value.toLowerCase()}`, valueId);
			stmts.push(db.prepare(`INSERT INTO cartde_product_option_values (id, option_id, value, position) VALUES (?1,?2,?3,?4)`).bind(valueId, optionId, value, vi));
		});
	});
	input.variants.forEach((v, i) => {
		const variantId = newId();
		stmts.push(
			db
				.prepare(`INSERT INTO cartde_variants (id, product_id, title, sku, price_minor, compare_at_minor, stock_qty, status, position, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)`)
				.bind(variantId, id, variantTitle(v.option_values), v.sku ?? null, v.price_minor, v.compare_at_minor ?? null, v.stock_qty, v.status, i, now),
		);
		v.option_values.forEach((val, oi) => {
			stmts.push(db.prepare(`INSERT INTO cartde_variant_option_values (variant_id, option_value_id) VALUES (?1,?2)`).bind(variantId, valueIds.get(`${oi}:${val.toLowerCase()}`)!));
		});
		if (v.stock_qty > 0) {
			stmts.push(
				db
					.prepare(`INSERT INTO cartde_inventory_events (id, variant_id, delta, reason, actor_user_id, note, created_at) VALUES (?1,?2,?3,'manual',?4,'Initial stock',?5)`)
					.bind(newId(), variantId, v.stock_qty, actorUserId, now),
			);
		}
	});
	try {
		await db.batch(stmts);
	} catch (err) {
		uniqueConflict(err);
	}
	return getProduct(db, id);
}

export async function updateProduct(
	db: D1Database,
	id: string,
	patch: Partial<Pick<ProductInput, "name" | "slug" | "description_md" | "status" | "featured_media_id" | "seo_title" | "seo_description" | "category_ids">>,
): Promise<ProductDetail> {
	const current = await getProduct(db, id);
	const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as ProductDetail;
	if (next.status === "active" && !current.variants.some((v) => v.status === "active")) {
		throw new CartdeError("invalid", "Activate at least one variant before publishing the product.");
	}
	const now = nowIso();
	const publishedAt = next.status === "active" ? (current.published_at ?? now) : current.published_at;
	const stmts = [
		db
			.prepare(`UPDATE cartde_products SET name=?2, slug=?3, description_md=?4, status=?5, featured_media_id=?6, seo_title=?7, seo_description=?8, published_at=?9, updated_at=?10 WHERE id=?1`)
			.bind(id, next.name, next.slug, next.description_md, next.status, next.featured_media_id, next.seo_title, next.seo_description, publishedAt, now),
	];
	if (patch.category_ids) {
		stmts.push(db.prepare(`DELETE FROM cartde_product_categories WHERE product_id = ?1`).bind(id));
		for (const c of patch.category_ids) stmts.push(db.prepare(`INSERT INTO cartde_product_categories (product_id, category_id) VALUES (?1,?2)`).bind(id, c));
	}
	try {
		await db.batch(stmts);
	} catch (err) {
		uniqueConflict(err);
	}
	return getProduct(db, id);
}

/** FR-CAT-8: products with orders cannot be deleted. Orders arrive in 0.3; until then drafts only. */
export async function deleteProduct(db: D1Database, id: string): Promise<void> {
	const product = await getProduct(db, id);
	if (product.status !== "draft") throw new CartdeError("conflict", "Only draft products can be deleted; archive it instead.");
	await db.prepare(`DELETE FROM cartde_products WHERE id = ?1`).bind(id).run();
}

async function resolveOptionValueIds(db: D1Database, productId: string, values: string[]): Promise<{ ids: string[]; creates: D1PreparedStatement[] }> {
	const product = await getProduct(db, productId);
	if (values.length !== product.options.length) {
		throw new CartdeError("invalid", `Pick one value for each of the ${product.options.length} option(s).`);
	}
	const ids: string[] = [];
	const creates: D1PreparedStatement[] = [];
	values.forEach((val, i) => {
		const option = product.options[i]!;
		const found = option.values.find((v) => v.value.toLowerCase() === val.toLowerCase());
		if (found) return ids.push(found.id);
		const valueId = newId();
		creates.push(db.prepare(`INSERT INTO cartde_product_option_values (id, option_id, value, position) VALUES (?1,?2,?3,?4)`).bind(valueId, option.id, val, option.values.length));
		ids.push(valueId);
	});
	const key = (vs: string[]) => vs.join("\u0000").toLowerCase();
	if (product.variants.some((v) => key(v.option_values) === key(values))) {
		throw new CartdeError("conflict", "A variant with these option values already exists.");
	}
	return { ids, creates };
}

export async function addVariant(db: D1Database, productId: string, input: VariantInput, actorUserId: string | null = null): Promise<ProductDetail> {
	const product = await getProduct(db, productId);
	if (product.variants.length >= 100) throw new CartdeError("invalid", "A product can have at most 100 variants.");
	const { ids, creates } = await resolveOptionValueIds(db, productId, input.option_values);
	const variantId = newId();
	const now = nowIso();
	const stmts = [
		...creates,
		db
			.prepare(`INSERT INTO cartde_variants (id, product_id, title, sku, price_minor, compare_at_minor, stock_qty, status, position, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)`)
			.bind(variantId, productId, variantTitle(input.option_values), input.sku ?? null, input.price_minor, input.compare_at_minor ?? null, input.stock_qty, input.status, product.variants.length, now),
		...ids.map((valueId) => db.prepare(`INSERT INTO cartde_variant_option_values (variant_id, option_value_id) VALUES (?1,?2)`).bind(variantId, valueId)),
	];
	if (input.stock_qty > 0) {
		stmts.push(db.prepare(`INSERT INTO cartde_inventory_events (id, variant_id, delta, reason, actor_user_id, note, created_at) VALUES (?1,?2,?3,'manual',?4,'Initial stock',?5)`).bind(newId(), variantId, input.stock_qty, actorUserId, now));
	}
	try {
		await db.batch(stmts);
	} catch (err) {
		uniqueConflict(err);
	}
	return getProduct(db, productId);
}

/** Update price, compare-at, SKU and status. Stock changes go through adjustStock so events stay reconcilable. */
export async function updateVariant(
	db: D1Database,
	variantId: string,
	patch: Partial<Pick<VariantInput, "sku" | "price_minor" | "compare_at_minor" | "status">>,
): Promise<void> {
	const cur = await db.prepare(`SELECT * FROM cartde_variants WHERE id = ?1`).bind(variantId).first<VariantRow & { product_id: string }>();
	if (!cur) throw new CartdeError("not_found", "Variant not found.");
	const price = patch.price_minor ?? cur.price_minor;
	const compare = patch.compare_at_minor === undefined ? cur.compare_at_minor : patch.compare_at_minor;
	if (compare != null && compare < price) throw new CartdeError("invalid", "Compare-at price must not be below the price.", { compare_at_minor: "Below price." });
	const status = patch.status ?? cur.status;
	if (status === "inactive" && cur.status === "active") {
		const product = await db.prepare(`SELECT status FROM cartde_products WHERE id = ?1`).bind(cur.product_id).first<{ status: string }>();
		const { results } = await db.prepare(`SELECT id FROM cartde_variants WHERE product_id = ?1 AND status = 'active' AND id != ?2`).bind(cur.product_id, variantId).all();
		if (product?.status === "active" && results.length === 0) {
			throw new CartdeError("invalid", "An active product needs at least one active variant.");
		}
	}
	try {
		await db
			.prepare(`UPDATE cartde_variants SET sku=?2, price_minor=?3, compare_at_minor=?4, status=?5, updated_at=?6 WHERE id=?1`)
			.bind(variantId, patch.sku === undefined ? cur.sku : patch.sku, price, compare, status, nowIso())
			.run();
	} catch (err) {
		uniqueConflict(err);
	}
}

export async function deleteVariant(db: D1Database, variantId: string): Promise<void> {
	const cur = await db.prepare(`SELECT product_id FROM cartde_variants WHERE id = ?1`).bind(variantId).first<{ product_id: string }>();
	if (!cur) throw new CartdeError("not_found", "Variant not found.");
	const { results } = await db.prepare(`SELECT id FROM cartde_variants WHERE product_id = ?1`).bind(cur.product_id).all();
	if (results.length <= 1) throw new CartdeError("invalid", "A product must keep at least one variant.");
	await db.prepare(`DELETE FROM cartde_variants WHERE id = ?1`).bind(variantId).run();
}

/** FR-CAT-6: conditional update plus event row in one batch; the event is written only if stock changed. */
export async function adjustStock(
	db: D1Database,
	variantId: string,
	input: z.infer<typeof stockAdjustmentInput>,
	actorUserId: string | null,
): Promise<{ stock_qty: number }> {
	const cur = await db.prepare(`SELECT stock_qty FROM cartde_variants WHERE id = ?1`).bind(variantId).first<{ stock_qty: number }>();
	if (!cur) throw new CartdeError("not_found", "Variant not found.");
	try {
		applyStockDelta(cur.stock_qty, input.delta);
	} catch (err) {
		if (err instanceof InventoryError) throw new CartdeError("invalid", err.message, { delta: err.message });
		throw err;
	}
	const now = nowIso();
	const [upd] = await db.batch([
		db.prepare(`UPDATE cartde_variants SET stock_qty = stock_qty + ?2, updated_at = ?3 WHERE id = ?1 AND stock_qty + ?2 >= 0`).bind(variantId, input.delta, now),
		db
			.prepare(`INSERT INTO cartde_inventory_events (id, variant_id, delta, reason, actor_user_id, note, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE changes() > 0`)
			.bind(newId(), variantId, input.delta, input.reason, actorUserId, input.note ?? null, now),
	]);
	if (!upd!.meta.changes) throw new CartdeError("conflict", "Stock changed concurrently; reload and try again.");
	const after = await db.prepare(`SELECT stock_qty FROM cartde_variants WHERE id = ?1`).bind(variantId).first<{ stock_qty: number }>();
	return { stock_qty: after!.stock_qty };
}
