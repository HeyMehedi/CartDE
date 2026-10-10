export interface SearchHit {
	id: string;
	name: string;
	slug: string;
	featured_media_id: string | null;
	price_minor: number;
}

export const SEARCH_PAGE_SIZE = 24;
const MAX_TERMS = 4;
const MAX_QUERY = 100;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Split a query into at most 4 terms; every term must match the name, description or a SKU. */
export function searchTerms(query: string): string[] {
	return query.trim().slice(0, MAX_QUERY).split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);
}

/** Storefront product search over active products. Names that start with the phrase rank first. */
export async function searchStorefrontProducts(
	db: D1Database,
	query: string,
	page = 1,
	pageSize = SEARCH_PAGE_SIZE,
): Promise<{ items: SearchHit[]; total: number; page: number; pageSize: number }> {
	const terms = searchTerms(query);
	const safePage = Math.max(1, Math.floor(page));
	if (terms.length === 0) return { items: [], total: 0, page: safePage, pageSize };

	const phrase = terms.join(" ");
	const params: unknown[] = [`${escapeLike(phrase)}%`, `%${escapeLike(phrase)}%`];
	const clauses = terms.map((term) => {
		params.push(`%${escapeLike(term)}%`);
		const n = params.length;
		return `(p.name LIKE ?${n} ESCAPE '\\' OR p.description_md LIKE ?${n} ESCAPE '\\' OR EXISTS (SELECT 1 FROM cartde_variants sv WHERE sv.product_id = p.id AND sv.sku LIKE ?${n} ESCAPE '\\'))`;
	});
	const where = `p.status = 'active' AND ${clauses.join(" AND ")}`;
	const base = `FROM cartde_products p JOIN cartde_variants v ON v.product_id = p.id AND v.status = 'active' WHERE ${where}`;

	const limitIdx = params.length + 1;
	const [list, count] = await db.batch([
		db
			.prepare(
				`SELECT p.id, p.name, p.slug, p.featured_media_id, MIN(v.price_minor) AS price_minor,
				        CASE WHEN p.name LIKE ?1 ESCAPE '\\' THEN 0 WHEN p.name LIKE ?2 ESCAPE '\\' THEN 1 ELSE 2 END AS rank
				 ${base} GROUP BY p.id ORDER BY rank, p.published_at DESC, p.id DESC LIMIT ?${limitIdx} OFFSET ?${limitIdx + 1}`,
			)
			.bind(...params, pageSize, (safePage - 1) * pageSize),
		db.prepare(`SELECT COUNT(DISTINCT p.id) AS n ${base}`).bind(...params),
	]);
	return {
		items: (list.results as (SearchHit & { rank: number })[]).map(({ rank: _rank, ...hit }) => hit),
		total: (count.results[0] as { n: number }).n,
		page: safePage,
		pageSize,
	};
}
