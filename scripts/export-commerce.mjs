#!/usr/bin/env node
/**
 * Export CartDE's commerce data (all cartde_* tables, data only) to backups/cartde-<timestamp>.sql.
 *
 * Why not `wrangler d1 export` of the whole database: D1 refuses to export databases that contain virtual tables,
 * and EmDash creates FTS5 search tables. Exporting named tables works. EmDash content is backed up separately
 * (`emdash site export`), and D1 Time Travel covers the whole database (`pnpm db:bookmark`).
 *
 * Usage: node scripts/export-commerce.mjs [--local]
 * Restore: apply migrations to an empty database, then `wrangler d1 execute DB --remote --file <export>`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const where = process.argv.includes("--local") ? "--local" : "--remote";
const wrangler = (args) => execFileSync("pnpm", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const listing = JSON.parse(
	wrangler([
		"d1",
		"execute",
		"DB",
		where,
		"--json",
		"--command",
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cartde\\_%' ESCAPE '\\' ORDER BY name",
	]),
);
const tables = listing[0].results.map((r) => r.name);
if (tables.length === 0) throw new Error("No cartde_* tables found. Have the migrations been applied?");

mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = `backups/cartde-${where.slice(2)}-${stamp}.sql`;
wrangler(["d1", "export", "DB", where, "--no-schema", "--output", file, ...tables.flatMap((t) => ["--table", t])]);

// Migration 0001 seeds the order counter; replace it with the exported value instead of failing on a duplicate key.
const sql = readFileSync(file, "utf8");
writeFileSync(
	file,
	`-- CartDE commerce export (${tables.length} tables, data only), ${new Date().toISOString()}\nDELETE FROM cartde_counters;\n${sql}`,
);
console.log(`Exported ${tables.length} tables to ${file}. It contains customer data: keep it private.`);
