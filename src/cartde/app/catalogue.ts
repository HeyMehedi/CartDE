/** Application-layer entry point for pages: binds the D1 database and re-exports read operations. */
import { env } from "cloudflare:workers";
import { listCategories } from "../db/categories";
import { resolveMediaUrls } from "../db/media";
import { getActiveProductBySlug, getProduct, listProducts, type ProductDetail } from "../db/products";
import { getStore } from "../db/store";

const db = () => env.DB;

export const adminProducts = (opts: Parameters<typeof listProducts>[1] = {}) => listProducts(db(), opts);
export const adminProduct = (id: string) => getProduct(db(), id);
export const adminCategories = () => listCategories(db());
export const adminStore = () => getStore(db());

export async function mediaUrls(ids: string[]): Promise<Map<string, string>> {
	return resolveMediaUrls(db(), ids);
}

/** Storefront read: active products only, unless an admin is previewing a draft (FR-CAT-7). */
export async function storefrontProduct(slug: string, previewAsAdmin: boolean): Promise<ProductDetail | null> {
	const active = await getActiveProductBySlug(db(), slug);
	if (active || !previewAsAdmin) return active;
	const row = await db().prepare(`SELECT id FROM cartde_products WHERE slug = ?1`).bind(slug).first<{ id: string }>();
	return row ? getProduct(db(), row.id) : null;
}

export async function storefrontProducts(categorySlug?: string) {
	const { results } = await db()
		.prepare(
			`SELECT p.id, p.name, p.slug, p.featured_media_id, MIN(v.price_minor) AS price_minor
			 FROM cartde_products p
			 JOIN cartde_variants v ON v.product_id = p.id AND v.status = 'active'
			 WHERE p.status = 'active'
			   AND (?1 IS NULL OR EXISTS (SELECT 1 FROM cartde_product_categories pc JOIN cartde_categories c ON c.id = pc.category_id WHERE pc.product_id = p.id AND c.slug = ?1))
			 GROUP BY p.id ORDER BY p.published_at DESC LIMIT 100`,
		)
		.bind(categorySlug ?? null)
		.all<{ id: string; name: string; slug: string; featured_media_id: string | null; price_minor: number }>();
	return results;
}
