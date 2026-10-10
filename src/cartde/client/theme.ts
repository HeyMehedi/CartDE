// @ts-nocheck
// Browser-only code (type checking is off for src/cartde/client; see product-editor.ts).
import { $, api, showError } from "./api";

const { theme, extensions, sectionTypes } = JSON.parse($("#theme-data").textContent);
const msg = $("#msg");
const sections = theme.sections.map((s) => ({ ...s }));
const links = theme.footer.links.map((l) => ({ ...l }));

$("#font").value = theme.font ?? "";
$("#radius").value = theme.radius ?? "";
for (const k of ["accent", "accent_fg", "bg", "fg"]) $(`#c-${k}`).value = theme.colors[k] ?? "";
$("#footer-text").value = theme.footer.text;
$("#seo-suffix").value = theme.seo.title_suffix;
$("#seo-desc").value = theme.seo.default_description;

const el = (tag, props = {}, ...kids) => {
	const e = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		// Hyphenated names (aria-*, data-*) are attributes, not DOM properties.
		if (k.includes("-")) e.setAttribute(k, String(v));
		else e[k] = v;
	}
	e.append(...kids);
	return e;
};
const btn = (label, fn) => el("button", { type: "button", textContent: label, onclick: fn });

function renderSections() {
	$("#sections").replaceChildren(
		...sections.map((s, i) => {
			const row = el("div", { className: "row", style: "margin:.5rem 0;border-bottom:1px solid var(--line);padding-bottom:.5rem" });
			const type = el("select", { "aria-label": "Section type" });
			for (const t of sectionTypes) type.append(el("option", { value: t, textContent: t.replace("_", " "), selected: t === s.type }));
			type.onchange = () => {
				s.type = type.value;
				renderSections();
			};
			const enabled = el("input", { type: "checkbox", checked: s.enabled, "aria-label": "Enabled" });
			enabled.onchange = () => (s.enabled = enabled.checked);
			const title = el("input", { type: "text", value: s.title ?? "", placeholder: "Title", maxLength: 80, "aria-label": "Title" });
			title.oninput = () => (s.title = title.value || undefined);
			row.append(el("label", { style: "font-weight:400" }, enabled, " on"), type, title);
			if (s.type === "text" || s.type === "hero") {
				const body = el("input", { type: "text", value: s.body ?? "", placeholder: "Text", maxLength: 500, "aria-label": "Text" });
				body.oninput = () => (s.body = body.value || undefined);
				row.append(body);
			}
			if (s.type === "latest_products" || s.type === "recent_posts") {
				const count = el("input", { type: "text", value: s.count ?? "", placeholder: "How many", size: 4, "aria-label": "Count" });
				count.oninput = () => (s.count = Number(count.value) || undefined);
				row.append(count);
			}
			if (s.type === "extension") {
				const sel = el("select", { "aria-label": "Extension" }, el("option", { value: "", textContent: "Choose…" }));
				for (const x of extensions.filter((x) => x.section))
					sel.append(el("option", { value: x.id, textContent: x.name, selected: x.id === s.extension_id }));
				sel.onchange = () => (s.extension_id = sel.value || undefined);
				row.append(sel);
			}
			row.append(
				btn("↑", () => {
					if (i > 0) {
						[sections[i - 1], sections[i]] = [sections[i], sections[i - 1]];
						renderSections();
					}
				}),
				btn("↓", () => {
					if (i < sections.length - 1) {
						[sections[i + 1], sections[i]] = [sections[i], sections[i + 1]];
						renderSections();
					}
				}),
				btn("Remove", () => {
					sections.splice(i, 1);
					renderSections();
				}),
			);
			return row;
		}),
	);
}
function renderLinks() {
	$("#footer-links").replaceChildren(
		...links.map((l, i) => {
			const label = el("input", { type: "text", value: l.label, placeholder: "Label", maxLength: 40, "aria-label": "Link label" });
			const url = el("input", { type: "text", value: l.url, placeholder: "/about or https://…", maxLength: 300, "aria-label": "Link URL" });
			label.oninput = () => (l.label = label.value);
			url.oninput = () => (l.url = url.value);
			return el(
				"div",
				{ className: "row", style: "margin:.4rem 0" },
				label,
				url,
				btn("Remove", () => {
					links.splice(i, 1);
					renderLinks();
				}),
			);
		}),
	);
}
$("#section-add").onclick = () => {
	if (sections.length < 12) {
		sections.push({ type: "text", enabled: true });
		renderSections();
	}
};
$("#link-add").onclick = () => {
	if (links.length < 8) {
		links.push({ label: "", url: "" });
		renderLinks();
	}
};
renderSections();
renderLinks();

$("#theme-form").addEventListener("submit", async (e) => {
	e.preventDefault();
	msg.hidden = true;
	const colors = {};
	for (const k of ["accent", "accent_fg", "bg", "fg"]) {
		const v = $(`#c-${k}`).value.trim();
		if (v) colors[k] = v;
	}
	const payload = {
		preset: $("#preset").value,
		colors,
		...($("#font").value ? { font: $("#font").value } : {}),
		...($("#radius").value ? { radius: $("#radius").value } : {}),
		sections: sections.map((s) => ({ ...s, title: s.title || undefined })),
		footer: { text: $("#footer-text").value.trim(), links: links.filter((l) => l.label.trim() || l.url.trim()) },
		seo: { title_suffix: $("#seo-suffix").value.trim(), default_description: $("#seo-desc").value.trim() },
	};
	try {
		await api("PATCH", "/theme", payload);
		msg.className = "ok";
		msg.textContent = "Saved. The storefront updates within a few seconds.";
		msg.hidden = false;
	} catch (err) {
		showError(msg, err);
		msg.className = "error";
	}
});
