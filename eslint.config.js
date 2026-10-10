import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default [
	{ ignores: ["dist/", ".astro/", ".wrangler/", "node_modules/", "worker-configuration.d.ts", "emdash-env.d.ts", ".agents/"] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	...astro.configs.recommended,
	{
		rules: {
			// Unused values prefixed with "_" are intentional (destructuring to drop a field).
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
			],
		},
	},
	{
		files: ["*.mjs", "*.js"],
		languageOptions: { globals: { URL: "readonly", process: "readonly" } },
	},
	{
		// Browser scripts are excluded from type checking (see docs/development.md); allow their loose typing.
		files: ["src/cartde/client/**"],
		rules: { "@typescript-eslint/ban-ts-comment": "off", "@typescript-eslint/no-explicit-any": "off" },
	},
];
