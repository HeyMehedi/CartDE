// @ts-nocheck
// Browser-only code. The project's generated workerd globals (worker-configuration.d.ts) conflict with the
// DOM lib, so this file is excluded from type checking; it is covered by manual and (from 0.3) Playwright tests.
import { $, $$, api, labelInputs, showError } from "./api";
import { parseMajorToMinor } from "../domain/money";
import { variantCombinations } from "../domain/variants";

interface Media {
	media_id: string;
	alt: string;
	url: string | null;
}
interface Variant {
	id: string;
	title: string;
	sku: string | null;
	price_minor: number;
	compare_at_minor: number | null;
	stock_qty: number;
	status: string;
	option_values: string[];
}

const root = $("#editor");
const { mode, product, currency } = JSON.parse($("#editor-data").textContent!);
const msg = $("#msg");
const say = (text: string, cls = "ok") => {
	msg.className = cls;
	msg.textContent = text;
	msg.hidden = false;
};
const major = (minor: number | null) => (minor === null ? "" : (minor / 100).toFixed(2));
const val = (id: string) => ($(`#${id}`) as HTMLInputElement).value.trim();

// ---- media ----
const media: Media[] = (product?.media ?? []).map((m: Media) => ({ media_id: m.media_id, alt: m.alt, url: m.url }));
function renderMedia() {
	const ul = $("#media-list");
	ul.replaceChildren(
		...media.map((m, i) => {
			const li = document.createElement("li");
			li.style.cssText = "display:flex;gap:.5rem;align-items:center;margin:.3rem 0";
			if (m.url) {
				const img = document.createElement("img");
				img.src = m.url;
				img.alt = "";
				img.width = 48;
				img.height = 48;
				img.style.objectFit = "cover";
				li.append(img);
			}
			const alt = document.createElement("input");
			alt.type = "text";
			alt.setAttribute("aria-label", "Image alt text");
			alt.placeholder = "Alt text";
			alt.value = m.alt;
			alt.maxLength = 300;
			alt.oninput = () => (m.alt = alt.value);
			const mk = (label: string, fn: () => void) => {
				const b = document.createElement("button");
				b.type = "button";
				b.textContent = label;
				b.onclick = fn;
				return b;
			};
			li.append(
				alt,
				mk("↑", () => {
					if (i > 0) {
						[media[i - 1], media[i]] = [media[i]!, media[i - 1]!];
						renderMedia();
					}
				}),
				mk("↓", () => {
					if (i < media.length - 1) {
						[media[i + 1], media[i]] = [media[i]!, media[i + 1]!];
						renderMedia();
					}
				}),
				mk("Remove", () => {
					media.splice(i, 1);
					renderMedia();
				}),
			);
			return li;
		}),
	);
}
renderMedia();
$("#media-choose").onclick = async () => {
	const dialog = $("#media-dialog"),
		grid = $("#media-grid");
	dialog.hidden = false;
	grid.textContent = "Loading…";
	try {
		const res = await fetch("/_emdash/api/media?limit=60");
		const json = await res.json();
		const items: any[] = json?.data?.items ?? json?.items ?? [];
		const images = items.filter((it) => String(it.mimeType ?? it.mime_type ?? "").startsWith("image/"));
		if (!res.ok || images.length === 0) {
			grid.textContent = res.ok ? "No images in the media library yet." : "Could not load the media library.";
			return;
		}
		grid.replaceChildren(
			...images.map((it) => {
				const url = it.url ?? `/_emdash/api/media/file/${it.storageKey ?? it.storage_key}`;
				const b = document.createElement("button");
				b.type = "button";
				b.title = it.filename ?? "";
				const img = document.createElement("img");
				img.src = url;
				img.alt = it.alt ?? "";
				img.width = 80;
				img.height = 80;
				img.style.objectFit = "cover";
				b.append(img);
				b.onclick = () => {
					if (!media.some((m) => m.media_id === it.id)) media.push({ media_id: it.id, alt: it.alt ?? "", url });
					renderMedia();
				};
				return b;
			}),
		);
	} catch {
		grid.textContent = "Could not load the media library.";
	}
};

const common = () => ({
	name: val("name"),
	description_md: ($("#description_md") as HTMLTextAreaElement).value,
	status: val("status"),
	seo_title: val("seo_title") || null,
	seo_description: val("seo_description") || null,
	category_ids: $$<HTMLInputElement>("input[name=category]:checked").map((c) => c.value),
	media: media.map((m) => ({ media_id: m.media_id, alt: m.alt })),
});

// ---- create mode: options + variants ----
function optionRows() {
	return $$(".option-row", root)
		.map((r) => ({
			name: ($("input.on", r) as HTMLInputElement).value.trim(),
			values: ($("input.ov", r) as HTMLInputElement).value
				.split(",")
				.map((v) => v.trim())
				.filter(Boolean),
		}))
		.filter((o) => o.name || o.values.length);
}
function buildVariants() {
	const tbody = $("#variants-table tbody");
	const old = new Map($$("tr", tbody).map((tr) => [tr.dataset.key!, tr]));
	const combos = variantCombinations(optionRows());
	tbody.replaceChildren(
		...combos.map((values) => {
			const key = values.join("\u0000");
			const prev = old.get(key);
			if (prev) return prev;
			const tr = document.createElement("tr");
			tr.dataset.key = key;
			tr.dataset.values = JSON.stringify(values);
			tr.innerHTML = `<td></td><td><input class="p" inputmode="decimal"></td><td><input class="c" inputmode="decimal"></td><td><input class="s"></td><td><input class="q" inputmode="numeric" value="0"></td><td><input class="a" type="checkbox" checked></td>`;
			labelInputs(tr, values.length ? values.join(" / ") : "Default", {
				p: "Price",
				c: "Compare-at price",
				s: "SKU",
				q: "Stock",
				a: "Active",
			});
			tr.firstElementChild!.textContent = values.length ? values.join(" / ") : "Default";
			return tr;
		}),
	);
}
if (mode === "create") {
	const addOption = () => {
		if ($$(".option-row", root).length >= 3) return;
		const d = document.createElement("div");
		d.className = "row option-row";
		d.innerHTML = `<div><label>Option name</label><input class="on" type="text" placeholder="Size" maxlength="60"></div><div><label>Values (comma separated)</label><input class="ov" type="text" placeholder="S, M, L"></div>`;
		labelInputs(d, "", { on: "Option name", ov: "Option values, comma separated" });
		$("#options").append(d);
	};
	$("#option-add").onclick = addOption;
	$("#variants-build").onclick = buildVariants;
	buildVariants();
}

function collectVariants() {
	return $$("#variants-table tbody tr").map((tr) => {
		const price = parseMajorToMinor(($("input.p", tr) as HTMLInputElement).value);
		const cmp = ($("input.c", tr) as HTMLInputElement).value.trim();
		const stock = Number(($("input.q", tr) as HTMLInputElement).value);
		if (price === null) throw new Error(`Enter a valid price for "${tr.firstElementChild!.textContent}" (for example 1250 or 1250.50).`);
		const compare = cmp ? parseMajorToMinor(cmp) : null;
		if (cmp && compare === null) throw new Error("Enter a valid compare-at price.");
		if (!Number.isInteger(stock) || stock < 0) throw new Error("Stock must be a whole number, zero or more.");
		return {
			option_values: JSON.parse(tr.dataset.values!),
			price_minor: price,
			compare_at_minor: compare,
			sku: ($("input.s", tr) as HTMLInputElement).value.trim() || null,
			stock_qty: stock,
			status: ($("input.a", tr) as HTMLInputElement).checked ? "active" : "inactive",
		};
	});
}

$("#product-form").addEventListener("submit", async (e) => {
	e.preventDefault();
	msg.hidden = true;
	const save = $("#save") as HTMLButtonElement;
	save.disabled = true;
	try {
		if (mode === "create") {
			const slug = val("slug");
			const created = await api<{ id: string }>("POST", "/products", {
				...common(),
				...(slug ? { slug } : {}),
				options: optionRows(),
				variants: collectVariants(),
			});
			location.href = `/admin/products/${created.id}`;
		} else {
			await api("PATCH", `/products/${product.id}`, { ...common(), slug: val("slug") });
			say("Saved.");
		}
	} catch (err) {
		showError(msg, err);
		msg.className = "error";
	} finally {
		save.disabled = false;
	}
});

// ---- edit mode: variants and stock ----
if (mode === "edit") {
	const tbody = $("#variants-edit tbody");
	const reload = async () => {
		const fresh = await api<{ variants: Variant[] }>("GET", `/products/${product.id}`);
		renderVariants(fresh.variants);
	};
	const wrap = (fn: () => Promise<unknown>) => async () => {
		msg.hidden = true;
		try {
			await fn();
		} catch (err) {
			showError(msg, err);
			msg.className = "error";
		}
	};
	function renderVariants(variants: Variant[]) {
		tbody.replaceChildren(
			...variants.map((v) => {
				const tr = document.createElement("tr");
				tr.innerHTML = `<td></td><td><input class="p" value="${major(v.price_minor)}"></td><td><input class="c" value="${major(v.compare_at_minor)}"></td><td><input class="s"></td><td><input class="a" type="checkbox"></td><td><strong class="q"></strong> <input class="d" placeholder="± qty" size="5"> <input class="n" placeholder="note" size="10"> <button type="button" class="adj">Adjust</button></td><td><button type="button" class="sv">Save</button> <button type="button" class="rm">Delete</button></td>`;
				labelInputs(tr, v.title, { p: "Price", c: "Compare-at price", s: "SKU", a: "Active", d: "Stock change", n: "Stock change note" });
				tr.children[0]!.textContent = v.title;
				($("input.s", tr) as HTMLInputElement).value = v.sku ?? "";
				($("input.a", tr) as HTMLInputElement).checked = v.status === "active";
				$("strong.q", tr).textContent = String(v.stock_qty);
				$("button.sv", tr).onclick = wrap(async () => {
					const price = parseMajorToMinor(($("input.p", tr) as HTMLInputElement).value);
					const cmp = ($("input.c", tr) as HTMLInputElement).value.trim();
					if (price === null) throw new Error("Enter a valid price.");
					const compare = cmp ? parseMajorToMinor(cmp) : null;
					if (cmp && compare === null) throw new Error("Enter a valid compare-at price.");
					await api("PATCH", `/variants/${v.id}`, {
						price_minor: price,
						compare_at_minor: compare,
						sku: ($("input.s", tr) as HTMLInputElement).value.trim() || null,
						status: ($("input.a", tr) as HTMLInputElement).checked ? "active" : "inactive",
					});
					say("Variant saved.");
					await reload();
				});
				$("button.adj", tr).onclick = wrap(async () => {
					const delta = Number(($("input.d", tr) as HTMLInputElement).value);
					if (!Number.isInteger(delta) || delta === 0) throw new Error("Enter a non-zero whole number, for example 10 or -2.");
					const note = ($("input.n", tr) as HTMLInputElement).value.trim();
					await api("POST", `/variants/${v.id}/stock`, { delta, reason: "manual", note: note || null });
					say("Stock updated.");
					await reload();
				});
				$("button.rm", tr).onclick = wrap(async () => {
					if (confirm(`Delete variant "${v.title}"?`)) {
						await api("DELETE", `/variants/${v.id}`);
						await reload();
					}
				});
				return tr;
			}),
		);
	}
	renderVariants(product.variants);

	$("#nv-add").onclick = wrap(async () => {
		const price = parseMajorToMinor(val("nv-price"));
		if (price === null) throw new Error("Enter a valid price.");
		const stock = Number(val("nv-stock"));
		await api("POST", `/products/${product.id}/variants`, {
			option_values: $$<HTMLInputElement>("[data-option-value]").map((i) => i.value.trim()),
			price_minor: price,
			sku: val("nv-sku") || null,
			stock_qty: stock,
		});
		location.reload();
	});
	const del = document.getElementById("delete");
	if (del)
		del.onclick = wrap(async () => {
			if (confirm("Delete this draft product permanently?")) {
				await api("DELETE", `/products/${product.id}`);
				location.href = "/admin/products";
			}
		});
}
void currency;
