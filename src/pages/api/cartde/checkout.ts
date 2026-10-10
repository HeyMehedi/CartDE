import { body, db, ok, route } from "../../../cartde/app/http";
import { extensionRuntime } from "../../../cartde/app/extensions";
import { placeOrder } from "../../../cartde/db/orders";
import { checkoutInput } from "../../../cartde/domain/schemas";

export const POST = route(async (ctx) => {
	const placed = await placeOrder(db(), checkoutInput.parse(await body(ctx)), { extensions: await extensionRuntime(db()) });
	return ok(
		{ order_number: placed.order_number, access_token: placed.access_token, total_minor: placed.total_minor, existing: placed.existing },
		placed.existing ? 200 : 201,
	);
});
