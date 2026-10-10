/** Application-layer entry point for pages: binds the D1 database and re-exports read operations. */
import { env } from "cloudflare:workers";
import { listCategories } from "../db/categories";
import { resolveMediaUrls } from "../db/media";
import { getActiveProductBySlug, getProduct, listProducts, type ProductDetail } from "../db/products";
import { getCustomerOrders, getOrder, getOrderForShopper, listCustomers, listOrders, overview } from "../db/orders";
import { getStore } from "../db/store";
import { startOfDayUtc } from "../domain/time";

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

export const STOREFRONT_PAGE_SIZE = 24;

export interface StorefrontProduct { id: string; name: string; slug: string; featured_media_id: string | null; price_minor: number }

/** FR-SF-2: newest first, 24 per page, optional category filter. */
export async function storefrontProducts(opts: { category?: string; page?: number; pageSize?: number } = {}): Promise<{ items: StorefrontProduct[]; total: number; page: number; pageSize: number }> {
	const page = Math.max(1, Math.floor(opts.page ?? 1));
	const pageSize = opts.pageSize ?? STOREFRONT_PAGE_SIZE;
	const filter = `p.status = 'active'
		AND EXISTS (SELECT 1 FROM cartde_variants av WHERE av.product_id = p.id AND av.status = 'active')
		AND (?1 IS NULL OR EXISTS (SELECT 1 FROM cartde_product_categories pc JOIN cartde_categories c ON c.id = pc.category_id WHERE pc.product_id = p.id AND c.slug = ?1))`;
	const [list, count] = await db().batch([
		db().prepare(
			`SELECT p.id, p.name, p.slug, p.featured_media_id, MIN(v.price_minor) AS price_minor
			 FROM cartde_products p JOIN cartde_variants v ON v.product_id = p.id AND v.status = 'active'
			 WHERE ${filter} GROUP BY p.id ORDER BY p.published_at DESC, p.id DESC LIMIT ?2 OFFSET ?3`,
		).bind(opts.category ?? null, pageSize, (page - 1) * pageSize),
		db().prepare(`SELECT COUNT(*) AS n FROM cartde_products p WHERE ${filter}`).bind(opts.category ?? null),
	]);
	return { items: list.results as StorefrontProduct[], total: (count.results[0] as { n: number }).n, page, pageSize };
}

export const storefrontOrder = (orderNumber: number, token: string) => getOrderForShopper(db(), orderNumber, token);

// ---- orders, customers, overview (admin) ----
export const adminOrders = (opts: Parameters<typeof listOrders>[1] = {}) => listOrders(db(), opts);
export const adminOrder = (id: string) => getOrder(db(), id);
export const adminCustomers = (q?: string) => listCustomers(db(), { q });
export const adminCustomer = (id: string) => getCustomerOrders(db(), id);
export async function adminOverview() {
	const store = await getStore(db());
	return overview(db(), startOfDayUtc(store.timezone).toISOString());
}
