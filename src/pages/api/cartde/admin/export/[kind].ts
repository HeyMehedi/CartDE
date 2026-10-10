import { db, fail, route } from "../../../../../cartde/app/http";
import { exportCustomers, exportOrders, exportProducts } from "../../../../../cartde/db/export";

const EXPORTS = { "products.csv": exportProducts, "orders.csv": exportOrders, "customers.csv": exportCustomers } as const;

/** GET /api/cartde/admin/export/{products,orders,customers}.csv — admin only (guarded by middleware). */
export const GET = route(async ({ params }) => {
	const kind = params.kind as keyof typeof EXPORTS;
	const build = EXPORTS[kind];
	if (!build) return fail(404, "not_found", "Unknown export.");
	const date = new Date().toISOString().slice(0, 10);
	return new Response("﻿" + (await build(db())), {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="cartde-${kind.replace(".csv", "")}-${date}.csv"`,
			"Cache-Control": "private, no-store",
		},
	});
});
