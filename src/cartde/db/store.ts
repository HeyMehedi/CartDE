import type { z } from "zod";
import type { storeSettingsInput } from "../domain/schemas";
import { CartdeError, nowIso } from "./util";

export interface StoreRow {
	id: number;
	name: string;
	slug: string;
	currency: string;
	locale: string;
	timezone: string;
	status: "setup" | "active" | "paused";
	contact_phone: string | null;
	contact_email: string | null;
	address_text: string | null;
	delivery_inside_dhaka_minor: number;
	delivery_outside_dhaka_minor: number;
	low_stock_threshold: number;
	setup_completed_at: string | null;
}

/** The single store row is created lazily so a fresh database needs no seed step. */
export async function getStore(db: D1Database): Promise<StoreRow> {
	const now = nowIso();
	await db
		.prepare(`INSERT OR IGNORE INTO cartde_store (id, name, slug, created_at, updated_at) VALUES (1, 'CartDE', 'cartde', ?1, ?1)`)
		.bind(now)
		.run();
	const row = await db.prepare(`SELECT * FROM cartde_store WHERE id = 1`).first<StoreRow>();
	if (!row) throw new CartdeError("not_found", "Store not found.");
	return row;
}

export async function updateStore(db: D1Database, input: z.infer<typeof storeSettingsInput>): Promise<StoreRow> {
	const current = await getStore(db);
	if (input.currency !== current.currency) {
		// FR-ADM-5: order amounts are stored in the store currency, so it is fixed once any order exists.
		const order = await db.prepare(`SELECT 1 AS x FROM cartde_orders LIMIT 1`).first();
		if (order) throw new CartdeError("conflict", "Currency cannot change once an order exists.", { currency: "Locked because orders exist." });
	}
	await db
		.prepare(
			`UPDATE cartde_store SET name=?1, currency=?2, locale=?3, timezone=?4, contact_phone=?5, contact_email=?6,
			 address_text=?7, delivery_inside_dhaka_minor=?8, delivery_outside_dhaka_minor=?9, low_stock_threshold=?10,
			 updated_at=?11, status = CASE WHEN ?12 IS NOT NULL AND status != 'setup' THEN ?12 ELSE status END WHERE id = 1`,
		)
		.bind(
			input.name, input.currency, input.locale, input.timezone, input.contact_phone ?? null,
			input.contact_email ?? null, input.address_text ?? null, input.delivery_inside_dhaka_minor,
			input.delivery_outside_dhaka_minor, input.low_stock_threshold, nowIso(), input.status ?? null,
		)
		.run();
	return getStore(db);
}
