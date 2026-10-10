import { body, db, ok, route } from "../../../../../cartde/app/http";
import { deleteCategory, updateCategory } from "../../../../../cartde/db/categories";
import { categoryInput } from "../../../../../cartde/domain/schemas";

export const PATCH = route(async (ctx) => ok(await updateCategory(db(), ctx.params.id!, categoryInput.parse(await body(ctx)))));
export const DELETE = route(async ({ params }) => {
	await deleteCategory(db(), params.id!);
	return ok({ deleted: true });
});
