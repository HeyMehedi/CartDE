import { describe, expect, it } from "vitest";
import { decide, type GuardRequest } from "../../src/cartde/app/guard";

const req = (over: Partial<GuardRequest> & { headers?: Record<string, string> } = {}): GuardRequest => {
	const h = over.headers ?? {};
	return {
		pathname: "/api/cartde/admin/products",
		method: "GET",
		origin: "https://shop.test",
		user: { role: 50 },
		header: (n) => h[n] ?? null,
		...over,
	};
};

describe("guard", () => {
	it("ignores public paths", () => {
		expect(decide(req({ pathname: "/", user: null }))).toEqual({ action: "allow" });
		expect(decide(req({ pathname: "/administrator", user: null }))).toEqual({ action: "allow" });
	});

	it("redirects anonymous page requests to login and 401s API requests", () => {
		expect(decide(req({ pathname: "/admin/products", user: null }))).toMatchObject({ action: "redirect" });
		expect(decide(req({ user: undefined }))).toMatchObject({ action: "deny", status: 401, json: true });
	});

	it("refuses disabled users and non-admins", () => {
		expect(decide(req({ user: { role: 50, disabled: true } }))).toMatchObject({ status: 401 });
		for (const role of [10, 20, 30, 40]) {
			expect(decide(req({ user: { role } }))).toMatchObject({ action: "deny", status: 403, code: "forbidden" });
			expect(decide(req({ pathname: "/admin", user: { role } }))).toMatchObject({ status: 403, json: false });
		}
	});

	it("allows admin reads", () => {
		expect(decide(req())).toEqual({ action: "allow" });
		expect(decide(req({ pathname: "/admin" }))).toEqual({ action: "allow" });
	});

	it("requires same-origin and the custom header for API writes", () => {
		const ok = { "sec-fetch-site": "same-origin", "x-cartde-request": "1" };
		expect(decide(req({ method: "POST", headers: ok }))).toEqual({ action: "allow" });
		expect(decide(req({ method: "POST", headers: { "x-cartde-request": "1", origin: "https://shop.test" } }))).toEqual({ action: "allow" });
		expect(decide(req({ method: "POST", headers: { "sec-fetch-site": "same-origin" } }))).toMatchObject({ code: "csrf" });
		expect(decide(req({ method: "DELETE", headers: { "sec-fetch-site": "cross-site", "x-cartde-request": "1" } }))).toMatchObject({ code: "csrf" });
		expect(decide(req({ method: "PATCH", headers: { "x-cartde-request": "1", origin: "https://evil.test" } }))).toMatchObject({ code: "csrf" });
		expect(decide(req({ method: "POST", headers: { "x-cartde-request": "1" } }))).toMatchObject({ code: "csrf" });
	});
});
