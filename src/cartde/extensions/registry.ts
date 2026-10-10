import {
	EXTENSION_API_VERSION,
	HOOK_TIMEOUT_MS,
	MAX_DELIVERY_MINOR,
	type Extension,
	type ExtensionRuntime,
	type OrderEvent,
	type PricingContext,
	type SectionContext,
	type SectionData,
} from "./types";

const ID = /^[a-z][a-z0-9-]{1,40}$/;

export interface RegistryResult {
	/** Extensions that passed the compatibility rules. */
	available: Extension[];
	rejected: { id: string; reason: string }[];
}

export function buildRegistry(extensions: readonly Extension[]): RegistryResult {
	const available: Extension[] = [];
	const rejected: RegistryResult["rejected"] = [];
	const seen = new Set<string>();
	for (const ext of extensions) {
		const id = typeof ext?.id === "string" ? ext.id : "(unknown)";
		if (!ID.test(id)) rejected.push({ id, reason: "id must be lowercase kebab-case (2-41 characters)" });
		else if (seen.has(id)) rejected.push({ id, reason: "duplicate id" });
		else if (ext.cartdeApi !== EXTENSION_API_VERSION)
			rejected.push({ id, reason: `built for extension API ${String(ext.cartdeApi)}, this CartDE provides ${EXTENSION_API_VERSION}` });
		else if (!ext.name || typeof ext.hooks !== "object" || ext.hooks === null) rejected.push({ id, reason: "missing name or hooks" });
		else {
			seen.add(id);
			available.push(ext);
		}
	}
	return { available, rejected };
}

type Logger = (message: string, detail?: unknown) => void;
const defaultLog: Logger = (message, detail) => console.error(`cartde extension: ${message}`, detail ?? "");

/** Run one hook with a time budget; returns undefined on throw or timeout. */
async function guarded<T>(id: string, hook: string, fn: () => T | Promise<T>, log: Logger, timeoutMs: number): Promise<T | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			Promise.resolve().then(fn),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("timed out")), timeoutMs);
			}),
		]);
	} catch (err) {
		log(`${id}.${hook} ignored: ${err instanceof Error ? err.message : "failed"}`);
		return undefined;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

const isMinor = (n: unknown, max: number): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= max;

function cleanSection(raw: SectionData | null | undefined): SectionData | null {
	if (!raw || typeof raw.title !== "string" || !raw.title.trim()) return null;
	const items = (raw.items ?? [])
		.filter(
			(i) =>
				typeof i?.label === "string" && typeof i?.url === "string" && (/^\/(?![/\\])/.test(i.url) || /^https?:\/\/[^\s]+$/i.test(i.url)),
		)
		.slice(0, 12)
		.map((i) => ({
			label: i.label.slice(0, 80),
			url: i.url.slice(0, 300),
			...(typeof i.note === "string" ? { note: i.note.slice(0, 120) } : {}),
		}));
	return { title: raw.title.trim().slice(0, 80), ...(typeof raw.body === "string" ? { body: raw.body.slice(0, 500) } : {}), items };
}

/** The runtime the core calls. Only enabled extensions take part; order follows the registration order. */
export function createRuntime(active: readonly Extension[], opts: { log?: Logger; timeoutMs?: number } = {}): ExtensionRuntime {
	const log = opts.log ?? defaultLog;
	const timeoutMs = opts.timeoutMs ?? HOOK_TIMEOUT_MS;
	return {
		async adjustPricing(ctx: PricingContext) {
			let delivery = ctx.delivery_minor;
			for (const ext of active) {
				const hook = ext.hooks.adjustDelivery;
				if (!hook) continue;
				const out = await guarded(
					ext.id,
					"adjustDelivery",
					() => hook.call(ext.hooks, { ...ctx, delivery_minor: delivery }),
					log,
					timeoutMs,
				);
				if (out === undefined) continue;
				if (!isMinor(out, MAX_DELIVERY_MINOR)) log(`${ext.id}.adjustDelivery ignored: ${String(out)} is not a valid delivery charge`);
				else delivery = out;
			}
			let discount = 0;
			for (const ext of active) {
				const hook = ext.hooks.discount;
				if (!hook) continue;
				const out = await guarded(ext.id, "discount", () => hook.call(ext.hooks, { ...ctx, delivery_minor: delivery }), log, timeoutMs);
				if (out === undefined) continue;
				if (!isMinor(out, ctx.subtotal_minor)) log(`${ext.id}.discount ignored: ${String(out)} is not between 0 and the subtotal`);
				else discount = Math.min(ctx.subtotal_minor, discount + out);
			}
			return { delivery_minor: delivery, discount_minor: discount };
		},

		async emitOrderEvent(event: OrderEvent) {
			await Promise.all(
				active.flatMap((ext) =>
					ext.hooks.onOrderEvent
						? [guarded(ext.id, "onOrderEvent", () => ext.hooks.onOrderEvent!.call(ext.hooks, Object.freeze({ ...event })), log, timeoutMs)]
						: [],
				),
			);
		},

		async loadSection(extensionId: string, ctx: SectionContext) {
			const ext = active.find((e) => e.id === extensionId);
			if (!ext?.hooks.storefrontSection) return null;
			const out = await guarded(ext.id, "storefrontSection", () => ext.hooks.storefrontSection!.call(ext.hooks, ctx), log, timeoutMs);
			return cleanSection(out);
		},
	};
}

export const noExtensions: ExtensionRuntime = createRuntime([]);
