/**
 * CartDE's AI-callable operations (FR-AI-1..4).
 *
 * Every tool is a typed function with a zod input schema. The EmDash plugin exposes them as MCP tools; they call
 * the same repository functions as the dashboard's HTTP routes, so business rules live in one place. No tool takes a
 * store or user argument: the store is implicit and the caller's identity comes from the authenticated request.
 */
import { z } from "zod";
import { recordAudit, summarizePayload } from "../db/audit";
import { createDiscountDraft } from "../db/discounts";
import { getOrder, getOrderIdByNumber, listOrders, salesSummary, transitionOrder } from "../db/orders";
import { adjustStock, createProduct, listProducts, updateProduct } from "../db/products";
import type { ExtensionRuntime } from "../extensions/types";
import { discountDraftInput, orderTransitionInput, productInput } from "../domain/schemas";

export interface ToolContext {
	db: D1Database;
	actorUserId: string | null;
	/** Extension runtime, so changes made by AI fire the same order events as the dashboard. */
	extensions?: ExtensionRuntime;
}

export interface ToolDef<I extends z.ZodType = z.ZodType> {
	description: string;
	input: I;
	/** Writes data. Mutating tools are audited. */
	mutates: boolean;
	/** Hard to undo (stock restoration, cancellation). The MCP client is told to ask the user first. */
	destructive: boolean;
	entity: string;
	run: (ctx: ToolContext, input: z.infer<I>) => Promise<unknown>;
}

const ulid = z.string().length(26);
const orderNumber = z.number().int().min(1).max(999_999_999);
const tool = <I extends z.ZodType>(def: ToolDef<I>): ToolDef<I> => def;

export const TOOLS = {
	search_products: tool({
		description:
			"Search products by name or slug. Returns id, name, status, variant count, lowest price and total stock (money in minor units).",
		input: z
			.object({
				query: z.string().trim().max(100).optional(),
				status: z.enum(["draft", "active", "archived"]).optional(),
				limit: z.number().int().min(1).max(50).default(20),
			})
			.strict(),
		mutates: false,
		destructive: false,
		entity: "product",
		run: async ({ db }, i) => listProducts(db, { search: i.query, status: i.status, limit: i.limit }),
	}),

	list_orders: tool({
		description:
			"List orders, newest first, 25 per page. Search by order number, phone or name; filter by status. Customer phone numbers are omitted; use get_order_details for fulfilment data.",
		input: z
			.object({
				query: z.string().trim().max(100).optional(),
				status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"]).optional(),
				page: z.number().int().min(1).max(1000).default(1),
			})
			.strict(),
		mutates: false,
		destructive: false,
		entity: "order",
		run: async ({ db }, i) => {
			const r = await listOrders(db, { q: i.query, status: i.status, page: i.page });
			return { ...r, items: r.items.map(({ customer_phone: _phone, ...rest }) => rest) };
		},
	}),

	get_order_details: tool({
		description: "Get one order by its order number: items, totals, delivery address, customer contact and status history.",
		input: z.object({ order_number: orderNumber }).strict(),
		mutates: false,
		destructive: false,
		entity: "order",
		run: async ({ db }, i) => getOrder(db, await getOrderIdByNumber(db, i.order_number)),
	}),

	get_sales_summary: tool({
		description:
			"Sales summary for the last N days: order count, revenue (excludes cancelled and returned), average order value, orders by status, top products.",
		input: z.object({ days: z.number().int().min(1).max(365).default(7) }).strict(),
		mutates: false,
		destructive: false,
		entity: "report",
		run: async ({ db }, i) => salesSummary(db, i.days),
	}),

	create_product_draft: tool({
		description:
			"Create a product as a DRAFT with one variant. It is not visible to shoppers until a person publishes it in the dashboard.",
		input: z
			.object({
				name: z.string().trim().min(1).max(200),
				description_md: z.string().max(50_000).default(""),
				price_minor: z.number().int().min(0).max(1_000_000_000),
				compare_at_minor: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
				stock_qty: z.number().int().min(0).max(1_000_000).default(0),
				sku: z.string().trim().min(1).max(64).nullable().optional(),
			})
			.strict(),
		mutates: true,
		destructive: false,
		entity: "product",
		run: async ({ db, actorUserId }, i) => {
			const product = await createProduct(
				db,
				productInput.parse({
					name: i.name,
					description_md: i.description_md,
					status: "draft",
					variants: [{ price_minor: i.price_minor, compare_at_minor: i.compare_at_minor, stock_qty: i.stock_qty, sku: i.sku }],
				}),
				actorUserId,
			);
			return { id: product.id, slug: product.slug, status: product.status, variant_id: product.variants[0]!.id };
		},
	}),

	update_product: tool({
		description:
			"Edit a product's name, description or SEO text, or move it to draft or archived. Publishing is intentionally not available here: a person publishes in the dashboard.",
		input: z
			.object({
				product_id: ulid,
				name: z.string().trim().min(1).max(200).optional(),
				description_md: z.string().max(50_000).optional(),
				seo_title: z.string().trim().max(70).nullable().optional(),
				seo_description: z.string().trim().max(160).nullable().optional(),
				status: z.enum(["draft", "archived"]).optional(),
			})
			.strict(),
		mutates: true,
		destructive: false,
		entity: "product",
		run: async ({ db }, { product_id, ...patch }) => {
			const p = await updateProduct(db, product_id, patch);
			return { id: p.id, name: p.name, slug: p.slug, status: p.status };
		},
	}),

	update_inventory: tool({
		description: "Add (positive) or remove (negative) stock for one variant. Stock cannot go below zero. Records an inventory event.",
		input: z
			.object({
				variant_id: ulid,
				delta: z
					.number()
					.int()
					.min(-1_000_000)
					.max(1_000_000)
					.refine((n) => n !== 0, "delta must not be zero"),
				note: z.string().trim().max(500).nullable().optional(),
			})
			.strict(),
		mutates: true,
		destructive: false,
		entity: "variant",
		run: async ({ db, actorUserId }, i) =>
			adjustStock(db, i.variant_id, { delta: i.delta, reason: "manual", note: i.note ?? null }, actorUserId),
	}),

	update_order_status: tool({
		description:
			"Move an order along its workflow (pending→confirmed→shipped→delivered; cancel from pending/confirmed; return from shipped/delivered). Cancelling or returning puts stock back. Invalid moves are refused. Confirm with the user before calling.",
		input: orderTransitionInput.extend({ order_number: orderNumber }).strict(),
		mutates: true,
		destructive: true,
		entity: "order",
		run: async ({ db, actorUserId, extensions }, { order_number, ...transition }) => {
			const o = await transitionOrder(db, await getOrderIdByNumber(db, order_number), transition, actorUserId, { extensions });
			return { order_number: o.order_number, status: o.status, payment_status: o.payment_status };
		},
	}),

	create_discount_draft: tool({
		description:
			"Create a discount code as a DRAFT (percent 1-100, or a fixed amount in minor units). Drafts are stored for review; discounts are not yet applied at checkout.",
		input: discountDraftInput,
		mutates: true,
		destructive: false,
		entity: "discount",
		run: async ({ db }, i) => createDiscountDraft(db, i),
	}),
} satisfies Record<string, ToolDef>;

export type ToolName = keyof typeof TOOLS;
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];

export class ToolInputError extends Error {
	constructor(public readonly fields: Record<string, string>) {
		super("Invalid tool input.");
	}
}

function auditEntityId(result: unknown, input: unknown): string | null {
	const r = result as { id?: unknown } | null;
	if (r && typeof r.id === "string") return r.id;
	const i = input as Record<string, unknown>;
	for (const key of ["variant_id", "product_id", "order_number"]) if (i[key] !== undefined) return String(i[key]);
	return null;
}

/** The one execution path for every tool: validate, run, audit. Returns plain data or throws CartdeError/ToolInputError. */
export async function executeTool(name: ToolName, ctx: ToolContext, raw: unknown): Promise<unknown> {
	const def = TOOLS[name] as ToolDef;
	const parsed = def.input.safeParse(raw ?? {});
	if (!parsed.success) {
		const fields: Record<string, string> = {};
		for (const issue of parsed.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
		throw new ToolInputError(fields);
	}
	const result = await def.run(ctx, parsed.data);
	if (def.mutates) {
		const id = auditEntityId(result, parsed.data);
		await recordAudit(ctx.db, {
			actor_user_id: ctx.actorUserId,
			actor_kind: "mcp",
			action: `mcp.${name}`,
			entity: def.entity,
			entity_id: id,
			payload: summarizePayload(parsed.data),
		});
	}
	return result;
}
