# CartDE — Software Requirements Specification (SRS)

| | |
| --- | --- |
| Status | Draft v0.1 |
| Date | 2026-10-10 |
| Audience | Contributors and AI coding agents implementing CartDE |
| Companion documents | [PRD.md](PRD.md), [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) |

## 1. Introduction

### 1.1 Purpose

This specification defines what the CartDE software must do and how it must behave for releases 0.1 through 0.6. It turns the PRD into testable requirements, a data model, an order state model and interface definitions.

### 1.2 Scope

A single-store, self-hosted commerce application deployed to one Cloudflare account, built as an Astro application with the EmDash CMS integration. In scope: catalogue, inventory, storefront, cart, cash-on-delivery checkout, order management, merchant administration, first-run setup, deployment, and a read-mostly AI tool layer. Out of scope: online payment gateways, courier integrations, messaging automation, multi-tenancy, billing.

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| Merchant | The store owner or staff member who manages products and orders |
| Shopper | A visitor who browses the storefront and places an order |
| COD | Cash on delivery: payment collected at handover |
| Option / Variant | An option is a named axis (Size). A variant is one purchasable combination of option values with its own SKU, price and stock |
| Minor units | Money stored as integers in the currency's smallest unit (poisha for BDT; 100 poisha = 1 taka) |
| Snapshot | A copy of product, price or address data stored on an order at the time of purchase |
| EmDash | The CMS integration providing admin shell, auth, media, content, settings and MCP |
| D1 / R2 | Cloudflare's SQLite-based database and object storage |
| MCP | Model Context Protocol, the interface AI clients use to call tools |

### 1.4 References

- [EmDash documentation](https://docs.emdashcms.com/), [repository](https://github.com/emdash-cms/emdash)
- [EmDash: Deploy to Cloudflare](https://docs.emdashcms.com/deployment/cloudflare/), [Core migrations](https://docs.emdashcms.com/deployment/core-migrations/), [Authentication](https://docs.emdashcms.com/guides/authentication/), [Plugin storage](https://docs.emdashcms.com/plugins/creating-plugins/storage/), [MCP server](https://docs.emdashcms.com/reference/mcp-server/)
- [Cloudflare: Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Cloudflare D1 documentation](https://developers.cloudflare.com/d1/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

### 1.5 Conventions

Identifiers: `FR-<AREA>-<n>` for functional requirements, `NFR-<n>` for non-functional. "Must" is binding for the release listed; "should" is a strong preference that may be deferred with a documented reason.

## 2. Overall description

### 2.1 Product perspective

CartDE is one Astro application. EmDash runs inside it as an integration and owns the `/_emdash/*` routes (admin, auth, media, MCP, REST). CartDE owns the storefront routes, the commerce admin routes under `/admin/*`, the JSON API under `/api/cartde/*`, and its own D1 tables prefixed `cartde_`. Both share one Worker, one D1 database, one R2 bucket and one session.

### 2.2 Verified stack (2026-10-10)

| Component | Version | Verified how |
| --- | --- | --- |
| Node.js | 22.23.1 (EmDash requires ≥ 22.16) | `node --version` |
| pnpm | 11.17.0 locally; scaffold pins 11.9.0 | `pnpm --version`, scaffold `package.json` |
| emdash, @emdash-cms/cloudflare, create-emdash | 1.2.0 (MIT) | npm registry, installed probe |
| astro | 7.3.8 | installed probe |
| @astrojs/cloudflare | 14.3.4 | installed probe |
| @astrojs/react, react | 6.0.6, 19.2.4 | installed probe |
| wrangler | 4.149.0 | installed probe |
| Scaffold build and typecheck | pass (0 errors) | `pnpm build`, `pnpm typecheck` on the probe |

### 2.3 Constraints

- Cloudflare Workers runtime: no filesystem, CPU time limits per request, bundle size limits (verify the compressed Worker size at first deploy against the current plan limit).
- D1: SQLite dialect; no interactive transactions. Atomic multi-statement changes use `D1Database.batch()`, which runs statements in one implicit transaction. Conditional updates provide optimistic concurrency.
- EmDash plugin storage is document and key-value only (no SQL tables), so commerce data lives in CartDE's own tables, not plugin storage.
- EmDash authentication is passkey-first with magic links and GitHub, Google, Microsoft and Cloudflare Access options. There is no password login.
- The deploy button requires a public repository and reads resource names from `wrangler.jsonc` and secrets from `.env.example`.
- Sandboxed plugins require the Worker Loader binding (paid plan) and stay disabled.

### 2.4 Assumptions and dependencies

- Single store, single owner account for releases 0.1 to 0.6. Records carry a `store_id` column defaulting to 1 so a future multi-store migration is additive, but no tenant isolation is claimed.
- Default currency BDT, locale en-BD, time zone Asia/Dhaka, all configurable in store settings.
- EmDash core migrations run in `auto` mode (applied on first request). CartDE commerce migrations are Wrangler D1 migrations run by the deploy script.

## 3. System architecture

### 3.1 Layers

| Layer | Contents | Location (proposed) |
| --- | --- | --- |
| Presentation | Storefront pages and components, commerce admin pages, setup wizard, theme components | `src/pages/`, `src/components/`, `src/layouts/`, `src/themes/default/` |
| Application / API | Route handlers, request validation (zod), authorisation guards, CSRF, error mapping, audit events | `src/pages/api/cartde/`, `src/cartde/app/` |
| Commerce domain | Pure TypeScript: money, pricing, cart totals, order state machine, inventory rules, validation schemas | `src/cartde/domain/` |
| Persistence | D1 repositories, migration files, R2 media helpers, export utilities | `src/cartde/db/`, `migrations/` |
| AI integration | MCP tool definitions calling application services; tool permission map; confirmation rules | `src/cartde/mcp/` (0.5) |
| Infrastructure | Wrangler configuration, Worker entry, CI workflow, deploy button metadata | `wrangler.jsonc`, `src/worker.ts`, `.github/workflows/` |

Rules: presentation never queries D1 directly; application services are the only callers of repositories; the domain layer has no I/O and is fully unit-tested; MCP tools call application services only.

### 3.2 Route namespaces

| Namespace | Owner | Purpose |
| --- | --- | --- |
| `/`, `/products`, `/products/[slug]`, `/category/[slug]`, `/cart`, `/checkout`, `/orders/[number]` | CartDE | Storefront |
| `/[slug]`, `/posts/*` | EmDash starter pages kept by CartDE | Content pages and optional blog |
| `/admin/*` | CartDE | Commerce dashboard (requires EmDash admin session) |
| `/api/cartde/*` | CartDE | JSON API used by the dashboard, checkout and later the CLI |
| `/setup` | CartDE (0.4) | First-run store configuration after the EmDash wizard |
| `/_emdash/admin` | EmDash | Users, media, pages, site settings, plugins |
| `/_emdash/api/*` | EmDash | REST, media files, MCP endpoint, auth callbacks |

Astro resolves static routes before the `[slug]` catch-all, so `/products` and `/admin` do not collide with EmDash content pages. A content page slug equal to a CartDE route is rejected by validation.

### 3.3 Reuse matrix: EmDash versus CartDE

| Capability | Source | Notes |
| --- | --- | --- |
| Admin shell, login, sessions, users, roles | EmDash | `Astro.locals.user` is set by EmDash's auth middleware; CartDE checks it in its own middleware |
| Media library and R2 uploads | EmDash | Product images reference EmDash media IDs; CartDE never writes to R2 directly in 0.2 |
| Content pages, menus, site title and logo, SEO basics | EmDash | Storefront reads site settings and menus |
| Scheduled handler, core migrations, backups, site transfer | EmDash | Commerce tables are included in D1 backups; verify in 0.4 |
| MCP server, OAuth, personal access tokens, scopes, audit of tool calls | EmDash | CartDE tools are exposed through a native plugin's routes in 0.5 (see Development Plan ADR-5) |
| Products, variants, categories, inventory | CartDE | Own tables and services |
| Cart, checkout, orders, order events, counters | CartDE | Own tables and services |
| Store settings specific to commerce (currency, delivery charges) | CartDE | `cartde_store` row |
| Commerce audit log | CartDE | `cartde_audit_log` |

## 4. Data requirements

### 4.1 Conventions

- Primary keys: 26-character ULID strings generated server-side (sortable, URL-safe). Order numbers are a separate integer sequence.
- Timestamps: ISO 8601 UTC text (`created_at`, `updated_at`) maintained by the application.
- Money: `INTEGER` minor units. Column names end in `_minor`. No floating point anywhere in money paths.
- Every table has `store_id INTEGER NOT NULL DEFAULT 1`.
- Foreign keys declared with `ON DELETE` rules; `PRAGMA foreign_keys` is on in D1.
- Soft delete for products via `status = 'archived'`; hard delete only for drafts with no orders.

### 4.2 Entities

**cartde_store** (one row): `id`, `name`, `slug`, `currency` (ISO 4217, default `BDT`), `locale` (default `en-BD`), `timezone` (default `Asia/Dhaka`), `status` (`setup` | `active` | `paused`), `contact_phone`, `contact_email`, `address_text`, `delivery_inside_dhaka_minor`, `delivery_outside_dhaka_minor`, `low_stock_threshold`, `setup_completed_at`, timestamps.

**cartde_categories**: `id`, `name`, `slug` UNIQUE, `description`, `sort_order`, timestamps.

**cartde_products**: `id`, `name`, `slug` UNIQUE, `description_md`, `status` (`draft` | `active` | `archived`), `featured_media_id` (EmDash media ID, nullable), `seo_title`, `seo_description`, `published_at`, timestamps. Index on `status`, `slug`.

**cartde_product_categories**: `product_id`, `category_id`, primary key (both), `ON DELETE CASCADE`.

**cartde_product_media**: `id`, `product_id`, `media_id`, `alt`, `sort_order`.

**cartde_product_options**: `id`, `product_id`, `name`, `position`. UNIQUE (`product_id`, `name`).

**cartde_product_option_values**: `id`, `option_id`, `value`, `position`. UNIQUE (`option_id`, `value`).

**cartde_variants**: `id`, `product_id`, `title` (derived, for example "M / Red"), `sku` UNIQUE nullable, `price_minor` ≥ 0, `compare_at_minor` nullable, `stock_qty` ≥ 0 (CHECK), `status` (`active` | `inactive`), `position`, timestamps. A product always has at least one variant; a product without options has one default variant.

**cartde_variant_option_values**: `variant_id`, `option_value_id`, primary key (both). UNIQUE combination per product enforced in the service layer.

**cartde_customers**: `id`, `name`, `phone` (normalised, indexed), `email` nullable, `created_at`. Phone is the natural key for matching repeat customers.

**cartde_customer_addresses**: `id`, `customer_id`, `recipient_name`, `phone`, `line1`, `line2`, `area`, `district`, `postal_code`, `instructions`, `created_at`.

**cartde_orders**: `id`, `order_number` INTEGER UNIQUE, `status`, `payment_method` (`cod`), `payment_status` (`unpaid` | `paid` | `refunded`), `currency`, `subtotal_minor`, `delivery_minor`, `discount_minor`, `total_minor`, `customer_id` nullable, snapshot columns `customer_name`, `customer_phone`, `customer_email`, `ship_recipient_name`, `ship_phone`, `ship_line1`, `ship_line2`, `ship_area`, `ship_district`, `ship_postal_code`, `ship_instructions`, `customer_note`, `merchant_note`, `idempotency_key` UNIQUE, `placed_at`, timestamps. Indexes on `status`, `customer_phone`, `placed_at`.

**cartde_order_items**: `id`, `order_id`, `product_id` nullable, `variant_id` nullable (`ON DELETE SET NULL`), snapshot `product_name`, `variant_title`, `sku`, `quantity` > 0, `unit_price_minor`, `line_total_minor`.

**cartde_order_events**: `id`, `order_id`, `from_status` nullable, `to_status`, `actor_user_id` nullable (null = shopper or system), `note`, `created_at`.

**cartde_inventory_events**: `id`, `variant_id`, `delta` (signed), `reason` (`order` | `cancel` | `return` | `manual` | `import`), `order_id` nullable, `actor_user_id` nullable, `note`, `created_at`.

**cartde_counters**: `name` PRIMARY KEY, `value` INTEGER. Row `order_number` starts at 1000.

**cartde_audit_log** (0.5): `id`, `actor_user_id`, `actor_kind` (`user` | `mcp` | `system`), `action`, `entity`, `entity_id`, `payload_json`, `created_at`.

### 4.3 Invariants

- `total_minor = subtotal_minor + delivery_minor − discount_minor`, and `subtotal_minor = Σ line_total_minor`, and `line_total_minor = unit_price_minor × quantity`, recomputed and asserted server-side at order creation.
- `stock_qty` never negative, enforced by a CHECK constraint and by conditional updates.
- Σ `delta` of inventory events for a variant equals `stock_qty` minus its initial value (reconciliation test).
- An order's snapshot columns are never updated after creation except `merchant_note`.

### 4.4 Migration strategy

- Commerce migrations are numbered SQL files in `migrations/` (`0001_init.sql`, …) applied with `wrangler d1 migrations apply DB` locally and in the deploy script, which the deploy button also runs. Wrangler tracks them in its own `d1_migrations` table, separate from EmDash's `_emdash_migrations`.
- Migrations are forward-only and additive where possible (expand, deploy, contract). A destructive migration requires a documented backup step first.
- Each migration ships with a test that applies all migrations to an empty database and verifies the schema.

## 5. Functional requirements

### 5.1 Catalogue (CAT)

| ID | Requirement | Release |
| --- | --- | --- |
| FR-CAT-1 | The system must create, read, update and archive products with the fields in 4.2, validating name (1–200 chars), slug (lowercase, unique, URL-safe, auto-generated from name), status and SEO lengths. | 0.2 |
| FR-CAT-2 | The system must manage categories and assign zero or more categories to a product. | 0.2 |
| FR-CAT-3 | The system must manage up to 3 options per product and up to 100 variants, each with SKU (unique when set), price, compare-at price, stock and status. | 0.2 |
| FR-CAT-4 | The system must attach EmDash media items to a product, ordered, with alt text, and select one featured image. | 0.2 |
| FR-CAT-5 | Only products with `status = 'active'` and at least one active variant appear on the storefront; drafts and archived products return 404 publicly. | 0.2 |
| FR-CAT-6 | The system must adjust stock manually with a reason and record an inventory event. | 0.2 |
| FR-CAT-7 | The editor must offer a preview link to the public product page, which works for drafts only for authenticated administrators. | 0.2 |
| FR-CAT-8 | Deleting a product that has orders must be refused; archiving is the supported path. | 0.2 |

### 5.2 Storefront (SF)

| ID | Requirement | Release |
| --- | --- | --- |
| FR-SF-1 | The homepage must render store name, logo, primary menu, featured or latest active products, and footer from settings. | 0.1 brand, 0.3 products |
| FR-SF-2 | Listing pages must paginate (24 per page) and filter by category, sorted by newest by default. | 0.3 |
| FR-SF-3 | Product pages must show images, description, options, resolved variant price, compare-at price, and stock state (in stock, low, out of stock). | 0.3 |
| FR-SF-4 | Pages must be server-rendered with cache hints and must emit title, meta description, canonical URL, Open Graph tags and `Product` JSON-LD. | 0.3 |
| FR-SF-5 | Pages must render without JavaScript except the cart and checkout interactions, which degrade to a form post. | 0.3 |
| FR-SF-6 | 404 and error pages must be branded and must not leak stack traces. | 0.1 |

### 5.3 Cart (CART)

| ID | Requirement | Release |
| --- | --- | --- |
| FR-CART-1 | The cart must be held client-side (localStorage with a cookie fallback) as a list of `{variantId, quantity}` and must be re-validated server-side at checkout. No cart table exists in 0.3. | 0.3 |
| FR-CART-2 | The cart page must show each line with current price and stock, allow quantity change and removal, and show subtotal. | 0.3 |
| FR-CART-3 | A variant that became inactive or out of stock must be flagged in the cart and blocked at checkout. | 0.3 |

### 5.4 Checkout and orders (ORD)

| ID | Requirement | Release |
| --- | --- | --- |
| FR-ORD-1 | Checkout input must be validated: name 2–100 chars; Bangladesh mobile number (11 digits starting `01[3-9]`, or `+880` form, normalised to `01…`); district from a fixed list of 64; area 1–100 chars; address line 5–200 chars; optional note ≤ 500 chars. | 0.3 |
| FR-ORD-2 | The server must recompute all prices from the database, ignoring client-submitted prices, and apply the delivery charge from store settings by zone. | 0.3 |
| FR-ORD-3 | Order creation must run as one D1 batch: for each line a conditional `UPDATE cartde_variants SET stock_qty = stock_qty − ? WHERE id = ? AND stock_qty >= ? AND status = 'active'`, then insert order, items, events and inventory events, then increment the counter. If any update affects 0 rows the batch is rolled back and the shopper sees which item is unavailable. | 0.3 |
| FR-ORD-4 | Each checkout attempt must carry an idempotency key generated when the checkout page loads; a repeated submission with the same key returns the existing order instead of creating another. | 0.3 |
| FR-ORD-5 | Each order must receive the next `order_number` from `cartde_counters` within the same batch. | 0.3 |
| FR-ORD-6 | The confirmation page must be reachable by order number plus a random access token stored on the order, so order numbers alone do not expose customer data. | 0.3 |
| FR-ORD-7 | Customers must be matched by normalised phone and created when new; the order stores snapshots regardless. | 0.3 |
| FR-ORD-8 | The orders list must search by order number, phone and name, filter by status, and paginate (25 per page). | 0.3 |
| FR-ORD-9 | Status changes must follow section 6 and record an order event with actor and note. | 0.3 |
| FR-ORD-10 | A merchant may edit `merchant_note` at any time; all other order fields are immutable after creation. | 0.3 |
| FR-ORD-11 | A printable order summary (items, totals, address, phone) must be available from the order page. | 0.3 |

### 5.5 Admin and authentication (ADM)

| ID | Requirement | Release |
| --- | --- | --- |
| FR-ADM-1 | Every `/admin/*` page and `/api/cartde/admin/*` endpoint must require an EmDash session whose user role is Admin (role level 50), checked in Astro middleware server-side; otherwise redirect to the EmDash login or return 401/403 JSON. | 0.2 |
| FR-ADM-2 | State-changing admin and checkout requests must be protected against CSRF by same-origin checks (`Origin`/`Sec-Fetch-Site`) plus a custom request header for JSON calls. | 0.2 |
| FR-ADM-3 | The dashboard must provide navigation: Overview, Products, Orders, Customers, Storefront (link to site and theme settings), Settings, plus a link to the EmDash admin for media, pages and users. | 0.3 |
| FR-ADM-4 | Overview must show counts of pending orders, orders today, active products and low-stock variants, computed by queries. | 0.3 |
| FR-ADM-5 | Store settings must be editable: name, currency, locale, time zone, contact details, delivery charges, low-stock threshold. Currency cannot change once an order exists. | 0.2 |
| FR-ADM-6 | Customers must list name, phone, order count and last order date, with a link to their orders. | 0.3 |
| FR-ADM-7 | Administrative mutations (product, variant, stock, order status, settings) must be written to the audit log with actor and payload summary. | 0.5 |

### 5.6 Setup and deployment (DEP)

| ID | Requirement | Release |
| --- | --- | --- |
| FR-DEP-1 | `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm typecheck` and `pnpm deploy` must work from the committed lockfile. | 0.1 |
| FR-DEP-2 | `wrangler.jsonc` must declare the D1 binding `DB`, the R2 binding `MEDIA`, the cron trigger, and default resource names so the deploy button can provision them. | 0.1 |
| FR-DEP-3 | The `deploy` script must apply commerce migrations (`wrangler d1 migrations apply DB --remote`) before `wrangler deploy`. | 0.2 |
| FR-DEP-4 | `.env.example` must list `EMDASH_ENCRYPTION_KEY` and `EMDASH_SITE_URL` with descriptions and no real values, so the deploy button prompts for them. | 0.1 |
| FR-DEP-5 | On any request, if the EmDash wizard or CartDE store setup is incomplete, storefront requests must show a "store not ready" page and admin requests must route to the next setup step. | 0.4 |
| FR-DEP-6 | The CartDE setup step must be available only to an authenticated EmDash Admin, must be idempotent, and must mark `setup_completed_at` once. | 0.4 |
| FR-DEP-7 | No endpoint may reset or reseed a store without an authenticated Admin and an explicit confirmation; seed data is applied only when the catalogue is empty and the admin opts in. | 0.4 |
| FR-DEP-8 | Documentation must cover secrets, backup (`wrangler d1 export`, R2 copy, EmDash backup), restore, redeploy without data loss, and recovery from incomplete setup. | 0.4 |

### 5.7 AI and MCP (AI)

| ID | Requirement | Release |
| --- | --- | --- |
| FR-AI-1 | All commerce operations must be exposed as typed functions in the application layer with zod input schemas, used by both HTTP routes and MCP tools. | 0.5 |
| FR-AI-2 | Read-only tools `search_products`, `list_orders`, `get_order_details`, `get_sales_summary` must be available to callers whose EmDash token or session carries the required scope and role. | 0.5 |
| FR-AI-3 | Draft and mutation tools `create_product_draft`, `update_product`, `update_inventory`, `update_order_status`, `create_discount_draft` must validate input, enforce permissions server-side, write audit entries, and mark destructive actions as requiring confirmation. | 0.5 |
| FR-AI-4 | Tool arguments must never select the store or override authorisation; the store is implicit and the caller's identity comes from the session or token only. | 0.5 |
| FR-AI-5 | The system must operate fully without any external model API key. | 0.5 |

## 6. Order state model

Order `status` values: `pending`, `confirmed`, `shipped`, `delivered`, `cancelled`, `returned`. Payment `payment_status`: `unpaid`, `paid`, `refunded`.

| From | To | Actor | Inventory effect | Payment effect |
| --- | --- | --- | --- | --- |
| (new) | pending | Shopper via checkout | Stock decremented per line (reason `order`) | unpaid |
| pending | confirmed | Merchant | none | — |
| pending | cancelled | Merchant | Stock restored (reason `cancel`) | — |
| confirmed | shipped | Merchant | none | — |
| confirmed | cancelled | Merchant | Stock restored (reason `cancel`) | — |
| shipped | delivered | Merchant | none | paid |
| shipped | returned | Merchant | Stock restored unless merchant opts out (reason `return`) | stays unpaid |
| delivered | returned | Merchant | Stock restored unless merchant opts out (reason `return`) | refunded if cash was returned (merchant flag) |

Any other transition is rejected with HTTP 409 and a message naming the allowed targets. `cancelled` and `returned` are terminal. The transition table is implemented once in the domain layer as a pure function and unit-tested for every pair.

## 7. External interfaces

### 7.1 HTTP API (JSON, `/api/cartde/*`)

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/cartde/checkout` | Public + CSRF | Create an order; body validated per FR-ORD-1; returns order number and access token |
| `GET /api/cartde/cart/validate` | Public | Re-price and check stock for cart lines |
| `GET/POST /api/cartde/admin/products`, `GET/PATCH/DELETE …/products/:id` | Admin | Product CRUD |
| `POST …/products/:id/variants`, `PATCH/DELETE …/variants/:id` | Admin | Variant management |
| `POST …/variants/:id/stock` | Admin | Manual stock adjustment with reason |
| `GET/POST …/categories`, `PATCH/DELETE …/categories/:id` | Admin | Category CRUD |
| `GET …/orders`, `GET …/orders/:id`, `POST …/orders/:id/transition`, `PATCH …/orders/:id/note` | Admin | Order management |
| `GET …/customers`, `GET …/customers/:id` | Admin | Customer views |
| `GET/PATCH …/settings` | Admin | Store settings |
| `GET …/export/{products,orders,customers}.csv` | Admin | Data export |

All responses use `{ ok: true, data }` or `{ ok: false, error: { code, message, fields? } }`. Errors never include stack traces or SQL.

### 7.2 EmDash interfaces used

- `Astro.locals.user` (type `User` from `@emdash-cms/auth`) for identity and role.
- `getSiteSettings`, `getMenu`, `Image`, `EmDashHead`, media library UI for images.
- EmDash MCP server at `/_emdash/api/mcp` with OAuth 2.1 PKCE and personal access tokens; CartDE tools are registered through a native plugin's routes with explicit permissions (0.5).

### 7.3 Cloudflare bindings and configuration

| Name | Type | Purpose |
| --- | --- | --- |
| `DB` | D1 | EmDash and CartDE tables |
| `MEDIA` | R2 | Media library objects |
| `triggers.crons` | Cron | EmDash scheduled publishing and maintenance, every minute |
| `compatibility_flags` | `nodejs_compat` | Required by EmDash |
| `worker_loaders` | commented out | Sandboxed plugins, paid plan only |

### 7.4 Secrets and environment variables

| Name | Where | Required | Purpose |
| --- | --- | --- | --- |
| `EMDASH_ENCRYPTION_KEY` | Wrangler secret; `.env` locally | Yes | Encrypts plugin secret settings; generated by the scaffold; keep a copy with backups |
| `EMDASH_SITE_URL` | Wrangler secret or var | Recommended | Public origin for passkeys, CSRF, canonical URLs; without it the first-request origin is recorded |
| `CF_ACCESS_AUDIENCE` | Wrangler secret | Only with Cloudflare Access | Access JWT validation |
| `EMDASH_MIGRATIONS_MODE` | var | No | Overrides core migration mode (`auto`, `check`, `manual`) |

No secret is ever committed, printed in logs, or read in client code.

## 8. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-1 Security | Authorisation is enforced server-side on every admin route and API; hidden UI is never a boundary. All input validated with zod. Uploads limited by EmDash media settings (type allowlist, size). Error responses sanitised. Dependencies updated at least monthly with `pnpm audit` in CI. |
| NFR-2 Money | All amounts are integer minor units; formatting happens only at the presentation edge; rounding rules are documented in the domain module. |
| NFR-3 Concurrency | Concurrent checkouts for the last unit of stock produce exactly one order; verified by an integration test issuing parallel requests. |
| NFR-4 Idempotency | Checkout, setup and migrations are safe to retry. |
| NFR-5 Performance | Storefront HTML responses under 200 ms server time at the p95 for listing and product pages with 1,000 products; images served through the EmDash image endpoint with width-appropriate variants. |
| NFR-6 Accessibility | WCAG 2.1 AA targets for colour contrast, labels, focus order and keyboard operability on storefront and admin. |
| NFR-7 Mobile | All pages usable at 360 px width without horizontal scrolling. |
| NFR-8 Localisation | Currency and date formatting via `Intl` with store locale and time zone; all UI strings in message files; Bengali translation planned for 0.6. |
| NFR-9 Observability | Structured logs without personal data; order and inventory events provide an audit trail; errors surface in Workers logs. |
| NFR-10 Cost | Default configuration runs on the Workers free plan; documentation lists D1 (storage and row reads), R2 and Images free-tier limits with links. |
| NFR-11 Portability | Domain and application layers depend on an interface for the database, not on D1 types, so a SQLite or libSQL adapter is possible later without rewriting business rules. |
| NFR-12 Maintainability | TypeScript strict mode; ESLint and Prettier; tests required for domain and persistence changes; docs updated in the same pull request as behaviour changes. |

## 9. Verification

| Class | What is verified | Tooling | Introduced |
| --- | --- | --- | --- |
| Build checks | Lockfile install, `astro check`, `astro build`, `wrangler deploy --dry-run` | GitHub Actions | 0.1 |
| Unit tests | Money and totals, slug generation, validation schemas, order transitions, inventory rules, authorisation helper | Vitest | 0.2 |
| Integration tests | Migrations on empty DB, product CRUD, variant uniqueness, order creation batch, stock conditional update, concurrent checkout, idempotent retry | Vitest with `@cloudflare/vitest-pool-workers` (D1 in Miniflare) | 0.2 to 0.3 |
| End-to-end | Storefront to admin COD journey on a phone-sized viewport | Playwright against `wrangler dev` | 0.3 |
| Deployment tests | Clean deploy, setup, media upload, secrets, redeploy without data loss, recovery from interrupted setup | Manual checklist, scripted where possible | 0.4 |
| Security checks | Unauthenticated access to every admin route and API, CSRF, upload limits, error leakage | Automated route sweep in integration tests | 0.2 onward |

A requirement counts as verified only when its test has been executed and the result recorded in the pull request.

## 10. Appendix

### 10.1 Open technical questions

1. Confirm the exact `User` fields exposed on `Astro.locals.user` (id, email, role) against `@emdash-cms/auth` types before writing the admin guard (0.2).
2. Confirm whether the Astro Cloudflare adapter's image service needs an `IMAGES` binding declared, or whether EmDash's media endpoint handles all product image rendering (first deploy in 0.1).
3. Measure the compressed Worker bundle size after the first deploy and compare with the plan limit.
4. Decide at 0.5 whether MCP tools are registered via a native EmDash plugin (inherits OAuth, scopes, consent, audit) or a standalone endpoint; the plugin path is preferred if route constraints allow JSON tools backed by CartDE services.
5. Decide whether product descriptions use Markdown or Portable Text (PRD open question 4).

### 10.2 District list

The 64 districts of Bangladesh are shipped as a static list in `src/cartde/domain/geo/districts.ts`, used for checkout validation and the delivery zone (Dhaka district = inside Dhaka).
