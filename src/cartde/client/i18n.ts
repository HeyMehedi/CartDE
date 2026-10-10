// @ts-nocheck
// Browser-only code. Reads the message subset the page embedded in <script id="i18n">.
const el = document.getElementById("i18n");
const messages = el ? JSON.parse(el.textContent || "{}") : {};
export const t = (key, vars = {}) => (messages[key] ?? key).replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
