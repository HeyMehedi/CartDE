import { z } from "zod";
import { SLUG_PATTERN, RESERVED_SLUGS } from "./slug";
import { MAX_OPTIONS, MAX_VARIANTS } from "./variants";

const minor = z.number().int().min(0).max(1_000_000_000);
const trimmed = (max: number) => z.string().trim().max(max);

export const slugSchema = z
	.string()
	.trim()
	.min(1)
	.max(80)
	.regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens.")
	.refine((s) => !RESERVED_SLUGS.has(s), "This slug is reserved.");

export const productStatus = z.enum(["draft", "active", "archived"]);

export const variantInput = z
	.object({
		sku: trimmed(64).min(1).nullable().optional(),
		price_minor: minor,
		compare_at_minor: minor.nullable().optional(),
		stock_qty: z.number().int().min(0).max(1_000_000).default(0),
		status: z.enum(["active", "inactive"]).default("active"),
		option_values: z.array(trimmed(80).min(1)).max(MAX_OPTIONS).default([]),
	})
	.refine((v) => v.compare_at_minor == null || v.compare_at_minor >= v.price_minor, {
		message: "Compare-at price must not be below the price.",
		path: ["compare_at_minor"],
	});

export const productInput = z.object({
	name: trimmed(200).min(1),
	slug: slugSchema.optional(),
	description_md: z.string().max(50_000).default(""),
	status: productStatus.default("draft"),
	featured_media_id: trimmed(64).min(1).nullable().optional(),
	seo_title: trimmed(70).nullable().optional(),
	seo_description: trimmed(160).nullable().optional(),
	category_ids: z.array(z.string().length(26)).max(50).default([]),
	options: z
		.array(z.object({ name: trimmed(60).min(1), values: z.array(trimmed(80).min(1)).min(1).max(MAX_VARIANTS) }))
		.max(MAX_OPTIONS)
		.default([]),
	variants: z.array(variantInput).min(1).max(MAX_VARIANTS),
});
export type ProductInput = z.infer<typeof productInput>;

export const categoryInput = z.object({
	name: trimmed(100).min(1),
	slug: slugSchema.optional(),
	description: trimmed(1000).nullable().optional(),
	sort_order: z.number().int().min(0).max(10_000).default(0),
});
export type CategoryInput = z.infer<typeof categoryInput>;

export const stockAdjustmentInput = z.object({
	delta: z.number().int().refine((n) => n !== 0, "Adjustment must not be zero.").refine((n) => Math.abs(n) <= 1_000_000),
	reason: z.enum(["manual", "import", "return"]).default("manual"),
	note: trimmed(500).nullable().optional(),
});

export const storeSettingsInput = z.object({
	name: trimmed(100).min(1),
	currency: z.string().regex(/^[A-Z]{3}$/),
	locale: trimmed(20).min(2),
	timezone: trimmed(60).min(1),
	contact_phone: trimmed(30).nullable().optional(),
	contact_email: z.email().max(120).nullable().optional(),
	address_text: trimmed(500).nullable().optional(),
	delivery_inside_dhaka_minor: minor,
	delivery_outside_dhaka_minor: minor,
	low_stock_threshold: z.number().int().min(0).max(100_000),
});
