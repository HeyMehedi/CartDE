/** CSV exports for the merchant (SRS 7.1). RFC 4180 quoting, plus a guard against spreadsheet formula injection. */

export function csvCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	let s = String(value);
	// A cell starting with = + - @ (or tab/CR) is run as a formula by Excel and Sheets; prefix it so it stays text.
	if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: readonly string[], rows: readonly Record<string, unknown>[]): string {
	return [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\r\n") + "\r\n";
}

const minorToMajor = (n: number) => (n / 100).toFixed(2);

export async function exportProducts(db: D1Database): Promise<string> {
	const { results } = await db
		.prepare(
			`SELECT p.id AS product_id, p.name, p.slug, p.status, v.id AS variant_id, v.title AS variant, v.sku, v.price_minor, v.compare_at_minor, v.stock_qty, v.status AS variant_status
			 FROM cartde_products p JOIN cartde_variants v ON v.product_id = p.id ORDER BY p.name, v.position`,
		)
		.all<Record<string, unknown> & { price_minor: number; compare_at_minor: number | null }>();
	const rows = results.map((r) => ({
		...r,
		price: minorToMajor(r.price_minor),
		compare_at: r.compare_at_minor === null ? "" : minorToMajor(r.compare_at_minor),
	}));
	return toCsv(
		["product_id", "name", "slug", "status", "variant_id", "variant", "sku", "price", "compare_at", "stock_qty", "variant_status"],
		rows,
	);
}

export async function exportOrders(db: D1Database): Promise<string> {
	const { results } = await db
		.prepare(
			`SELECT order_number, placed_at, status, payment_status, currency, subtotal_minor, delivery_minor, discount_minor, total_minor,
			        customer_name, customer_phone, customer_email, ship_line1, ship_area, ship_district, customer_note, merchant_note,
			        (SELECT SUM(quantity) FROM cartde_order_items i WHERE i.order_id = o.id) AS items
			 FROM cartde_orders o ORDER BY order_number`,
		)
		.all<Record<string, unknown> & { subtotal_minor: number; delivery_minor: number; discount_minor: number; total_minor: number }>();
	const rows = results.map((r) => ({
		...r,
		subtotal: minorToMajor(r.subtotal_minor),
		delivery: minorToMajor(r.delivery_minor),
		discount: minorToMajor(r.discount_minor),
		total: minorToMajor(r.total_minor),
	}));
	return toCsv(
		[
			"order_number",
			"placed_at",
			"status",
			"payment_status",
			"currency",
			"items",
			"subtotal",
			"delivery",
			"discount",
			"total",
			"customer_name",
			"customer_phone",
			"customer_email",
			"ship_line1",
			"ship_area",
			"ship_district",
			"customer_note",
			"merchant_note",
		],
		rows,
	);
}

export async function exportCustomers(db: D1Database): Promise<string> {
	const { results } = await db
		.prepare(
			`SELECT c.name, c.phone, c.email, c.created_at, COUNT(o.id) AS order_count, MAX(o.placed_at) AS last_order_at
			 FROM cartde_customers c LEFT JOIN cartde_orders o ON o.customer_id = c.id GROUP BY c.id ORDER BY c.created_at`,
		)
		.all<Record<string, unknown>>();
	return toCsv(["name", "phone", "email", "created_at", "order_count", "last_order_at"], results);
}
