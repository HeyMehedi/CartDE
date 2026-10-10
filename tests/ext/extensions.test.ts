import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { buildRegistry, createRuntime } from "../../src/cartde/extensions/registry";
import { EXTENSION_API_VERSION, MAX_DELIVERY_MINOR, type Extension, type OrderEvent } from "../../src/cartde/extensions/types";
import { extensionRuntime, getEnabledIds, setEnabledIds } from "../../src/cartde/app/extensions";
import { placeOrder, quoteTotals, priceCart, transitionOrder } from "../../src/cartde/db/orders";
import { createProduct } from "../../src/cartde/db/products";
import { completeSetup } from "../../src/cartde/db/setup";
import { getStore } from "../../src/cartde/db/store";
import { checkoutInput, productInput, setupInput } from "../../src/cartde/domain/schemas";
import { EXTENSIONS } from "../../src/extensions";
import freeDelivery from "../../src/extensions/free-delivery";

const ext = (id: string, hooks: Extension["hooks"], over: Partial<Extension> = {}): Extension => ({
	id,
	name: id,
	description: "",
	cartdeApi: EXTENSION_API_VERSION,
	hooks,
	...over,
});
const silent = { log: () => {} };

describe("registry compatibility rules", () => {
	it("accepts valid extensions and rejects bad ids, duplicates, wrong API versions and malformed objects", () => {
		const r = buildRegistry([
			ext("good-one", {}),
			ext("Bad_ID", {}),
			ext("good-one", {}),
			ext("future", {}, { cartdeApi: 2 }),
			ext("old-one", {}, { cartdeApi: 0 }),
			{ id: "no-hooks", name: "x", description: "", cartdeApi: 1 } as unknown as Extension,
		]);
		expect(r.available.map((e) => e.id)).toEqual(["good-one"]);
		expect(r.rejected.map((x) => [x.id, x.reason.split(" ")[0]])).toEqual([
			["Bad_ID", "id"],
			["good-one", "duplicate"],
			["future", "built"],
			["old-one", "built"],
			["no-hooks", "missing"],
		]);
	});
	it("the shipped extensions are all compatible", () => {
		const r = buildRegistry(EXTENSIONS);
		expect(r.rejected).toEqual([]);
		expect(r.available.map((e) => e.id)).toContain("free-delivery");
	});
});

describe("runtime guards", () => {
	const ctx = { currency: "BDT", district: "Dhaka", lines: [], subtotal_minor: 100000, delivery_minor: 6000 };

	it("chains delivery adjustments in order and applies discounts capped at the subtotal", async () => {
		const rt = createRuntime(
			[
				ext("a", { adjustDelivery: (c) => c.delivery_minor + 1000 }),
				ext("b", { adjustDelivery: (c) => c.delivery_minor * 2, discount: () => 80000 }),
				ext("c", { discount: () => 80000 }),
			],
			silent,
		);
		expect(await rt.adjustPricing(ctx)).toEqual({ delivery_minor: 14000, discount_minor: 100000 });
	});

	it("ignores throwing, slow, non-integer, negative and out-of-range results", async () => {
		const logs: string[] = [];
		const rt = createRuntime(
			[
				ext("thrower", {
					adjustDelivery: () => {
						throw new Error("boom");
					},
					discount: () => {
						throw new Error("boom");
					},
				}),
				ext("slow", { adjustDelivery: () => new Promise<number>((r) => setTimeout(() => r(0), 200)) }),
				ext("float", { adjustDelivery: () => 12.5 }),
				ext("negative", { adjustDelivery: () => -1, discount: () => -5 }),
				ext("huge", { adjustDelivery: () => MAX_DELIVERY_MINOR + 1, discount: () => 100001 }),
				ext("nan", { adjustDelivery: () => NaN, discount: () => Number.POSITIVE_INFINITY }),
				ext("string", { adjustDelivery: () => "0" as unknown as number }),
			],
			{ log: (m) => logs.push(m), timeoutMs: 20 },
		);
		expect(await rt.adjustPricing(ctx)).toEqual({ delivery_minor: 6000, discount_minor: 0 });
		expect(logs.length).toBeGreaterThanOrEqual(10);
		expect(logs.join("\n")).toMatch(/timed out/);
	});

	it("a bad extension does not stop a good one after it", async () => {
		const rt = createRuntime(
			[
				ext("bad", {
					adjustDelivery: () => {
						throw new Error("x");
					},
				}),
				ext("good", { adjustDelivery: () => 0 }),
			],
			silent,
		);
		expect((await rt.adjustPricing(ctx)).delivery_minor).toBe(0);
	});

	it("emits order events to all extensions, isolating failures, with frozen data", async () => {
		const seen: OrderEvent[] = [];
		const rt = createRuntime(
			[
				ext("crash", {
					onOrderEvent: () => {
						throw new Error("x");
					},
				}),
				ext("rec", {
					onOrderEvent: (e) => {
						seen.push(e);
						try {
							(e as { status: string }).status = "hacked";
						} catch {
							/* frozen */
						}
					},
				}),
			],
			silent,
		);
		const event: OrderEvent = {
			type: "order.placed",
			order_number: 1001,
			status: "pending",
			from_status: null,
			total_minor: 1,
			currency: "BDT",
			item_count: 1,
		};
		await rt.emitOrderEvent(event);
		expect(seen).toHaveLength(1);
		expect(event.status).toBe("pending");
	});

	it("sanitises section data: no HTML contract, bad URLs dropped, sizes capped", async () => {
		const rt = createRuntime(
			[
				ext("sec", {
					storefrontSection: () => ({
						title: "  Hello  ",
						body: "x".repeat(900),
						items: [
							{ label: "ok", url: "/a" },
							{ label: "bad", url: "javascript:alert(1)" },
							{ label: "proto", url: "//evil.test" },
							{ label: "abs", url: "https://x.test/y", note: "n" },
						],
					}),
				}),
				ext("empty", { storefrontSection: () => ({ title: " " }) }),
				ext("none", {}),
			],
			silent,
		);
		const s = await rt.loadSection("sec", { currency: "BDT", locale: "en-BD" });
		expect(s!.title).toBe("Hello");
		expect(s!.body).toHaveLength(500);
		expect(s!.items!.map((i) => i.url)).toEqual(["/a", "https://x.test/y"]);
		expect(await rt.loadSection("empty", { currency: "BDT", locale: "en-BD" })).toBeNull();
		expect(await rt.loadSection("none", { currency: "BDT", locale: "en-BD" })).toBeNull();
		expect(await rt.loadSection("missing", { currency: "BDT", locale: "en-BD" })).toBeNull();
	});
});

describe("extensions in checkout (no change to the commerce core)", () => {
	let db: D1Database;
	let variantId: string;
	let n = 0;
	const checkout = (qty: number, over: Record<string, unknown> = {}) =>
		checkoutInput.parse({
			idempotency_key: `ext-key-${String(++n).padStart(16, "0")}`,
			name: "Rahim",
			phone: "01712345678",
			district: "Sylhet",
			area: "Zindabazar",
			address: "House 5, Road 3",
			lines: [{ variant_id: variantId, quantity: qty }],
			...over,
		});

	beforeEach(async () => {
		db = createTestDb();
		n = 0;
		await completeSetup(
			db,
			setupInput.parse({
				name: "Shop",
				currency: "BDT",
				locale: "en-BD",
				timezone: "Asia/Dhaka",
				delivery_inside_dhaka_minor: 6000,
				delivery_outside_dhaka_minor: 12000,
				low_stock_threshold: 3,
			}),
		);
		variantId = (
			await createProduct(db, productInput.parse({ name: "Tee", status: "active", variants: [{ price_minor: 300000, stock_qty: 50 }] }))
		).variants[0]!.id;
	});

	it("is off by default: delivery is the store's charge", async () => {
		const rt = await extensionRuntime(db, EXTENSIONS);
		const placed = await placeOrder(db, checkout(2), { extensions: rt });
		expect(placed.total_minor).toBe(600000 + 12000);
	});

	it("when enabled, waives delivery at the threshold and keeps the order invariants", async () => {
		await setEnabledIds(db, ["free-delivery"]);
		expect(await getEnabledIds(db)).toEqual(["free-delivery"]);
		const rt = await extensionRuntime(db, EXTENSIONS);
		const small = await placeOrder(db, checkout(1), { extensions: rt }); // 3,000 < 5,000
		expect(small.total_minor).toBe(300000 + 12000);
		const big = await placeOrder(db, checkout(2), { extensions: rt }); // 6,000 >= 5,000
		expect(big.total_minor).toBe(600000);
		const row = await db
			.prepare(`SELECT subtotal_minor, delivery_minor, discount_minor, total_minor FROM cartde_orders WHERE order_number = ?1`)
			.bind(big.order_number)
			.first<Record<string, number>>();
		expect(row).toEqual({ subtotal_minor: 600000, delivery_minor: 0, discount_minor: 0, total_minor: 600000 });
	});

	it("the cart preview uses the same quote as the order", async () => {
		await setEnabledIds(db, ["free-delivery"]);
		const rt = await extensionRuntime(db, EXTENSIONS);
		const store = await getStore(db);
		const lines = await priceCart(db, [{ variant_id: variantId, quantity: 2 }]);
		const quote = await quoteTotals(store, lines, "Sylhet", rt);
		const placed = await placeOrder(db, checkout(2), { extensions: rt });
		expect(quote.total_minor).toBe(placed.total_minor);
	});

	it("a discount extension is stored in discount_minor and the total check still holds", async () => {
		const tenOff = ext("ten-off", { discount: (c) => Math.floor(c.subtotal_minor / 10) });
		const rt = createRuntime([tenOff], silent);
		const placed = await placeOrder(db, checkout(2), { extensions: rt });
		const row = await db
			.prepare(`SELECT subtotal_minor, delivery_minor, discount_minor, total_minor FROM cartde_orders WHERE order_number = ?1`)
			.bind(placed.order_number)
			.first<Record<string, number>>();
		expect(row).toEqual({ subtotal_minor: 600000, delivery_minor: 12000, discount_minor: 60000, total_minor: 552000 });
	});

	it("faulty extensions never block an order", async () => {
		const rt = createRuntime(
			[
				ext("bad", {
					adjustDelivery: () => {
						throw new Error("x");
					},
					discount: () => NaN,
					onOrderEvent: () => {
						throw new Error("y");
					},
				}),
			],
			silent,
		);
		const placed = await placeOrder(db, checkout(1), { extensions: rt });
		expect(placed.total_minor).toBe(312000);
	});

	it("order events fire for placement and status changes, without customer details", async () => {
		const events: OrderEvent[] = [];
		const rt = createRuntime(
			[
				ext("rec", {
					onOrderEvent: (e) => {
						events.push(e);
					},
				}),
			],
			silent,
		);
		const placed = await placeOrder(db, checkout(1), { extensions: rt });
		const again = await placeOrder(db, checkout(1, { idempotency_key: "ext-key-other-0000000002" }), { extensions: rt });
		expect(again.existing).toBe(false);
		const orderId = (await db
			.prepare(`SELECT id FROM cartde_orders WHERE order_number = ?1`)
			.bind(placed.order_number)
			.first<{ id: string }>())!.id;
		await transitionOrder(db, orderId, { to: "confirmed" }, null, { extensions: rt });
		expect(events.map((e) => [e.type, e.order_number, e.status, e.from_status])).toEqual([
			["order.placed", placed.order_number, "pending", null],
			["order.placed", again.order_number, "pending", null],
			["order.status_changed", placed.order_number, "confirmed", "pending"],
		]);
		expect(JSON.stringify(events)).not.toMatch(/Rahim|01712|Zindabazar|House/);
	});

	it("an idempotent retry does not emit a second event", async () => {
		const events: OrderEvent[] = [];
		const rt = createRuntime(
			[
				ext("rec", {
					onOrderEvent: (e) => {
						events.push(e);
					},
				}),
			],
			silent,
		);
		const input = checkout(1);
		await placeOrder(db, input, { extensions: rt });
		await placeOrder(db, input, { extensions: rt });
		expect(events).toHaveLength(1);
	});

	it("only known, compatible extensions can be enabled", async () => {
		await expect(setEnabledIds(db, ["does-not-exist"])).rejects.toMatchObject({ code: "invalid" });
		await expect(setEnabledIds(db, ["future"], [ext("future", {}, { cartdeApi: 9 })])).rejects.toMatchObject({ code: "invalid" });
		expect(await setEnabledIds(db, ["free-delivery", "free-delivery"])).toEqual(["free-delivery"]);
	});

	it("the sample extension's section hook returns valid data", async () => {
		const rt = createRuntime([freeDelivery], silent);
		expect((await rt.loadSection("free-delivery", { currency: "BDT", locale: "en-BD" }))?.title).toBe("Free delivery");
	});
});
