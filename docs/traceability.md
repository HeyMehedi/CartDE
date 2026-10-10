# Requirements traceability

Status on 2026-10-10. Every requirement in [PRD.md](PRD.md) and [SRS.md](SRS.md) for releases 0.1 to 0.6, where it is implemented, how it is verified, and what is still open.

**Status key**

| Mark | Meaning |
| --- | --- |
| Done | Implemented and covered by an automated test (`pnpm test`) or a recorded HTTP check against the running site |
| Partial | Implemented, but part of the requirement is untested or missing (the note says which) |
| Needs a person | Implemented in code, but verification needs a logged-in administrator, a browser, a real device or a GitHub/Cloudflare account action |
| Deviation | Done differently from the text, for a recorded reason |
| Not done | Not implemented |

No admin screen has been used by a signed-in person yet. Their server logic is tested; the screens themselves are marked "Needs a person".

## SRS functional requirements

### Catalogue (FR-CAT)

| ID | Status | Where | Verified by |
| --- | --- | --- | --- |
| FR-CAT-1 product CRUD and validation | Done | `src/cartde/db/products.ts`, `domain/schemas.ts` | `tests/db/catalogue.test.ts`, `tests/domain/domain.test.ts` |
| FR-CAT-2 categories | Done | `db/categories.ts`, `/admin/categories` | `tests/db/catalogue.test.ts` |
| FR-CAT-3 options (3) and variants (100), unique SKU | Done | `db/products.ts`, `domain/variants.ts` | `tests/db/catalogue.test.ts`, `tests/domain/domain.test.ts` |
| FR-CAT-4 ordered media with alt, featured image | Partial | `db/products.ts`, `db/media.ts`, editor media picker | Repository tested. The picker reads EmDash's media list with a guessed response shape (needs a person) |
| FR-CAT-5 only active products with an active variant are public | Done | `getActiveProductBySlug`, `storefrontProducts` | `tests/db/catalogue.test.ts`, HTTP check (draft returns 404) |
| FR-CAT-6 manual stock adjustment with event | Done | `adjustStock` | `tests/db/catalogue.test.ts` (reconciliation) |
| FR-CAT-7 draft preview for admins only | Partial | `/products/[slug]` | Public 404 for drafts verified; admin preview needs a person |
| FR-CAT-8 products with orders cannot be deleted | Done | `deleteProduct` | `tests/db/export-and-locks.test.ts` |

### Storefront (FR-SF)

| ID | Status | Where | Verified by |
| --- | --- | --- | --- |
| FR-SF-1 homepage with name, logo, menu, products, footer | Done | `src/pages/index.astro`, `Base.astro`, theme sections | HTTP check |
| FR-SF-2 listing, 24 per page, category filter, newest first | Done | `/products`, `/category/[slug]` | `storefrontProducts`; HTTP check |
| FR-SF-3 images, options, variant price, compare-at, stock state incl. low | Done | `/products/[slug]` | HTTP check |
| FR-SF-4 title, description, canonical, Open Graph, Product JSON-LD | Partial | `Base.astro`, product page | HTTP check shows all tags. **Cache hints**: Astro's route cache is not enabled in this project, so none are set |
| FR-SF-5 no JavaScript needed except cart/checkout, which degrade to a form post | Done | `checkout.astro` (form post), product page "Order now" | HTTP check (form post, validation, idempotent retry, cross-site refusal); `tests/app/guard.test.ts` |
| FR-SF-6 branded 404 and error pages, no stack traces | Done | `404.astro`, `500.astro`, API error envelope | HTTP check for 404; `route()` never returns stacks |

### Cart (FR-CART)

| ID | Status | Where | Verified by |
| --- | --- | --- | --- |
| FR-CART-1 client-side cart with cookie fallback, server re-validation | Done | `client/cart.ts`, `/api/cartde/cart/validate` | HTTP check; cookie fallback needs a browser |
| FR-CART-2 cart page with prices, stock, quantity, removal, subtotal | Needs a person | `cart.astro`, `client/cart-page.ts` | Server pricing tested (`priceCart`); page not used in a browser |
| FR-CART-3 unavailable lines flagged and blocked | Done | `priceCart`, `placeOrder` | `tests/db/orders.test.ts` |

### Checkout and orders (FR-ORD)

| ID | Status | Where | Verified by |
| --- | --- | --- | --- |
| FR-ORD-1 input validation (name, BD phone, 64 districts, area, address, note) | Done | `checkoutInput`, `domain/phone.ts`, `geo/districts.ts` | `tests/domain/orders.test.ts` |
| FR-ORD-2 server re-prices; delivery by zone | Done | `placeOrder`, `quoteTotals` | `tests/db/orders.test.ts` |
| FR-ORD-3 single batch, conditional stock update, rollback | Done | `placeOrder` guard statement | `tests/db/orders.test.ts` (rollback, race) |
| FR-ORD-4 idempotency key | Done | `placeOrder` | tests + HTTP check |
| FR-ORD-5 order number from counter in the same batch | Done | `placeOrder` | tests |
| FR-ORD-6 confirmation needs number and token | Done | `getOrderForShopper` | tests + HTTP check |
| FR-ORD-7 customers matched by phone; snapshots | Done | `placeOrder` | tests |
| FR-ORD-8 order search, filter, 25 per page | Done | `listOrders`, `/admin/orders` | tests; screen needs a person |
| FR-ORD-9 transitions per section 6 with events | Done | `domain/orders.ts`, `transitionOrder` | every pair tested |
| FR-ORD-10 only merchant note editable | Done | `setMerchantNote`; no other update path | tests |
| FR-ORD-11 printable summary | Needs a person | order page print styles | not printed |

### Admin and authentication (FR-ADM)

| ID | Status | Where | Verified by |
| --- | --- | --- | --- |
| FR-ADM-1 Admin role required on all admin pages and APIs | Done | `src/middleware.ts`, `app/guard.ts` | `tests/app/guard.test.ts`, `route-sweep.test.ts`, HTTP checks on production |
| FR-ADM-2 CSRF: same origin + custom header | Done | `guard.ts` | tests, HTTP checks |
| FR-ADM-3 navigation incl. storefront and EmDash admin links | Done | `AdminLayout.astro`; CartDE page in EmDash's sidebar (`plugin/admin-page.ts`) | `tests/mcp/admin-page.test.ts`; sidebar rendering needs a person |
| FR-ADM-4 overview counts | Done | `overview()` | tests |
| FR-ADM-5 settings; currency locked after first order | Done | `updateStore` | `tests/db/export-and-locks.test.ts` |
| FR-ADM-6 customers with order count and history | Done | `listCustomers`, `getCustomerOrders` | tests |
| FR-ADM-7 audit log of admin mutations | Done | `route()` wrapper, `executeTool` | `tests/app/audit-coverage.test.ts`, `tests/mcp/tools.test.ts` |

### Setup and deployment (FR-DEP)

| ID | Status | Where | Verified by |
| --- | --- | --- | --- |
| FR-DEP-1 install/dev/build/typecheck/deploy from lockfile | Done | `package.json` | run locally; deploy run 2026-10-10 |
| FR-DEP-2 bindings and names in `wrangler.jsonc` | Done | `wrangler.jsonc` | deploy provisioned them |
| FR-DEP-3 deploy applies migrations first | Done | `deploy` script | production deploy applied 0001 to 0004 |
| FR-DEP-4 `.env.example` | Done | `.env.example` | file review |
| FR-DEP-5 store-not-ready page; admin routed to setup | Done | `middleware.ts`, `app/ready.ts` | `tests/db/setup.test.ts`; HTTP checks on production |
| FR-DEP-6 setup admin-only, idempotent, stamps once | Done | `/setup`, `completeSetup` | tests; the form needs a person |
| FR-DEP-7 no reset/reseed without admin; demo data opt-in on empty catalogue | Done | `seedDemoCatalogue`; no reset endpoint exists | tests |
| FR-DEP-8 docs: secrets, backup, restore, redeploy, recovery | Partial | `docs/deployment.md` | Written. `wrangler d1 export` turned out not to work (FTS5); Time Travel documented instead. Restore not rehearsed |

### AI and MCP (FR-AI)

| ID | Status | Where | Verified by |
| --- | --- | --- | --- |
| FR-AI-1 typed operations shared by HTTP and MCP | Done | `mcp/tools.ts` calls the same repositories | tests |
| FR-AI-2 read-only tools | Done | `search_products`, `list_orders`, `get_order_details`, `get_sales_summary` | `tests/mcp/tools.test.ts`; live MCP client needs a person |
| FR-AI-3 draft and mutation tools with audit and confirmation flag | Done | five tools, `destructive` on `update_order_status` | tests |
| FR-AI-4 no store or identity arguments | Done | strict schemas | tests |
| FR-AI-5 no model API key needed | Done | | tests |

### Other SRS items

| Item | Status | Note |
| --- | --- | --- |
| 3.2 content page slug equal to a store route is rejected | Done | `content:beforePublish` hook refuses publishing such pages (`plugin/slug-policy.ts`, tested). Saving a draft with that slug is still allowed because EmDash does not expose the slug to save hooks |
| 4.1 `store_id` on every table | Deviation | Present on entity tables; omitted on pure link tables (`product_categories`, `variant_option_values`) and `counters`, which inherit the store from their parents |
| 4.4 a test applies all migrations to an empty database | Done | `tests/helpers/d1.ts` runs every migration for each test; also applied to local and remote D1 |
| 7.1 CSV export endpoints | Done | `/api/cartde/admin/export/{products,orders,customers}.csv`, formula-injection safe, tested |
| 9 integration tests with `@cloudflare/vitest-pool-workers` | Deviation | `node:sqlite` stand-in instead; migrations also applied to real D1 |
| 9 Playwright end-to-end | Not done | No browser automation installed; HTTP-level journeys run instead |

## SRS non-functional requirements

| ID | Status | Note |
| --- | --- | --- |
| NFR-1 Security | Done | Server-side auth, zod on all input, CSRF, sanitised errors, `pnpm audit` in CI, checkout rate limits (60 per minute per IP, 5 per minute per phone; Cloudflare's limiter is per location and approximate). Tested in `tests/app/ratelimit.test.ts` and locally (6th attempt returns 429) |
| NFR-2 Money | Done | Integer minor units, `Intl` at the edge |
| NFR-3 Concurrency | Partial | Logic tested with the stand-in; not with parallel requests against real D1 |
| NFR-4 Idempotency | Done | Checkout, setup and migrations |
| NFR-5 Performance | Not done | Not measured |
| NFR-6 Accessibility | Partial | Labels, focus styles, skip link, contrast validation for themes; no audit with assistive technology |
| NFR-7 Mobile 360 px | Needs a person | Responsive CSS; not checked on a device |
| NFR-8 Localisation | Partial | `Intl` with store locale and time zone; storefront strings in English and Bengali message files. Admin strings are English only |
| NFR-9 Observability | Partial | No personal data in logs; order, inventory and audit events. Logs are plain strings, not structured JSON |
| NFR-10 Cost | Partial | Limits documented with a date; CPU time per request not measured, so no "free plan" claim |
| NFR-11 Portability | Partial | Domain layer has no I/O; repositories take the `D1Database` interface type directly rather than a CartDE-owned interface |
| NFR-12 Maintainability | Done | TypeScript strict, ESLint, Prettier, tests, CI (lint, format check, typecheck, tests, audit, build, dry-run deploy) |

## PRD requirements

Most PRD rows map onto the SRS rows above; only the differences are listed.

| ID | Status | Note |
| --- | --- | --- |
| PR-SF-4 category pages | Done | `/category/[slug]` shows the product category (falls back to the blog category of the same slug) |
| PR-SF-8 content pages in EmDash | Done | Reused from the starter |
| PR-SF-10 SEO incl. sitemap and robots | Done | Products and categories added to EmDash's sitemap index via `/sitemap-products.xml`; private paths added to `robots.txt` (HTTP checked) |
| PR-SF-11 empty and error states | Done | Empty catalogue, empty cart, out of stock, checkout errors, 404, 500 |
| PR-SF-12 search | Done | `/search`, tested |
| PR-SF-13 Bengali and English | Partial | Storefront complete; Bengali written by an AI and not yet reviewed by a native speaker |
| PR-CAT-9 low-stock list | Done | Overview list and count |
| PR-CAT-10 CSV import | Done | `/admin/import`, dry run first, tested |
| PR-CAT-11 discount codes (after 0.6) | Partial | Drafts can be created by the AI tool; not applied at checkout (as scheduled) |
| PR-ADM-1 sidebar navigation | Done | CartDE admin nav, plus a CartDE entry in EmDash's sidebar |
| PR-ADM-2 overview with recent orders and awaiting action | Done | Recent orders, pending count, product count |
| PR-ADM-5 settings incl. logo | Done | Logo comes from EmDash site settings (reused by design) |
| PR-ADM-6 sales by day, 7 and 30 days | Done | Overview table; `tests/db/overview.test.ts` |
| PR-ADM-8 staff roles (after 0.6) | Not done | As scheduled |
| PR-DEP-3 deploy button from a clean account | Needs a person | Repository not yet public; button untested |
| PR-DEP-5 setup wizard | Partial | EmDash wizard plus CartDE `/setup`; one-time setup token not built (window documented) |
| PR-DEP-8 CLI (after 0.6) | Not done | As scheduled |
| PR-THM-1 theme settings | Done | Name and logo from EmDash; colours, fonts, sections, footer, SEO in CartDE |
| PR-THM-2 theme never touches products or orders | Done | Theme is a separate setting; extensions get plain data only |
| PR-THM-3 more themes (after 0.6) | Partial | A second preset exists |
| PR-AI-1 to 4 | Done | See FR-AI |
| PRD §7 Data ownership: CSV or JSON export | Done | CSV |
| PRD §7 Reliability: backup and restore tested | Not done | Restore not rehearsed |

## Milestone acceptance criteria

| Milestone | Criterion | Status |
| --- | --- | --- |
| 0.1 | Builds reproducibly; admin login and media upload work locally and on Cloudflare | Needs a person (login and media upload) |
| 0.2 | Merchant creates and publishes a product; storefront reads it | Needs a person (admin screens) |
| 0.3 | Real COD order from a phone, managed to Delivered in the admin | Needs a person (order placed over HTTP; not from a phone, not managed in the admin UI) |
| 0.4 | New user deploys and initialises a store without editing source | Needs a person (public repo, clean account) |
| 0.5 | Authorised AI client queries the store without bypassing rules | Needs a person (live MCP client) |
| 0.6 | Themes and extensions evolve without changes to the commerce core | Done (sample extension and second preset, no core change; tested) |

## Open items, in priority order

1. Sign in, complete `/setup`, and walk through every admin screen and the storefront on a phone (closes most "Needs a person" rows).
2. Publish the GitHub repository; test the deploy button from a clean Cloudflare account.
3. Connect a real MCP client.
4. Rehearse a Time Travel restore; try EmDash's site export with commerce data.
5. Measure CPU time and storefront latency (NFR-5, NFR-10).
6. Native-speaker review of the Bengali strings.
7. Playwright journeys and a concurrency test against real D1.
