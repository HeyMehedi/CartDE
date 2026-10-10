import { z } from "zod";
import { actorId, body, db, ok, route } from "../../../../../cartde/app/http";
import { importProductsCsv } from "../../../../../cartde/db/import";

const input = z.object({ csv: z.string().min(1).max(2_000_000), dry_run: z.boolean().default(true) }).strict();

/** POST { csv, dry_run } — dry run by default so nothing is written until the merchant confirms. */
export const POST = route(async (ctx) => {
	const { csv, dry_run } = input.parse(await body(ctx));
	return ok(await importProductsCsv(db(), csv, { dryRun: dry_run, actorUserId: actorId(ctx) }));
});
