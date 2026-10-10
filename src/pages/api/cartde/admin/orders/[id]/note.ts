import { body, db, ok, route } from "../../../../../../cartde/app/http";
import { setMerchantNote } from "../../../../../../cartde/db/orders";
import { merchantNoteInput } from "../../../../../../cartde/domain/schemas";

export const PATCH = route(async (ctx) => {
	const { merchant_note } = merchantNoteInput.parse(await body(ctx));
	await setMerchantNote(db(), ctx.params.id!, merchant_note || null);
	return ok({ updated: true });
});
