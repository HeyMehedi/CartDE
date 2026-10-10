import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Sign in as EmDash's development administrator (local dev only) and land on `to`. */
export async function signIn(page: Page, to = "/admin") {
	await page.goto(`/_emdash/api/setup/dev-bypass?redirect=${encodeURIComponent(to)}`);
}

/** Accept every confirm() dialog on this page. */
export const acceptDialogs = (page: Page) => page.on("dialog", (d) => d.accept());

/** No horizontal scrolling at the current viewport (SRS NFR-7). */
export async function expectNoHorizontalScroll(page: Page) {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow, `page ${page.url()} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
}

/** A valid 8x8 PNG, so EmDash's media library accepts it as an image. */
export const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC",
	"base64",
);

export const ORIGIN = "http://localhost:4321";
export const adminHeaders = { "x-cartde-request": "1", "content-type": "application/json", origin: ORIGIN };

export async function adminApi<T = unknown>(
	request: APIRequestContext,
	method: "GET" | "POST" | "PATCH" | "DELETE",
	path: string,
	data?: unknown,
): Promise<T> {
	const res = await request.fetch(`/api/cartde/admin${path}`, { method, headers: adminHeaders, data });
	const json = await res.json();
	expect(json.ok, `${method} ${path}: ${JSON.stringify(json.error)}`).toBe(true);
	return json.data as T;
}

export const variantRow = (page: Page, title: string) =>
	page.locator("#variants-edit tbody tr", { has: page.locator("td", { hasText: new RegExp(`^${title}$`) }) });
