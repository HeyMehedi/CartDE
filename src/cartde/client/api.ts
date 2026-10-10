// @ts-nocheck
// Browser-only helper (see product-editor.ts for why type checking is off).
/** Browser-side helper for the admin pages. Sends the CSRF header the guard requires. */
export class ApiError extends Error {
	constructor(
		message: string,
		public fields: Record<string, string> = {},
	) {
		super(message);
	}
}

export async function api<T = unknown>(method: string, path: string, payload?: unknown): Promise<T> {
	const res = await fetch(`/api/cartde/admin${path}`, {
		method,
		headers: { "content-type": "application/json", "x-cartde-request": "1" },
		body: payload === undefined ? undefined : JSON.stringify(payload),
	});
	const json = await res.json().catch(() => null);
	if (!json?.ok) throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, json?.error?.fields);
	return json.data as T;
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

export function showError(el: HTMLElement, err: unknown) {
	const fields = err instanceof ApiError ? Object.entries(err.fields) : [];
	el.textContent =
		(err instanceof Error ? err.message : "Something went wrong.") +
		(fields.length ? " " + fields.map(([k, v]) => `${k}: ${v}`).join("; ") : "");
	el.hidden = false;
}
