import type { z } from "zod";
import type { categoryInput } from "../domain/schemas";
import { slugify, uniqueSlug } from "../domain/slug";
import { CartdeError, isUniqueViolation, newId, nowIso } from "./util";

export interface CategoryRow {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	sort_order: number;
}

type Input = z.infer<typeof categoryInput>;

async function takenSlugs(db: D1Database, exceptId?: string): Promise<Set<string>> {
	const { results } = await db
		.prepare(`SELECT slug FROM cartde_categories WHERE id != ?1`)
		.bind(exceptId ?? "")
		.all<{ slug: string }>();
	return new Set(results.map((r) => r.slug));
}

export async function listCategories(db: D1Database): Promise<CategoryRow[]> {
	const { results } = await db
		.prepare(`SELECT id, name, slug, description, sort_order FROM cartde_categories ORDER BY sort_order, name`)
		.all<CategoryRow>();
	return results;
}

export async function createCategory(db: D1Database, input: Input): Promise<CategoryRow> {
	const id = newId();
	const now = nowIso();
	const slug = input.slug ?? uniqueSlug(input.name, await takenSlugs(db));
	try {
		await db
			.prepare(
				`INSERT INTO cartde_categories (id, name, slug, description, sort_order, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)`,
			)
			.bind(id, input.name, slug, input.description ?? null, input.sort_order, now)
			.run();
	} catch (err) {
		if (isUniqueViolation(err)) throw new CartdeError("conflict", "A category with this slug already exists.", { slug: "Already in use." });
		throw err;
	}
	return { id, name: input.name, slug, description: input.description ?? null, sort_order: input.sort_order };
}

export async function updateCategory(db: D1Database, id: string, input: Input): Promise<CategoryRow> {
	const existing = await db.prepare(`SELECT slug FROM cartde_categories WHERE id = ?1`).bind(id).first<{ slug: string }>();
	if (!existing) throw new CartdeError("not_found", "Category not found.");
	const slug = input.slug ?? existing.slug;
	try {
		await db
			.prepare(`UPDATE cartde_categories SET name=?2, slug=?3, description=?4, sort_order=?5, updated_at=?6 WHERE id=?1`)
			.bind(id, input.name, slug, input.description ?? null, input.sort_order, nowIso())
			.run();
	} catch (err) {
		if (isUniqueViolation(err)) throw new CartdeError("conflict", "A category with this slug already exists.", { slug: "Already in use." });
		throw err;
	}
	return { id, name: input.name, slug, description: input.description ?? null, sort_order: input.sort_order };
}

export async function deleteCategory(db: D1Database, id: string): Promise<void> {
	const res = await db.prepare(`DELETE FROM cartde_categories WHERE id = ?1`).bind(id).run();
	if (!res.meta.changes) throw new CartdeError("not_found", "Category not found.");
}

export { slugify };
