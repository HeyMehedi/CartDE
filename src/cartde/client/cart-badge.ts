// @ts-nocheck
// Browser-only code. Keeps the header cart count current.
import { cartCount } from "./cart";

const el = document.getElementById("cart-count");
const update = () => { if (el) { const n = cartCount(); el.textContent = n ? `(${n})` : ""; } };
update();
window.addEventListener("cartde:cart", update);
window.addEventListener("storage", update);
