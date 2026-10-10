export const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = "unpaid" | "paid" | "refunded";

/** Allowed transitions (SRS section 6). `cancelled` and `returned` are terminal. */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
	pending: ["confirmed", "cancelled"],
	confirmed: ["shipped", "cancelled"],
	shipped: ["delivered", "returned"],
	delivered: ["returned"],
	cancelled: [],
	returned: [],
};

export const allowedTransitions = (from: OrderStatus): readonly OrderStatus[] => TRANSITIONS[from];
export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => TRANSITIONS[from].includes(to);

export interface TransitionOptions {
	/** For returns: put the items back in stock (default true). */
	restock?: boolean;
	/** For delivered -> returned: cash was handed back to the customer. */
	cashReturned?: boolean;
}

export interface TransitionEffect {
	restock: boolean;
	restockReason: "cancel" | "return" | null;
	payment: PaymentStatus;
}

/** Side effects of a valid transition. Throws on an invalid pair so callers cannot skip the check. */
export function transitionEffect(
	from: OrderStatus,
	to: OrderStatus,
	current: PaymentStatus,
	opts: TransitionOptions = {},
): TransitionEffect {
	if (!canTransition(from, to)) {
		const allowed = TRANSITIONS[from];
		throw new Error(
			allowed.length
				? `An order that is ${from} can only become: ${allowed.join(", ")}.`
				: `An order that is ${from} cannot change status.`,
		);
	}
	if (to === "cancelled") return { restock: true, restockReason: "cancel", payment: current };
	if (to === "returned") {
		return {
			restock: opts.restock !== false,
			restockReason: "return",
			payment: from === "delivered" && opts.cashReturned ? "refunded" : current,
		};
	}
	return { restock: false, restockReason: null, payment: to === "delivered" ? "paid" : current };
}
