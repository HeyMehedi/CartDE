import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { csvCell, exportCustomers, exportOrders, exportProducts, toCsv } from "../../src/cartde/db/export";
import { createProduct, deleteProduct, updateProduct } from "../../src/cartde/db/products";
import { placeOrder } from "../../src/cartde/db/orders";
import { updateStore } from "../../src/cartde/db/store";
import { completeSetup } from "../../src/cartde/db/setup";
import { checkoutInput, productInput, setupInput } from "../../src/cartde/domain/schemas";

let db: D1Database;
const settings = (over: Record<string, unknown> = {}) => setupInput.parse({ name: "Shop", currency: "BDT", locale: "en-BD", timezone: "Asia/Dhaka", delivery_inside_dhaka_minor: 6000, delivery_outside_dhaka_minor: 12000, low_stock_threshold: 3, ...over });

beforeEach(async () => {
	db = createTestDb();
	await completeSetup(db, settings());
});

async function sell() {
	const p = await createProduct(db, productInput.parse({ name: "Tee, \"classic\"", status: "active", variants: [{ price_minor: 90050, stock_qty: 5, sku: "=HYPERLINK(1)" }] }));
	await placeOrder(db, checkoutInput.parse({ idempotency_key: "csv-key-0000000000001", name: "=cmd|' /C calc'!A0", phone: "01712345678", district: "Dhaka", area: "Mirpur", address: "House 5, Road 3\nFlat 2", lines: [{ variant_id: p.variants[0]!.id, quantity: 1 }] }));
	return p;
}

describe("FR-ADM-5 currency lock", () => {
	it("allows a currency change before the first order and refuses it after", async () => {
		await updateStore(db, settings({ currency: "USD" }));
		await updateStore(db, settings({ currency: "BDT" }));
		await sell();
		await expect(updateStore(db, settings({ currency: "USD" }))).rejects.toMatchObject({ code: "conflict" });
		await updateStore(db, settings({ name: "Renamed" })); // other settings still editable
	});
});

describe("FR-CAT-8 delete with orders", () => {
	it("refuses to delete a product that was ever ordered, even after it goes back to draft", async () => {
		const p = await sell();
		await updateProduct(db, p.id, { status: "draft" });
		await expect(deleteProduct(db, p.id)).rejects.toMatchObject({ code: "conflict" });
		await updateProduct(db, p.id, { status: "archived" });
	});
});

describe("CSV export", () => {
	it("quotes per RFC 4180 and neutralises formula injection", () => {
		expect(csvCell('a,"b"')).toBe('"a,""b"""');
		expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
		expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
		expect(csvCell("@cmd")).toBe("'@cmd");
		expect(csvCell("-12.50")).toBe("-12.50");
		expect(csvCell(null)).toBe("");
		expect(toCsv(["a"], [{ a: 1 }])).toBe("a\r\n1\r\n");
	});

	it("exports products, orders and customers", async () => {
		await sell();
		const products = await exportProducts(db);
		expect(products.split("\r\n")[0]).toBe("product_id,name,slug,status,variant_id,variant,sku,price,compare_at,stock_qty,variant_status");
		expect(products).toContain('"Tee, ""classic"""');
		expect(products).toContain("'=HYPERLINK(1)");
		expect(products).toContain(",900.50,");
		const orders = await exportOrders(db);
		expect(orders).toContain("1001,");
		expect(orders).toContain(",960.50,"); // 900.50 + 60.00
		expect(orders).toContain("\"'=cmd|' /C calc'!A0\"".replace(/^"|"$/g, "").slice(0, 5));
		expect(orders).not.toMatch(/,=cmd/);
		expect(orders).toContain('"House 5, Road 3\nFlat 2"');
		const customers = await exportCustomers(db);
		expect(customers.split("\r\n")[1]).toMatch(/^'=cmd.*,01712345678,,.*,1,/);
	});
});
