import { z } from "zod";
import { body, db, ok, route } from "../../../../cartde/app/http";
import { getEnabledIds, registry, setEnabledIds } from "../../../../cartde/app/extensions";
import { resetStorefrontCache } from "../../../../cartde/app/storefront";

const input = z.object({ enabled: z.array(z.string().max(41)).max(50) }).strict();

async function snapshot() {
	const { available, rejected } = registry();
	const enabled = await getEnabledIds(db());
	return { available: available.map((e) => ({ id: e.id, name: e.name, description: e.description, enabled: enabled.includes(e.id), hooks: Object.keys(e.hooks) })), rejected };
}

export const GET = route(async () => ok(await snapshot()));

export const PATCH = route(async (ctx) => {
	await setEnabledIds(db(), input.parse(await body(ctx)).enabled);
	resetStorefrontCache();
	return ok(await snapshot());
});
