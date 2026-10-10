import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { parseCsv } from "../../src/cartde/domain/csv";
import { importProductsCsv } from "../../src/cartde/db/import";
import { createCategory } from "../../src/cartde/db/categories";
import { getProduct, listProducts } from "../../src/cartde/db/products";
import { exportProducts } from "../../src/cartde/db/export";

describe("CSV parser", () => {
	it("handles quotes, escaped quotes, embedded newlines, CRLF and a BOM", () => {
		expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"multi\nline",z\n')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["multi\nline", "z"]]);
		expect(parseCsv("a,b\n\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
		expect(() => parseCsv('a\n"open')).toThrow(/Unclosed/);
	});
});

describe("product import", () => {
	let db: D1Database;
	beforeEach(async () => {
		db = createTestDb();
		await createCategory(db, { name: "Clothing", sort_order: 0 });
	});

	const csv = [
		"slug,name,description,status,category,option1_name,option1_value,sku,price,compare_at,stock",
		"tee,Cotton Tee,Soft tee,active,clothing,Size,S,TEE-S,890,990,5",
		"tee,Cotton Tee,,,,Size,M,TEE-M,890.50,,3",
		",Ceramic Mug,A mug,,,,,MUG,450,,10",
	].join("\n");

	it("dry run validates without writing", async () => {
		const r = await importProductsCsv(db, csv, { dryRun: true, actorUserId: null });
		expect(r).toMatchObject({ dry_run: true, created: 0, failed: 0 });
		expect(r.products.map((p) => [p.slug, p.variants, p.status])).toEqual([["tee", 2, "ok"], ["ceramic-mug", 1, "ok"]]);
		expect(await listProducts(db)).toHaveLength(0);
	});

	it("creates grouped products with options, prices, stock and category", async () => {
		const r = await importProductsCsv(db, csv, { dryRun: false, actorUserId: "u1" });
		expect(r.created).toBe(2);
		const tee = (await listProducts(db, { search: "tee" }))[0]!;
		const detail = await getProduct(db, tee.id);
		expect(detail).toMatchObject({ status: "active", description_md: "Soft tee" });
		expect(detail.category_ids).toHaveLength(1);
		expect(detail.variants.map((v) => [v.title, v.sku, v.price_minor, v.compare_at_minor, v.stock_qty])).toEqual([["S", "TEE-S", 89000, 99000, 5], ["M", "TEE-M", 89050, null, 3]]);
		const mug = (await listProducts(db, { search: "mug" }))[0]!;
		expect(mug.status).toBe("draft"); // status defaults to draft
	});

	it("reports row errors and never overwrites existing products", async () => {
		await importProductsCsv(db, csv, { dryRun: false, actorUserId: null });
		const bad = ["slug,name,price,stock,category", "tee,Again,10,1,", "x,Bad price,12.345,1,", "y,Neg stock,10,-1,", "z,No cat,10,1,nope", "w,,10,1,"].join("\n");
		const r = await importProductsCsv(db, bad, { dryRun: false, actorUserId: null });
		expect(r.created).toBe(0);
		expect(r.failed).toBe(5);
		const msgs = r.products.map((p) => p.errors.join(" ")).join("\n");
		expect(msgs).toMatch(/already exists/);
		expect(msgs).toMatch(/Line 3: price/);
		expect(msgs).toMatch(/Line 4: stock/);
		expect(msgs).toMatch(/Category "nope"/);
		expect(msgs).toMatch(/name/);
		expect(await listProducts(db)).toHaveLength(2);
	});

	it("rejects files without the required columns, empty files and huge files", async () => {
		await expect(importProductsCsv(db, "name\nx", { dryRun: true, actorUserId: null })).rejects.toMatchObject({ code: "invalid" });
		await expect(importProductsCsv(db, "name,price\n", { dryRun: true, actorUserId: null })).rejects.toMatchObject({ code: "invalid" });
		await expect(importProductsCsv(db, "name,price\n" + "a,1\n".repeat(501), { dryRun: true, actorUserId: null })).rejects.toMatchObject({ code: "invalid" });
	});

	it("an exported product file can be read back by the parser", async () => {
		await importProductsCsv(db, csv, { dryRun: false, actorUserId: null });
		const rows = parseCsv(await exportProducts(db));
		expect(rows[0]![1]).toBe("name");
		expect(rows).toHaveLength(4);
	});
});
