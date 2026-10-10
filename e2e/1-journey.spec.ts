import { expect, test, type Browser, type Page } from "@playwright/test";
import { acceptDialogs, adminApi, adminHeaders, expectNoHorizontalScroll, ORIGIN, PNG, signIn, variantRow } from "./helpers";

/**
 * The milestone acceptance journeys, run in order against one local store:
 *  0.1 admin login and media upload · 0.2 create, preview and publish a product with two variants and an image ·
 *  0.3 a COD order from a 360 px phone, managed to Delivered; cancellation restores stock · 0.4 first-run setup ·
 *  0.5 an MCP client using the CartDE tools · 0.6 theme preset, extension and Bengali storefront.
 */
test.describe.configure({ mode: "serial" });

let admin: Page;
let productId = "";
let productSlug = "";
let mediaId = "";

const phone360 = (browser: Browser, js = true) =>
	browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, javaScriptEnabled: js, baseURL: ORIGIN });

test.beforeAll(async ({ browser }) => {
	admin = await (await browser.newContext({ baseURL: ORIGIN })).newPage();
	acceptDialogs(admin);
});

test("0.4 first-run setup opens the store", async () => {
	await signIn(admin, "/setup");
	await expect(admin.getByRole("heading", { name: "Set up your store" })).toBeVisible();
	await admin.fill("#name", "E2E Shop");
	await admin.fill("#contact_phone", "01711111111");
	await admin.fill("#inside", "60");
	await admin.fill("#outside", "120");
	await admin.getByRole("button", { name: "Open my store" }).click();
	await admin.waitForURL("**/admin");
	await expect(admin.getByRole("heading", { name: "E2E Shop" })).toBeVisible();
	// Running setup again keeps the store open and does not duplicate anything.
	await admin.goto("/setup");
	await expect(admin.getByText("Setup is complete")).toBeVisible();
});

test("0.1 media upload through the EmDash media library", async () => {
	const res = await admin.request.post("/_emdash/api/media", {
		headers: { "x-emdash-request": "1", origin: ORIGIN },
		multipart: { file: { name: "tee.png", mimeType: "image/png", buffer: PNG }, alt: "Cotton tee" },
	});
	expect([200, 201]).toContain(res.status());
	const json = await res.json();
	mediaId = json.data?.item?.id ?? json.data?.id;
	expect(mediaId, JSON.stringify(json).slice(0, 300)).toBeTruthy();
});

test("0.2 category, product with two variants and an image, preview, publish", async ({ browser }) => {
	await admin.goto("/admin/categories");
	await admin.fill("#cn", "Clothing");
	await admin.getByRole("button", { name: "Add" }).click();
	await expect(admin.locator("#cat-table input.n")).toHaveValue("Clothing");

	await admin.goto("/admin/products/new");
	await admin.fill("#name", "Cotton Tee");
	await admin.fill("#description_md", "Soft **handloom** cotton.\n\n- Breathable\n- Washable");
	await admin.getByLabel("Clothing").check();
	await admin.click("#media-choose");
	await admin.locator("#media-grid button").first().click();
	await expect(admin.locator("#media-list li")).toHaveCount(1);
	await admin.click("#option-add");
	await admin.fill(".option-row input.on", "Size");
	await admin.fill(".option-row input.ov", "S, M");
	await admin.click("#variants-build");
	const rows = admin.locator("#variants-table tbody tr");
	await expect(rows).toHaveCount(2);
	await rows.nth(0).locator("input.p").fill("1250");
	await rows.nth(0).locator("input.s").fill("TEE-S");
	await rows.nth(0).locator("input.q").fill("5");
	await rows.nth(1).locator("input.p").fill("1300.50");
	await rows.nth(1).locator("input.c").fill("1500");
	await rows.nth(1).locator("input.s").fill("TEE-M");
	await rows.nth(1).locator("input.q").fill("2");
	await admin.click("#save");
	await admin.waitForURL(/\/admin\/products\/[0-9A-Z]{26}$/);
	productId = admin.url().split("/").pop()!;
	productSlug = await admin.inputValue("#slug");
	expect(productSlug).toBe("cotton-tee");
	await expect(variantRow(admin, "S").locator("strong.q")).toHaveText("5");

	// Draft: admins see a preview, shoppers get 404.
	await admin.goto(`/products/${productSlug}`);
	await expect(admin.getByText(/Preview: this product is draft/)).toBeVisible();
	const shopper = await phone360(browser);
	const res = await (await shopper.newPage()).goto(`/products/${productSlug}`);
	expect(res?.status()).toBe(404);

	// Publish.
	await admin.goto(`/admin/products/${productId}`);
	await admin.selectOption("#status", "active");
	await admin.click("#save");
	await expect(admin.locator("#msg")).toHaveText("Saved.");
	const page = await shopper.newPage();
	await page.goto(`/products/${productSlug}`);
	await expect(page.getByRole("heading", { name: "Cotton Tee" })).toBeVisible();
	await expect(page.locator("img[alt='']").or(page.locator("main img")).first()).toBeVisible();
	await shopper.close();
});

test("0.2 stock adjustment records an event", async () => {
	await admin.goto(`/admin/products/${productId}`);
	const row = variantRow(admin, "S");
	await row.locator("input.d").fill("3");
	await row.locator("input.n").fill("restock");
	await row.locator("button.adj").click();
	await expect(variantRow(admin, "S").locator("strong.q")).toHaveText("8");
});

let orderNumber = 0;

test("0.3 a shopper orders from a 360 px phone", async ({ browser }) => {
	const ctx = await phone360(browser);
	const page = await ctx.newPage();
	for (const path of ["/", "/products", `/products/${productSlug}`, "/search?q=cotton"]) {
		await page.goto(path);
		await expectNoHorizontalScroll(page);
	}
	await page.goto(`/products/${productSlug}`);
	await page.selectOption("#opt-0", "M");
	await expect(page.locator("#stock")).toHaveText("Only 2 left");
	await page.click("#add");
	await expect(page.locator("#add-msg")).toContainText("Added to your cart");
	await expect(page.locator("#cart-count")).toHaveText("(1)");

	await page.goto("/cart");
	await expect(page.locator("#cart-body tr")).toHaveCount(1);
	await expectNoHorizontalScroll(page);
	await page.locator("#cart-body input[type=number]").fill("2");
	await page.locator("#cart-body input[type=number]").blur();
	await expect(page.locator("#subtotal")).toContainText("2,601.00");
	await page.click("#checkout-link");

	await page.waitForURL("**/checkout");
	await expectNoHorizontalScroll(page);
	await page.fill("#name", "Rahim Uddin");
	await page.fill("#phone", "+880 1712-345678");
	await page.selectOption("#district", "Sylhet");
	await page.fill("#area", "Zindabazar");
	await page.fill("#address", "House 5, Road 3");
	await expect(page.locator("#tot")).toContainText("2,721.00"); // 2 x 1,300.50 + 120 outside Dhaka
	await page.click("#place");
	await page.waitForURL(/\/orders\/\d+\?t=/);
	await expect(page.getByRole("heading", { name: "Thank you, Rahim Uddin!" })).toBeVisible();
	orderNumber = Number(new URL(page.url()).pathname.split("/").pop());
	expect(orderNumber).toBe(1001);
	await expectNoHorizontalScroll(page);
	await expect(page.locator("#cart-count")).toHaveText("");
	await ctx.close();
});

test("0.3 the merchant manages the order to Delivered", async () => {
	await admin.goto("/admin");
	await expect(admin.locator(".card").first()).toContainText("1");
	await admin.goto("/admin/orders?status=pending");
	await admin.getByRole("link", { name: `#${orderNumber}` }).click();
	await expect(admin.getByText("01712345678")).toBeVisible();
	for (const to of ["confirmed", "shipped", "delivered"]) {
		await admin.locator(`button[data-to=${to}]`).click();
		await expect(admin.getByRole("heading", { name: new RegExp(`· ${to} ·`) })).toBeVisible();
	}
	await expect(admin.getByRole("heading")).toContainText(["payment paid"]);
	await expect(admin.locator("ul li").filter({ hasText: "delivered" }).first()).toContainText("by administrator");
	await admin.fill("#merchant-note", "Collected cash");
	await admin.click("#save-note");
	await expect(admin.locator("#msg")).toHaveText("Note saved.");
	// Stock of M went 2 -> 0.
	await admin.goto(`/admin/products/${productId}`);
	await expect(variantRow(admin, "M").locator("strong.q")).toHaveText("0");
});

test("0.3 cancelling an order restores stock", async ({ request }) => {
	const res = await request.post("/api/cartde/checkout", {
		headers: { ...adminHeaders },
		data: {
			idempotency_key: "e2e-cancel-0000000001",
			name: "Karim",
			phone: "01812345678",
			district: "Dhaka",
			area: "Mirpur",
			address: "House 9, Road 1",
			lines: [
				{
					variant_id: (
						await adminApi<{ variants: { id: string; title: string }[] }>(admin.request, "GET", `/products/${productId}`)
					).variants.find((v) => v.title === "S")!.id,
					quantity: 3,
				},
			],
		},
	});
	expect(res.status()).toBe(201);
	const { order_number } = (await res.json()).data;
	await admin.goto("/admin/orders");
	await admin.getByRole("link", { name: `#${order_number}` }).click();
	await admin.locator("button[data-to=cancelled]").click();
	await expect(admin.getByRole("heading", { name: /· cancelled ·/ })).toBeVisible();
	await admin.goto(`/admin/products/${productId}`);
	await expect(variantRow(admin, "S").locator("strong.q")).toHaveText("8");
});

test("0.3 checkout without JavaScript (single-item form post)", async ({ browser }) => {
	const ctx = await phone360(browser, false);
	const page = await ctx.newPage();
	await page.goto(`/products/${productSlug}`);
	const sValue = await page.locator("#nojs-v option", { hasText: /^S —/ }).getAttribute("value");
	await page.selectOption("#nojs-v", sValue!);
	await page.fill("#nojs-q", "1");
	await page.getByRole("button", { name: "Order now" }).click();
	await page.waitForURL(/\/checkout\?v=/);
	await expect(page.locator("#summary")).toContainText("1 × Cotton Tee (S)");
	await page.fill("#name", "No Script");
	await page.fill("#phone", "01912345678");
	await page.selectOption("#district", "Dhaka");
	await page.fill("#area", "Gulshan");
	await page.fill("#address", "House 1, Road 1");
	await page.click("#place");
	await page.waitForURL(/\/orders\/\d+\?t=/);
	await expect(page.getByRole("heading", { name: "Thank you, No Script!" })).toBeVisible();
	await ctx.close();
});

test("0.3 the last unit cannot be sold twice (parallel checkouts on local D1)", async ({ request }) => {
	const p = await adminApi<{ variants: { id: string; title: string; stock_qty: number }[] }>(
		admin.request,
		"GET",
		`/products/${productId}`,
	);
	const s = p.variants.find((v) => v.title === "S")!;
	await adminApi(admin.request, "POST", `/variants/${s.id}/stock`, { delta: 1 - s.stock_qty, reason: "manual", note: "race test" });
	const attempts = await Promise.all(
		Array.from({ length: 8 }, (_, i) =>
			request.post("/api/cartde/checkout", {
				headers: adminHeaders,
				data: {
					idempotency_key: `e2e-race-key-${String(i).padStart(8, "0")}`,
					name: "Racer",
					phone: `0171000000${i}`,
					district: "Dhaka",
					area: "A",
					address: "House 1, R",
					lines: [{ variant_id: s.id, quantity: 1 }],
				},
			}),
		),
	);
	const codes = attempts.map((r) => r.status()).sort();
	expect(codes.filter((c) => c === 201)).toHaveLength(1);
	expect(codes.filter((c) => c === 409)).toHaveLength(7);
	const after = await adminApi<{ variants: { title: string; stock_qty: number }[] }>(admin.request, "GET", `/products/${productId}`);
	expect(after.variants.find((v) => v.title === "S")!.stock_qty).toBe(0);
});

test("exports and import", async () => {
	const csv = await (await admin.request.get("/api/cartde/admin/export/orders.csv")).text();
	expect(csv).toContain(`${orderNumber},`);
	expect(csv).toContain("Rahim Uddin");
	await admin.goto("/admin/import");
	await admin.setInputFiles("#file", {
		name: "products.csv",
		mimeType: "text/csv",
		buffer: Buffer.from("slug,name,price,stock,status\nmug,Ceramic Mug,450,10,active\n"),
	});
	await admin.click("#check");
	await expect(admin.locator("#report")).toContainText("1 product(s) ready");
	await admin.click("#run");
	await expect(admin.locator("#report")).toContainText("1 product(s) created");
	await admin.goto("/search?q=mug");
	await expect(admin.getByText("Ceramic Mug")).toBeVisible();
});

test("0.5 an MCP client uses the CartDE tools with a personal access token", async ({ request }) => {
	const enable = await admin.request.put("/_emdash/api/admin/plugins/cartde/mcp", {
		headers: { "x-emdash-request": "1", origin: ORIGIN },
		data: { enabled: true },
	});
	expect(enable.status(), await enable.text()).toBe(200);
	const tokenRes = await admin.request.post("/_emdash/api/admin/api-tokens", {
		headers: { "x-emdash-request": "1", origin: ORIGIN },
		data: { name: "e2e", scopes: ["mcp:tools"] },
	});
	expect(tokenRes.status(), await tokenRes.text()).toBeLessThan(300);
	const tokenJson = await tokenRes.json();
	const token: string = tokenJson.data?.token ?? tokenJson.data?.rawToken ?? tokenJson.data?.value;
	expect(token, JSON.stringify(tokenJson).slice(0, 200)).toMatch(/^ec_pat_/);

	const rpc = async (method: string, params: unknown, bearer = token) => {
		const r = await request.post("/_emdash/api/mcp", {
			headers: { authorization: `Bearer ${bearer}`, accept: "application/json, text/event-stream", "content-type": "application/json" },
			data: { jsonrpc: "2.0", id: 1, method, params },
		});
		const text = await r.text();
		const body = text.startsWith("{")
			? JSON.parse(text)
			: JSON.parse(
					text
						.split("\n")
						.find((l) => l.startsWith("data:"))!
						.slice(5),
				);
		return { status: r.status(), body };
	};
	const list = await rpc("tools/list", {});
	const names: string[] = list.body.result.tools.map((t: { name: string }) => t.name);
	expect(names.filter((n) => n.startsWith("cartde__")).sort()).toEqual(
		[
			"create_discount_draft",
			"create_product_draft",
			"get_order_details",
			"get_sales_summary",
			"list_orders",
			"search_products",
			"update_inventory",
			"update_order_status",
			"update_product",
		]
			.map((n) => `cartde__${n}`)
			.sort(),
	);
	const destructive = list.body.result.tools.find((t: { name: string }) => t.name === "cartde__update_order_status");
	expect(destructive.annotations?.destructiveHint).toBe(true);

	const summary = await rpc("tools/call", { name: "cartde__get_sales_summary", arguments: { days: 7 } });
	expect(summary.body.result.isError ?? false).toBe(false);
	expect(JSON.stringify(summary.body.result)).toContain("revenue_minor");

	const invalid = await rpc("tools/call", {
		name: "cartde__update_order_status",
		arguments: { order_number: orderNumber, to: "confirmed" },
	});
	expect(invalid.body.result.isError).toBe(true);
	expect(JSON.stringify(invalid.body.result)).toContain("An order that is delivered can only become: returned.");

	const draft = await rpc("tools/call", {
		name: "cartde__create_product_draft",
		arguments: { name: "AI Draft Mug", price_minor: 50000, stock_qty: 3 },
	});
	expect(draft.body.result.isError ?? false).toBe(false);
	expect(JSON.stringify(draft.body.result)).toContain('\\"status\\": \\"draft\\"');

	const sneaky = await rpc("tools/call", { name: "cartde__search_products", arguments: { store_id: 2 } });
	expect(sneaky.body.result.isError).toBe(true);
	expect(JSON.stringify(sneaky.body.result)).toContain('Unrecognized key: \\"store_id\\"');

	const noScope = await admin.request.post("/_emdash/api/admin/api-tokens", {
		headers: { "x-emdash-request": "1", origin: ORIGIN },
		data: { name: "e2e-read", scopes: ["content:read"] },
	});
	const weak = (await noScope.json()).data;
	const refused = await rpc("tools/call", { name: "cartde__get_sales_summary", arguments: {} }, weak.token ?? weak.rawToken ?? weak.value);
	expect(refused.body.result._meta?.code).toBe("INSUFFICIENT_SCOPE");

	await admin.goto("/admin/audit");
	await expect(admin.getByText("mcp.create_product_draft")).toBeVisible();
});

test("the EmDash admin shows the CartDE page", async () => {
	await admin.goto("/_emdash/admin/plugins/cartde/commerce");
	await expect(admin.getByText("Open commerce dashboard")).toBeVisible({ timeout: 90_000 });
	await expect(admin.getByText("Your store is not open yet")).toHaveCount(0);
});

test("0.6 theme preset, extension and Bengali storefront", async ({ browser }) => {
	await admin.goto("/admin/theme");
	await admin.selectOption("#preset", "warm");
	await admin.fill("#footer-text", "© E2E Shop");
	await admin.getByRole("button", { name: "Save theme" }).click();
	await expect(admin.locator("#msg")).toContainText("Saved");
	// A low-contrast colour is refused.
	await admin.fill("#c-accent", "#eeeeee");
	await admin.getByRole("button", { name: "Save theme" }).click();
	await expect(admin.locator("#msg")).toContainText(/contrast/);
	await admin.fill("#c-accent", "");

	await admin.goto("/admin/extensions");
	await admin.locator("input[name=ext][value=free-delivery]").check();
	await admin.getByRole("button", { name: "Save" }).click();
	await expect(admin.locator("#msg")).toHaveText("Saved.");

	await admin.goto("/admin/settings");
	await admin.fill("#locale", "bn-BD");
	await admin.getByRole("button", { name: "Save settings" }).click();
	await expect(admin.locator("#msg")).toHaveText("Saved.");

	const ctx = await phone360(browser);
	const page = await ctx.newPage();
	await page.goto("/");
	expect(await page.getAttribute("html", "lang")).toBe("bn");
	await expect(page.getByText("© E2E Shop")).toBeVisible();
	const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--cd-bg").trim());
	expect(bg).toBe("#fbf6ee");
	await page.goto(`/products/${productSlug}`);
	await expect(page.getByRole("button", { name: "কার্টে যোগ করুন" })).toBeVisible();
	await expectNoHorizontalScroll(page);

	// Free delivery: 4 x 1,250 = 5,000 reaches the threshold.
	const v = (
		await adminApi<{ variants: { id: string; title: string; stock_qty: number }[] }>(admin.request, "GET", `/products/${productId}`)
	).variants.find((x) => x.title === "S")!;
	await adminApi(admin.request, "POST", `/variants/${v.id}/stock`, { delta: 10, reason: "manual" });
	const quote = await (await page.request.get(`/api/cartde/cart/validate?lines=${v.id}:4&district=Sylhet`)).json();
	expect(quote.data).toMatchObject({ subtotal_minor: 500000, delivery_minor: 0, total_minor: 500000 });
	await ctx.close();

	// Restore English for the remaining checks.
	await admin.goto("/admin/settings");
	await admin.fill("#locale", "en-BD");
	await admin.getByRole("button", { name: "Save settings" }).click();
	await expect(admin.locator("#msg")).toHaveText("Saved.");
});
