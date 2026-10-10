/**
 * The "CartDE" page inside EmDash's own admin (sidebar entry). It is a Block Kit page: a status summary plus links
 * into CartDE's dashboard pages, which live outside the EmDash admin shell at /admin and /setup.
 */
export interface OverviewNumbers {
	pending_orders: number;
	orders_today: number;
	active_products: number;
	low_stock_variants: number;
}

export interface AdminPageState {
	/** Site origin, e.g. https://shop.example. Block Kit external links must be absolute. */
	origin: string;
	storeName: string;
	/** null when the commerce tables are missing. */
	setupComplete: boolean | null;
	overview: OverviewNumbers | null;
}

type Block = Record<string, unknown>;

const LINKS: { label: string; path: string }[] = [
	{ label: "Orders", path: "/admin/orders" },
	{ label: "Products", path: "/admin/products" },
	{ label: "Customers", path: "/admin/customers" },
	{ label: "Categories", path: "/admin/categories" },
	{ label: "Theme", path: "/admin/theme" },
	{ label: "Extensions", path: "/admin/extensions" },
	{ label: "Store settings", path: "/admin/settings" },
	{ label: "Activity log", path: "/admin/audit" },
];

const link = (origin: string, label: string, path: string, appearance: "primary" | "secondary" = "secondary") => ({
	type: "link",
	label,
	target: { kind: "external", url: new URL(path, origin).toString() },
	appearance,
});

export function buildAdminBlocks(state: AdminPageState): { blocks: Block[] } {
	const blocks: Block[] = [{ type: "header", text: `${state.storeName} · Commerce` }];

	if (state.setupComplete === null) {
		blocks.push({
			type: "banner",
			variant: "error",
			title: "Commerce tables are missing",
			description: "Run the database migrations (pnpm deploy applies them), then reload this page.",
		});
	} else if (!state.setupComplete) {
		blocks.push(
			{
				type: "banner",
				variant: "alert",
				title: "Your store is not open yet",
				description: "Finish store setup. Until then, shoppers see a \"store not ready\" page.",
			},
			{ type: "actions", elements: [link(state.origin, "Finish store setup", "/setup", "primary")] },
		);
	}

	if (state.overview) {
		blocks.push({
			type: "stats",
			items: [
				{ label: "Pending orders", value: state.overview.pending_orders },
				{ label: "Orders today", value: state.overview.orders_today },
				{ label: "Active products", value: state.overview.active_products },
				{ label: "Low-stock variants", value: state.overview.low_stock_variants },
			],
		});
	}

	blocks.push(
		{ type: "actions", elements: [link(state.origin, "Open commerce dashboard", "/admin", "primary"), link(state.origin, "View storefront", "/")] },
		{ type: "divider" },
		{ type: "context", text: "CartDE's commerce screens open in a new tab. They use your EmDash sign-in and need the Admin role." },
		{ type: "actions", elements: LINKS.map((l) => link(state.origin, l.label, l.path)) },
	);
	return { blocks };
}
