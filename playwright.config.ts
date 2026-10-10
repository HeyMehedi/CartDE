import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (plan 0.3). They run against `pnpm dev` (Astro with the Cloudflare workerd runtime and local D1),
 * sign in through EmDash's development-only bypass, and reset CartDE's local tables first. Never point them at
 * production: the dev bypass does not exist there (it returns 403).
 */
export default defineConfig({
	testDir: "e2e",
	globalSetup: "./e2e/global-setup.ts",
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 20_000 },
	retries: 0,
	reporter: [["list"]],
	use: {
		baseURL: "http://localhost:4321",
		trace: "retain-on-failure",
		...devices["Desktop Chrome"],
	},
	// Locally, start `pnpm dev` yourself first. CI sets E2E_START_SERVER=1 so Playwright starts it.
	webServer: process.env.E2E_START_SERVER
		? { command: "pnpm dev", url: "http://localhost:4321/robots.txt", reuseExistingServer: false, timeout: 180_000 }
		: undefined,
});
