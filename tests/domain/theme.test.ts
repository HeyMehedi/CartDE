import { describe, expect, it } from "vitest";
import { contrastRatio, defaultTheme, effectiveTheme, PRESETS, PRESET_IDS, themeCss, themeSettingsInput } from "../../src/cartde/domain/theme";

describe("contrast", () => {
	it("matches known WCAG values", () => {
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
		expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
		expect(contrastRatio("#777777", "#ffffff")).toBeGreaterThan(4.4); // ~4.48
		expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.6);
	});
});

describe("presets", () => {
	it("every preset passes its own validation", () => {
		for (const preset of PRESET_IDS) expect(themeSettingsInput.safeParse({ preset }).success, preset).toBe(true);
	});
	it("preset tokens meet AA contrast", () => {
		for (const p of Object.values(PRESETS)) {
			expect(contrastRatio(p.accent, p.accent_fg)).toBeGreaterThanOrEqual(4.5);
			if (p.bg && p.fg) expect(contrastRatio(p.bg, p.fg)).toBeGreaterThanOrEqual(4.5);
		}
	});
});

describe("theme settings", () => {
	it("defaults are valid and complete", () => {
		const t = defaultTheme();
		expect(t.preset).toBe("default");
		expect(t.sections.map((s) => s.type)).toEqual(["hero", "latest_products", "recent_posts"]);
	});
	it("rejects non-hex colours and CSS injection attempts", () => {
		for (const bad of ["red", "#fff", "#12345g", "#0b6b4f; background:url(x)", "url(javascript:1)", "#0b6b4f}"]) {
			expect(themeSettingsInput.safeParse({ colors: { accent: bad } }).success, bad).toBe(false);
		}
	});
	it("rejects low-contrast button, text and accent colours", () => {
		expect(themeSettingsInput.safeParse({ colors: { accent: "#cccccc", accent_fg: "#ffffff" } }).success).toBe(false);
		expect(themeSettingsInput.safeParse({ colors: { bg: "#ffffff", fg: "#aaaaaa" } }).success).toBe(false);
		expect(themeSettingsInput.safeParse({ colors: { bg: "#ffffff", fg: "#111111", accent: "#eeeeee", accent_fg: "#000000" } }).success).toBe(false);
	});
	it("requires background and text together", () => {
		expect(themeSettingsInput.safeParse({ colors: { bg: "#ffffff" } }).success).toBe(false); // default preset has no text colour to pair with
		expect(themeSettingsInput.safeParse({ colors: { fg: "#111111" } }).success).toBe(false);
		expect(themeSettingsInput.safeParse({ colors: { bg: "#ffffff", fg: "#111111" } }).success).toBe(true);
		expect(themeSettingsInput.safeParse({ preset: "warm", colors: { bg: "#ffffff" } }).success).toBe(true); // warm already defines a text colour
	});
	it("validates footer links and sections", () => {
		const ok = { footer: { text: "© Shop", links: [{ label: "About", url: "/about" }, { label: "Facebook", url: "https://facebook.com/shop" }] } };
		expect(themeSettingsInput.safeParse(ok).success).toBe(true);
		for (const url of ["javascript:alert(1)", "//evil.test", "/\\evil", "ftp://x", "data:text/html,x", ""]) {
			expect(themeSettingsInput.safeParse({ footer: { links: [{ label: "x", url }] } }).success, url).toBe(false);
		}
		expect(themeSettingsInput.safeParse({ sections: [{ type: "extension" }] }).success).toBe(false);
		expect(themeSettingsInput.safeParse({ sections: [{ type: "extension", extension_id: "free-delivery" }] }).success).toBe(true);
		expect(themeSettingsInput.safeParse({ sections: [{ type: "nope" }] }).success).toBe(false);
		expect(themeSettingsInput.safeParse({ sections: Array.from({ length: 13 }, () => ({ type: "hero" })) }).success).toBe(false);
	});
});

describe("themeCss", () => {
	it("emits only validated tokens", () => {
		const css = themeCss(themeSettingsInput.parse({ preset: "warm", colors: { accent: "#7c2d12" }, radius: "sharp" }));
		expect(css).toContain("--cd-accent:#7c2d12");
		expect(css).toContain("--cd-radius:0");
		expect(css).toContain("--cd-bg:#fbf6ee");
		expect(css).toContain("color-scheme:light");
		expect(css).not.toMatch(/[<>]/);
	});
	it("the default preset leaves page colours to the visitor's light/dark preference", () => {
		const css = themeCss(defaultTheme());
		expect(css).not.toContain("--cd-bg");
		expect(effectiveTheme(defaultTheme()).bg).toBeUndefined();
	});
});
