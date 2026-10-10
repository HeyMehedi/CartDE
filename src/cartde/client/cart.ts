// @ts-nocheck
// Browser-only code (type checking is off for src/cartde/client; see product-editor.ts).
// Cart lives in localStorage with a cookie fallback (FR-CART-1). Shape: [{ variantId, quantity }].
const KEY = "cartde.cart.v1";
const COOKIE = "cartde_cart";
const MAX_QTY = 20;

function read() {
	let raw = null;
	try { raw = localStorage.getItem(KEY); } catch { /* storage blocked: fall back to the cookie */ }
	if (raw === null) {
		const m = document.cookie.split("; ").find((c) => c.startsWith(COOKIE + "="));
		if (m) raw = decodeURIComponent(m.slice(COOKIE.length + 1));
	}
	try {
		const parsed = JSON.parse(raw ?? "[]");
		return Array.isArray(parsed) ? parsed.filter((l) => typeof l?.variantId === "string" && Number.isInteger(l.quantity) && l.quantity > 0) : [];
	} catch { return []; }
}

function write(lines) {
	const json = JSON.stringify(lines);
	try { localStorage.setItem(KEY, json); document.cookie = `${COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`; }
	catch { document.cookie = `${COOKIE}=${encodeURIComponent(json)}; Max-Age=2592000; Path=/; SameSite=Lax`; }
	window.dispatchEvent(new CustomEvent("cartde:cart"));
}

export const getCart = read;
export const cartCount = () => read().reduce((n, l) => n + l.quantity, 0);
export function addToCart(variantId, quantity = 1) {
	const lines = read();
	const line = lines.find((l) => l.variantId === variantId);
	if (line) line.quantity = Math.min(MAX_QTY, line.quantity + quantity); else lines.push({ variantId, quantity: Math.min(MAX_QTY, quantity) });
	write(lines);
}
export function setQuantity(variantId, quantity) {
	write(read().map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l)).filter((l) => l.quantity > 0));
}
export const removeFromCart = (variantId) => write(read().filter((l) => l.variantId !== variantId));
export const clearCart = () => write([]);

export const toQuery = (lines) => lines.map((l) => `${l.variantId}:${l.quantity}`).join(",");
export const money = (minor, currency, locale) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
