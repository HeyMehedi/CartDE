import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { completeSetup, seedDemoCatalogue, storeIsReady } from "../../src/cartde/db/setup";
import { createProduct, listProducts } from "../../src/cartde/db/products";
import { listCategories } from "../../src/cartde/db/categories";
import { getStore, updateStore } from "../../src/cartde/db/store";
import { productInput, setupInput } from "../../src/cartde/domain/schemas";
import { isStorefrontPath } from "../../src/cartde/app/guard";

let db: D1Database;
beforeEach(() => {
	db = createTestDb();
});

const input = (over: Record<string, unknown> = {}) =>
	setupInput.parse({ name: "My Shop", currency: "BDT", locale: "en-BD", timezone: "Asia/Dhaka", delivery_inside_dhaka_minor: 6000, delivery_outside_dhaka_minor: 12000, low_stock_threshold: 3, ...over });

describe("store readiness", () => {
	it("is not ready until setup completes, and reports missing migrations", async () => {
		expect(await storeIsReady(db)).toEqual({ ready: false, reason: "setup" });
		await completeSetup(db, input());
		expect(await storeIsReady(db)).toEqual({ ready: true });
		const broken = { prepare: () => { throw new Error("no such table: cartde_store"); } } as unknown as D1Database;
		expect(await storeIsReady(broken)).toEqual({ ready: false, reason: "migrations" });
	});
});

describe("completeSetup", () => {
	it("opens the store and stamps the completion time exactly once (idempotent)", async () => {
		const first = await completeSetup(db, input());
		expect(first.store).toMatchObject({ status: "active", name: "My Shop", delivery_outside_dhaka_minor: 12000 });
		const stamp = first.store.setup_completed_at;
		expect(stamp).toBeTruthy();
		await new Promise((r) => setTimeout(r, 5));
		const second = await completeSetup(db, input({ name: "Renamed" }));
		expect(second.store.setup_completed_at).toBe(stamp);
		expect(second.store.name).toBe("Renamed");
	});

	it("adds demo products only on request and only to an empty catalogue", async () => {
		const none = await completeSetup(db, input());
		expect(none.demoProducts).toBe(0);
		expect(await listProducts(db)).toHaveLength(0);

		const db2 = createTestDb();
		const withDemo = await completeSetup(db2, input({ with_demo_products: true }));
		expect(withDemo.demoProducts).toBe(2);
		const products = await listProducts(db2);
		expect(products.map((p) => p.status)).toEqual(["draft", "draft"]);
		expect(await listCategories(db2)).toHaveLength(1);

		await expect(seedDemoCatalogue(db2)).rejects.toMatchObject({ code: "conflict" });

		const db3 = createTestDb();
		await createProduct(db3, productInput.parse({ name: "Mine", variants: [{ price_minor: 1 }] }));
		await expect(completeSetup(db3, input({ with_demo_products: true }))).rejects.toMatchObject({ code: "conflict" });
		expect((await getStore(db3)).setup_completed_at).toBeNull();
	});
});

describe("store status", () => {
	it("can be paused and reopened after setup, but not before", async () => {
		await updateStore(db, input({ status: "paused" }));
		expect((await getStore(db)).status).toBe("setup");
		await completeSetup(db, input());
		await updateStore(db, input({ status: "paused" }));
		expect((await getStore(db)).status).toBe("paused");
		await updateStore(db, input({ status: "active" }));
		expect((await getStore(db)).status).toBe("active");
		await completeSetup(db, input()); // re-running setup must not reopen a paused store
		await updateStore(db, input({ status: "paused" }));
		await completeSetup(db, input());
		expect((await getStore(db)).status).toBe("paused");
	});
});

describe("storefront path classification", () => {
	it("covers shopper routes but not admin, EmDash or content pages", () => {
		for (const p of ["/", "/products", "/products/x", "/cart", "/checkout", "/orders/1001", "/search", "/api/cartde/checkout", "/api/cartde/cart/validate"]) expect(isStorefrontPath(p), p).toBe(true);
		for (const p of ["/admin", "/setup", "/_emdash/admin", "/about", "/posts/hello", "/api/cartde/admin/products"]) expect(isStorefrontPath(p), p).toBe(false);
	});
});
