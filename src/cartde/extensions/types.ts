/**
 * CartDE extension API, version 1.
 *
 * An extension is plain code registered in `src/extensions/index.ts` and switched on by an administrator.
 * Extensions never touch the database or the order tables; they receive plain data and return plain data, which the
 * core validates and bounds before using it. A hook that throws, is too slow, or returns something out of range is
 * ignored for that request and logged, so a faulty extension cannot break checkout.
 *
 * Compatibility rules (enforced by `buildRegistry`):
 *  - `cartdeApi` must equal EXTENSION_API_VERSION, or the extension is rejected at load.
 *  - `id` is lowercase kebab-case and unique.
 *  - New hooks may be added in later minor releases; existing hook signatures only change with a new API version.
 */
export const EXTENSION_API_VERSION = 1;

/** Per-hook time budget. Hooks that exceed it are skipped. */
export const HOOK_TIMEOUT_MS = 500;
/** A delivery charge returned by an extension may not exceed this (minor units). */
export const MAX_DELIVERY_MINOR = 1_000_000;

export interface PricingLine {
	product_id: string;
	variant_id: string;
	quantity: number;
	unit_price_minor: number;
}

export interface PricingContext {
	currency: string;
	district: string;
	lines: readonly PricingLine[];
	subtotal_minor: number;
	/** The delivery charge as it stands (store setting, after earlier extensions). */
	delivery_minor: number;
}

/** Order lifecycle event. Deliberately contains no customer details. */
export interface OrderEvent {
	type: "order.placed" | "order.status_changed";
	order_number: number;
	status: string;
	from_status: string | null;
	total_minor: number;
	currency: string;
	item_count: number;
}

export interface SectionContext {
	currency: string;
	locale: string;
}

/** Data for a storefront section. The core renders it with escaping; extensions never supply HTML. */
export interface SectionData {
	title: string;
	body?: string;
	items?: { label: string; url: string; note?: string }[];
}

export interface ExtensionHooks {
	/** Return the new delivery charge (0..MAX_DELIVERY_MINOR). */
	adjustDelivery?(ctx: PricingContext): number | Promise<number>;
	/** Return a discount on the goods subtotal (0..subtotal). Discounts from several extensions add up, capped at the subtotal. */
	discount?(ctx: PricingContext): number | Promise<number>;
	/** Called after an order is placed or changes status. Fire and forget. */
	onOrderEvent?(event: OrderEvent): void | Promise<void>;
	/** Content for a homepage section of type "extension" that names this extension. */
	storefrontSection?(ctx: SectionContext): SectionData | null | Promise<SectionData | null>;
}

export interface Extension {
	id: string;
	name: string;
	description: string;
	cartdeApi: number;
	hooks: ExtensionHooks;
}

/** What the core hands to checkout and order code. Implemented in `registry.ts`. */
export interface ExtensionRuntime {
	adjustPricing(ctx: PricingContext): Promise<{ delivery_minor: number; discount_minor: number }>;
	emitOrderEvent(event: OrderEvent): Promise<void>;
	loadSection(extensionId: string, ctx: SectionContext): Promise<SectionData | null>;
}
