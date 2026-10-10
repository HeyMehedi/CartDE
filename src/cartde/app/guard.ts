/** Pure access decision for CartDE's protected routes (FR-ADM-1, FR-ADM-2). No I/O, fully unit-tested. */

export const ADMIN_ROLE_LEVEL = 50; // EmDash Role.ADMIN
export const CSRF_HEADER = "x-cartde-request";
const LOGIN_PATH = "/_emdash/admin/login";

export interface GuardUser {
	role: number;
	disabled?: boolean;
}

export interface GuardRequest {
	pathname: string;
	method: string;
	/** Lower-cased header lookup. */
	header: (name: string) => string | null;
	/** Origin the request was made to, e.g. "https://shop.example". */
	origin: string;
	user: GuardUser | null | undefined;
}

export type GuardDecision =
	| { action: "allow" }
	| { action: "redirect"; to: string }
	| { action: "deny"; status: 401 | 403; code: "unauthenticated" | "forbidden" | "csrf"; message: string; json: boolean };

export function isProtectedPath(pathname: string): boolean {
	return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/setup" || pathname.startsWith("/api/cartde/admin/");
}

const isApi = (pathname: string) => pathname.startsWith("/api/");
const isSafeMethod = (m: string) => m === "GET" || m === "HEAD" || m === "OPTIONS";

function sameOrigin(req: GuardRequest): boolean {
	const site = req.header("sec-fetch-site");
	if (site) return site === "same-origin" || site === "none";
	const origin = req.header("origin");
	return origin !== null && origin === req.origin;
}

/** Public write endpoints: no login, but same-origin and the custom header are still required (FR-ADM-2). */
export const isPublicWritePath = (pathname: string): boolean => pathname === "/api/cartde/checkout";

export function decide(req: GuardRequest): GuardDecision {
	// FR-SF-5 no-JavaScript checkout posts a normal form: no custom header is possible, so require same origin.
	if (req.pathname === "/checkout" && !isSafeMethod(req.method)) {
		return sameOrigin(req)
			? { action: "allow" }
			: { action: "deny", status: 403, code: "csrf", message: "Cross-site request refused.", json: false };
	}
	if (isPublicWritePath(req.pathname)) {
		if (!isSafeMethod(req.method) && (!sameOrigin(req) || req.header(CSRF_HEADER) !== "1")) {
			return { action: "deny", status: 403, code: "csrf", message: "Cross-site request refused.", json: true };
		}
		return { action: "allow" };
	}
	if (!isProtectedPath(req.pathname)) return { action: "allow" };
	const json = isApi(req.pathname);

	if (!req.user || req.user.disabled) {
		return json
			? { action: "deny", status: 401, code: "unauthenticated", message: "Sign in required.", json }
			: { action: "redirect", to: `${LOGIN_PATH}?redirect=${encodeURIComponent(req.pathname)}` };
	}
	if (req.user.role < ADMIN_ROLE_LEVEL) {
		return { action: "deny", status: 403, code: "forbidden", message: "Administrator role required.", json };
	}
	if (json && !isSafeMethod(req.method)) {
		if (!sameOrigin(req) || req.header(CSRF_HEADER) !== "1") {
			return { action: "deny", status: 403, code: "csrf", message: "Cross-site request refused.", json };
		}
	}
	return { action: "allow" };
}

/** Routes shoppers use; shown a "store not ready" page until setup completes (FR-DEP-5). */
export function isStorefrontPath(pathname: string): boolean {
	return (
		pathname === "/" ||
		pathname === "/cart" ||
		pathname === "/checkout" ||
		pathname === "/search" ||
		pathname.startsWith("/products") ||
		pathname.startsWith("/orders/") ||
		pathname === "/api/cartde/checkout" ||
		pathname.startsWith("/api/cartde/cart/")
	);
}
