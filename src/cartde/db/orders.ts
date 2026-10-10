import type { z } from "zod";
import { computeTotals, normalizeCart } from "../domain/cart";
import { zoneFor } from "../domain/geo/districts";
import { ORDER_STATUSES, canTransition, transitionEffect, type OrderStatus, type PaymentStatus } from "../domain/orders";
import type { checkoutInput, orderTransitionInput } from "../domain/schemas";
import { getStore } from "./store";
import { CartdeError, isUniqueViolation, newId, nowIso } from "./util";

export interface CartLineView {
	variant_id: string;
	product_id: string;
	product_name: string;
	product_slug: string;
	variant_title: string;
	sku: string | null;
	unit_price_minor: number;
	compare_at_minor: number | null;
	quantity: number;
	stock_qty: number;
	available: boolean;
	/** Why the line cannot be ordered, or null. */
	problem: string | null;
	line_total_minor: number;
	media_id: string | null;
}

/** Re-price cart lines from the database (FR-ORD-2, FR-CART-2, FR-CART-3). Unknown variants are reported, not dropped. */
export async function priceCart(db: D1Database, lines: { variant_id: string; quantity: number }[]): Promise<CartLineView[]> {
	const merged = normalizeCart(lines);
	if (merged.length === 0) return [];
	const marks = merged.map((_, i) => `?${i + 1}`).join(",");
	const { results } = await db
		.prepare(
			`SELECT v.id AS variant_id, v.product_id, p.name AS product_name, p.slug AS product_slug, v.title AS variant_title, v.sku,
			        v.price_minor, v.compare_at_minor, v.stock_qty, v.status AS variant_status, p.status AS product_status, p.featured_media_id AS media_id
			 FROM cartde_variants v JOIN cartde_products p ON p.id = v.product_id WHERE v.id IN (${marks})`,
		)
		.bind(...merged.map((l) => l.variant_id))
		.all<{
			variant_id: string; product_id: string; product_name: string; product_slug: string; variant_title: string; sku: string | null;
			price_minor: number; compare_at_minor: number | null; stock_qty: number; variant_status: string; product_status: string; media_id: string | null;
		}>();
	const byId = new Map(results.map((r) => [r.variant_id, r]));
	return merged.map((l): CartLineView => {
		const r = byId.get(l.variant_id);
		if (!r) {
			return { variant_id: l.variant_id, product_id: "", product_name: "Unavailable item", product_slug: "", variant_title: "", sku: null, unit_price_minor: 0, compare_at_minor: null, quantity: l.quantity, stock_qty: 0, available: false, problem: "This item is no longer sold.", line_total_minor: 0, media_id: null };
		}
		let problem: string | null = null;
		if (r.product_status !== "active" || r.variant_status !== "active") problem = "This item is no longer available.";
		else if (r.stock_qty < 1) problem = "Out of stock.";
		else if (r.stock_qty < l.quantity) problem = `Only ${r.stock_qty} left.`;
		return {
			variant_id: r.variant_id, product_id: r.product_id, product_name: r.product_name, product_slug: r.product_slug, variant_title: r.variant_title, sku: r.sku,
			unit_price_minor: r.price_minor, compare_at_minor: r.compare_at_minor, quantity: l.quantity, stock_qty: r.stock_qty, available: problem === null, problem,
			line_total_minor: r.price_minor * l.quantity, media_id: r.media_id,
		};
	});
}

export interface PlacedOrder {
	order_number: number;
	access_token: string;
	total_minor: number;
	existing: boolean;
}

const token = (): string => {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Aborts the surrounding batch when the previous statement changed no rows (NOT NULL violation on purpose). */
const guard = (db: D1Database) => db.prepare(`INSERT INTO cartde_counters (name, value) SELECT 'guard', NULL WHERE changes() = 0`);
const isGuardFailure = (err: unknown) => err instanceof Error && /NOT NULL constraint failed: cartde_counters\.value/i.test(err.message);

async function findByKey(db: D1Database, key: string): Promise<PlacedOrder | null> {
	const row = await db.prepare(`SELECT order_number, access_token, total_minor FROM cartde_orders WHERE idempotency_key = ?1`).bind(key).first<Omit<PlacedOrder, "existing">>();
	return row ? { ...row, existing: true } : null;
}

/** FR-ORD-2..5, FR-ORD-7: one atomic batch; retried submissions with the same key return the same order. */
export async function placeOrder(db: D1Database, input: z.infer<typeof checkoutInput>): Promise<PlacedOrder> {
	const prior = await findByKey(db, input.idempotency_key);
	if (prior) return prior;

	const store = await getStore(db);
	if (store.status === "paused") throw new CartdeError("conflict", "The store is not taking orders right now.");

	const lines = await priceCart(db, input.lines);
	const bad = lines.find((l) => !l.available);
	if (bad) throw new CartdeError("conflict", `${bad.product_name}${bad.variant_title && bad.variant_title !== "Default" ? ` (${bad.variant_title})` : ""}: ${bad.problem}`, { [bad.variant_id]: bad.problem ?? "Unavailable" });

	const delivery = zoneFor(input.district) === "inside_dhaka" ? store.delivery_inside_dhaka_minor : store.delivery_outside_dhaka_minor;
	const totals = computeTotals(lines, delivery);
	const orderId = newId();
	const accessToken = token();
	const now = nowIso();

	const stmts: D1PreparedStatement[] = [
		db.prepare(`INSERT OR IGNORE INTO cartde_customers (id, name, phone, email, created_at) VALUES (?1,?2,?3,?4,?5)`).bind(newId(), input.name, input.phone, input.email ?? null, now),
	];
	for (const l of lines) {
		stmts.push(
			db.prepare(`UPDATE cartde_variants SET stock_qty = stock_qty - ?2, updated_at = ?3 WHERE id = ?1 AND stock_qty >= ?2 AND status = 'active'`).bind(l.variant_id, l.quantity, now),
			guard(db),
		);
	}
	stmts.push(
		db.prepare(`UPDATE cartde_counters SET value = value + 1 WHERE name = 'order_number'`),
		db
			.prepare(
				`INSERT INTO cartde_orders (id, order_number, access_token, status, payment_method, payment_status, currency, subtotal_minor, delivery_minor, discount_minor, total_minor,
				   customer_id, customer_name, customer_phone, customer_email, ship_recipient_name, ship_phone, ship_line1, ship_area, ship_district, customer_note,
				   idempotency_key, placed_at, created_at, updated_at)
				 VALUES (?1, (SELECT value FROM cartde_counters WHERE name = 'order_number'), ?2, 'pending', 'cod', 'unpaid', ?3, ?4, ?5, ?6, ?7,
				   (SELECT id FROM cartde_customers WHERE phone = ?8), ?9, ?8, ?10, ?9, ?8, ?11, ?12, ?13, ?14, ?15, ?16, ?16, ?16)`,
			)
			.bind(orderId, accessToken, store.currency, totals.subtotal_minor, totals.delivery_minor, totals.discount_minor, totals.total_minor, input.phone, input.name, input.email ?? null, input.address, input.area, input.district, input.note ?? null, input.idempotency_key, now),
	);
	for (const l of lines) {
		stmts.push(
			db
				.prepare(`INSERT INTO cartde_order_items (id, order_id, product_id, variant_id, product_name, variant_title, sku, quantity, unit_price_minor, line_total_minor) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
				.bind(newId(), orderId, l.product_id, l.variant_id, l.product_name, l.variant_title, l.sku, l.quantity, l.unit_price_minor, l.line_total_minor),
			db
				.prepare(`INSERT INTO cartde_inventory_events (id, variant_id, delta, reason, order_id, created_at) VALUES (?1,?2,?3,'order',?4,?5)`)
				.bind(newId(), l.variant_id, -l.quantity, orderId, now),
		);
	}
	stmts.push(
		db.prepare(`INSERT INTO cartde_order_events (id, order_id, from_status, to_status, note, created_at) VALUES (?1,?2,NULL,'pending','Order placed',?3)`).bind(newId(), orderId, now),
		db
			.prepare(`INSERT INTO cartde_customer_addresses (id, customer_id, recipient_name, phone, line1, area, district, created_at) SELECT ?1, id, ?2, ?3, ?4, ?5, ?6, ?7 FROM cartde_customers WHERE phone = ?3`)
			.bind(newId(), input.name, input.phone, input.address, input.area, input.district, now),
	);

	try {
		await db.batch(stmts);
	} catch (err) {
		if (isUniqueViolation(err) && /idempotency_key/i.test(String(err))) {
			const again = await findByKey(db, input.idempotency_key);
			if (again) return again;
		}
		if (isGuardFailure(err)) {
			// Stock moved between pricing and the batch; tell the shopper which line is short.
			const fresh = (await priceCart(db, input.lines)).find((l) => !l.available);
			throw new CartdeError("conflict", fresh ? `${fresh.product_name}: ${fresh.problem}` : "An item just sold out. Please review your cart.", fresh ? { [fresh.variant_id]: fresh.problem ?? "Unavailable" } : undefined);
		}
		throw err;
	}
	const placed = await findByKey(db, input.idempotency_key);
	if (!placed) throw new Error("Order was not stored.");
	return { ...placed, existing: false };
}

// ---------- reads ----------

export interface OrderRow {
	id: string; order_number: number; status: OrderStatus; payment_method: "cod"; payment_status: PaymentStatus; currency: string;
	subtotal_minor: number; delivery_minor: number; discount_minor: number; total_minor: number;
	customer_id: string | null; customer_name: string; customer_phone: string; customer_email: string | null;
	ship_recipient_name: string; ship_phone: string; ship_line1: string; ship_line2: string | null; ship_area: string; ship_district: string;
	ship_postal_code: string | null; ship_instructions: string | null; customer_note: string | null; merchant_note: string | null; placed_at: string;
}
export interface OrderItemRow { id: string; product_id: string | null; variant_id: string | null; product_name: string; variant_title: string; sku: string | null; quantity: number; unit_price_minor: number; line_total_minor: number }
export interface OrderEventRow { id: string; from_status: string | null; to_status: string; actor_user_id: string | null; note: string | null; created_at: string }
export interface OrderDetail extends OrderRow { items: OrderItemRow[]; events: OrderEventRow[] }

const ORDER_COLS = `id, order_number, status, payment_method, payment_status, currency, subtotal_minor, delivery_minor, discount_minor, total_minor, customer_id, customer_name, customer_phone, customer_email,
  ship_recipient_name, ship_phone, ship_line1, ship_line2, ship_area, ship_district, ship_postal_code, ship_instructions, customer_note, merchant_note, placed_at`;

async function withChildren(db: D1Database, row: OrderRow): Promise<OrderDetail> {
	const [items, events] = await db.batch([
		db.prepare(`SELECT id, product_id, variant_id, product_name, variant_title, sku, quantity, unit_price_minor, line_total_minor FROM cartde_order_items WHERE order_id = ?1 ORDER BY rowid`).bind(row.id),
		db.prepare(`SELECT id, from_status, to_status, actor_user_id, note, created_at FROM cartde_order_events WHERE order_id = ?1 ORDER BY created_at, rowid`).bind(row.id),
	]);
	return { ...row, items: items.results as OrderItemRow[], events: events.results as OrderEventRow[] };
}

export async function getOrder(db: D1Database, id: string): Promise<OrderDetail> {
	const row = await db.prepare(`SELECT ${ORDER_COLS} FROM cartde_orders WHERE id = ?1`).bind(id).first<OrderRow>();
	if (!row) throw new CartdeError("not_found", "Order not found.");
	return withChildren(db, row);
}

const safeEqual = (a: string, b: string) => {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
};

/** FR-ORD-6: public lookup needs the order number AND its access token. Returns null for any mismatch. */
export async function getOrderForShopper(db: D1Database, orderNumber: number, accessToken: string): Promise<OrderDetail | null> {
	if (!Number.isSafeInteger(orderNumber) || !accessToken) return null;
	const row = await db.prepare(`SELECT ${ORDER_COLS}, access_token FROM cartde_orders WHERE order_number = ?1`).bind(orderNumber).first<OrderRow & { access_token: string }>();
	if (!row || !safeEqual(row.access_token, accessToken)) return null;
	const { access_token: _omit, ...order } = row;
	return withChildren(db, order);
}

export interface OrderListItem { id: string; order_number: number; status: OrderStatus; customer_name: string; customer_phone: string; total_minor: number; currency: string; placed_at: string }

export const ORDERS_PAGE_SIZE = 25;

export async function listOrders(db: D1Database, opts: { q?: string; status?: string; page?: number } = {}): Promise<{ items: OrderListItem[]; total: number; page: number }> {
	const page = Math.max(1, Math.floor(opts.page ?? 1));
	const q = opts.q?.trim() || null;
	const like = q ? `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
	const number = q && /^\d{1,12}$/.test(q) ? Number(q) : null;
	const status = opts.status && (ORDER_STATUSES as readonly string[]).includes(opts.status) ? opts.status : null;
	const where = `(?1 IS NULL OR order_number = ?2 OR customer_phone LIKE ?1 ESCAPE '\\' OR customer_name LIKE ?1 ESCAPE '\\') AND (?3 IS NULL OR status = ?3)`;
	const [list, count] = await db.batch([
		db.prepare(`SELECT id, order_number, status, customer_name, customer_phone, total_minor, currency, placed_at FROM cartde_orders WHERE ${where} ORDER BY order_number DESC LIMIT ?4 OFFSET ?5`).bind(like, number, status, ORDERS_PAGE_SIZE, (page - 1) * ORDERS_PAGE_SIZE),
		db.prepare(`SELECT COUNT(*) AS n FROM cartde_orders WHERE ${where}`).bind(like, number, status),
	]);
	return { items: list.results as OrderListItem[], total: (count.results[0] as { n: number }).n, page };
}

// ---------- writes ----------

/** FR-ORD-9: transition with its side effects in one atomic batch, conditional on the status the caller saw. */
export async function transitionOrder(db: D1Database, orderId: string, input: z.infer<typeof orderTransitionInput>, actorUserId: string | null): Promise<OrderDetail> {
	const order = await getOrder(db, orderId);
	if (!canTransition(order.status, input.to)) {
		try { transitionEffect(order.status, input.to, order.payment_status); } catch (err) { throw new CartdeError("conflict", (err as Error).message); }
	}
	const effect = transitionEffect(order.status, input.to, order.payment_status, { restock: input.restock, cashReturned: input.cash_returned });
	const now = nowIso();
	const stmts: D1PreparedStatement[] = [
		db.prepare(`UPDATE cartde_orders SET status = ?2, payment_status = ?3, updated_at = ?4 WHERE id = ?1 AND status = ?5`).bind(orderId, input.to, effect.payment, now, order.status),
		guard(db),
		db.prepare(`INSERT INTO cartde_order_events (id, order_id, from_status, to_status, actor_user_id, note, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(newId(), orderId, order.status, input.to, actorUserId, input.note ?? null, now),
	];
	if (effect.restock && effect.restockReason) {
		for (const item of order.items) {
			if (!item.variant_id) continue; // variant was deleted; nothing to restock
			stmts.push(
				db.prepare(`UPDATE cartde_variants SET stock_qty = stock_qty + ?2, updated_at = ?3 WHERE id = ?1`).bind(item.variant_id, item.quantity, now),
				db.prepare(`INSERT INTO cartde_inventory_events (id, variant_id, delta, reason, order_id, actor_user_id, note, created_at) SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE changes() > 0`)
					.bind(newId(), item.variant_id, item.quantity, effect.restockReason, orderId, actorUserId, `Order #${order.order_number}`, now),
			);
		}
	}
	try {
		await db.batch(stmts);
	} catch (err) {
		if (isGuardFailure(err)) throw new CartdeError("conflict", "This order was changed by someone else. Reload and try again.");
		throw err;
	}
	return getOrder(db, orderId);
}

/** FR-ORD-10: the only order field a merchant can edit after creation. */
export async function setMerchantNote(db: D1Database, orderId: string, note: string | null): Promise<void> {
	const res = await db.prepare(`UPDATE cartde_orders SET merchant_note = ?2, updated_at = ?3 WHERE id = ?1`).bind(orderId, note, nowIso()).run();
	if (!res.meta.changes) throw new CartdeError("not_found", "Order not found.");
}

// ---------- customers and overview ----------

export interface CustomerRow { id: string; name: string; phone: string; email: string | null; order_count: number; last_order_at: string | null }

export async function listCustomers(db: D1Database, opts: { q?: string; limit?: number } = {}): Promise<CustomerRow[]> {
	const like = opts.q?.trim() ? `%${opts.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
	const { results } = await db
		.prepare(
			`SELECT c.id, c.name, c.phone, c.email, COUNT(o.id) AS order_count, MAX(o.placed_at) AS last_order_at
			 FROM cartde_customers c LEFT JOIN cartde_orders o ON o.customer_id = c.id
			 WHERE (?1 IS NULL OR c.name LIKE ?1 ESCAPE '\\' OR c.phone LIKE ?1 ESCAPE '\\')
			 GROUP BY c.id ORDER BY last_order_at DESC LIMIT ?2`,
		)
		.bind(like, Math.min(opts.limit ?? 100, 500))
		.all<CustomerRow>();
	return results;
}

export async function getCustomerOrders(db: D1Database, customerId: string): Promise<{ customer: CustomerRow; orders: OrderListItem[] }> {
	const customer = (await listCustomers(db, { limit: 500 })).find((c) => c.id === customerId);
	if (!customer) throw new CartdeError("not_found", "Customer not found.");
	const { results } = await db
		.prepare(`SELECT id, order_number, status, customer_name, customer_phone, total_minor, currency, placed_at FROM cartde_orders WHERE customer_id = ?1 ORDER BY order_number DESC`)
		.bind(customerId)
		.all<OrderListItem>();
	return { customer, orders: results };
}

/** FR-ADM-4. `dayStartIso` is the start of "today" in the store's time zone, as a UTC instant. */
export async function overview(db: D1Database, dayStartIso: string) {
	const store = await getStore(db);
	const [pending, today, active, low] = await db.batch([
		db.prepare(`SELECT COUNT(*) AS n FROM cartde_orders WHERE status = 'pending'`),
		db.prepare(`SELECT COUNT(*) AS n FROM cartde_orders WHERE placed_at >= ?1`).bind(dayStartIso),
		db.prepare(`SELECT COUNT(*) AS n FROM cartde_products WHERE status = 'active'`),
		db.prepare(`SELECT COUNT(*) AS n FROM cartde_variants v JOIN cartde_products p ON p.id = v.product_id WHERE v.status = 'active' AND p.status = 'active' AND v.stock_qty <= ?1`).bind(store.low_stock_threshold),
	]);
	const n = (r: { results: unknown[] }) => (r.results[0] as { n: number }).n;
	return { pending_orders: n(pending), orders_today: n(today), active_products: n(active), low_stock_variants: n(low) };
}

// ---------- reporting ----------

export interface SalesSummary {
	currency: string;
	days: number;
	since: string;
	orders: number;
	revenue_minor: number;
	average_order_minor: number;
	by_status: Record<string, number>;
	top_products: { product_name: string; quantity: number; revenue_minor: number }[];
}

/** Revenue counts orders that are not cancelled or returned. */
export async function salesSummary(db: D1Database, days: number, now: Date = new Date()): Promise<SalesSummary> {
	const store = await getStore(db);
	const since = new Date(now.getTime() - days * 86_400_000).toISOString();
	const [byStatus, totals, top] = await db.batch([
		db.prepare(`SELECT status, COUNT(*) AS n FROM cartde_orders WHERE placed_at >= ?1 GROUP BY status`).bind(since),
		db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_minor), 0) AS revenue FROM cartde_orders WHERE placed_at >= ?1 AND status NOT IN ('cancelled', 'returned')`).bind(since),
		db.prepare(
			`SELECT i.product_name, SUM(i.quantity) AS quantity, SUM(i.line_total_minor) AS revenue_minor
			 FROM cartde_order_items i JOIN cartde_orders o ON o.id = i.order_id
			 WHERE o.placed_at >= ?1 AND o.status NOT IN ('cancelled', 'returned')
			 GROUP BY i.product_name ORDER BY quantity DESC, revenue_minor DESC LIMIT 5`,
		).bind(since),
	]);
	const t = totals.results[0] as { n: number; revenue: number };
	const by_status: Record<string, number> = {};
	for (const r of byStatus.results as { status: string; n: number }[]) by_status[r.status] = r.n;
	const orders = Object.values(by_status).reduce((a, b) => a + b, 0);
	return {
		currency: store.currency, days, since, orders, revenue_minor: t.revenue,
		average_order_minor: t.n ? Math.round(t.revenue / t.n) : 0, by_status,
		top_products: top.results as SalesSummary["top_products"],
	};
}

export async function getOrderIdByNumber(db: D1Database, orderNumber: number): Promise<string> {
	const row = await db.prepare(`SELECT id FROM cartde_orders WHERE order_number = ?1`).bind(orderNumber).first<{ id: string }>();
	if (!row) throw new CartdeError("not_found", `Order #${orderNumber} not found.`);
	return row.id;
}
