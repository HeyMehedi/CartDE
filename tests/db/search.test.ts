import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { createProduct, updateProduct } from "../../src/cartde/db/products";
import { searchStorefrontProducts, searchTerms } from "../../src/cartde/db/search";
import { productInput } from "../../src/cartde/domain/schemas";

let db: D1Database;
const add = (name: string, extra: Record<string, unknown> = {}) =>
	createProduct(db, productInput.parse({ name, status: "active", variants: [{ price_minor: 1000, sku: extra.sku as string | undefined }], ...extra, ...(extra.sku ? { variants: [{ price_minor: 1000, sku: extra.sku }] } : {}) }));

beforeEach(async () => {
	db = createTestDb();
	await add("Cotton Tee", { description_md: "Soft handloom fabric" });
	await add("Red Cotton Shirt", { sku: "SHIRT-RED-01" });
	await add("Ceramic Mug", { description_md: "Holds 350 ml of cotton-free tea" });
	await add("লাল শাড়ি", { description_md: "হাতে বোনা" });
	const draft = await createProduct(db, productInput.parse({ name: "Cotton Secret Draft", variants: [{ price_minor: 1 }] }));
	expect(draft.status).toBe("draft");
});

describe("storefront search", () => {
	it("matches names, ranks prefix matches first, and never returns drafts", async () => {
		const r = await searchStorefrontProducts(db, "cotton");
		expect(r.items.map((i) => i.name)).toEqual(["Cotton Tee", "Red Cotton Shirt", "Ceramic Mug"]);
		expect(r.total).toBe(3);
	});
	it("requires every term to match somewhere (name, description or SKU)", async () => {
		expect((await searchStorefrontProducts(db, "cotton red")).items.map((i) => i.name)).toEqual(["Red Cotton Shirt"]);
		expect((await searchStorefrontProducts(db, "handloom soft")).items.map((i) => i.name)).toEqual(["Cotton Tee"]);
		expect((await searchStorefrontProducts(db, "SHIRT-RED")).items.map((i) => i.name)).toEqual(["Red Cotton Shirt"]);
	});
	it("handles Bengali text and empty queries", async () => {
		expect((await searchStorefrontProducts(db, "শাড়ি")).items.map((i) => i.name)).toEqual(["লাল শাড়ি"]);
		expect((await searchStorefrontProducts(db, "   ")).items).toEqual([]);
	});
	it("treats LIKE wildcards literally", async () => {
		expect((await searchStorefrontProducts(db, "%")).total).toBe(0);
		expect((await searchStorefrontProducts(db, "_")).total).toBe(0);
		expect((await searchStorefrontProducts(db, "c%e")).total).toBe(0);
	});
	it("is safe against SQL-looking input", async () => {
		expect((await searchStorefrontProducts(db, "'; DROP TABLE cartde_products; --")).total).toBe(0);
		expect((await searchStorefrontProducts(db, "cotton")).total).toBe(3);
	});
	it("paginates and hides products that were archived", async () => {
		expect((await searchStorefrontProducts(db, "cotton", 1, 2)).items).toHaveLength(2);
		expect((await searchStorefrontProducts(db, "cotton", 2, 2)).items).toHaveLength(1);
		const tee = (await searchStorefrontProducts(db, "cotton tee")).items[0]!;
		await updateProduct(db, tee.id, { status: "archived" });
		expect((await searchStorefrontProducts(db, "cotton")).total).toBe(2);
	});
	it("caps terms and length", () => {
		expect(searchTerms("a b c d e f")).toHaveLength(4);
		expect(searchTerms("x".repeat(500))[0]).toHaveLength(100);
	});
});
