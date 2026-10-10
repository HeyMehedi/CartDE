import { describe, expect, it } from "vitest";
import { buildAdminBlocks } from "../../src/cartde/plugin/admin-page";

const links = (blocks: Record<string, unknown>[]) =>
	blocks.filter((b) => b.type === "actions").flatMap((b) => b.elements as { label: string; target: { kind: string; url: string } }[]);

describe("EmDash sidebar page", () => {
	const ok = { origin: "https://shop.example", storeName: "Rahim Store", setupComplete: true, overview: { pending_orders: 3, orders_today: 5, active_products: 12, low_stock_variants: 2 } };

	it("shows the numbers and links into every CartDE screen with absolute URLs", () => {
		const { blocks } = buildAdminBlocks(ok);
		expect(blocks[0]).toEqual({ type: "header", text: "Rahim Store · Commerce" });
		expect(blocks.find((b) => b.type === "stats")).toMatchObject({ items: [{ value: 3 }, { value: 5 }, { value: 12 }, { value: 2 }] });
		const all = links(blocks);
		expect(all.every((l) => l.target.kind === "external" && l.target.url.startsWith("https://shop.example/"))).toBe(true);
		expect(all.map((l) => new URL(l.target.url).pathname)).toEqual(expect.arrayContaining(["/admin", "/admin/orders", "/admin/products", "/admin/customers", "/admin/theme", "/admin/extensions", "/admin/settings", "/admin/audit"]));
		expect(blocks.some((b) => b.type === "banner")).toBe(false);
	});

	it("tells the owner to finish setup when it is not complete", () => {
		const { blocks } = buildAdminBlocks({ ...ok, setupComplete: false });
		expect(blocks.find((b) => b.type === "banner")).toMatchObject({ variant: "alert" });
		expect(links(blocks).some((l) => new URL(l.target.url).pathname === "/setup")).toBe(true);
	});

	it("explains missing tables without numbers", () => {
		const { blocks } = buildAdminBlocks({ ...ok, setupComplete: null, overview: null });
		expect(blocks.find((b) => b.type === "banner")).toMatchObject({ variant: "error" });
		expect(blocks.some((b) => b.type === "stats")).toBe(false);
	});
});
