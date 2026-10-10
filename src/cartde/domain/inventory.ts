export type InventoryReason = "order" | "cancel" | "return" | "manual" | "import";

export class InventoryError extends Error {}

/** New stock level after a signed delta; refuses to go negative or to apply a zero delta. */
export function applyStockDelta(current: number, delta: number): number {
	if (!Number.isInteger(current) || current < 0) throw new InventoryError("Current stock is invalid.");
	if (!Number.isInteger(delta) || delta === 0) throw new InventoryError("Adjustment must be a non-zero integer.");
	const next = current + delta;
	if (next < 0) throw new InventoryError(`Cannot remove ${-delta}: only ${current} in stock.`);
	return next;
}

export function isLowStock(stock: number, threshold: number): boolean {
	return stock <= threshold;
}
