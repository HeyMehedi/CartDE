import { RESERVED_SLUGS } from "../domain/slug";

/**
 * SRS 3.2: an EmDash page whose slug equals a CartDE route would be shadowed (or would shadow the store), so
 * publishing it is refused. Pages are served at /<slug>; other collections live under their own prefix.
 */
export function pageSlugDecision(collection: string, slug: unknown): { cancel: true; reason: string } | undefined {
	if (collection !== "pages" || typeof slug !== "string") return undefined;
	const first = slug.toLowerCase().split("/")[0] ?? "";
	if (RESERVED_SLUGS.has(first) || first === "404" || first.startsWith("sitemap")) {
		return { cancel: true, reason: `The address "/${slug}" is used by the store. Choose a different slug for this page.` };
	}
	return undefined;
}
