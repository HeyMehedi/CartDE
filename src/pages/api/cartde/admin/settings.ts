import { body, db, ok, route } from "../../../../cartde/app/http";
import { getStore, updateStore } from "../../../../cartde/db/store";
import { storeSettingsInput } from "../../../../cartde/domain/schemas";

export const GET = route(async () => ok(await getStore(db())));
export const PATCH = route(async (ctx) => ok(await updateStore(db(), storeSettingsInput.parse(await body(ctx)))));
