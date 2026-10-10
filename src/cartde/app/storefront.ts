/** Per-request storefront context: store details, theme, language and translator. Cached briefly per isolate. */
import { env } from "cloudflare:workers";
import { getStore, type StoreRow } from "../db/store";
import { getTheme } from "../db/theme";
import { defaultTheme, type ThemeSettings } from "../domain/theme";
import { langFor, t as translate, type Lang, type MessageKey } from "../i18n/messages";

export interface StorefrontContext {
	store: Pick<StoreRow, "name" | "currency" | "locale" | "contact_phone" | "status" | "delivery_inside_dhaka_minor" | "delivery_outside_dhaka_minor" | "low_stock_threshold">;
	theme: ThemeSettings;
	lang: Lang;
	t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const TTL_MS = 15_000;
let cached: { at: number; data: Omit<StorefrontContext, "t"> } | null = null;
export const resetStorefrontCache = () => { cached = null; };

const FALLBACK_STORE: StorefrontContext["store"] = { name: "Store", currency: "BDT", locale: "en-BD", contact_phone: null, status: "active", delivery_inside_dhaka_minor: 0, delivery_outside_dhaka_minor: 0, low_stock_threshold: 5 };

export async function storefrontContext(): Promise<StorefrontContext> {
	if (!cached || Date.now() - cached.at > TTL_MS) {
		let store = FALLBACK_STORE;
		let theme = defaultTheme();
		try {
			[store, theme] = await Promise.all([getStore(env.DB), getTheme(env.DB)]);
		} catch {
			/* tables not migrated yet: render with defaults rather than fail the page */
		}
		cached = { at: Date.now(), data: { store, theme, lang: langFor(store.locale) } };
	}
	const { lang } = cached.data;
	return { ...cached.data, t: (key, vars) => translate(lang, key, vars) };
}
