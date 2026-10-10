// @ts-nocheck
// Browser-only code. Variant selector and add-to-cart for the product page (FR-SF-3).
import { addToCart, money } from "./cart";
import { t } from "./i18n";

const data = JSON.parse(document.getElementById("product-data").textContent);
const priceEl = document.getElementById("price");
const stockEl = document.getElementById("stock");
const addBtn = document.getElementById("add");
const msg = document.getElementById("add-msg");
const box = document.getElementById("options");
const fmt = (n) => money(n, data.currency, data.locale);
const selected = data.options.map(() => null);
let current = data.variants.find((v) => v.stock > 0) ?? data.variants[0];
if (current) current.values.forEach((v, i) => (selected[i] = v));

function match() {
	return data.variants.find((v) => v.values.length === selected.length && v.values.every((x, i) => x.toLowerCase() === (selected[i] ?? "").toLowerCase()));
}

function render() {
	const v = current;
	if (!v) { stockEl.textContent = t("product.unavailable_combo"); addBtn.disabled = true; return; }
	priceEl.textContent = fmt(v.price);
	if (v.compare && v.compare > v.price) { const s = document.createElement("s"); s.className = "cd-muted"; s.textContent = " " + fmt(v.compare); priceEl.append(s); }
	stockEl.textContent = v.stock < 1 ? t("product.out_of_stock") : v.stock <= data.lowStock ? t("product.only_left", { n: v.stock }) : t("product.in_stock");
	addBtn.disabled = v.stock < 1;
}

if (data.options.length) {
	box.hidden = false;
	data.options.forEach((o, i) => {
		const wrap = document.createElement("div"); wrap.className = "cd-field";
		const label = document.createElement("label"); label.textContent = o.name; label.htmlFor = `opt-${i}`;
		const sel = document.createElement("select"); sel.id = `opt-${i}`;
		for (const val of o.values) { const opt = document.createElement("option"); opt.value = val; opt.textContent = val; opt.selected = val === selected[i]; sel.append(opt); }
		sel.onchange = () => { selected[i] = sel.value; current = match(); msg.textContent = ""; render(); };
		wrap.append(label, sel); box.append(wrap);
	});
}
render();

addBtn.onclick = () => {
	if (!current || current.stock < 1) return;
	addToCart(current.id, 1);
	msg.textContent = t("product.added");
	const a = document.createElement("a"); a.href = "/cart"; a.textContent = t("product.view_cart"); msg.append(a);
};
