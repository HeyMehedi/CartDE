import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { addToSitemapIndex, extendRobots, productSitemap, ROBOTS_DISALLOW } from "../../src/cartde/db/sitemap";
import { createProduct } from "../../src/cartde/db/products";
import { createCategory } from "../../src/cartde/db/categories";
import { productInput } from "../../src/cartde/domain/schemas";

let db: D1Database;
beforeEach(async () => {
	db = createTestDb();
	await createProduct(db, productInput.parse({ name: "Tee & Co <b>", status: "active", variants: [{ price_minor: 1 }] }));
	await createProduct(db, productInput.parse({ name: "Hidden", status: "draft", variants: [{ price_minor: 1 }] }));
	await createCategory(db, { name: "Clothing", sort_order: 0 });
});

describe("product sitemap", () => {
	it("lists active products and categories only, escaped, with absolute URLs", async () => {
		const xml = await productSitemap(db, "https://shop.example");
		expect(xml).toContain("<loc>https://shop.example/products/tee-co-b</loc>");
		expect(xml).toContain("<loc>https://shop.example/category/clothing</loc>");
		expect(xml).not.toContain("hidden");
		expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
	});
	it("is added to EmDash's sitemap index exactly once", () => {
		const idx = '<?xml version="1.0"?>\n<sitemapindex xmlns="x">\n</sitemapindex>';
		const once = addToSitemapIndex(idx, "https://s/sitemap-products.xml");
		expect(once).toContain("<sitemap><loc>https://s/sitemap-products.xml</loc></sitemap>");
		expect(addToSitemapIndex(once, "https://s/sitemap-products.xml")).toBe(once);
		expect(addToSitemapIndex("not xml", "x")).toBe("not xml");
	});
});

describe("robots.txt", () => {
	it("adds CartDE's private paths under the * group and keeps EmDash's lines", () => {
		const src = "User-agent: *\nAllow: /\n\nDisallow: /_emdash/\n\nSitemap: https://s/sitemap.xml\n";
		const out = extendRobots(src);
		for (const p of ROBOTS_DISALLOW) expect(out).toContain(`Disallow: ${p}\n`);
		expect(out).toContain("Disallow: /_emdash/");
		expect(out).toContain("Sitemap: https://s/sitemap.xml");
		expect(extendRobots(out)).toBe(out);
	});
});
