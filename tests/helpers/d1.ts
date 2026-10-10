import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

/**
 * Minimal D1Database stand-in over node:sqlite, enough for CartDE's repositories.
 * `batch` is atomic (rolls back on error), matching D1's batch semantics.
 * Real-D1 behaviour is still verified by `wrangler d1 migrations apply --local` (see docs/development.md).
 */
class Stmt {
	private args: unknown[] = [];
	constructor(private db: DatabaseSync, readonly sql: string) {}
	bind(...args: unknown[]) {
		this.args = args;
		return this;
	}
	private run_(): { results: unknown[]; meta: { changes: number } } {
		const st = this.db.prepare(this.sql);
		if (/^\s*(select|with)/i.test(this.sql)) return { results: st.all(...(this.args as never[])), meta: { changes: 0 } };
		const r = st.run(...(this.args as never[]));
		return { results: [], meta: { changes: Number(r.changes) } };
	}
	async first() {
		return (this.run_().results[0] as unknown) ?? null;
	}
	async all() {
		return this.run_();
	}
	async run() {
		return this.run_();
	}
	exec() {
		return this.run_();
	}
}

export function createTestDb(): D1Database {
	const db = new DatabaseSync(":memory:");
	db.exec("PRAGMA foreign_keys = ON");
	const dir = join(import.meta.dirname, "../../migrations");
	for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
	return {
		prepare: (sql: string) => new Stmt(db, sql),
		async batch(stmts: Stmt[]) {
			db.exec("BEGIN");
			try {
				const out = stmts.map((s) => s.exec());
				db.exec("COMMIT");
				return out;
			} catch (err) {
				db.exec("ROLLBACK");
				throw err;
			}
		},
	} as unknown as D1Database;
}
