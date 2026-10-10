import { z } from "zod";
import { db, ok, route } from "../../../../cartde/app/http";
import { extensionRuntime } from "../../../../cartde/app/extensions";
import { priceCart, quoteTotals } from "../../../../cartde/db/orders";
import { getStore } from "../../../../cartde/db/store";
import { MAX_CART_LINES } from "../../../../cartde/domain/cart";
import { cartLineInput } from "../../../../cartde/domain/schemas";
import { isDistrict } from "../../../../cartde/domain/geo/districts";

/** GET /api/cartde/cart/validate?lines=<variantId>:<qty>,...&district=Dhaka  — re-prices the cart (FR-CART-2/3). */
export const GET = route(async ({ url }) => {
	const raw = (url.searchParams.get("lines") ?? "").split(",").filter(Boolean).slice(0, MAX_CART_LINES);
	const lines = z.array(cartLineInput).parse(
		raw.map((part) => {
			const [variant_id, qty] = part.split(":");
			return { variant_id, quantity: Number(qty) };
		}),
	);
	const [priced, store] = await Promise.all([priceCart(db(), lines), getStore(db())]);
	const district = url.searchParams.get("district");
	const purchasable = priced.length > 0 && priced.every((l) => l.available);
	// The same quote function the real order uses, so the preview cannot disagree with the charge.
	const quote =
		district && isDistrict(district) && purchasable ? await quoteTotals(store, priced, district, await extensionRuntime(db())) : null;
	const subtotal = priced.reduce((s, l) => s + (l.available ? l.line_total_minor : 0), 0);
	return ok({
		currency: store.currency,
		locale: store.locale,
		lines: priced.map((l) => ({ ...l, media_id: undefined })),
		subtotal_minor: subtotal,
		delivery_inside_minor: store.delivery_inside_dhaka_minor,
		delivery_outside_minor: store.delivery_outside_dhaka_minor,
		delivery_minor: quote ? quote.delivery_minor : null,
		discount_minor: quote ? quote.discount_minor : 0,
		total_minor: quote ? quote.total_minor : null,
		purchasable,
	});
});
