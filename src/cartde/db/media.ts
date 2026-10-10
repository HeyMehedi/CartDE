/**
 * Read-only lookup into EmDash's own `media` table so the storefront can turn a media ID into a URL.
 * This couples to an EmDash internal table (columns id, storage_key, status); re-check on EmDash upgrades.
 */
export async function resolveMediaUrls(db: D1Database, ids: string[]): Promise<Map<string, string>> {
	const unique = [...new Set(ids)].slice(0, 50);
	const out = new Map<string, string>();
	if (unique.length === 0) return out;
	const marks = unique.map((_, i) => `?${i + 1}`).join(",");
	const { results } = await db
		.prepare(`SELECT id, storage_key FROM media WHERE id IN (${marks}) AND status = 'ready'`)
		.bind(...unique)
		.all<{ id: string; storage_key: string }>();
	for (const r of results) out.set(r.id, `/_emdash/api/media/file/${r.storage_key}`);
	return out;
}
