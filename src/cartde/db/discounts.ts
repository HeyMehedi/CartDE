import type { z } from "zod";
import type { discountDraftInput } from "../domain/schemas";
import { CartdeError, isUniqueViolation, newId, nowIso } from "./util";

export interface DiscountRow { id: string; code: string; kind: "percent" | "fixed"; value: number; min_subtotal_minor: number; starts_at: string | null; ends_at: string | null; status: "draft" | "active" | "archived"; note: string | null }

/** Always created as a draft. Activating and applying discounts at checkout is not implemented yet. */
export async function createDiscountDraft(db: D1Database, input: z.infer<typeof discountDraftInput>): Promise<DiscountRow> {
	const id = newId();
	const now = nowIso();
	try {
		await db
			.prepare(`INSERT INTO cartde_discounts (id, code, kind, value, min_subtotal_minor, starts_at, ends_at, status, note, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'draft',?8,?9,?9)`)
			.bind(id, input.code, input.kind, input.value, input.min_subtotal_minor, input.starts_at ?? null, input.ends_at ?? null, input.note ?? null, now)
			.run();
	} catch (err) {
		if (isUniqueViolation(err)) throw new CartdeError("conflict", "A discount with this code already exists.", { code: "Already in use." });
		throw err;
	}
	return { id, code: input.code, kind: input.kind, value: input.value, min_subtotal_minor: input.min_subtotal_minor, starts_at: input.starts_at ?? null, ends_at: input.ends_at ?? null, status: "draft", note: input.note ?? null };
}

export async function listDiscounts(db: D1Database): Promise<DiscountRow[]> {
	const { results } = await db.prepare(`SELECT id, code, kind, value, min_subtotal_minor, starts_at, ends_at, status, note FROM cartde_discounts ORDER BY created_at DESC`).all<DiscountRow>();
	return results;
}
