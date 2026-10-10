import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { auditEntryForRequest, recordAudit } from "../db/audit";
import { CartdeError } from "../db/util";

export type Ctx = APIContext;

export const db = (): D1Database => env.DB;

const headers = { "Content-Type": "application/json", "Cache-Control": "private, no-store" };

export const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ ok: true, data }), { status, headers });

export const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
	new Response(JSON.stringify({ ok: false, error: { code, message, ...(fields ? { fields } : {}) } }), { status, headers });

const STATUS = { not_found: 404, conflict: 409, invalid: 422, forbidden: 403 } as const;

/** Wraps an admin API handler: maps domain and validation errors to the `{ ok, error }` envelope; never leaks SQL or stacks. */
export function route(handler: (ctx: Ctx) => Promise<Response>) {
	return async (ctx: Ctx): Promise<Response> => {
		const { method, url } = ctx.request;
		// FR-ADM-7: every successful admin mutation is written to the audit log, here, so no endpoint can forget.
		const audited = method !== "GET" && method !== "HEAD" && url.includes("/api/cartde/admin/");
		const bodyText = audited
			? await ctx.request
					.clone()
					.text()
					.catch(() => "")
			: "";
		try {
			const response = await handler(ctx);
			if (audited && response.status < 400) {
				try {
					await recordAudit(
						db(),
						auditEntryForRequest({ method, routePattern: ctx.routePattern, params: ctx.params, userId: actorId(ctx), bodyText }),
					);
				} catch (auditErr) {
					console.error("cartde audit write failed", auditErr instanceof Error ? auditErr.message : auditErr);
				}
			}
			return response;
		} catch (err) {
			if (err instanceof CartdeError) return fail(STATUS[err.code], err.code, err.message, err.fields);
			if (err instanceof ZodError) {
				const fields: Record<string, string> = {};
				for (const issue of err.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
				return fail(422, "invalid", "Please fix the highlighted fields.", fields);
			}
			if (err instanceof SyntaxError) return fail(400, "bad_json", "Request body must be valid JSON.");
			console.error("cartde api error", err instanceof Error ? err.message : err);
			return fail(500, "internal", "Something went wrong.");
		}
	};
}

export function actorId(ctx: Ctx): string | null {
	return ctx.locals.user?.id ?? null;
}

export async function body(ctx: Ctx): Promise<unknown> {
	return ctx.request.json();
}
