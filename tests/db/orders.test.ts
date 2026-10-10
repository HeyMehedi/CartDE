import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { createProduct, getProduct, updateProduct, updateVariant } from "../../src/cartde/db/products";
import {
	getCustomerOrders,
	getOrder,
	getOrderForShopper,
	listCustomers,
	listOrders,
	overview,
	placeOrder,
	priceCart,
	setMerchantNote,
	transitionOrder,
} from "../../src/cartde/db/orders";
import { getStore, updateStore } from "../../src/cartde/db/store";
import { checkoutInput, productInput } from "../../src/cartde/domain/schemas";
import { ORDER_STATUSES, canTransition } from "../../src/cartde/domain/orders";

let db: D1Database;
let variantId: string;
let variant2Id: string;

async function seed(stock = 5) {
	const p = await createProduct(
		db,
		productInput.parse({
			name: "Tee",
			status: "active",
			options: [{ name: "Size", values: ["S", "M"] }],
			variants: [
				{ option_values: ["S"], price_minor: 90000, stock_qty: stock },
				{ option_values: ["M"], price_minor: 95000, stock_qty: 2 },
			],
		}),
	);
	variantId = p.variants[0]!.id;
	variant2Id = p.variants[1]!.id;
	await updateStore(db, {
		name: "Shop",
		currency: "BDT",
		locale: "en-BD",
		timezone: "Asia/Dhaka",
		delivery_inside_dhaka_minor: 6000,
		delivery_outside_dhaka_minor: 12000,
		low_stock_threshold: 3,
	});
}

let n = 0;
const checkout = (over: Record<string, unknown> = {}) =>
	checkoutInput.parse({
		idempotency_key: `key-${String(++n).padStart(16, "0")}`,
		name: "Rahim",
		phone: "01712345678",
		district: "Dhaka",
		area: "Mirpur",
		address: "House 5, Road 3",
		lines: [{ variant_id: variantId, quantity: 2 }],
		...over,
	});

const stockOf = async (id: string) =>
	(await db.prepare(`SELECT stock_qty FROM cartde_variants WHERE id = ?1`).bind(id).first<{ stock_qty: number }>())!.stock_qty;

beforeEach(async () => {
	db = createTestDb();
	n = 0;
	await seed();
});

describe("placeOrder", () => {
	it("creates an order with server-side prices, delivery by zone, stock decrement, events and customer", async () => {
		const placed = await placeOrder(db, checkout());
		expect(placed.order_number).toBe(1001);
		const order = await getOrder(db, (await db.prepare(`SELECT id FROM cartde_orders`).first<{ id: string }>())!.id);
		expect(order).toMatchObject({
			status: "pending",
			payment_status: "unpaid",
			subtotal_minor: 180000,
			delivery_minor: 6000,
			total_minor: 186000,
			customer_name: "Rahim",
			ship_district: "Dhaka",
		});
		expect(order.items).toHaveLength(1);
		expect(order.items[0]).toMatchObject({
			product_name: "Tee",
			variant_title: "S",
			quantity: 2,
			unit_price_minor: 90000,
			line_total_minor: 180000,
		});
		expect(order.events.map((e) => e.to_status)).toEqual(["pending"]);
		expect(await stockOf(variantId)).toBe(3);
		const inv = await db
			.prepare(`SELECT SUM(delta) AS s FROM cartde_inventory_events WHERE variant_id = ?1`)
			.bind(variantId)
			.first<{ s: number }>();
		expect(inv!.s).toBe(3); // initial 5 - 2
		expect((await listCustomers(db))[0]).toMatchObject({ phone: "01712345678", order_count: 1 });
	});

	it("charges the outside-Dhaka rate and numbers orders sequentially", async () => {
		await placeOrder(db, checkout());
		const second = await placeOrder(db, checkout({ district: "Sylhet", lines: [{ variant_id: variantId, quantity: 1 }] }));
		expect(second.order_number).toBe(1002);
		expect(second.total_minor).toBe(90000 + 12000);
	});

	it("matches repeat customers by phone", async () => {
		await placeOrder(db, checkout());
		await placeOrder(db, checkout({ name: "R. Uddin", lines: [{ variant_id: variantId, quantity: 1 }] }));
		const customers = await listCustomers(db);
		expect(customers).toHaveLength(1);
		expect(customers[0]!.order_count).toBe(2);
		const { orders } = await getCustomerOrders(db, customers[0]!.id);
		expect(orders).toHaveLength(2);
	});

	it("is idempotent: the same key returns the same order and decrements stock once", async () => {
		const input = checkout();
		const a = await placeOrder(db, input);
		const b = await placeOrder(db, input);
		expect(b).toMatchObject({ order_number: a.order_number, access_token: a.access_token, existing: true });
		expect(await stockOf(variantId)).toBe(3);
		expect((await listOrders(db)).total).toBe(1);
	});

	it("selling the last unit twice yields exactly one order", async () => {
		await db.prepare(`UPDATE cartde_variants SET stock_qty = 1 WHERE id = ?1`).bind(variantId).run();
		const attempts = await Promise.allSettled(
			[1, 2, 3].map(() => placeOrder(db, checkout({ lines: [{ variant_id: variantId, quantity: 1 }] }))),
		);
		expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
		expect(attempts.filter((a) => a.status === "rejected")).toHaveLength(2);
		expect(await stockOf(variantId)).toBe(0);
		expect((await listOrders(db)).total).toBe(1);
	});

	it("rolls everything back when one line is unavailable", async () => {
		await expect(
			placeOrder(
				db,
				checkout({
					lines: [
						{ variant_id: variantId, quantity: 1 },
						{ variant_id: variant2Id, quantity: 3 },
					],
				}),
			),
		).rejects.toMatchObject({ code: "conflict" });
		expect(await stockOf(variantId)).toBe(5);
		expect(await stockOf(variant2Id)).toBe(2);
		expect((await listOrders(db)).total).toBe(0);
		expect((await listCustomers(db)).length).toBe(0);
		const counter = await db.prepare(`SELECT value FROM cartde_counters WHERE name = 'order_number'`).first<{ value: number }>();
		expect(counter!.value).toBe(1000);
	});

	it("rolls back when stock vanishes between pricing and the batch", async () => {
		const input = checkout();
		// Simulate the race: price check passes, then another buyer takes the stock before the batch runs.
		const realFirst = db.prepare.bind(db);
		let tampered = false;
		(db as unknown as { prepare: typeof db.prepare }).prepare = ((sql: string) => {
			if (!tampered && /INSERT OR IGNORE INTO cartde_customers/.test(sql)) {
				tampered = true;
				void realFirst(`UPDATE cartde_variants SET stock_qty = 0 WHERE id = ?1`).bind(variantId).run();
			}
			return realFirst(sql);
		}) as typeof db.prepare;
		await expect(placeOrder(db, input)).rejects.toMatchObject({ code: "conflict" });
		expect((await listOrders(db)).total).toBe(0);
	});

	it("refuses inactive, unknown and unpublished items, and a paused store", async () => {
		await updateVariant(db, variant2Id, { status: "inactive" });
		await expect(placeOrder(db, checkout({ lines: [{ variant_id: variant2Id, quantity: 1 }] }))).rejects.toMatchObject({
			code: "conflict",
		});
		await expect(placeOrder(db, checkout({ lines: [{ variant_id: "Z".repeat(26), quantity: 1 }] }))).rejects.toMatchObject({
			code: "conflict",
		});
		const prod = await getProduct(
			db,
			(await db.prepare(`SELECT product_id FROM cartde_variants WHERE id=?1`).bind(variantId).first<{ product_id: string }>())!.product_id,
		);
		await updateProduct(db, prod.id, { status: "archived" });
		await expect(placeOrder(db, checkout())).rejects.toMatchObject({ code: "conflict" });
		await updateProduct(db, prod.id, { status: "active" });
		await db.prepare(`UPDATE cartde_store SET status = 'paused'`).run();
		await expect(placeOrder(db, checkout())).rejects.toMatchObject({ code: "conflict" });
	});

	it("prices carts from the database and flags problems", async () => {
		const lines = await priceCart(db, [
			{ variant_id: variantId, quantity: 9 },
			{ variant_id: variant2Id, quantity: 1 },
		]);
		expect(lines[0]).toMatchObject({ available: false, problem: "Only 5 left." });
		expect(lines[1]).toMatchObject({ available: true, line_total_minor: 95000 });
	});

	it("keeps order snapshots when the catalogue changes later", async () => {
		await placeOrder(db, checkout());
		await db.prepare(`UPDATE cartde_variants SET price_minor = 1, title = 'Renamed' WHERE id = ?1`).bind(variantId).run();
		const row = await db.prepare(`SELECT id FROM cartde_orders`).first<{ id: string }>();
		const order = await getOrder(db, row!.id);
		expect(order.items[0]).toMatchObject({ unit_price_minor: 90000, variant_title: "S" });
		expect(order.total_minor).toBe(186000);
	});
});

describe("shopper lookup (FR-ORD-6)", () => {
	it("needs the matching number and token", async () => {
		const placed = await placeOrder(db, checkout());
		expect((await getOrderForShopper(db, placed.order_number, placed.access_token))?.customer_name).toBe("Rahim");
		expect(await getOrderForShopper(db, placed.order_number, "wrong-token")).toBeNull();
		expect(await getOrderForShopper(db, placed.order_number, "")).toBeNull();
		expect(await getOrderForShopper(db, 9999, placed.access_token)).toBeNull();
		const order = await getOrderForShopper(db, placed.order_number, placed.access_token);
		expect(JSON.stringify(order)).not.toContain(placed.access_token);
	});
});

describe("transitions", () => {
	async function fresh() {
		await db.prepare(`UPDATE cartde_variants SET stock_qty = 5 WHERE id = ?1`).bind(variantId).run();
		await placeOrder(db, checkout());
		return (await db.prepare(`SELECT id FROM cartde_orders`).first<{ id: string }>())!.id;
	}

	it("walks pending -> confirmed -> shipped -> delivered, marking cash as paid", async () => {
		const id = await fresh();
		await transitionOrder(db, id, { to: "confirmed" }, "u1");
		await transitionOrder(db, id, { to: "shipped", note: "Courier X" }, "u1");
		const done = await transitionOrder(db, id, { to: "delivered" }, "u1");
		expect(done).toMatchObject({ status: "delivered", payment_status: "paid" });
		expect(done.events.map((e) => e.to_status)).toEqual(["pending", "confirmed", "shipped", "delivered"]);
		expect(done.events[2]).toMatchObject({ note: "Courier X", actor_user_id: "u1" });
		expect(await stockOf(variantId)).toBe(3);
	});

	it("cancelling restores stock and records inventory events that reconcile", async () => {
		const id = await fresh();
		await transitionOrder(db, id, { to: "cancelled" }, "u1");
		expect(await stockOf(variantId)).toBe(5);
		const sum = await db
			.prepare(`SELECT SUM(delta) AS s FROM cartde_inventory_events WHERE variant_id = ?1`)
			.bind(variantId)
			.first<{ s: number }>();
		expect(sum!.s).toBe(5);
	});

	it("returns restock by default and can opt out; delivered return can refund", async () => {
		const id = await fresh();
		await transitionOrder(db, id, { to: "confirmed" }, null);
		await transitionOrder(db, id, { to: "shipped" }, null);
		await transitionOrder(db, id, { to: "returned", restock: false }, null);
		expect(await stockOf(variantId)).toBe(3);

		await placeOrder(db, checkout({ lines: [{ variant_id: variantId, quantity: 1 }] }));
		const id2 = (await db.prepare(`SELECT id FROM cartde_orders WHERE order_number = 1002`).first<{ id: string }>())!.id;
		for (const to of ["confirmed", "shipped", "delivered"] as const) await transitionOrder(db, id2, { to }, null);
		const r = await transitionOrder(db, id2, { to: "returned", cash_returned: true }, null);
		expect(r.payment_status).toBe("refunded");
		expect(await stockOf(variantId)).toBe(3); // 3 -1 (order) +1 (return)
	});

	it("rejects every invalid pair and leaves the order untouched", async () => {
		for (const from of ORDER_STATUSES) {
			for (const to of ORDER_STATUSES) {
				if (to === "pending" || canTransition(from, to)) continue;
				const id = await fresh();
				await db.prepare(`UPDATE cartde_orders SET status = ?2 WHERE id = ?1`).bind(id, from).run();
				await expect(transitionOrder(db, id, { to: to as "confirmed" }, null), `${from}>${to}`).rejects.toMatchObject({ code: "conflict" });
				expect((await getOrder(db, id)).status).toBe(from);
				await db.prepare(`DELETE FROM cartde_orders WHERE id = ?1`).bind(id).run();
			}
		}
	});

	it("a stale transition (order changed meanwhile) fails without side effects", async () => {
		const id = await fresh();
		await transitionOrder(db, id, { to: "confirmed" }, null);
		await db.prepare(`UPDATE cartde_orders SET status = 'cancelled' WHERE id = ?1`).bind(id).run();
		await expect(transitionOrder(db, id, { to: "shipped" }, null)).rejects.toMatchObject({ code: "conflict" });
	});

	it("only the merchant note is editable", async () => {
		const id = await fresh();
		await setMerchantNote(db, id, "Call before delivery");
		expect((await getOrder(db, id)).merchant_note).toBe("Call before delivery");
		await expect(setMerchantNote(db, "nope", "x")).rejects.toMatchObject({ code: "not_found" });
	});
});

describe("listing and overview", () => {
	it("searches by number, phone and name; filters by status; paginates", async () => {
		await placeOrder(db, checkout());
		await placeOrder(db, checkout({ name: "Karim", phone: "01812345678", lines: [{ variant_id: variantId, quantity: 1 }] }));
		expect((await listOrders(db, { q: "1002" })).items.map((o) => o.customer_name)).toEqual(["Karim"]);
		expect((await listOrders(db, { q: "0181" })).total).toBe(1);
		expect((await listOrders(db, { q: "rahi" })).total).toBe(1);
		expect((await listOrders(db, { q: "%" })).total).toBe(0);
		expect((await listOrders(db, { status: "confirmed" })).total).toBe(0);
		expect((await listOrders(db, { status: "pending" })).total).toBe(2);
		expect((await listOrders(db, { page: 2 })).items).toHaveLength(0);
	});

	it("computes dashboard counts", async () => {
		await placeOrder(db, checkout());
		const o = await overview(db, "2000-01-01T00:00:00.000Z");
		expect(o).toMatchObject({ pending_orders: 1, orders_today: 1, active_products: 1 });
		expect(o.low_stock_variants).toBe(2); // S has 3 (<= 3), M has 2
		expect((await overview(db, "2999-01-01T00:00:00.000Z")).orders_today).toBe(0);
		expect((await getStore(db)).currency).toBe("BDT");
	});
});

describe("database constraints back the invariants", () => {
	it("rejects an order whose total does not add up", async () => {
		await expect(
			db
				.prepare(
					`INSERT INTO cartde_orders (id, order_number, access_token, currency, subtotal_minor, delivery_minor, total_minor, customer_name, customer_phone, ship_recipient_name, ship_phone, ship_line1, ship_area, ship_district, idempotency_key, placed_at, created_at, updated_at)
			 VALUES ('x', 5, 't', 'BDT', 100, 10, 999, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'k', 'n', 'n', 'n')`,
				)
				.run(),
		).rejects.toThrow();
	});
});
