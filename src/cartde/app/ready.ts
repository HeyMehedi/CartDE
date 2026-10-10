import { env } from "cloudflare:workers";
import { storeIsReady } from "../db/setup";

/** Positive results are cached briefly per isolate so storefront requests do not pay a query each time. */
let readyUntil = 0;
export const resetStoreReadyCache = () => { readyUntil = 0; };

export async function checkStoreReady(): Promise<{ ready: boolean; reason?: "migrations" | "setup" }> {
	if (Date.now() < readyUntil) return { ready: true };
	const r = await storeIsReady(env.DB);
	if (r.ready) readyUntil = Date.now() + 30_000;
	return r;
}
