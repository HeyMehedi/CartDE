import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
			// CartDE's AI tools (milestone 0.5). In-repo native plugin: the entrypoint is an absolute path so
			// EmDash's generated module can import it. An administrator must still enable its MCP surface.
			plugins: [
				{
					id: "cartde",
					version: "0.5.0",
					format: "native",
					entrypoint: fileURLToPath(new URL("./src/cartde/plugin/index.ts", import.meta.url)),
					capabilities: ["hooks.content-policy:register"],
				},
			],
		}),
	],
	devToolbar: { enabled: false },
});
