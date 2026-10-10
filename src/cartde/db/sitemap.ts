const xmlEscape = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Sitemap of active products and categories (PRD §7 SEO). Max 50,000 URLs per sitemap file. */
export async function productSitemap(db: D1Database, origin: string): Promise<string> {
	const [products, categories] = await db.batch([
		db.prepare(
			`SELECT p.slug, p.updated_at FROM cartde_products p WHERE p.status = 'active' AND EXISTS (SELECT 1 FROM cartde_variants v WHERE v.product_id = p.id AND v.status = 'active') ORDER BY p.published_at DESC LIMIT 49000`,
		),
		db.prepare(`SELECT slug, updated_at FROM cartde_categories ORDER BY sort_order LIMIT 900`),
	]);
	const url = (path: string, lastmod: string) =>
		`<url><loc>${xmlEscape(new URL(path, origin).toString())}</loc><lastmod>${xmlEscape(lastmod.slice(0, 10))}</lastmod></url>`;
	const urls = [
		...(products.results as { slug: string; updated_at: string }[]).map((p) =>
			url(`/products/${encodeURIComponent(p.slug)}`, p.updated_at),
		),
		...(categories.results as { slug: string; updated_at: string }[]).map((c) =>
			url(`/category/${encodeURIComponent(c.slug)}`, c.updated_at),
		),
	];
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/** Adds the product sitemap to EmDash's sitemap index, once. */
export function addToSitemapIndex(indexXml: string, productSitemapUrl: string): string {
	if (indexXml.includes(productSitemapUrl) || !indexXml.includes("</sitemapindex>")) return indexXml;
	return indexXml.replace("</sitemapindex>", `<sitemap><loc>${xmlEscape(productSitemapUrl)}</loc></sitemap>\n</sitemapindex>`);
}

export const ROBOTS_DISALLOW = ["/admin", "/setup", "/api/", "/cart", "/checkout", "/orders/", "/search"];

/** Adds CartDE's private and non-indexable paths to EmDash's robots.txt under its first user-agent group. */
export function extendRobots(robots: string): string {
	const missing = ROBOTS_DISALLOW.filter((p) => !robots.includes(`Disallow: ${p}\n`) && !robots.endsWith(`Disallow: ${p}`));
	if (missing.length === 0) return robots;
	const lines = missing.map((p) => `Disallow: ${p}`).join("\n");
	return /User-agent: \*\n/.test(robots)
		? robots.replace(/User-agent: \*\n/, (m) => `${m}${lines}\n`)
		: `User-agent: *\n${lines}\n\n${robots}`;
}
