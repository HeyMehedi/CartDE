import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { lowStockVariants, placeOrder, recentOrders, salesByDay, transitionOrder } from "../../src/cartde/db/orders";
import { createProduct } from "../../src/cartde/db/products";
import { completeSetup } from "../../src/cartde/db/setup";
import { checkoutInput, productInput, setupInput } from "../../src/cartde/domain/schemas";

let db: D1Database;
let variantId: string;
beforeEach(async () => {
	db = createTestDb();
	await completeSetup(db, setupInput.parse({ name: "Shop", currency: "BDT", locale: "en-BD", timezone: "Asia/Dhaka", delivery_inside_dhaka_minor: 6000, delivery_outside_dhaka_minor: 12000, low_stock_threshold: 3 }));
	const p = await createProduct(db, productInput.parse({ name: "Tee", status: "active", options: [{ name: "Size", values: ["S", "M"] }], variants: [{ option_values: ["S"], price_minor: 100000, stock_qty: 10 }, { option_values: ["M"], price_minor: 100000, stock_qty: 2 }] }));
	variantId = p.variants[0]!.id;
});

const order = (n: number) => placeOrder(db, checkoutInput.parse({ idempotency_key: `ov-key-${String(n).padStart(16, "0")}`, name: "Rahim", phone: "01712345678", district: "Dhaka", area: "A", address: "House 5", lines: [{ variant_id: variantId, quantity: 1 }] }));

describe("overview data", () => {
	it("groups sales by store-local day, includes empty days, excludes cancelled revenue", async () => {
		await order(1);
		const second = await order(2);
		const id = (await db.prepare(`SELECT id FROM cartde_orders WHERE order_number = ?1`).bind(second.order_number).first<{ id: string }>())!.id;
		await transitionOrder(db, id, { to: "cancelled" }, null);
		// Pretend the first order was placed at 23:30 UTC yesterday, which is already today in Dhaka (UTC+6).
		const now = new Date("2026-10-10T12:00:00Z");
		await db.prepare(`UPDATE cartde_orders SET placed_at = '2026-10-09T23:30:00.000Z' WHERE order_number = 1001`).run();
		await db.prepare(`UPDATE cartde_orders SET placed_at = '2026-10-08T10:00:00.000Z' WHERE order_number = 1002`).run();
		const days = await salesByDay(db, 7, "Asia/Dhaka", now);
		expect(days).toHaveLength(7);
		expect(days.at(-1)).toEqual({ date: "2026-10-10", orders: 1, revenue_minor: 106000 });
		expect(days.find((d) => d.date === "2026-10-08")).toEqual({ date: "2026-10-08", orders: 1, revenue_minor: 0 });
		expect(days.filter((d) => d.orders === 0)).toHaveLength(5);
	});

	it("lists recent orders newest first and low-stock variants lowest first", async () => {
		await order(1);
		await order(2);
		expect((await recentOrders(db)).map((o) => o.order_number)).toEqual([1002, 1001]);
		const low = await lowStockVariants(db, 3);
		expect(low.map((l) => [l.variant_title, l.stock_qty])).toEqual([["M", 2]]);
	});
});
