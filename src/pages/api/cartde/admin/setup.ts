import { body, db, ok, route } from "../../../../cartde/app/http";
import { completeSetup } from "../../../../cartde/db/setup";
import { setupInput } from "../../../../cartde/domain/schemas";
import { resetStoreReadyCache } from "../../../../cartde/app/ready";

export const POST = route(async (ctx) => {
	const result = await completeSetup(db(), setupInput.parse(await body(ctx)));
	resetStoreReadyCache();
	return ok(result, 200);
});
