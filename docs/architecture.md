# Architecture

Status: foundation, the milestone 0.2 catalogue, and the milestone 0.3 cash-on-delivery order journey. The full specification is in [SRS.md](SRS.md), section 3.

## Current structure

CartDE is one Astro application with the EmDash integration.

| Path | Contents |
| --- | --- |
| `astro.config.mjs` | Astro with the Cloudflare adapter, React, and the EmDash integration bound to D1 (`DB`) and R2 (`MEDIA`) |
| `src/worker.ts` | Worker entry point: EmDash handler plus the scheduled handler for scheduled publishing |
| `src/pages/` | Storefront pages (currently the foundation homepage, posts and pages) |
| `src/layouts/Base.astro` | Shared layout using EmDash head and body hooks |
| `src/utils/site-identity.ts` | Resolves site title, tagline and logo from EmDash site settings |
| `seed/seed.json` | Content model and starter content applied by the EmDash setup wizard |
| `migrations/` | Numbered D1 migrations for `cartde_*` tables, applied by Wrangler (`0001_init.sql`) |
| `src/cartde/domain/` | Pure logic with no I/O: money, slugs, variants, inventory, Markdown, zod schemas |
| `src/cartde/db/` | D1 repositories (store, categories, products, media lookup) |
| `src/cartde/app/` | Application layer: access guard (`guard.ts`), API helpers (`http.ts`), page-facing reads (`catalogue.ts`) |
| `src/cartde/client/` | Browser scripts for the admin pages (not type-checked; see development.md) |
| `src/middleware.ts` | Applies the guard to `/admin/*` and `/api/cartde/admin/*` after EmDash's auth middleware |
| `src/pages/admin/`, `src/pages/api/cartde/admin/` | Commerce dashboard pages and JSON API (administrators only) |
| `src/pages/products/`, `cart.astro`, `checkout.astro`, `orders/` | Storefront (theme tokens in `src/themes/default/theme.css`) |
| `src/pages/api/cartde/` | Public checkout and cart validation; admin API under `admin/` |
| `wrangler.jsonc` | Worker name, D1 database, R2 bucket, cron trigger |

## Route ownership

- `/_emdash/*`: EmDash admin, authentication, media, REST and MCP endpoints.
- All other routes: CartDE and EmDash content pages.

CartDE owns `/admin/*`, `/api/cartde/admin/*` and `/products/*` (implemented in 0.2). Access to the first two requires an EmDash session with the Admin role, and API writes also need a same-origin request carrying the `X-CartDE-Request: 1` header. Remaining planned routes are listed in [SRS.md](SRS.md), section 3.2.

## Reuse versus build

EmDash supplies the admin shell, authentication, media library, content pages, site settings and MCP server. CartDE will build products, inventory, cart, checkout and orders in its own `cartde_*` D1 tables. EmDash plugin storage is document and key-value only, so commerce data does not go there.

## Checkout atomicity

`placeOrder` (`src/cartde/db/orders.ts`) sends one D1 batch: customer upsert, then per line a conditional `UPDATE … WHERE stock_qty >= qty AND status = 'active'` followed by a guard statement. The guard inserts a NULL into a NOT NULL column when the previous statement changed no rows, which makes D1 roll the whole batch back. The order number comes from the counter row incremented in the same batch. A unique idempotency key makes retries return the original order. `transitionOrder` uses the same guard to make status changes conditional on the status the admin saw.
