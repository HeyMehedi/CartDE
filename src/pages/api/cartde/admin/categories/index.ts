import { body, db, ok, route } from "../../../../../cartde/app/http";
import { createCategory, listCategories } from "../../../../../cartde/db/categories";
import { categoryInput } from "../../../../../cartde/domain/schemas";

export const GET = route(async () => ok(await listCategories(db())));
export const POST = route(async (ctx) => ok(await createCategory(db(), categoryInput.parse(await body(ctx))), 201));
