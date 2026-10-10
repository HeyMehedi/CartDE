import type { ZodType } from "zod";
import { nowIso } from "./util";

export async function getSettingJson(db: D1Database, key: string): Promise<unknown | null> {
	const row = await db.prepare(`SELECT value_json FROM cartde_settings WHERE store_id = 1 AND key = ?1`).bind(key).first<{ value_json: string }>();
	if (!row) return null;
	try {
		return JSON.parse(row.value_json);
	} catch {
		return null;
	}
}

export async function setSettingJson(db: D1Database, key: string, value: unknown): Promise<void> {
	await db
		.prepare(`INSERT INTO cartde_settings (store_id, key, value_json, updated_at) VALUES (1, ?1, ?2, ?3) ON CONFLICT (store_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
		.bind(key, JSON.stringify(value), nowIso())
		.run();
}

/** Read a setting through its schema; stored data that no longer validates falls back to `fallback`. */
export async function getValidatedSetting<T>(db: D1Database, key: string, schema: ZodType<T>, fallback: () => T): Promise<T> {
	const raw = await getSettingJson(db, key);
	if (raw === null) return fallback();
	const parsed = schema.safeParse(raw);
	return parsed.success ? parsed.data : fallback();
}
