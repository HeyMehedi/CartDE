/**
 * CartDE's native EmDash plugin. It exposes the tools in `../mcp/tools.ts` as private plugin routes and as MCP tools.
 * EmDash authenticates the caller (OAuth or personal access token), checks the route permission, and only lists the
 * tools after an administrator enables the plugin's MCP surface.
 *
 * Permission: EmDash's permission list has no commerce entries, so every tool requires `settings:manage` (Admin role).
 * Orders contain customer contact details, so nothing here is available below Admin.
 */
import { definePlugin } from "emdash";
import { extensionRuntime } from "../app/extensions";
import { buildAdminBlocks } from "./admin-page";
import { pageSlugDecision } from "./slug-policy";
import { overview } from "../db/orders";
import { getStore } from "../db/store";
import { startOfDayUtc } from "../domain/time";
import { CartdeError } from "../db/util";
import { executeTool, TOOL_NAMES, TOOLS, ToolInputError, type ToolName } from "../mcp/tools";

export const PLUGIN_ID = "cartde";
export const PLUGIN_VERSION = "0.5.0";
export const TOOL_PERMISSION = "settings:manage" as const;

async function database(): Promise<D1Database> {
	// Imported lazily: astro.config.mjs runs in Node, where "cloudflare:workers" does not resolve.
	const { env } = await import("cloudflare:workers");
	return env.DB;
}

const routes = Object.fromEntries(
	TOOL_NAMES.map((name) => [
		name,
		{
			permission: TOOL_PERMISSION,
			input: TOOLS[name].input,
			handler: async (ctx: { input: unknown; user?: { id: string } }) => {
				try {
					const db = await database();
					return { ok: true, data: await executeTool(name as ToolName, { db, actorUserId: ctx.user?.id ?? null, extensions: await extensionRuntime(db) }, ctx.input) };
				} catch (err) {
					if (err instanceof ToolInputError) return { ok: false, error: { code: "invalid_input", message: err.message, fields: err.fields } };
					if (err instanceof CartdeError) return { ok: false, error: { code: err.code, message: err.message, fields: err.fields } };
					console.error("cartde tool error", name, err instanceof Error ? err.message : err);
					return { ok: false, error: { code: "internal", message: "Something went wrong." } };
				}
			},
		},
	]),
);

/** Block Kit page shown under "CartDE" in EmDash's sidebar. Private route: EmDash checks the permission first. */
const adminRoute = {
	permission: TOOL_PERMISSION,
	handler: async (ctx: { request: Request }) => {
		const origin = new URL(ctx.request.url).origin;
		try {
			const db = await database();
			const store = await getStore(db);
			return buildAdminBlocks({ origin, storeName: store.name, setupComplete: !!store.setup_completed_at, overview: await overview(db, startOfDayUtc(store.timezone).toISOString()) });
		} catch {
			return buildAdminBlocks({ origin, storeName: "CartDE", setupComplete: null, overview: null });
		}
	},
};

const mcpTools = Object.fromEntries(
	TOOL_NAMES.map((name) => [name, { description: TOOLS[name].description, route: name, input: TOOLS[name].input, destructive: TOOLS[name].destructive }]),
);

export function createPlugin() {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		// Needed only to veto publishing a page whose slug collides with a store route (SRS 3.2).
		capabilities: ["hooks.content-policy:register"],
		hooks: {
			"content:beforePublish": async (event: { collection: string; content: { slug?: unknown } }) => pageSlugDecision(event.collection, event.content.slug),
		} as never,
		// The route/tool maps are built from the registry above; their value types are checked by EmDash at startup.
		routes: { ...routes, admin: adminRoute } as never,
		admin: { pages: [{ path: "/commerce", label: "CartDE", icon: "shopping-cart" }] },
		mcp: { tools: mcpTools } as never,
	});
}

export default createPlugin;
