import { z } from "zod";
import { body, db, ok, route } from "../../../../../../cartde/app/http";
import { deleteVariant, updateVariant } from "../../../../../../cartde/db/products";

const patch = z
	.object({
		sku: z.string().trim().min(1).max(64).nullable(),
		price_minor: z.number().int().min(0).max(1_000_000_000),
		compare_at_minor: z.number().int().min(0).max(1_000_000_000).nullable(),
		status: z.enum(["active", "inactive"]),
	})
	.partial()
	.strict();

export const PATCH = route(async (ctx) => {
	await updateVariant(db(), ctx.params.id!, patch.parse(await body(ctx)));
	return ok({ updated: true });
});

export const DELETE = route(async ({ params }) => {
	await deleteVariant(db(), params.id!);
	return ok({ deleted: true });
});
