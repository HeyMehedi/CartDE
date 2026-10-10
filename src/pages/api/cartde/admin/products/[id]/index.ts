import { body, db, ok, route } from "../../../../../../cartde/app/http";
import { deleteProduct, getProduct, updateProduct } from "../../../../../../cartde/db/products";
import { productInput } from "../../../../../../cartde/domain/schemas";

const patch = productInput
	.pick({ name: true, slug: true, description_md: true, status: true, featured_media_id: true, seo_title: true, seo_description: true, category_ids: true })
	.partial()
	.strict();

export const GET = route(async ({ params }) => ok(await getProduct(db(), params.id!)));

export const PATCH = route(async (ctx) => ok(await updateProduct(db(), ctx.params.id!, patch.parse(await body(ctx)))));

export const DELETE = route(async ({ params }) => {
	await deleteProduct(db(), params.id!);
	return ok({ deleted: true });
});
