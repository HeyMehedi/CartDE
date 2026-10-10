import { defineMiddleware } from "astro:middleware";
import { decide, isStorefrontPath } from "./cartde/app/guard";
import { checkStoreReady } from "./cartde/app/ready";
import { addToSitemapIndex, extendRobots } from "./cartde/db/sitemap";

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
		const isAdminArea = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
		if (isAdminArea || isStorefrontPath(url.pathname)) {
			const state = await checkStoreReady();
			if (!state.ready) {
				// Admins are routed to the next setup step; shoppers see a neutral page (FR-DEP-5).
				if (isAdminArea) return context.redirect("/setup");
				if (url.pathname.startsWith("/api/")) {
					return new Response(JSON.stringify({ ok: false, error: { code: "not_ready", message: "The store is not open yet." } }), { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "300", "Cache-Control": "no-store" } });
				}
				return new Response(
					`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Store not ready</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1>This store is not open yet</h1><p>Please check back soon.</p>`,
					{ status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "300", "Cache-Control": "no-store" } },
				);
			}
		}
		const response = await next();
		// SEO: EmDash serves /sitemap.xml and /robots.txt; CartDE adds its products sitemap and private paths.
		if ((url.pathname === "/sitemap.xml" || url.pathname === "/robots.txt") && response.ok) {
			const text = await response.text();
			const body = url.pathname === "/robots.txt" ? extendRobots(text) : addToSitemapIndex(text, new URL("/sitemap-products.xml", url.origin).toString());
			return new Response(body, { status: response.status, headers: response.headers });
		}
		if (url.pathname.startsWith("/admin") || url.pathname === "/setup" || url.pathname.startsWith("/api/cartde/admin/")) {
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
