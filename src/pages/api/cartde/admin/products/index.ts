import { actorId, body, db, ok, route } from "../../../../../cartde/app/http";
import { createProduct, listProducts } from "../../../../../cartde/db/products";
import { productInput } from "../../../../../cartde/domain/schemas";

export const GET = route(async ({ url }) => {
	const p = url.searchParams;
	return ok(await listProducts(db(), {
		search: p.get("q")?.trim() || undefined,
		status: p.get("status") || undefined,
		limit: Number(p.get("limit")) || undefined,
		offset: Number(p.get("offset")) || undefined,
	}));
});

export const POST = route(async (ctx) => {
	const input = productInput.parse(await body(ctx));
	return ok(await createProduct(db(), input, actorId(ctx)), 201);
});
