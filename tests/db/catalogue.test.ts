import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { createProduct, listProducts, getProduct, getActiveProductBySlug, updateProduct, addVariant, updateVariant, deleteVariant, deleteProduct, adjustStock } from "../../src/cartde/db/products";
import { createCategory, listCategories, updateCategory, deleteCategory } from "../../src/cartde/db/categories";
import { getStore, updateStore } from "../../src/cartde/db/store";
import { productInput } from "../../src/cartde/domain/schemas";
import { CartdeError } from "../../src/cartde/db/util";

let db: D1Database;
beforeEach(() => {
	db = createTestDb();
});

const tee = (over: Record<string, unknown> = {}) =>
	productInput.parse({
		name: "Cotton Tee",
		options: [{ name: "Size", values: ["S", "M"] }],
		variants: [
			{ option_values: ["S"], price_minor: 90000, stock_qty: 5, sku: "TEE-S" },
			{ option_values: ["M"], price_minor: 95000, stock_qty: 3, sku: "TEE-M" },
		],
		...over,
	});

describe("migrations", () => {
	it("create the schema and seed the order counter", async () => {
		const row = await db.prepare(`SELECT value FROM cartde_counters WHERE name = 'order_number'`).first<{ value: number }>();
		expect(row?.value).toBe(1000);
	});
});

describe("products", () => {
	it("creates a product with two variants, options and initial stock events", async () => {
		const p = await createProduct(db, tee(), "user1");
		expect(p.slug).toBe("cotton-tee");
		expect(p.variants.map((v) => v.title)).toEqual(["S", "M"]);
		expect(p.options[0]!.values.map((v) => v.value)).toEqual(["S", "M"]);
		const ev = await db.prepare(`SELECT COUNT(*) AS n FROM cartde_inventory_events`).first<{ n: number }>();
		expect(ev?.n).toBe(2);
	});

	it("generates unique slugs and rejects duplicate explicit slugs and SKUs", async () => {
		await createProduct(db, tee());
		const second = await createProduct(db, tee({ variants: [{ option_values: ["S"], price_minor: 1, sku: "X-S" }, { option_values: ["M"], price_minor: 1, sku: "X-M" }] }));
		expect(second.slug).toBe("cotton-tee-2");
		await expect(createProduct(db, tee({ slug: "cotton-tee" }))).rejects.toMatchObject({ code: "conflict" });
	});

	it("rolls back the whole product when a SKU collides", async () => {
		await createProduct(db, tee());
		await expect(createProduct(db, tee({ name: "Other" }))).rejects.toBeInstanceOf(CartdeError);
		expect((await listProducts(db)).map((p) => p.name)).toEqual(["Cotton Tee"]);
	});

	it("rejects variants that do not match the options", async () => {
		await expect(createProduct(db, tee({ variants: [{ option_values: ["XL"], price_minor: 1 }] }))).rejects.toMatchObject({ code: "invalid" });
		await expect(createProduct(db, tee({ variants: [{ option_values: ["S"], price_minor: 1 }, { option_values: ["s"], price_minor: 1 }] }))).rejects.toMatchObject({ code: "invalid" });
	});

	it("storefront hides drafts, archived products and products without active variants (FR-CAT-5)", async () => {
		const p = await createProduct(db, tee());
		expect(await getActiveProductBySlug(db, p.slug)).toBeNull();
		await updateProduct(db, p.id, { status: "active" });
		expect((await getActiveProductBySlug(db, p.slug))?.variants).toHaveLength(2);
		await updateVariant(db, p.variants[0]!.id, { status: "inactive" });
		expect((await getActiveProductBySlug(db, p.slug))?.variants).toHaveLength(1);
		await expect(updateVariant(db, p.variants[1]!.id, { status: "inactive" })).rejects.toMatchObject({ code: "invalid" });
		await updateProduct(db, p.id, { status: "archived" });
		expect(await getActiveProductBySlug(db, p.slug)).toBeNull();
	});

	it("cannot publish a product with no active variant", async () => {
		const p = await createProduct(db, productInput.parse({ name: "Hidden", variants: [{ price_minor: 100, status: "inactive" }] }));
		await expect(updateProduct(db, p.id, { status: "active" })).rejects.toMatchObject({ code: "invalid" });
	});

	it("adds and deletes variants but keeps at least one", async () => {
		const p = await createProduct(db, tee());
		const after = await addVariant(db, p.id, { option_values: ["L"], price_minor: 99000, stock_qty: 2, status: "active" });
		expect(after.variants.map((v) => v.title)).toEqual(["S", "M", "L"]);
		await expect(addVariant(db, p.id, { option_values: ["l"], price_minor: 1, stock_qty: 0, status: "active" })).rejects.toMatchObject({ code: "conflict" });
		await deleteVariant(db, after.variants[2]!.id);
		const single = await createProduct(db, productInput.parse({ name: "One", variants: [{ price_minor: 1 }] }));
		await expect(deleteVariant(db, single.variants[0]!.id)).rejects.toMatchObject({ code: "invalid" });
	});

	it("only drafts can be deleted", async () => {
		const p = await createProduct(db, tee());
		await updateProduct(db, p.id, { status: "active" });
		await expect(deleteProduct(db, p.id)).rejects.toMatchObject({ code: "conflict" });
		await updateProduct(db, p.id, { status: "draft" });
		await deleteProduct(db, p.id);
		await expect(getProduct(db, p.id)).rejects.toMatchObject({ code: "not_found" });
	});

	it("searches by name and escapes LIKE wildcards", async () => {
		await createProduct(db, tee());
		expect(await listProducts(db, { search: "cotton" })).toHaveLength(1);
		expect(await listProducts(db, { search: "%" })).toHaveLength(0);
	});
});

describe("stock", () => {
	it("adjusts, records events and reconciles with stock_qty", async () => {
		const p = await createProduct(db, tee());
		const v = p.variants[0]!;
		expect((await adjustStock(db, v.id, { delta: 4, reason: "manual" }, "u")).stock_qty).toBe(9);
		expect((await adjustStock(db, v.id, { delta: -9, reason: "manual", note: "damaged" }, "u")).stock_qty).toBe(0);
		await expect(adjustStock(db, v.id, { delta: -1, reason: "manual" }, "u")).rejects.toMatchObject({ code: "invalid" });
		const sum = await db.prepare(`SELECT SUM(delta) AS s FROM cartde_inventory_events WHERE variant_id = ?1`).bind(v.id).first<{ s: number }>();
		expect(sum?.s).toBe(0); // initial 5 + 4 - 9
	});

	it("the CHECK constraint backs the service rule", async () => {
		const p = await createProduct(db, tee());
		await expect(db.prepare(`UPDATE cartde_variants SET stock_qty = -1 WHERE id = ?1`).bind(p.variants[0]!.id).run()).rejects.toThrow();
	});
});

describe("categories and store", () => {
	it("manages categories and assigns them to products", async () => {
		const c = await createCategory(db, { name: "Clothing", sort_order: 0 });
		expect(c.slug).toBe("clothing");
		const p = await createProduct(db, tee({ category_ids: [c.id] }));
		expect(p.category_ids).toEqual([c.id]);
		await updateCategory(db, c.id, { name: "Apparel", slug: "apparel", sort_order: 1 });
		expect((await listCategories(db))[0]!.slug).toBe("apparel");
		await deleteCategory(db, c.id);
		expect((await getProduct(db, p.id)).category_ids).toEqual([]);
		await expect(deleteCategory(db, c.id)).rejects.toMatchObject({ code: "not_found" });
	});

	it("creates the store row lazily and updates settings", async () => {
		const s = await getStore(db);
		expect(s.currency).toBe("BDT");
		const u = await updateStore(db, { name: "Shop", currency: "BDT", locale: "en-BD", timezone: "Asia/Dhaka", delivery_inside_dhaka_minor: 6000, delivery_outside_dhaka_minor: 12000, low_stock_threshold: 3 });
		expect(u.name).toBe("Shop");
		expect(u.delivery_outside_dhaka_minor).toBe(12000);
	});
});
