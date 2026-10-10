import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Apply migrations to the local D1 and empty CartDE's tables. EmDash content and users are left alone. */
export default async function globalSetup() {
	execFileSync("pnpm", ["wrangler", "d1", "migrations", "apply", "DB", "--local"], { stdio: "ignore" });
	const sql = [
		"DELETE FROM cartde_order_events",
		"DELETE FROM cartde_order_items",
		"DELETE FROM cartde_orders",
		"DELETE FROM cartde_customer_addresses",
		"DELETE FROM cartde_customers",
		"DELETE FROM cartde_inventory_events",
		"DELETE FROM cartde_product_media",
		"DELETE FROM cartde_product_categories",
		"DELETE FROM cartde_products",
		"DELETE FROM cartde_categories",
		"DELETE FROM cartde_audit_log",
		"DELETE FROM cartde_discounts",
		"DELETE FROM cartde_settings",
		"UPDATE cartde_counters SET value = 1000 WHERE name = 'order_number'",
		"DELETE FROM cartde_store",
	].join(";\n");
	const dir = mkdtempSync(join(tmpdir(), "cartde-e2e-"));
	const file = join(dir, "reset.sql");
	writeFileSync(file, sql + ";\n");
	execFileSync("pnpm", ["wrangler", "d1", "execute", "DB", "--local", "--file", file], { stdio: "ignore" });

	// Warm the dev server in a real browser so Vite compiles pages and optimises client dependencies (which can
	// reload an open page) before the tests start typing into forms.
	const browser = await chromium.launch();
	const page = await browser.newPage({ baseURL: "http://localhost:4321" });
	for (const path of [
		"/_emdash/api/setup/dev-bypass?redirect=/setup",
		"/admin/products/new",
		"/admin/theme",
		"/admin/import",
		"/",
		"/cart",
		"/checkout",
	]) {
		await page.goto(path).catch(() => undefined);
		await page.waitForLoadState("networkidle").catch(() => undefined);
	}
	await page.waitForTimeout(3000);
	await browser.close();
}
