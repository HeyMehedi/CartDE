/**
 * Normalise a Bangladesh mobile number to the national 11-digit form "01XXXXXXXXX".
 * Accepts "01…", "8801…", "+8801…", with spaces or hyphens, and Bengali digits. Returns null if invalid.
 */
export function normalizeBdPhone(input: string): string | null {
	const ascii = input.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
	let digits = ascii.replace(/[\s-]/g, "");
	if (digits.startsWith("+880")) digits = "0" + digits.slice(4);
	else if (digits.startsWith("880") && digits.length === 13) digits = "0" + digits.slice(3);
	return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}
