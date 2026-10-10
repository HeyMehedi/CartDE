import type { z } from "zod";
import type { setupInput } from "../domain/schemas";
import { productInput } from "../domain/schemas";
import { createCategory } from "./categories";
import { createProduct } from "./products";
import { getStore, updateStore, type StoreRow } from "./store";
import { CartdeError, nowIso } from "./util";

/** FR-DEP-5: true once the owner finished CartDE's setup step. A missing schema counts as "not ready". */
export async function storeIsReady(db: D1Database): Promise<{ ready: boolean; reason?: "migrations" | "setup" }> {
	try {
		const store = await getStore(db);
		return store.setup_completed_at ? { ready: true } : { ready: false, reason: "setup" };
	} catch {
		return { ready: false, reason: "migrations" };
	}
}

async function catalogueIsEmpty(db: D1Database): Promise<boolean> {
	const row = await db
		.prepare(`SELECT (SELECT COUNT(*) FROM cartde_products) AS p, (SELECT COUNT(*) FROM cartde_categories) AS c`)
		.first<{ p: number; c: number }>();
	return !row || (row.p === 0 && row.c === 0);
}

const DEMO = [
	{
		name: "Handloom Cotton Tee",
		price: 89000,
		sizes: ["S", "M", "L"],
		description: "A soft **handloom cotton** t-shirt.\n\n- Breathable\n- Machine washable",
	},
	{ name: "Ceramic Mug", price: 45000, sizes: [] as string[], description: "A 350 ml ceramic mug." },
];

/** FR-DEP-7: demo data is opt-in and only applied to an empty catalogue. Products are created as drafts. */
export async function seedDemoCatalogue(db: D1Database): Promise<number> {
	if (!(await catalogueIsEmpty(db))) throw new CartdeError("conflict", "Demo products can only be added to an empty catalogue.");
	const category = await createCategory(db, { name: "Demo", sort_order: 0 });
	for (const d of DEMO) {
		await createProduct(
			db,
			productInput.parse({
				name: d.name,
				description_md: d.description,
				status: "draft",
				category_ids: [category.id],
				options: d.sizes.length ? [{ name: "Size", values: d.sizes }] : [],
				variants: d.sizes.length
					? d.sizes.map((s) => ({ option_values: [s], price_minor: d.price, stock_qty: 10 }))
					: [{ price_minor: d.price, stock_qty: 10 }],
			}),
		);
	}
	return DEMO.length;
}

/** FR-DEP-6: idempotent. Saves settings, opens the store, and stamps `setup_completed_at` only the first time. */
export async function completeSetup(db: D1Database, input: z.infer<typeof setupInput>): Promise<{ store: StoreRow; demoProducts: number }> {
	const { with_demo_products, ...settings } = input;
	let demoProducts = 0;
	if (with_demo_products) demoProducts = await seedDemoCatalogue(db);
	await updateStore(db, settings);
	await db
		.prepare(
			`UPDATE cartde_store SET status = CASE WHEN status = 'setup' THEN 'active' ELSE status END, setup_completed_at = COALESCE(setup_completed_at, ?1), updated_at = ?1 WHERE id = 1`,
		)
		.bind(nowIso())
		.run();
	return { store: await getStore(db), demoProducts };
}
