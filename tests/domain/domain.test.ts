import { describe, expect, it } from "vitest";
import { formatMoney, parseMajorToMinor } from "../../src/cartde/domain/money";
import { slugify, uniqueSlug } from "../../src/cartde/domain/slug";
import { validateOptions, variantCombinations, variantTitle } from "../../src/cartde/domain/variants";
import { applyStockDelta, InventoryError } from "../../src/cartde/domain/inventory";
import { productInput, slugSchema, stockAdjustmentInput } from "../../src/cartde/domain/schemas";

describe("money", () => {
	it("parses major amounts exactly", () => {
		expect(parseMajorToMinor("1,250.50")).toBe(125050);
		expect(parseMajorToMinor("10")).toBe(1000);
		expect(parseMajorToMinor("0.5")).toBe(50);
		expect(parseMajorToMinor("0.07")).toBe(7);
	});
	it("rejects bad input", () => {
		for (const bad of ["", "-1", "1.234", "abc", "1.2.3"]) expect(parseMajorToMinor(bad)).toBeNull();
	});
	it("formats BDT", () => {
		expect(formatMoney(125000)).toContain("1,250");
	});
});

describe("slug", () => {
	it("slugifies", () => {
		expect(slugify("  Café Mug — 350ml! ")).toBe("cafe-mug-350ml");
		expect(slugify("!!!")).toBe("");
	});
	it("makes unique", () => {
		expect(uniqueSlug("Red Shirt", new Set(["red-shirt", "red-shirt-2"]))).toBe("red-shirt-3");
		expect(uniqueSlug("???", new Set())).toBe("item");
	});
	it("rejects reserved and malformed slugs", () => {
		expect(slugSchema.safeParse("admin").success).toBe(false);
		expect(slugSchema.safeParse("Bad_Slug").success).toBe(false);
		expect(slugSchema.safeParse("good-slug").success).toBe(true);
	});
});

describe("variants", () => {
	it("builds combinations", () => {
		expect(variantCombinations([])).toEqual([[]]);
		expect(variantCombinations([{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Red"] }])).toEqual([
			["S", "Red"],
			["M", "Red"],
		]);
		expect(variantTitle(["M", "Red"])).toBe("M / Red");
		expect(variantTitle([])).toBe("Default");
	});
	it("validates options", () => {
		expect(validateOptions([{ name: "Size", values: ["S", "s"] }])).toHaveLength(1);
		expect(validateOptions([{ name: "A", values: ["1"] }, { name: "a", values: ["1"] }])).toHaveLength(1);
		const mk = (names: string[], n: number) =>
			names.map((name) => ({ name, values: Array.from({ length: n }, (_, i) => String(i)) }));
		expect(validateOptions(mk(["a", "b", "c"], 4))).toEqual([]); // 64 variants
		expect(validateOptions(mk(["a", "b", "c"], 5))).not.toEqual([]); // 125 > 100
		expect(validateOptions(mk(["a", "b", "c", "d"], 1))).not.toEqual([]); // 4 options
	});
});

describe("inventory", () => {
	it("applies deltas and refuses negatives", () => {
		expect(applyStockDelta(5, 3)).toBe(8);
		expect(applyStockDelta(5, -5)).toBe(0);
		expect(() => applyStockDelta(5, -6)).toThrow(InventoryError);
		expect(() => applyStockDelta(5, 0)).toThrow(InventoryError);
	});
	it("schema forbids zero adjustment", () => {
		expect(stockAdjustmentInput.safeParse({ delta: 0 }).success).toBe(false);
		expect(stockAdjustmentInput.safeParse({ delta: -2, reason: "manual" }).success).toBe(true);
	});
});

describe("product schema", () => {
	const base = { name: "Mug", variants: [{ price_minor: 50000 }] };
	it("accepts a minimal product", () => {
		const r = productInput.safeParse(base);
		expect(r.success).toBe(true);
	});
	it("rejects compare-at below price and empty variants", () => {
		expect(productInput.safeParse({ ...base, variants: [{ price_minor: 500, compare_at_minor: 100 }] }).success).toBe(false);
		expect(productInput.safeParse({ ...base, variants: [] }).success).toBe(false);
	});
	it("rejects float prices", () => {
		expect(productInput.safeParse({ ...base, variants: [{ price_minor: 10.5 }] }).success).toBe(false);
	});
});

import { renderMarkdown } from "../../src/cartde/domain/markdown";

describe("markdown", () => {
	it("escapes raw HTML", () => {
		const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror="y">');
		expect(html).not.toContain("<script");
		expect(html).not.toContain("<img");
	});
	it("renders the supported subset", () => {
		expect(renderMarkdown("Hello **bold** and *it*")).toBe("<p>Hello <strong>bold</strong> and <em>it</em></p>");
		expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
		expect(renderMarkdown("one\n\ntwo")).toBe("<p>one</p>\n<p>two</p>");
	});
	it("allows only http(s) links", () => {
		expect(renderMarkdown("[x](https://a.test)")).toContain('href="https://a.test"');
		expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("<a");
	});
});
