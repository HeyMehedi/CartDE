import { actorId, body, db, ok, route } from "../../../../../../cartde/app/http";
import { addVariant } from "../../../../../../cartde/db/products";
import { variantInput } from "../../../../../../cartde/domain/schemas";

export const POST = route(async (ctx) =>
	ok(await addVariant(db(), ctx.params.id!, variantInput.parse(await body(ctx)), actorId(ctx)), 201),
);
