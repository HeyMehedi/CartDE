import { describe, expect, it } from "vitest";
import { pageSlugDecision } from "../../src/cartde/plugin/slug-policy";

describe("page slug policy (SRS 3.2)", () => {
	it("refuses pages that would collide with store routes", () => {
		for (const slug of [
			"products",
			"cart",
			"checkout",
			"orders",
			"admin",
			"setup",
			"search",
			"category",
			"api",
			"Products",
			"404",
			"sitemap-products",
		]) {
			expect(pageSlugDecision("pages", slug), slug).toMatchObject({ cancel: true });
		}
	});
	it("allows normal pages and other collections", () => {
		for (const slug of ["about", "delivery-policy", "contact", "product-care"])
			expect(pageSlugDecision("pages", slug), slug).toBeUndefined();
		expect(pageSlugDecision("posts", "products")).toBeUndefined();
		expect(pageSlugDecision("pages", undefined)).toBeUndefined();
	});
});
