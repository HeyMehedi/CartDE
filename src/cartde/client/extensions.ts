// @ts-nocheck
// Browser-only code (type checking is off for src/cartde/client; see product-editor.ts).
import { $, $$, api, showError } from "./api";

const form = $("#ext-form");
if (form) {
	const msg = $("#msg");
	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		msg.hidden = true;
		try {
			await api("PATCH", "/extensions", { enabled: $$("input[name=ext]:checked", form).map((i) => i.value) });
			msg.className = "ok";
			msg.textContent = "Saved.";
			msg.hidden = false;
		} catch (err) {
			showError(msg, err);
			msg.className = "error";
		}
	});
}
