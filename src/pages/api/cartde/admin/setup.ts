import { body, db, ok, route } from "../../../../cartde/app/http";
import { resetStoreReadyCache } from "../../../../cartde/app/ready";
import { resetStorefrontCache } from "../../../../cartde/app/storefront";
import { completeSetup } from "../../../../cartde/db/setup";
import { setupInput } from "../../../../cartde/domain/schemas";

export const POST = route(async (ctx) => {
	const result = await completeSetup(db(), setupInput.parse(await body(ctx)));
	resetStoreReadyCache();
	resetStorefrontCache();
	return ok(result, 200);
});
