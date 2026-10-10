// @ts-nocheck
// Browser-only code (type checking is off for src/cartde/client; see product-editor.ts).
import { $, $$, api, showError } from "./api";

const { id } = JSON.parse($("#order-data").textContent);
const msg = $("#msg");
const run = (fn) => async () => { msg.hidden = true; try { await fn(); } catch (err) { showError(msg, err); } };

$$("button[data-to]").forEach((b) => {
	b.onclick = run(async () => {
		const to = b.dataset.to;
		if (!confirm(`Mark this order ${to}?`)) return;
		const note = $("#note").value.trim();
		await api("POST", `/orders/${id}/transition`, { to, note: note || null, restock: $("#restock") ? $("#restock").checked : undefined, cash_returned: $("#cash") ? $("#cash").checked : undefined });
		location.reload();
	});
});
$("#save-note").onclick = run(async () => {
	await api("PATCH", `/orders/${id}/note`, { merchant_note: $("#merchant-note").value.trim() || null });
	msg.className = "ok"; msg.textContent = "Note saved."; msg.hidden = false;
});
