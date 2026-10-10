export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 30;

export interface PricedLine {
	unit_price_minor: number;
	quantity: number;
}

export interface Totals {
	subtotal_minor: number;
	delivery_minor: number;
	discount_minor: number;
	total_minor: number;
}

export const lineTotal = (line: PricedLine): number => line.unit_price_minor * line.quantity;

/** total = subtotal + delivery - discount (SRS 4.3). Throws if the invariant cannot hold. */
export function computeTotals(lines: readonly PricedLine[], delivery_minor: number, discount_minor = 0): Totals {
	const subtotal_minor = lines.reduce((sum, l) => sum + lineTotal(l), 0);
	if (discount_minor > subtotal_minor + delivery_minor) throw new Error("Discount exceeds the order value.");
	const totals = { subtotal_minor, delivery_minor, discount_minor, total_minor: subtotal_minor + delivery_minor - discount_minor };
	if (!Object.values(totals).every(Number.isSafeInteger)) throw new Error("Order total is out of range.");
	return totals;
}

/** Merge duplicate variants and drop zero quantities; used before pricing. */
export function normalizeCart(lines: readonly { variant_id: string; quantity: number }[]): { variant_id: string; quantity: number }[] {
	const merged = new Map<string, number>();
	for (const l of lines) merged.set(l.variant_id, (merged.get(l.variant_id) ?? 0) + l.quantity);
	return [...merged].filter(([, q]) => q > 0).map(([variant_id, quantity]) => ({ variant_id, quantity }));
}
