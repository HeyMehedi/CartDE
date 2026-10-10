import { body, db, ok, route } from "../../../../cartde/app/http";
import { resetStorefrontCache } from "../../../../cartde/app/storefront";
import { getTheme, saveTheme } from "../../../../cartde/db/theme";

export const GET = route(async () => ok(await getTheme(db())));

export const PATCH = route(async (ctx) => {
	const theme = await saveTheme(db(), await body(ctx));
	resetStorefrontCache();
	return ok(theme);
});
