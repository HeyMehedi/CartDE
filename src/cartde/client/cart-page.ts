// @ts-nocheck
// Browser-only code. Cart page (FR-CART-2, FR-CART-3): shows server-priced lines, flags problems.
import { getCart, money, removeFromCart, setQuantity, toQuery } from "./cart";
import { t } from "./i18n";

const msg = document.getElementById("cart-msg");
const wrap = document.getElementById("cart-wrap");
const body = document.getElementById("cart-body");

async function render() {
	const lines = getCart();
	if (lines.length === 0) { wrap.hidden = true; msg.hidden = false; msg.textContent = ""; msg.append(t("cart.empty")); const a = document.createElement("a"); a.href = "/products"; a.textContent = t("cart.browse"); msg.append(a); return; }
	let data;
	try {
		const res = await fetch(`/api/cartde/cart/validate?lines=${encodeURIComponent(toQuery(lines))}`);
		const json = await res.json();
		if (!json.ok) throw new Error(json.error?.message);
		data = json.data;
	} catch { msg.hidden = false; msg.textContent = t("cart.load_error"); return; }
	const fmt = (n) => money(n, data.currency, data.locale);
	msg.hidden = true; wrap.hidden = false;
	body.replaceChildren(...data.lines.map((l) => {
		const tr = document.createElement("tr");
		const name = document.createElement("td");
		const link = document.createElement(l.product_slug ? "a" : "span");
		if (l.product_slug) link.href = `/products/${l.product_slug}`;
		link.textContent = l.product_name; name.append(link);
		if (l.variant_title && l.variant_title !== "Default") { const v = document.createElement("div"); v.className = "cd-muted"; v.textContent = l.variant_title; name.append(v); }
		if (l.problem) { const p = document.createElement("div"); p.className = "cd-error"; p.setAttribute("role", "alert"); p.textContent = l.problem; name.append(p); }
		const price = document.createElement("td"); price.textContent = l.available || l.stock_qty ? fmt(l.unit_price_minor) : "";
		const qty = document.createElement("td");
		const input = document.createElement("input"); input.type = "number"; input.min = "1"; input.max = String(Math.min(20, Math.max(l.stock_qty, 1))); input.value = String(l.quantity); input.style.width = "4.5rem";
		input.setAttribute("aria-label", t("cart.quantity_for", { name: l.product_name }));
		input.onchange = () => { const q = Math.floor(Number(input.value)); if (q >= 1) setQuantity(l.variant_id, q); else removeFromCart(l.variant_id); render(); };
		qty.append(input);
		const total = document.createElement("td"); total.textContent = l.available ? fmt(l.line_total_minor) : "—";
		const rm = document.createElement("td"); const b = document.createElement("button"); b.type = "button"; b.className = "cd-btn secondary"; b.textContent = t("cart.remove"); b.onclick = () => { removeFromCart(l.variant_id); render(); }; rm.append(b);
		tr.append(name, price, qty, total, rm);
		return tr;
	}));
	document.getElementById("subtotal").textContent = fmt(data.subtotal_minor);
	document.getElementById("blocked").hidden = data.purchasable;
	const checkout = document.getElementById("checkout-link");
	checkout.setAttribute("aria-disabled", String(!data.purchasable));
	checkout.onclick = (e) => { if (!data.purchasable) e.preventDefault(); };
	checkout.style.opacity = data.purchasable ? "" : ".5";
}
render();
window.addEventListener("storage", render);
