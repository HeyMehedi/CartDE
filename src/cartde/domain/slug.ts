export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Reserved first path segments owned by CartDE or EmDash; a slug may not shadow them. */
export const RESERVED_SLUGS = new Set([
	"admin", "api", "cart", "checkout", "orders", "products", "category", "tag", "posts",
	"setup", "search", "_emdash", "_astro",
]);

export function slugify(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80)
		.replace(/-+$/g, "");
}

/** Return `base`, or `base-2`, `base-3`… the first one not in `taken`. Falls back to "item". */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
	const root = slugify(base) || "item";
	if (!taken.has(root)) return root;
	for (let n = 2; ; n++) {
		const candidate = `${root}-${n}`;
		if (!taken.has(candidate)) return candidate;
	}
}
