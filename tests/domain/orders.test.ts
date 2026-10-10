import { describe, expect, it } from "vitest";
import { DISTRICTS, isDistrict, zoneFor } from "../../src/cartde/domain/geo/districts";
import { normalizeBdPhone } from "../../src/cartde/domain/phone";
import { ORDER_STATUSES, allowedTransitions, canTransition, transitionEffect } from "../../src/cartde/domain/orders";
import { computeTotals, normalizeCart } from "../../src/cartde/domain/cart";
import { checkoutInput } from "../../src/cartde/domain/schemas";

describe("districts", () => {
	it("has 64 unique districts and zones", () => {
		expect(DISTRICTS).toHaveLength(64);
		expect(new Set(DISTRICTS).size).toBe(64);
		expect(isDistrict("Sylhet")).toBe(true);
		expect(isDistrict("Atlantis")).toBe(false);
		expect(zoneFor("Dhaka")).toBe("inside_dhaka");
		expect(zoneFor("Gazipur")).toBe("outside_dhaka");
	});
});

describe("phone", () => {
	it("normalises accepted forms", () => {
		for (const ok of ["01712345678", "+8801712345678", "8801712345678", "017-1234 5678", "০১৭১২৩৪৫৬৭৮"]) expect(normalizeBdPhone(ok)).toBe("01712345678");
	});
	it("rejects invalid numbers", () => {
		for (const bad of ["", "0171234567", "01212345678", "02-1234567", "+8801712", "abc", "017123456789"]) expect(normalizeBdPhone(bad)).toBeNull();
	});
});

describe("order state machine", () => {
	const valid = new Set(["pending>confirmed", "pending>cancelled", "confirmed>shipped", "confirmed>cancelled", "shipped>delivered", "shipped>returned", "delivered>returned"]);
	it("accepts exactly the SRS transitions for every pair", () => {
		for (const from of ORDER_STATUSES) for (const to of ORDER_STATUSES) expect(canTransition(from, to), `${from}>${to}`).toBe(valid.has(`${from}>${to}`));
	});
	it("terminal states have no exits", () => {
		expect(allowedTransitions("cancelled")).toEqual([]);
		expect(allowedTransitions("returned")).toEqual([]);
	});
	it("computes effects", () => {
		expect(transitionEffect("pending", "cancelled", "unpaid")).toMatchObject({ restock: true, restockReason: "cancel", payment: "unpaid" });
		expect(transitionEffect("shipped", "delivered", "unpaid")).toMatchObject({ restock: false, payment: "paid" });
		expect(transitionEffect("shipped", "returned", "unpaid", { restock: false })).toMatchObject({ restock: false, payment: "unpaid" });
		expect(transitionEffect("delivered", "returned", "paid", { cashReturned: true })).toMatchObject({ restock: true, payment: "refunded" });
		expect(transitionEffect("delivered", "returned", "paid")).toMatchObject({ payment: "paid" });
	});
	it("throws on invalid pairs with the allowed targets", () => {
		expect(() => transitionEffect("pending", "delivered", "unpaid")).toThrow(/confirmed, cancelled/);
		expect(() => transitionEffect("cancelled", "pending", "unpaid")).toThrow(/cannot change/);
	});
});

describe("cart totals", () => {
	it("sums lines and delivery", () => {
		expect(computeTotals([{ unit_price_minor: 90000, quantity: 2 }, { unit_price_minor: 5000, quantity: 1 }], 6000)).toEqual({ subtotal_minor: 185000, delivery_minor: 6000, discount_minor: 0, total_minor: 191000 });
	});
	it("rejects over-discount", () => {
		expect(() => computeTotals([{ unit_price_minor: 100, quantity: 1 }], 0, 200)).toThrow();
	});
	it("merges duplicate lines", () => {
		expect(normalizeCart([{ variant_id: "a", quantity: 1 }, { variant_id: "a", quantity: 2 }, { variant_id: "b", quantity: 0 }])).toEqual([{ variant_id: "a", quantity: 3 }]);
	});
});

describe("checkout schema", () => {
	const base = { idempotency_key: "0123456789abcdef", name: "Rahim Uddin", phone: "+8801712345678", district: "Dhaka", area: "Mirpur", address: "House 5, Road 3", lines: [{ variant_id: "A".repeat(26), quantity: 2 }] };
	it("accepts and normalises a valid payload", () => {
		const r = checkoutInput.safeParse(base);
		expect(r.success && r.data.phone).toBe("01712345678");
	});
	it("rejects bad fields", () => {
		for (const bad of [{ name: "R" }, { phone: "123" }, { district: "Nowhere" }, { address: "x" }, { lines: [] }, { lines: [{ variant_id: "A".repeat(26), quantity: 0 }] }, { note: "x".repeat(501) }]) {
			expect(checkoutInput.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false);
		}
	});
	it("ignores client-supplied prices", () => {
		const r = checkoutInput.parse({ ...base, lines: [{ variant_id: "A".repeat(26), quantity: 1, unit_price_minor: 1 }] });
		expect(r.lines[0]).not.toHaveProperty("unit_price_minor");
	});
});

import { startOfDayUtc } from "../../src/cartde/domain/time";

describe("startOfDayUtc", () => {
	it("uses the store's calendar day (Dhaka is UTC+6, no DST)", () => {
		expect(startOfDayUtc("Asia/Dhaka", new Date("2026-10-10T20:00:00Z")).toISOString()).toBe("2026-10-10T18:00:00.000Z"); // already the 11th in Dhaka
		expect(startOfDayUtc("Asia/Dhaka", new Date("2026-10-10T10:00:00Z")).toISOString()).toBe("2026-10-09T18:00:00.000Z");
	});
	it("handles a DST change day", () => {
		expect(startOfDayUtc("America/New_York", new Date("2026-03-08T15:00:00Z")).toISOString()).toBe("2026-03-08T05:00:00.000Z"); // midnight was still EST
	});
});
