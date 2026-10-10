/** RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF or LF, embedded newlines. Strips a UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
	const src = text.replace(/^\uFEFF/, "");
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < src.length; i++) {
		const c = src[i]!;
		if (quoted) {
			if (c === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += c;
		} else if (c === '"' && field === "") quoted = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && src[i + 1] === "\n") i++;
			row.push(field);
			field = "";
			rows.push(row);
			row = [];
		} else field += c;
	}
	if (quoted) throw new Error("Unclosed quote in CSV.");
	if (field !== "" || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => !(r.length === 1 && r[0]!.trim() === ""));
}

/** Rows as objects keyed by the lower-cased, trimmed header. */
export function csvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
	const [head, ...body] = parseCsv(text);
	if (!head) return { headers: [], records: [] };
	const headers = head.map((h) => h.trim().toLowerCase());
	return { headers, records: body.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}
