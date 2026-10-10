import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/d1";
import { getTheme, saveTheme } from "../../src/cartde/db/theme";
import { setSettingJson } from "../../src/cartde/db/settings";

let db: D1Database;
beforeEach(() => {
	db = createTestDb();
});

describe("theme persistence", () => {
	it("returns defaults when nothing is stored", async () => {
		expect((await getTheme(db)).preset).toBe("default");
	});
	it("round-trips a validated theme", async () => {
		await saveTheme(db, { preset: "warm", colors: { accent: "#7c2d12" }, footer: { text: "© Shop", links: [{ label: "About", url: "/about" }] } });
		const t = await getTheme(db);
		expect(t).toMatchObject({ preset: "warm", colors: { accent: "#7c2d12" }, footer: { text: "© Shop" } });
	});
	it("refuses invalid themes and keeps the previous one", async () => {
		await saveTheme(db, { preset: "warm" });
		await expect(saveTheme(db, { colors: { accent: "red" } })).rejects.toThrow();
		await expect(saveTheme(db, { colors: { accent: "#cccccc", accent_fg: "#ffffff" } })).rejects.toThrow();
		expect((await getTheme(db)).preset).toBe("warm");
	});
	it("falls back to defaults if stored data no longer validates", async () => {
		await setSettingJson(db, "theme", { preset: "gone", colors: { accent: "javascript:1" } });
		expect((await getTheme(db)).preset).toBe("default");
		await db.prepare(`UPDATE cartde_settings SET value_json = 'not json'`).run();
		expect((await getTheme(db)).preset).toBe("default");
	});
});
