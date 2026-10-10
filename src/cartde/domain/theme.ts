import { z } from "zod";

/** Storefront theme settings (milestone 0.6). Only validated tokens ever reach CSS: hex colours and named options. */

export const HEX = /^#[0-9a-fA-F]{6}$/;
export const PRESET_IDS = ["default", "warm"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const FONT_STACKS = {
	system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif',
	serif: 'Georgia, "Times New Roman", "Noto Serif Bengali", serif',
	mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;
export const RADII = { sharp: "0", soft: "6px", round: "14px" } as const;

export interface PresetTokens {
	label: string;
	accent: string;
	accent_fg: string;
	/** Optional fixed page colours. When absent the page follows the visitor's light/dark preference. */
	bg?: string;
	fg?: string;
	font: keyof typeof FONT_STACKS;
	radius: keyof typeof RADII;
}

export const PRESETS: Record<PresetId, PresetTokens> = {
	default: { label: "Default (follows light/dark)", accent: "#0b6b4f", accent_fg: "#ffffff", font: "system", radius: "soft" },
	warm: {
		label: "Warm (light, serif)",
		accent: "#9a3412",
		accent_fg: "#ffffff",
		bg: "#fbf6ee",
		fg: "#2b2118",
		font: "serif",
		radius: "round",
	},
};

const colour = z.string().regex(HEX, "Use a 6-digit hex colour such as #0b6b4f.");
const text = (max: number) => z.string().trim().max(max);
const href = z
	.string()
	.trim()
	.max(300)
	.refine((u) => /^\/(?![/\\])/.test(u) || /^https?:\/\/[^\s]+$/i.test(u), "Use a path like /about or an https:// link.");

export const SECTION_TYPES = ["hero", "latest_products", "categories", "text", "recent_posts", "extension"] as const;

export const sectionSchema = z.object({
	type: z.enum(SECTION_TYPES),
	enabled: z.boolean().default(true),
	title: text(80).optional(),
	body: text(500).optional(),
	count: z.number().int().min(1).max(24).optional(),
	/** For type "extension": the id of an enabled extension that provides a storefront section. */
	extension_id: z
		.string()
		.regex(/^[a-z][a-z0-9-]{1,40}$/)
		.optional(),
});
export type Section = z.infer<typeof sectionSchema>;

export const DEFAULT_SECTIONS: Section[] = [
	{ type: "hero", enabled: true },
	{ type: "latest_products", enabled: true, count: 8 },
	{ type: "recent_posts", enabled: true, count: 3 },
];

const themeShape = z.object({
	preset: z.enum(PRESET_IDS).default("default"),
	colors: z.object({ accent: colour.optional(), accent_fg: colour.optional(), bg: colour.optional(), fg: colour.optional() }).default({}),
	font: z.enum(["system", "serif", "mono"]).optional(),
	radius: z.enum(["sharp", "soft", "round"]).optional(),
	sections: z.array(sectionSchema).max(12).default(DEFAULT_SECTIONS),
	footer: z
		.object({
			text: text(300).default(""),
			links: z
				.array(z.object({ label: text(40).min(1), url: href }))
				.max(8)
				.default([]),
		})
		.default({ text: "", links: [] }),
	seo: z
		.object({ title_suffix: text(40).default(""), default_description: text(160).default("") })
		.default({ title_suffix: "", default_description: "" }),
});

/** Relative luminance and WCAG contrast ratio for two 6-digit hex colours. */
function luminance(hex: string): number {
	const channel = (i: number) => {
		const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
export function contrastRatio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (hi + 0.05) / (lo + 0.05);
}
export const MIN_CONTRAST = 4.5; // WCAG 2.1 AA for body text

export type ThemeSettings = z.infer<typeof themeShape>;

export interface EffectiveTheme {
	accent: string;
	accent_fg: string;
	bg: string | undefined;
	fg: string | undefined;
	font: keyof typeof FONT_STACKS;
	radius: keyof typeof RADII;
}

export function effectiveTheme(s: ThemeSettings): EffectiveTheme {
	const p = PRESETS[s.preset];
	return {
		accent: s.colors.accent ?? p.accent,
		accent_fg: s.colors.accent_fg ?? p.accent_fg,
		bg: s.colors.bg ?? p.bg,
		fg: s.colors.fg ?? p.fg,
		font: s.font ?? p.font,
		radius: s.radius ?? p.radius,
	};
}

export const themeSettingsInput = themeShape.superRefine((s, ctx) => {
	const t = effectiveTheme(s);
	if (contrastRatio(t.accent, t.accent_fg) < MIN_CONTRAST) {
		ctx.addIssue({
			code: "custom",
			path: ["colors", "accent_fg"],
			message: `Button text and button colour need a contrast ratio of at least ${MIN_CONTRAST}:1 (WCAG AA).`,
		});
	}
	if ((s.colors.bg || s.colors.fg) && (!t.bg || !t.fg)) {
		ctx.addIssue({ code: "custom", path: ["colors", t.bg ? "fg" : "bg"], message: "Set both the background and text colour, or neither." });
	}
	if (t.bg && t.fg && contrastRatio(t.bg, t.fg) < MIN_CONTRAST) {
		ctx.addIssue({
			code: "custom",
			path: ["colors", "fg"],
			message: `Text and background need a contrast ratio of at least ${MIN_CONTRAST}:1 (WCAG AA).`,
		});
	}
	if (t.bg && contrastRatio(t.bg, t.accent) < 3) {
		ctx.addIssue({
			code: "custom",
			path: ["colors", "accent"],
			message: "The accent colour needs a contrast ratio of at least 3:1 against the background so links and focus rings stay visible.",
		});
	}
	s.sections.forEach((sec, i) => {
		if (sec.type === "extension" && !sec.extension_id)
			ctx.addIssue({ code: "custom", path: ["sections", i, "extension_id"], message: "Choose an extension." });
	});
});

export const defaultTheme = (): ThemeSettings => themeSettingsInput.parse({});

/** CSS custom properties for the storefront. Built only from validated values. */
export function themeCss(s: ThemeSettings): string {
	const t = effectiveTheme(s);
	const vars = [
		`--cd-accent:${t.accent}`,
		`--cd-accent-fg:${t.accent_fg}`,
		`--cd-font:${FONT_STACKS[t.font]}`,
		`--cd-radius:${RADII[t.radius]}`,
	];
	// "html:root" outranks the base stylesheet's ":root", so the order of the stylesheets does not matter.
	let css = `html:root{${vars.join(";")}}`;
	if (t.bg && t.fg)
		css += `html:root{color-scheme:light;--cd-bg:${t.bg};--cd-fg:${t.fg};--cd-muted:color-mix(in srgb,${t.fg} 62%,${t.bg});--cd-line:color-mix(in srgb,${t.fg} 16%,${t.bg})}`;
	return css;
}
