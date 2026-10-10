/** Money is always integer minor units (poisha for BDT). No floats in money paths. */

export function isMinorUnits(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Parse a merchant-typed major-unit amount ("1,250.50") into minor units. Returns null if invalid. */
export function parseMajorToMinor(input: string): number | null {
	const cleaned = input.trim().replace(/,/g, "");
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
	if (!match) return null;
	const major = Number(match[1]);
	const minor = Number((match[2] ?? "").padEnd(2, "0") || "0");
	const total = major * 100 + minor;
	return Number.isSafeInteger(total) ? total : null;
}

/** Format minor units for display, e.g. 125000 -> "৳1,250.00" (en-BD, BDT). */
export function formatMoney(minor: number, currency = "BDT", locale = "en-BD"): string {
	return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}
