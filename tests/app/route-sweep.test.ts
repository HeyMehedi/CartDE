import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { decide } from "../../src/cartde/app/guard";

const pagesDir = join(import.meta.dirname, "../../src/pages");

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

/** src/pages/api/cartde/admin/products/[id]/index.ts -> /api/cartde/admin/products/x */
function toPath(file: string): string {
	return (
		"/" +
		relative(pagesDir, file)
			.replace(/\.(ts|astro)$/, "")
			.replace(/\/index$/, "")
			.replace(/\[\.\.\.[^\]]+\]/g, "x")
			.replace(/\[[^\]]+\]/g, "x")
	);
}

const adminFiles = walk(pagesDir).filter((f) => /\/(admin|api\/cartde\/admin)(\/|\.)/.test("/" + relative(pagesDir, f)) || /^(admin)\b/.test(relative(pagesDir, f)));
const methods = ["GET", "POST", "PATCH", "DELETE"];

describe("route sweep: every admin route refuses anonymous and non-admin callers", () => {
	it("finds admin routes", () => {
		expect(adminFiles.length).toBeGreaterThan(5);
	});
	for (const file of adminFiles) {
		const pathname = toPath(file);
		it(pathname, () => {
			for (const method of methods) {
				const base = { pathname, method, origin: "https://shop.test", header: () => null };
				expect(decide({ ...base, user: null }).action).not.toBe("allow");
				expect(decide({ ...base, user: { role: 40 } }).action).not.toBe("allow");
			}
		});
	}
});
