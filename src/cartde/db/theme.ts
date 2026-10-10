import { defaultTheme, themeSettingsInput, type ThemeSettings } from "../domain/theme";
import { getValidatedSetting, setSettingJson } from "./settings";

const KEY = "theme";

export const getTheme = (db: D1Database): Promise<ThemeSettings> => getValidatedSetting(db, KEY, themeSettingsInput, defaultTheme);

export async function saveTheme(db: D1Database, input: unknown): Promise<ThemeSettings> {
	const theme = themeSettingsInput.parse(input);
	await setSettingJson(db, KEY, theme);
	return theme;
}
