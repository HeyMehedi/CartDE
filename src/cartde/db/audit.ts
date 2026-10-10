import { newId, nowIso } from "./util";

export type ActorKind = "user" | "mcp" | "system";

export interface AuditEntry {
	actor_user_id: string | null;
	actor_kind: ActorKind;
	action: string;
	entity: string;
	entity_id?: string | null;
	payload?: Record<string, unknown> | null;
}

/** Keys whose values are personal data or free text: only the key name is kept, never the value. */
const SENSITIVE_KEYS = /name|phone|email|address|area|note|description|instruction|district|title/i;

/** Small, PII-free summary of a request body: key names plus short scalar values of non-sensitive keys. */
export function summarizePayload(body: unknown): Record<string, unknown> {
	if (!body || typeof body !== "object" || Array.isArray(body)) return {};
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
		const scalar = typeof value === "number" || typeof value === "boolean" || (typeof value === "string" && value.length <= 40);
		out[key] = scalar && !SENSITIVE_KEYS.test(key) ? value : "(set)";
	}
	return out;
}

export async function recordAudit(db: D1Database, entry: AuditEntry): Promise<void> {
	await db
		.prepare(`INSERT INTO cartde_audit_log (id, actor_user_id, actor_kind, action, entity, entity_id, payload_json, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`)
		.bind(newId(), entry.actor_user_id, entry.actor_kind, entry.action, entry.entity, entry.entity_id ?? null, entry.payload ? JSON.stringify(entry.payload) : null, nowIso())
		.run();
}

export interface AuditRow { id: string; actor_user_id: string | null; actor_kind: ActorKind; action: string; entity: string; entity_id: string | null; payload_json: string | null; created_at: string }

export async function listAudit(db: D1Database, opts: { limit?: number; entity?: string } = {}): Promise<AuditRow[]> {
	const { results } = await db
		.prepare(`SELECT id, actor_user_id, actor_kind, action, entity, entity_id, payload_json, created_at FROM cartde_audit_log WHERE (?1 IS NULL OR entity = ?1) ORDER BY created_at DESC, rowid DESC LIMIT ?2`)
		.bind(opts.entity ?? null, Math.min(opts.limit ?? 100, 500))
		.all<AuditRow>();
	return results;
}

/** Builds the audit entry for an admin HTTP mutation. Pure so it can be tested without a server. */
export function auditEntryForRequest(input: { method: string; routePattern: string; params: Record<string, string | undefined>; userId: string | null; bodyText: string }): AuditEntry {
	let body: unknown = null;
	try { body = input.bodyText ? JSON.parse(input.bodyText) : null; } catch { /* not JSON: nothing to summarise */ }
	const afterAdmin = input.routePattern.replace(/^\/api\/cartde\/admin\//, "").split("/").filter((seg) => !seg.startsWith("["));
	return {
		actor_user_id: input.userId,
		actor_kind: "user",
		action: `${input.method} ${input.routePattern.replace(/^\/api\/cartde\/admin/, "")}`,
		entity: afterAdmin[0] ?? "admin",
		entity_id: input.params.id ?? null,
		payload: summarizePayload(body),
	};
}
