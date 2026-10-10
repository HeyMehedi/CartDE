import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { executeTool, TOOL_NAMES, TOOLS, ToolInputError, type ToolContext } from "../../src/cartde/mcp/tools";
import { auditEntryForRequest, listAudit, summarizePayload } from "../../src/cartde/db/audit";
import { createProduct, getProduct, updateProduct } from "../../src/cartde/db/products";
import { placeOrder } from "../../src/cartde/db/orders";
import { completeSetup } from "../../src/cartde/db/setup";
import { checkoutInput, productInput, setupInput } from "../../src/cartde/domain/schemas";

let db: D1Database;
let ctx: ToolContext;
let variantId: string;
let productId: string;

beforeEach(async () => {
	db = createTestDb();
	ctx = { db, actorUserId: "admin1" };
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
	const p = await createProduct(
		db,
		productInput.parse({ name: "Tee", status: "active", variants: [{ price_minor: 90000, stock_qty: 10 }] }),
	);
	productId = p.id;
	variantId = p.variants[0]!.id;
});

const order = (n: number, qty = 1, over: Record<string, unknown> = {}) =>
	placeOrder(
		db,
		checkoutInput.parse({
			idempotency_key: `mcp-key-${String(n).padStart(16, "0")}`,
			name: "Rahim",
			phone: "01712345678",
			district: "Dhaka",
			area: "Mirpur",
			address: "House 5, Road 3",
			lines: [{ variant_id: variantId, quantity: qty }],
			...over,
		}),
	);

describe("read tools", () => {
	it("search_products", async () => {
		const r = (await executeTool("search_products", ctx, { query: "te" })) as { name: string }[];
		expect(r.map((p) => p.name)).toEqual(["Tee"]);
		expect(await executeTool("search_products", ctx, { query: "zzz" })).toEqual([]);
	});

	it("list_orders omits phone numbers; get_order_details returns fulfilment data", async () => {
		const placed = await order(1, 2);
		const list = (await executeTool("list_orders", ctx, {})) as { items: Record<string, unknown>[] };
		expect(list.items).toHaveLength(1);
		expect(list.items[0]).not.toHaveProperty("customer_phone");
		expect(JSON.stringify(list)).not.toContain("01712345678");
		const detail = (await executeTool("get_order_details", ctx, { order_number: placed.order_number })) as {
			ship_phone: string;
			items: unknown[];
		};
		expect(detail.ship_phone).toBe("01712345678");
		expect(JSON.stringify(detail)).not.toContain(placed.access_token);
		await expect(executeTool("get_order_details", ctx, { order_number: 99999 })).rejects.toMatchObject({ code: "not_found" });
	});

	it("get_sales_summary excludes cancelled orders from revenue", async () => {
		await order(1, 2);
		const second = await order(2, 1);
		await executeTool("update_order_status", ctx, { order_number: second.order_number, to: "cancelled" });
		const s = (await executeTool("get_sales_summary", ctx, { days: 7 })) as {
			orders: number;
			revenue_minor: number;
			by_status: Record<string, number>;
			top_products: { product_name: string; quantity: number }[];
			average_order_minor: number;
		};
		expect(s.orders).toBe(2);
		expect(s.by_status).toEqual({ pending: 1, cancelled: 1 });
		expect(s.revenue_minor).toBe(2 * 90000 + 6000);
		expect(s.average_order_minor).toBe(186000);
		expect(s.top_products).toEqual([{ product_name: "Tee", quantity: 2, revenue_minor: 180000 }]);
	});

	it("read tools write no audit entries", async () => {
		await executeTool("search_products", ctx, {});
		await executeTool("get_sales_summary", ctx, {});
		expect(await listAudit(db)).toHaveLength(0);
	});
});

describe("mutating tools", () => {
	it("create_product_draft makes a draft that shoppers cannot see, and audits it", async () => {
		const r = (await executeTool("create_product_draft", ctx, { name: "Mug", price_minor: 45000, stock_qty: 5, sku: "MUG-1" })) as {
			id: string;
			status: string;
			variant_id: string;
		};
		expect(r.status).toBe("draft");
		expect((await getProduct(db, r.id)).variants[0]).toMatchObject({ price_minor: 45000, stock_qty: 5, sku: "MUG-1" });
		const log = await listAudit(db);
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({
			actor_user_id: "admin1",
			actor_kind: "mcp",
			action: "mcp.create_product_draft",
			entity: "product",
			entity_id: r.id,
		});
		expect(log[0]!.payload_json).not.toContain("Mug"); // name is free text: only the key is stored
	});

	it("update_product cannot publish, and rejects unknown keys such as store_id", async () => {
		await expect(executeTool("update_product", ctx, { product_id: productId, status: "active" })).rejects.toBeInstanceOf(ToolInputError);
		await expect(executeTool("update_product", ctx, { product_id: productId, store_id: 2 })).rejects.toBeInstanceOf(ToolInputError);
		await executeTool("update_product", ctx, { product_id: productId, name: "Tee v2", status: "archived" });
		expect(await getProduct(db, productId)).toMatchObject({ name: "Tee v2", status: "archived" });
		await updateProduct(db, productId, { status: "active" });
	});

	it("update_inventory adjusts stock, refuses negative stock, and audits only successes", async () => {
		expect(await executeTool("update_inventory", ctx, { variant_id: variantId, delta: -4, note: "damaged" })).toEqual({ stock_qty: 6 });
		await expect(executeTool("update_inventory", ctx, { variant_id: variantId, delta: -100 })).rejects.toMatchObject({ code: "invalid" });
		await expect(executeTool("update_inventory", ctx, { variant_id: variantId, delta: 0 })).rejects.toBeInstanceOf(ToolInputError);
		const log = await listAudit(db);
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({ action: "mcp.update_inventory", entity: "variant", entity_id: variantId });
	});

	it("update_order_status follows the state machine, restocks on cancel, and audits", async () => {
		const placed = await order(1, 3);
		await expect(executeTool("update_order_status", ctx, { order_number: placed.order_number, to: "delivered" })).rejects.toMatchObject({
			code: "conflict",
		});
		await executeTool("update_order_status", ctx, { order_number: placed.order_number, to: "confirmed", note: "called customer" });
		const r = await executeTool("update_order_status", ctx, { order_number: placed.order_number, to: "cancelled" });
		expect(r).toMatchObject({ status: "cancelled" });
		const stock = await db.prepare(`SELECT stock_qty FROM cartde_variants WHERE id = ?1`).bind(variantId).first<{ stock_qty: number }>();
		expect(stock!.stock_qty).toBe(10);
		const log = await listAudit(db, { entity: "order" });
		expect(log.map((l) => l.action)).toEqual(["mcp.update_order_status", "mcp.update_order_status"]);
		expect(log.every((l) => l.entity_id === String(placed.order_number))).toBe(true);
		const events = await db
			.prepare(`SELECT actor_user_id FROM cartde_order_events WHERE actor_user_id IS NOT NULL`)
			.all<{ actor_user_id: string }>();
		expect(events.results.every((e) => e.actor_user_id === "admin1")).toBe(true);
	});

	it("create_discount_draft stores drafts only and validates", async () => {
		const d = (await executeTool("create_discount_draft", ctx, { code: "eid10", kind: "percent", value: 10 })) as {
			code: string;
			status: string;
		};
		expect(d).toMatchObject({ code: "EID10", status: "draft" });
		await expect(executeTool("create_discount_draft", ctx, { code: "EID10", kind: "percent", value: 5 })).rejects.toMatchObject({
			code: "conflict",
		});
		await expect(executeTool("create_discount_draft", ctx, { code: "BIG", kind: "percent", value: 150 })).rejects.toBeInstanceOf(
			ToolInputError,
		);
		await expect(executeTool("create_discount_draft", ctx, { code: "x", kind: "fixed", value: 5 })).rejects.toBeInstanceOf(ToolInputError);
		await expect(
			executeTool("create_discount_draft", ctx, { code: "BAD", kind: "fixed", value: 5, status: "active" }),
		).resolves.toMatchObject({ status: "draft" });
		const rows = await db.prepare(`SELECT status FROM cartde_discounts`).all<{ status: string }>();
		expect(rows.results.every((r) => r.status === "draft")).toBe(true);
	});
});

describe("tool contract (FR-AI-3, FR-AI-4)", () => {
	it("exposes exactly the specified tools", () => {
		expect([...TOOL_NAMES].sort()).toEqual([
			"create_discount_draft",
			"create_product_draft",
			"get_order_details",
			"get_sales_summary",
			"list_orders",
			"search_products",
			"update_inventory",
			"update_order_status",
			"update_product",
		]);
	});
	it("no input schema accepts a store, user or actor argument", () => {
		for (const name of TOOL_NAMES) {
			const probe = TOOLS[name].input.safeParse({ store_id: 2, user_id: "x", actor_user_id: "x", role: "admin" });
			if (probe.success) throw new Error(`${name} accepted identity fields`);
			const json = JSON.stringify(TOOLS[name].input.toJSONSchema?.() ?? {});
			expect(json).not.toMatch(/store_id|user_id|actor/);
		}
	});
	it("flags the destructive tool and every mutating tool audits", () => {
		expect(TOOLS.update_order_status.destructive).toBe(true);
		expect(TOOL_NAMES.filter((n) => TOOLS[n].mutates).sort()).toEqual([
			"create_discount_draft",
			"create_product_draft",
			"update_inventory",
			"update_order_status",
			"update_product",
		]);
		expect(TOOL_NAMES.filter((n) => TOOLS[n].destructive)).toEqual(["update_order_status"]);
	});
	it("tools need no external model API key (FR-AI-5)", () => {
		const src = JSON.stringify(Object.values(TOOLS).map((t) => t.run.toString()));
		expect(src).not.toMatch(/api[_-]?key|anthropic|openai/i);
	});
});

describe("audit helpers", () => {
	it("summarizePayload hides personal and free-text values", () => {
		expect(
			summarizePayload({
				to: "shipped",
				delta: -2,
				name: "Rahim",
				phone: "017",
				note: "hi",
				restock: true,
				big: "x".repeat(50),
				nested: { a: 1 },
			}),
		).toEqual({ to: "shipped", delta: -2, name: "(set)", phone: "(set)", note: "(set)", restock: true, big: "(set)", nested: "(set)" });
		expect(summarizePayload(null)).toEqual({});
	});
	it("builds the entry for an admin HTTP mutation", () => {
		expect(
			auditEntryForRequest({
				method: "POST",
				routePattern: "/api/cartde/admin/orders/[id]/transition",
				params: { id: "O1" },
				userId: "u1",
				bodyText: '{"to":"shipped","note":"call first"}',
			}),
		).toEqual({
			actor_user_id: "u1",
			actor_kind: "user",
			action: "POST /orders/[id]/transition",
			entity: "orders",
			entity_id: "O1",
			payload: { to: "shipped", note: "(set)" },
		});
		expect(
			auditEntryForRequest({
				method: "DELETE",
				routePattern: "/api/cartde/admin/products/[id]",
				params: { id: "P" },
				userId: null,
				bodyText: "",
			}).payload,
		).toEqual({});
		expect(
			auditEntryForRequest({ method: "PATCH", routePattern: "/api/cartde/admin/settings", params: {}, userId: "u", bodyText: "not json" })
				.entity,
		).toBe("settings");
	});
});
