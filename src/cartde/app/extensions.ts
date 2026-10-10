/** Builds the extension runtime for a request from the registered extensions and the admin's enabled list. */
import { z } from "zod";
import { EXTENSIONS } from "../../extensions";
import { getValidatedSetting, setSettingJson } from "../db/settings";
import { CartdeError } from "../db/util";
import { buildRegistry, createRuntime } from "../extensions/registry";
import type { Extension, ExtensionRuntime } from "../extensions/types";

const KEY = "extensions";
const enabledSchema = z.object({ enabled: z.array(z.string()).max(50).default([]) });
const TTL_MS = 15_000;

let cache: { at: number; runtime: ExtensionRuntime; activeIds: string[] } | null = null;
export const resetExtensionCache = () => { cache = null; };

export const registry = (extensions: readonly Extension[] = EXTENSIONS) => buildRegistry(extensions);

export async function getEnabledIds(db: D1Database): Promise<string[]> {
	const { enabled } = await getValidatedSetting(db, KEY, enabledSchema, () => ({ enabled: [] }));
	return enabled;
}

export async function setEnabledIds(db: D1Database, ids: string[], extensions: readonly Extension[] = EXTENSIONS): Promise<string[]> {
	const known = new Set(registry(extensions).available.map((e) => e.id));
	const unknown = ids.filter((id) => !known.has(id));
	if (unknown.length) throw new CartdeError("invalid", `Unknown or incompatible extension: ${unknown.join(", ")}`);
	const unique = [...new Set(ids)];
	await setSettingJson(db, KEY, { enabled: unique });
	resetExtensionCache();
	return unique;
}

/** Runtime used by checkout, order transitions and the homepage. Falls back to "no extensions" if settings cannot be read. */
export async function extensionRuntime(db: D1Database, extensions: readonly Extension[] = EXTENSIONS): Promise<ExtensionRuntime> {
	if (extensions === EXTENSIONS && cache && Date.now() - cache.at < TTL_MS) return cache.runtime;
	let ids: string[] = [];
	try { ids = await getEnabledIds(db); } catch { /* settings table not migrated yet: run without extensions */ }
	const active = registry(extensions).available.filter((e) => ids.includes(e.id));
	const runtime = createRuntime(active);
	if (extensions === EXTENSIONS) cache = { at: Date.now(), runtime, activeIds: active.map((e) => e.id) };
	return runtime;
}
