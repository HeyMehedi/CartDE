import { describe, expect, it } from "vitest";
import { createPlugin, PLUGIN_ID, TOOL_PERMISSION } from "../../src/cartde/plugin";
import { TOOL_NAMES, TOOLS } from "../../src/cartde/mcp/tools";

describe("CartDE EmDash plugin", () => {
	const plugin = createPlugin() as unknown as {
		id: string;
		version: string;
		capabilities: string[];
		routes: Record<string, { permission?: string; public?: boolean }>;
		mcp?: { tools: Record<string, { route: string; destructive?: boolean; description: string }> };
	};

	it("is accepted by definePlugin and asks only for the content-policy capability", () => {
		expect(plugin.id).toBe(PLUGIN_ID);
		expect(plugin.version).toBe("0.5.0");
		expect(plugin.capabilities).toEqual(["hooks.content-policy:register"]);
		expect(Object.keys((plugin as unknown as { hooks: object }).hooks)).toEqual(["content:beforePublish"]);
	});

	it("exposes one private, Admin-level route per tool", () => {
		expect(Object.keys(plugin.routes).sort()).toEqual([...TOOL_NAMES, "admin"].sort());
		for (const route of Object.values(plugin.routes)) {
			expect(route.public).toBeFalsy();
			expect(route.permission).toBe(TOOL_PERMISSION);
		}
		expect(TOOL_PERMISSION).toBe("settings:manage");
	});

	it("adds a sidebar page backed by the private admin route", () => {
		const admin = (plugin as unknown as { admin: { pages: { path: string; label: string }[] } }).admin;
		expect(admin.pages).toEqual([expect.objectContaining({ path: "/commerce", label: "CartDE" })]);
		expect(plugin.routes.admin!.permission).toBe(TOOL_PERMISSION);
		expect(plugin.routes.admin!.public).toBeFalsy();
	});

	it("registers every tool with its route and destructive flag", () => {
		const tools = plugin.mcp!.tools;
		expect(Object.keys(tools).sort()).toEqual([...TOOL_NAMES].sort());
		for (const name of TOOL_NAMES) {
			expect(tools[name]!.route).toBe(name);
			expect(Boolean(tools[name]!.destructive)).toBe(TOOLS[name].destructive);
			expect(tools[name]!.description.length).toBeGreaterThan(20);
		}
	});
});
