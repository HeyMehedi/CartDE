/**
 * Tiny, safe Markdown subset for product descriptions: paragraphs, **bold**, *italic*, `-` lists, and http(s) links.
 * All input is HTML-escaped first, so no raw HTML or script can pass through.
 */
const escapeHtml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function inline(escaped: string): string {
	return escaped
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="nofollow noopener">$1</a>')
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

export function renderMarkdown(source: string): string {
	return escapeHtml(source.replace(/\r\n?/g, "\n"))
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean)
		.map((block) => {
			const lines = block.split("\n");
			if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
				return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
			}
			return `<p>${lines.map(inline).join("<br>")}</p>`;
		})
		.join("\n");
}
