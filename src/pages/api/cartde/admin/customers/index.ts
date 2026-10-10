import { db, ok, route } from "../../../../../cartde/app/http";
import { listCustomers } from "../../../../../cartde/db/orders";

export const GET = route(async ({ url }) => ok(await listCustomers(db(), { q: url.searchParams.get("q") ?? undefined })));
