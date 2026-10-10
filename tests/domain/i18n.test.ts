import { describe, expect, it } from "vitest";
import { bn, clientMessages, en, langFor, t } from "../../src/cartde/i18n/messages";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("storefront messages", () => {
	it("Bengali has exactly the English keys", () => {
		expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
	});
	it("every translation keeps the same placeholders as the English source", () => {
		for (const key of Object.keys(en) as (keyof typeof en)[]) expect(placeholders(bn[key]), key).toEqual(placeholders(en[key]));
	});
	it("no translation is empty or identical-by-accident for user-facing text", () => {
		for (const key of Object.keys(en) as (keyof typeof en)[]) expect(bn[key].trim().length, key).toBeGreaterThan(0);
		expect(bn["cart.title"]).not.toBe(en["cart.title"]);
	});
	it("picks the language from the locale", () => {
		expect(langFor("bn-BD")).toBe("bn");
		expect(langFor("bn")).toBe("bn");
		expect(langFor("en-BD")).toBe("en");
		expect(langFor("bnx")).toBe("en");
	});
	it("interpolates and leaves unknown placeholders visible", () => {
		expect(t("en", "products.page_of", { page: 2, pages: 5 })).toBe("Page 2 of 5");
		expect(t("bn", "products.page_of", { page: 2, pages: 5 })).toBe("পৃষ্ঠা 2 / 5");
		expect(t("en", "order.thanks")).toBe("Thank you, {name}!");
	});
	it("builds a client subset", () => {
		expect(clientMessages("bn", ["cart.remove"])).toEqual({ "cart.remove": "সরান" });
	});
});
