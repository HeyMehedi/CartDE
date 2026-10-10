import { body, db, ok, route } from "../../../../cartde/app/http";
import { resetStorefrontCache } from "../../../../cartde/app/storefront";
import { getStore, updateStore } from "../../../../cartde/db/store";
import { storeSettingsInput } from "../../../../cartde/domain/schemas";

export const GET = route(async () => ok(await getStore(db())));

export const PATCH = route(async (ctx) => {
	const store = await updateStore(db(), storeSettingsInput.parse(await body(ctx)));
	resetStorefrontCache(); // name, locale and delivery charges show on the storefront immediately
	return ok(store);
});
