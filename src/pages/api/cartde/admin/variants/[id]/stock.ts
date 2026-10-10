import { actorId, body, db, ok, route } from "../../../../../../cartde/app/http";
import { adjustStock } from "../../../../../../cartde/db/products";
import { stockAdjustmentInput } from "../../../../../../cartde/domain/schemas";

export const POST = route(async (ctx) =>
	ok(await adjustStock(db(), ctx.params.id!, stockAdjustmentInput.parse(await body(ctx)), actorId(ctx))),
);
