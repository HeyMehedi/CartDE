// @ts-nocheck
// Browser-only code (type checking is off for src/cartde/client; see product-editor.ts).
import { $, api, showError } from "./api";
import { parseMajorToMinor } from "../domain/money";

const msg = $("#msg");
const v = (id) => $(`#${id}`).value.trim();

$("#settings-form").addEventListener("submit", async (e) => {
	e.preventDefault();
	msg.hidden = true;
	try {
		const inside = parseMajorToMinor(v("inside"));
		const outside = parseMajorToMinor(v("outside"));
		if (inside === null || outside === null) throw new Error("Enter valid delivery charges, for example 60 or 120.50.");
		await api("PATCH", "/settings", {
			name: v("name"),
			currency: v("currency").toUpperCase(),
			locale: v("locale"),
			timezone: v("timezone"),
			contact_phone: v("contact_phone") || null,
			contact_email: v("contact_email") || null,
			address_text: v("address_text") || null,
			delivery_inside_dhaka_minor: inside,
			delivery_outside_dhaka_minor: outside,
			low_stock_threshold: Number(v("low")),
			status: v("status"),
		});
		msg.className = "ok";
		msg.textContent = "Saved.";
		msg.hidden = false;
	} catch (err) {
		showError(msg, err);
		msg.className = "error";
	}
});
