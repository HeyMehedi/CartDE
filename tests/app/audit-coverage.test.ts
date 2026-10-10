import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "../../src/pages/api/cartde/admin");
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

describe("audit coverage (FR-ADM-7)", () => {
	const files = walk(dir);
	it("finds admin API files", () => expect(files.length).toBeGreaterThan(8));
	for (const file of files) {
		const src = readFileSync(file, "utf8");
		it(`${relative(dir, file)}: every handler goes through route()`, () => {
			const handlers = [...src.matchAll(/export const (GET|POST|PATCH|PUT|DELETE)\b\s*=\s*(\S+)/g)];
			expect(handlers.length).toBeGreaterThan(0);
			for (const [, method, rhs] of handlers) expect(rhs, `${method} must be wrapped in route(...)`).toMatch(/^route\(/);
			expect(src).not.toMatch(/export (async )?function (POST|PATCH|PUT|DELETE)\b/);
		});
	}
});
