import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { productSitemap } from "../cartde/db/sitemap";

export async function GET({ url }: APIContext): Promise<Response> {
	return new Response(await productSitemap(env.DB, url.origin), {
		headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" },
	});
}
