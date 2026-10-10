import { defineMiddleware } from "astro:middleware";
import { decide } from "./cartde/app/guard";

/** Runs after EmDash's auth middleware (registered with order "pre"), so `locals.user` is already set. */
export const onRequest = defineMiddleware(async (context, next) => {
	const { request, locals, url } = context;
	const decision = decide({
		pathname: url.pathname,
		method: request.method,
		header: (name) => request.headers.get(name),
		origin: url.origin,
		user: locals.user,
	});

	if (decision.action === "allow") {
		const response = await next();
		if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/cartde/admin/")) {
			response.headers.set("Cache-Control", "private, no-store");
		}
		return response;
	}
	if (decision.action === "redirect") return context.redirect(decision.to);
	const body = decision.json
		? JSON.stringify({ ok: false, error: { code: decision.code, message: decision.message } })
		: decision.message;
	return new Response(body, {
		status: decision.status,
		headers: { "Content-Type": decision.json ? "application/json" : "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
	});
});
