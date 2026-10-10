// @ts-nocheck
// Browser-only code (type checking is off for src/cartde/client; see product-editor.ts).
import { $, api, showError } from "./api";

const msg = $("#msg");
const report = $("#report");
let csv = "";

function render(r) {
	const table = document.createElement("table");
	table.innerHTML = "<thead><tr><th>Slug</th><th>Name</th><th>Variants</th><th>Result</th></tr></thead>";
	const tbody = document.createElement("tbody");
	for (const p of r.products) {
		const tr = document.createElement("tr");
		for (const v of [
			p.slug,
			p.name,
			String(p.variants),
			p.errors.length ? p.errors.join(" ") : p.status === "created" ? "Created" : "Ready",
		]) {
			const td = document.createElement("td");
			td.textContent = v;
			tr.append(td);
		}
		if (p.errors.length) tr.style.color = "#b00020";
		tbody.append(tr);
	}
	table.append(tbody);
	const summary = document.createElement("p");
	summary.textContent = r.dry_run
		? `${r.products.length - r.failed} product(s) ready, ${r.failed} with problems. Nothing has been saved yet.`
		: `${r.created} product(s) created, ${r.failed} skipped.`;
	report.replaceChildren(summary, table);
	$("#run").disabled = !r.dry_run || r.failed > 0 || r.products.length === 0;
}

async function send(dry_run) {
	msg.hidden = true;
	try {
		if (!csv) {
			const f = $("#file").files[0];
			if (!f) throw new Error("Choose a CSV file first.");
			csv = await f.text();
		}
		render(await api("POST", "/import/products", { csv, dry_run }));
	} catch (err) {
		showError(msg, err);
	}
}
$("#file").onchange = () => {
	csv = "";
	$("#run").disabled = true;
	report.replaceChildren();
};
$("#check").onclick = () => send(true);
$("#run").onclick = () => {
	if (confirm("Create these products now?")) send(false);
};
