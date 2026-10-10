import { extensionRuntime } from "../../../../../../cartde/app/extensions";
import { actorId, body, db, ok, route } from "../../../../../../cartde/app/http";
import { transitionOrder } from "../../../../../../cartde/db/orders";
import { orderTransitionInput } from "../../../../../../cartde/domain/schemas";

export const POST = route(async (ctx) =>
	ok(
		await transitionOrder(db(), ctx.params.id!, orderTransitionInput.parse(await body(ctx)), actorId(ctx), {
			extensions: await extensionRuntime(db()),
		}),
	),
);
