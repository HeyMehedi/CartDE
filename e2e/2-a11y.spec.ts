import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminApi, signIn } from "./helpers";

/** SRS NFR-6: no serious or critical WCAG 2.1 A/AA violations on the storefront and admin pages, in both presets. */
test.describe.configure({ mode: "serial" });

const scan = async (page: Page) => {
	const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
	return results.violations
		.filter((v) => v.impact === "serious" || v.impact === "critical")
		.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`);
};

let admin: Page;

test.beforeAll(async ({ browser }) => {
	admin = await (await browser.newContext({ baseURL: "http://localhost:4321" })).newPage();
	await signIn(admin, "/setup");
	await adminApi(admin.request, "POST", "/setup", {
		name: "A11y Shop",
		currency: "BDT",
		locale: "en-BD",
		timezone: "Asia/Dhaka",
		delivery_inside_dhaka_minor: 6000,
		delivery_outside_dhaka_minor: 12000,
		low_stock_threshold: 3,
	});
	const existing = await adminApi<{ slug: string }[]>(admin.request, "GET", "/products?q=cotton-tee");
	if (!existing.some((p) => p.slug === "cotton-tee")) {
		const cat = await adminApi<{ id: string }>(admin.request, "POST", "/categories", { name: "Clothing", slug: "clothing" }).catch(
			() => null,
		);
		await adminApi(admin.request, "POST", "/products", {
			name: "Cotton Tee",
			slug: "cotton-tee",
			status: "active",
			description_md: "Soft **cotton**.",
			category_ids: cat ? [cat.id] : [],
			options: [{ name: "Size", values: ["S", "M"] }],
			variants: [
				{ option_values: ["S"], price_minor: 125000, stock_qty: 5 },
				{ option_values: ["M"], price_minor: 130050, compare_at_minor: 150000, stock_qty: 2 },
			],
		});
	}
});

for (const preset of ["default", "warm"] as const) {
	test(`storefront pages (${preset} preset)`, async ({ page }) => {
		await adminApi(admin.request, "PATCH", "/theme", { preset });
		for (const path of ["/", "/products", "/products/cotton-tee", "/cart", "/checkout", "/search?q=tee", "/category/clothing", "/nope"]) {
			await page.goto(path);
			await page.waitForLoadState("networkidle");
			// Guard against scanning the "store not ready" page by mistake.
			await expect(page.locator("body")).not.toContainText("This store is not open yet");
			expect(await scan(page), `${preset} ${path}`).toEqual([]);
		}
	});
}

test("admin pages", async () => {
	for (const path of [
		"/admin",
		"/admin/orders",
		"/admin/products",
		"/admin/products/new",
		"/admin/customers",
		"/admin/categories",
		"/admin/theme",
		"/admin/extensions",
		"/admin/settings",
		"/admin/audit",
		"/admin/import",
		"/setup",
	]) {
		await admin.goto(path);
		await admin.waitForLoadState("networkidle");
		expect(new URL(admin.url()).pathname, "redirected unexpectedly").toBe(path);
		expect(await scan(admin), path).toEqual([]);
	}
});

test("admin pages fit a 360 px screen (SRS NFR-7)", async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, baseURL: "http://localhost:4321" });
	const page = await ctx.newPage();
	await signIn(page, "/admin");
	const products = await adminApi<{ id: string }[]>(page.request, "GET", "/products");
	const orders = await adminApi<{ items: { id: string }[] }>(page.request, "GET", "/orders");
	const paths = [
		"/admin",
		"/admin/orders",
		"/admin/products",
		"/admin/products/new",
		"/admin/customers",
		"/admin/categories",
		"/admin/theme",
		"/admin/extensions",
		"/admin/settings",
		"/admin/audit",
		"/admin/import",
		"/setup",
	];
	if (products[0]) paths.push(`/admin/products/${products[0].id}`);
	if (orders.items[0]) paths.push(`/admin/orders/${orders.items[0].id}`);
	for (const path of paths) {
		await page.goto(path);
		await page.waitForLoadState("networkidle");
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
	}
	await ctx.close();
});
