import { db, ok, route } from "../../../../../../cartde/app/http";
import { getOrder } from "../../../../../../cartde/db/orders";

export const GET = route(async ({ params }) => ok(await getOrder(db(), params.id!)));
