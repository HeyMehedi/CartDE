// @ts-nocheck
// Browser-only code (type checking is off for src/cartde/client; see product-editor.ts).
import { $, api, showError } from "./api";

const msg = $("#msg");
const tbody = $("#cat-table tbody");
const run = (fn) => async () => {
	msg.hidden = true;
	try {
		await fn();
	} catch (err) {
		showError(msg, err);
	}
};

function render(categories) {
	tbody.replaceChildren(
		...categories.map((c) => {
			const tr = document.createElement("tr");
			tr.innerHTML = `<td><input class="n" type="text"></td><td><input class="s" type="text"></td><td><input class="o" type="text" size="3"></td><td><button type="button" class="sv">Save</button> <button type="button" class="rm">Delete</button></td>`;
			$("input.n", tr).value = c.name;
			$("input.s", tr).value = c.slug;
			$("input.o", tr).value = String(c.sort_order);
			$("button.sv", tr).onclick = run(async () => {
				await api("PATCH", `/categories/${c.id}`, {
					name: $("input.n", tr).value.trim(),
					slug: $("input.s", tr).value.trim(),
					sort_order: Number($("input.o", tr).value) || 0,
					description: c.description,
				});
				await reload();
			});
			$("button.rm", tr).onclick = run(async () => {
				if (confirm(`Delete category "${c.name}"? Products keep existing but lose this category.`)) {
					await api("DELETE", `/categories/${c.id}`);
					await reload();
				}
			});
			return tr;
		}),
	);
}
const reload = async () => render(await api("GET", "/categories"));

render(JSON.parse($("#cat-data").textContent));
$("#cat-form").addEventListener("submit", (e) => {
	e.preventDefault();
	run(async () => {
		await api("POST", "/categories", { name: $("#cn").value.trim() });
		$("#cn").value = "";
		await reload();
	})();
});
