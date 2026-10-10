import { db, ok, route } from "../../../../../cartde/app/http";
import { listOrders } from "../../../../../cartde/db/orders";

export const GET = route(async ({ url }) => {
	const p = url.searchParams;
	return ok(await listOrders(db(), { q: p.get("q") ?? undefined, status: p.get("status") ?? undefined, page: Number(p.get("page")) || 1 }));
});
