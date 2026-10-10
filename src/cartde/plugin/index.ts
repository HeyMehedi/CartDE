/**
 * CartDE's native EmDash plugin. It exposes the tools in `../mcp/tools.ts` as private plugin routes and as MCP tools.
 * EmDash authenticates the caller (OAuth or personal access token), checks the route permission, and only lists the
 * tools after an administrator enables the plugin's MCP surface.
 *
 * Permission: EmDash's permission list has no commerce entries, so every tool requires `settings:manage` (Admin role).
 * Orders contain customer contact details, so nothing here is available below Admin.
 */
import { definePlugin } from "emdash";
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
					return { ok: true, data: await executeTool(name as ToolName, { db: await database(), actorUserId: ctx.user?.id ?? null }, ctx.input) };
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

const mcpTools = Object.fromEntries(
	TOOL_NAMES.map((name) => [name, { description: TOOLS[name].description, route: name, input: TOOLS[name].input, destructive: TOOLS[name].destructive }]),
);

export function createPlugin() {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		capabilities: [],
		// The route/tool maps are built from the registry above; their value types are checked by EmDash at startup.
		routes: routes as never,
		mcp: { tools: mcpTools } as never,
	});
}

export default createPlugin;
