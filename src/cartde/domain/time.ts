/** UTC offset in minutes of `timeZone` at the instant `at`. */
function offsetMinutes(timeZone: string, at: Date): number {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
	const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
	const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
	return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant at which the current calendar day began in `timeZone` (handles DST by re-checking the offset). */
export function startOfDayUtc(timeZone: string, now: Date = new Date()): Date {
	const local = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); // YYYY-MM-DD
	const [y, m, d] = local.split("-").map(Number) as [number, number, number];
	const guess = Date.UTC(y, m - 1, d);
	let instant = guess - offsetMinutes(timeZone, new Date(guess)) * 60000;
	instant = guess - offsetMinutes(timeZone, new Date(instant)) * 60000;
	return new Date(instant);
}
