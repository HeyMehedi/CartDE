// @ts-nocheck
// Browser-only code. Checkout (FR-ORD-1, FR-ORD-4): idempotency key per page load, server re-prices everything.
import { clearCart, getCart, money, toQuery } from "./cart";
import { t } from "./i18n";

const KEY_STORE = "cartde.checkout.key";
const form = document.getElementById("checkout-form");
const errBox = document.getElementById("form-error");
let data = null;

function idempotencyKey() {
	try {
		let k = sessionStorage.getItem(KEY_STORE);
		if (!k) {
			k = crypto.randomUUID();
			sessionStorage.setItem(KEY_STORE, k);
		}
		return k;
	} catch {
		return crypto.randomUUID();
	}
}
const key = idempotencyKey();
const fmt = (n) => money(n, data.currency, data.locale);

async function loadSummary() {
	const lines = getCart();
	if (lines.length === 0) {
		document.getElementById("checkout").hidden = true;
		document.getElementById("empty").hidden = false;
		return;
	}
	const district = form.district.value;
	const res = await fetch(
		`/api/cartde/cart/validate?lines=${encodeURIComponent(toQuery(lines))}${district ? `&district=${encodeURIComponent(district)}` : ""}`,
	);
	const json = await res.json();
	if (!json.ok) {
		errBox.hidden = false;
		errBox.textContent = json.error?.message ?? t("checkout.review_cart");
		return;
	}
	data = json.data;
	document.getElementById("summary").replaceChildren(
		...data.lines.map((l) => {
			const tr = document.createElement("tr");
			const a = document.createElement("td");
			a.textContent = `${l.quantity} × ${l.product_name}${l.variant_title && l.variant_title !== "Default" ? ` (${l.variant_title})` : ""}`;
			if (l.problem) {
				const p = document.createElement("div");
				p.className = "cd-error";
				p.textContent = l.problem;
				a.append(p);
			}
			const b = document.createElement("td");
			b.textContent = l.available ? fmt(l.line_total_minor) : "—";
			tr.append(a, b);
			return tr;
		}),
	);
	document.getElementById("sub").textContent = fmt(data.subtotal_minor);
	document.getElementById("del").textContent = data.delivery_minor === null ? t("checkout.choose_district") : fmt(data.delivery_minor);
	const discountRow = document.getElementById("disc-row");
	if (discountRow) {
		discountRow.hidden = !data.discount_minor;
		document.getElementById("disc").textContent = "−" + fmt(data.discount_minor || 0);
	}
	document.getElementById("tot").textContent = data.total_minor === null ? fmt(data.subtotal_minor) : fmt(data.total_minor);
	document.getElementById("place").disabled = !data.purchasable;
	if (!data.purchasable) {
		errBox.hidden = false;
		errBox.textContent = t("checkout.review_cart");
	}
}

function showFieldErrors(fields = {}) {
	document.querySelectorAll("[data-err]").forEach((el) => (el.textContent = fields[el.dataset.err] ?? ""));
}

form.district.addEventListener("change", loadSummary);
form.addEventListener("submit", async (e) => {
	e.preventDefault();
	errBox.hidden = true;
	showFieldErrors();
	const btn = document.getElementById("place");
	btn.disabled = true;
	const v = (n) => form[n].value.trim();
	try {
		const res = await fetch("/api/cartde/checkout", {
			method: "POST",
			headers: { "content-type": "application/json", "x-cartde-request": "1" },
			body: JSON.stringify({
				idempotency_key: key,
				name: v("name"),
				phone: v("phone"),
				email: v("email") || null,
				district: v("district"),
				area: v("area"),
				address: v("address"),
				note: v("note") || null,
				lines: getCart().map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
			}),
		});
		const json = await res.json().catch(() => null);
		if (!json?.ok) {
			showFieldErrors(json?.error?.fields);
			errBox.hidden = false;
			errBox.textContent = json?.error?.message ?? t("checkout.failed");
			if (res.status === 409) await loadSummary();
			btn.disabled = false;
			return;
		}
		try {
			sessionStorage.removeItem(KEY_STORE);
		} catch {
			/* storage blocked: nothing to clear */
		}
		clearCart();
		location.href = `/orders/${json.data.order_number}?t=${encodeURIComponent(json.data.access_token)}`;
	} catch {
		errBox.hidden = false;
		errBox.textContent = t("checkout.network_error");
		btn.disabled = false;
	}
});
loadSummary();
