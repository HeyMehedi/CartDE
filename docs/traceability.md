# Requirements traceability

Status on 2026-10-10 (end of day). Every requirement in [PRD.md](PRD.md) and [SRS.md](SRS.md) for releases 0.1 to 0.6, where it is implemented, how it is verified, and what is still open.

**How things are verified**

| Evidence | What it is |
| --- | --- |
| Unit | `pnpm test`: 221 Vitest tests over the domain, the real migrations on SQLite, access rules, tools and extensions |
| E2E | `pnpm test:e2e`: 17 Playwright tests in a real browser against `pnpm dev` (Cloudflare workerd runtime, local D1), signed in through EmDash's development-only bypass |
| A11y | axe-core WCAG 2.1 A/AA scan inside the E2E run, both theme presets and every admin page |
| Production | Requests and `wrangler tail` measurements against https://cartde.heymehedi.workers.dev |

**Status key**

| Mark | Meaning |
| --- | --- |
| Done | Implemented and verified by the evidence named |
| Partial | Implemented; the note says which part is not verified or not built |
| Not met | Measured and found not to meet the requirement |
| Needs a person | Cannot be done from the development machine (a GitHub action, a clean Cloudflare account, a physical phone, a native speaker) |
| Deviation | Done differently from the text, for a recorded reason |
| Not done | Not implemented |

## SRS functional requirements

### Catalogue (FR-CAT)

| ID | Status | Where | Evidence |
| --- | --- | --- | --- |
| FR-CAT-1 product CRUD and validation | Done | `db/products.ts`, `domain/schemas.ts`, `/admin/products` | Unit; E2E creates and publishes a product |
| FR-CAT-2 categories | Done | `db/categories.ts`, `/admin/categories` | Unit; E2E |
| FR-CAT-3 options and variants, unique SKU | Done | `db/products.ts`, `domain/variants.ts` | Unit; E2E builds two variants |
| FR-CAT-4 ordered media with alt, featured image | Done | media picker, `db/media.ts` | E2E uploads to the EmDash media library and picks the image |
| FR-CAT-5 only active products with an active variant are public | Done | storefront queries | Unit; E2E (draft returns 404 to shoppers) |
| FR-CAT-6 manual stock adjustment with event | Done | `adjustStock` | Unit (reconciliation); E2E |
| FR-CAT-7 draft preview for administrators only | Done | `/products/[slug]` | E2E (admin sees preview banner, shopper gets 404) |
| FR-CAT-8 products with orders cannot be deleted | Done | `deleteProduct` | Unit |

### Storefront (FR-SF)

| ID | Status | Where | Evidence |
| --- | --- | --- | --- |
| FR-SF-1 homepage | Done | `index.astro`, theme sections | E2E; production |
| FR-SF-2 listing, 24 per page, category filter, newest first | Done | `/products`, `/category/[slug]` | Unit; E2E |
| FR-SF-3 images, options, price, compare-at, stock incl. low | Done | `/products/[slug]` | E2E ("Only 2 left" after picking a variant) |
| FR-SF-4 title, description, canonical, Open Graph, Product JSON-LD | Partial | `Base.astro`, product page | Tags verified over HTTP. Cache hints not set: Astro's route cache is not enabled in this project |
| FR-SF-5 works without JavaScript; checkout degrades to a form post | Done | `checkout.astro`, product page "Order now" | E2E with JavaScript disabled places an order |
| FR-SF-6 branded 404 and error pages, no stack traces | Done | `404.astro`, `500.astro`, API envelope | E2E and A11y scan the 404 |

### Cart (FR-CART)

| ID | Status | Where | Evidence |
| --- | --- | --- | --- |
| FR-CART-1 client-side cart, cookie fallback, server re-validation | Partial | `client/cart.ts` | E2E covers the localStorage cart and server re-pricing. The cookie fallback (storage blocked) is not exercised |
| FR-CART-2 cart page | Done | `cart.astro` | E2E changes quantity at 360 px |
| FR-CART-3 unavailable lines flagged and blocked | Done | `priceCart`, `placeOrder` | Unit |

### Checkout and orders (FR-ORD)

| ID | Status | Where | Evidence |
| --- | --- | --- | --- |
| FR-ORD-1 input validation | Done | `checkoutInput` | Unit; E2E (`+880 1712-345678` accepted and normalised) |
| FR-ORD-2 server re-prices; delivery by zone | Done | `placeOrder`, `quoteTotals` | Unit; E2E (outside-Dhaka total) |
| FR-ORD-3 single batch, conditional stock, rollback | Done | `placeOrder` | Unit; E2E race on local D1 |
| FR-ORD-4 idempotency key | Done | `placeOrder` | Unit; HTTP; no-JS form retry |
| FR-ORD-5 order number in the same batch | Done | `placeOrder` | Unit; E2E (#1001) |
| FR-ORD-6 confirmation needs number and token | Done | `getOrderForShopper` | Unit; HTTP |
| FR-ORD-7 customers by phone; snapshots | Done | `placeOrder` | Unit |
| FR-ORD-8 search, filter, 25 per page | Done | `/admin/orders` | Unit; E2E opens the order from the Pending filter |
| FR-ORD-9 transitions with events | Done | `domain/orders.ts` | Unit (every pair); E2E to Delivered and a cancellation |
| FR-ORD-10 only the merchant note is editable | Done | `setMerchantNote` | Unit; E2E |
| FR-ORD-11 printable summary | Partial | order page print styles | Print stylesheet present; not printed |

### Admin and authentication (FR-ADM)

| ID | Status | Where | Evidence |
| --- | --- | --- | --- |
| FR-ADM-1 Admin role on all admin pages and APIs | Done | `middleware.ts`, `guard.ts` | Unit (route sweep); production 302/401 checks |
| FR-ADM-2 CSRF | Done | `guard.ts` | Unit; production (cross-site form post refused) |
| FR-ADM-3 navigation incl. links to storefront and EmDash | Done | `AdminLayout.astro`; CartDE page in EmDash's sidebar | E2E renders the sidebar page |
| FR-ADM-4 overview counts | Done | `overview()` | Unit; E2E |
| FR-ADM-5 settings; currency locked after the first order | Done | `updateStore` | Unit; E2E edits settings |
| FR-ADM-6 customers | Done | `/admin/customers` | Unit; A11y scan |
| FR-ADM-7 audit log | Done | `route()`, `executeTool` | Unit (coverage test); E2E sees AI actions in the log |

### Setup and deployment (FR-DEP)

| ID | Status | Where | Evidence |
| --- | --- | --- | --- |
| FR-DEP-1 commands from the lockfile | Done | `package.json` | Run locally; CI config |
| FR-DEP-2 bindings in `wrangler.jsonc` | Done | `wrangler.jsonc` | Production deploys |
| FR-DEP-3 deploy applies migrations first | Done | `deploy` script | Production |
| FR-DEP-4 `.env.example` | Done | `.env.example` (with the correct key format) | Review |
| FR-DEP-5 not-ready page; admin routed to setup | Done | `middleware.ts` | Unit; production before setup |
| FR-DEP-6 setup admin-only, idempotent, stamps once | Done | `/setup` | Unit; E2E; the owner completed it on production |
| FR-DEP-7 no reset/reseed; opt-in demo data | Done | `seedDemoCatalogue` | Unit |
| FR-DEP-8 docs: secrets, backup, restore, redeploy, recovery | Done | `docs/deployment.md` | Commerce export restored into a fresh database with matching counts; Time Travel restore rehearsed |

### AI and MCP (FR-AI)

| ID | Status | Where | Evidence |
| --- | --- | --- | --- |
| FR-AI-1 typed operations shared with HTTP | Done | `mcp/tools.ts` | Unit |
| FR-AI-2 read-only tools by scope and role | Done | plugin routes | E2E: a real MCP client with a personal access token lists and calls the tools; a token without `mcp:tools` gets `INSUFFICIENT_SCOPE` |
| FR-AI-3 draft and mutation tools, audit, confirmation flag | Done | five tools | E2E: draft created, invalid transition returns `isError`, `destructiveHint` set |
| FR-AI-4 no store or identity arguments | Done | strict schemas | E2E: `store_id` refused |
| FR-AI-5 no model API key | Done | | Unit |

The OAuth consent flow of a third-party AI client (Claude, ChatGPT) was not run; it is EmDash's code and uses the same scopes as the token used in the test.

### Other SRS items

| Item | Status | Note |
| --- | --- | --- |
| 3.2 page slug equal to a store route rejected | Done | `content:beforePublish` hook; unit tested. Saving a draft with such a slug is still possible |
| 4.1 `store_id` on every table | Deviation | Omitted on pure link tables and `counters` |
| 4.4 migrations tested on an empty database | Done | Every unit test run; local and remote D1 |
| 7.1 CSV exports | Done | Unit; E2E downloads the orders CSV |
| 9 integration tests with `@cloudflare/vitest-pool-workers` | Deviation | `node:sqlite` stand-in for unit tests; the E2E suite runs on the real workerd/D1 runtime instead |
| 9 Playwright end-to-end | Done | `e2e/`, also in CI |

## SRS non-functional requirements

| ID | Status | Note |
| --- | --- | --- |
| NFR-1 Security | Done | Server-side auth, zod everywhere, CSRF, sanitised errors, rate limits, `pnpm audit`, dev bypass refused in production |
| NFR-2 Money | Done | Integer minor units |
| NFR-3 Concurrency | Done | 8 parallel checkouts for the last unit on local D1 (workerd): exactly one order. Not repeated against remote D1 |
| NFR-4 Idempotency | Done | Checkout (both paths), setup, migrations |
| NFR-5 Performance (200 ms server time p95) | Not met at p95 | After parallelising the home page: home 174 ms median / 463 ms p95, products 126 / 368 ms. Medians meet the target; p95 does not (cold starts). See deployment.md |
| NFR-6 Accessibility | Done (automated) | No serious or critical axe findings on storefront (both presets) and admin. No screen-reader session with a person |
| NFR-7 Mobile 360 px | Done (emulated) | E2E checks every storefront and admin page for sideways scrolling at 360 px. Not tried on a physical phone |
| NFR-8 Localisation | Partial | Storefront English and Bengali; admin English only |
| NFR-9 Observability | Partial | No personal data in logs; plain-text rather than structured logs |
| NFR-10 Cost (Workers free plan) | Not met | Measured CPU median 10 to 16 ms per page against the free plan's 10 ms. Recommend Workers Paid; see deployment.md |
| NFR-11 Portability | Partial | Domain has no I/O; repositories use the `D1Database` type directly |
| NFR-12 Maintainability | Done | Strict TypeScript, ESLint, Prettier, tests, CI |

## PRD requirements (differences from the SRS rows above)

| ID | Status | Note |
| --- | --- | --- |
| PR-SF-4 category pages | Done | E2E/A11y |
| PR-SF-10 SEO incl. sitemap and robots | Done | Production |
| PR-SF-12 search | Done | E2E |
| PR-SF-13 Bengali and English | Partial / Needs a person | E2E shows the Bengali storefront. The translation was written by an AI and needs a native speaker's review |
| PR-CAT-9 low-stock list | Done | |
| PR-CAT-10 CSV import | Done | E2E imports a product |
| PR-CAT-11 discounts (after 0.6) | Partial | Drafts only, as scheduled |
| PR-ADM-1, 2, 6 | Done | |
| PR-ADM-8 staff roles (after 0.6) | Not done | As scheduled |
| PR-DEP-3 deploy button from a clean account | Needs a person | The repository must be public first |
| PR-DEP-5 setup wizard | Done | EmDash wizard plus `/setup`; a setup token was evaluated and not built (deployment.md) |
| PR-DEP-8 CLI (after 0.6) | Not done | As scheduled |
| PR-THM-1, 2 | Done | |
| PR-THM-3 more themes (after 0.6) | Partial | A second preset exists |
| PRD §7 Cost: free plan by default | Not met | See NFR-10 |
| PRD §7 Reliability: backup and restore tested | Done | Rehearsed both ways |

## Milestone acceptance criteria

| Milestone | Criterion | Status |
| --- | --- | --- |
| 0.1 | Builds reproducibly; admin login and media upload work locally and on Cloudflare | Done: local E2E; on production the owner created the admin with a passkey and completed setup |
| 0.2 | Merchant creates and publishes a product; storefront reads it | Done (E2E) |
| 0.3 | Real COD order from a phone, managed to Delivered | Done in an emulated 360 px phone (E2E); not yet on a physical phone |
| 0.4 | New user deploys and initialises without editing source | Needs a person: public repository and a clean Cloudflare account |
| 0.5 | Authorised AI client queries the store without bypassing rules | Done (E2E with a real MCP request flow and token) |
| 0.6 | Themes and extensions evolve without changing the commerce core | Done |

## Still open

1. Publish the GitHub repository (the command was blocked by this environment's permission check) and test the deploy button from a clean Cloudflare account.
2. Decide the hosting plan: CartDE needs Workers Paid for reliable CPU headroom.
3. Add route caching to bring the p95 under 200 ms (NFR-5), then load-test with 1,000 products.
4. Native-speaker review of the Bengali strings.
5. Place one order from a physical phone on the live site.
