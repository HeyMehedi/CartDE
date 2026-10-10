import { env } from "cloudflare:workers";
import { body, db, fail, ok, route } from "../../../cartde/app/http";
import { checkoutAllowed, clientIp, type CheckoutLimiters } from "../../../cartde/app/ratelimit";
import { extensionRuntime } from "../../../cartde/app/extensions";
import { placeOrder } from "../../../cartde/db/orders";
import { checkoutInput } from "../../../cartde/domain/schemas";

export const POST = route(async (ctx) => {
	const input = checkoutInput.parse(await body(ctx));
	if (!(await checkoutAllowed(env as unknown as CheckoutLimiters, clientIp(ctx.request), input.phone))) {
		return fail(429, "rate_limited", "Too many order attempts. Please wait a minute and try again.");
	}
	const placed = await placeOrder(db(), input, { extensions: await extensionRuntime(db()) });
	return ok(
		{ order_number: placed.order_number, access_token: placed.access_token, total_minor: placed.total_minor, existing: placed.existing },
		placed.existing ? 200 : 201,
	);
});
