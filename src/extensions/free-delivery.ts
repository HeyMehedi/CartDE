import { EXTENSION_API_VERSION, type Extension } from "../cartde/extensions/types";

/** Orders with a goods subtotal at or above this get free delivery (minor units: 5,000.00 BDT). */
const THRESHOLD_MINOR = 500_000;

/**
 * Sample extension showing all three hook kinds. Off until an administrator enables it under Admin > Extensions.
 * It changes nothing in the commerce core: it only returns numbers and data that the core validates.
 */
const freeDelivery: Extension = {
	id: "free-delivery",
	name: "Free delivery over 5,000",
	description: "Waives the delivery charge when the goods subtotal is 5,000 or more, shows a banner section, and logs order events.",
	cartdeApi: EXTENSION_API_VERSION,
	hooks: {
		adjustDelivery: (ctx) => (ctx.subtotal_minor >= THRESHOLD_MINOR ? 0 : ctx.delivery_minor),
		storefrontSection: () => ({ title: "Free delivery", body: "Orders over 5,000 ship free anywhere in Bangladesh.", items: [{ label: "Shop now", url: "/products" }] }),
		onOrderEvent: (event) => {
			// Order events carry no customer details, so they are safe to log.
			console.info("free-delivery saw", event.type, `#${event.order_number}`, event.status);
		},
	},
};

export default freeDelivery;
