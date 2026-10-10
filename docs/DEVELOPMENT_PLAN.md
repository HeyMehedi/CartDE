# CartDE — Development Plan

| | |
| --- | --- |
| Status | Draft v0.1 |
| Date | 2026-10-10 |
| Audience | Maintainers, contributors and AI coding agents working on CartDE |
| Companion documents | [PRD.md](PRD.md), [SRS.md](SRS.md) |

## 1. Current state (audit of 2026-10-10)

The project directory is empty, so CartDE starts from the official EmDash scaffold, which installs, builds and typechecks cleanly on this machine. Nothing exists yet to preserve, and nothing in the brief has been implemented.

**Repository.** `/Users/cyberspace/Docker/CartDE` contained no files and was not a git repository before this plan and its two companion documents were written into `docs/`. There is no code, configuration, license, secret material or history.

**Toolchain on this machine**

| Tool | Version | Note |
| --- | --- | --- |
| Node.js | 22.23.1 | EmDash requires 22.16 or newer |
| pnpm | 11.17.0 | The scaffold pins pnpm 11.9.0 in `packageManager`; pnpm switches automatically |
| git | 2.55.0 | |
| GitHub CLI | 2.98.0 | |
| Wrangler | 4.149.0 | Project-local only; not installed globally |

**Baseline probe.** The official starter was scaffolded into a scratch directory, not the project, with:

```
npm create emdash@1.2.0 cartde-probe -- --template cloudflare:starter --pm pnpm --no-install --no-sandboxed-plugins --yes
```

| Check | Result |
| --- | --- |
| `pnpm install` | Passed on retry. The first attempt failed with a transient registry error for `@astrojs/internal-helpers` 0.12.0, published two days earlier. A lockfile was written. |
| `pnpm build` (astro build) | Passed. Output 36 MB (client and server). One warning about chunks over 500 kB. |
| `pnpm typecheck` (astro check) | Passed. 0 errors, 0 warnings across 14 files. |
| Tests | None exist in the template. |
| `wrangler whoami` | Logged in to a Cloudflare account. Scopes include Workers, D1, KV and Secrets Store. No R2 scope is listed explicitly; verify bucket creation on first deploy. |
| Deployment | Not performed. |

**Resolved versions:** emdash 1.2.0, @emdash-cms/cloudflare 1.2.0, astro 7.3.8, @astrojs/cloudflare 14.3.4, @astrojs/react 6.0.6, react 19.2.4, wrangler 4.149.0, @astrojs/check 0.9.10. EmDash 1.0 shipped on 2026-09-28 and 1.2.0 on 2026-10-06, so the API is young and moving.

**What the scaffold provides**

- `wrangler.jsonc` with D1 binding `DB`, R2 binding `MEDIA`, `nodejs_compat`, a one-minute cron trigger, and the Worker Loader binding commented out (free-plan compatible).
- `astro.config.mjs` with `output: "server"`, the Cloudflare adapter, React, and the EmDash integration using `d1({ binding: "DB", session: "auto" })` and `r2({ binding: "MEDIA" })`.
- `src/worker.ts` wrapping the EmDash handler with the scheduled handler.
- `seed/seed.json` defining posts and pages collections, category and tag taxonomies, and site settings.
- Starter pages: home, posts list and detail, category and tag archives, static page by slug, 404.
- A `.env` holding a generated `EMDASH_ENCRYPTION_KEY`, ignored by git. Production needs it as a Wrangler secret.
- `.gitignore` covering `node_modules`, `dist`, `.astro`, `.emdash/migrations.json`, `.wrangler`, `.env*` and `.dev.vars*`.
- `.agents/skills/` with EmDash's own agent skills and `.mcp.json` pointing at the EmDash docs MCP server. No secrets in either.
- `worker-configuration.d.ts` generated types whose `Env` declares only `DB` and `MEDIA`.

**Observations worth acting on**

- The build log reports the adapter enabling Cloudflare Images (`IMAGES`) and KV sessions (`SESSION`), but neither binding is declared. EmDash's D1 adapter handles sessions with `session: "auto"`. Confirm admin login and image rendering on the first deploy.
- EmDash has no verifiable commerce plugin. Cloudflare's launch post names an Urumi plugin as upcoming and a community directory lists an emCommerce entry, but neither could be inspected. Commerce must be built.
- EmDash plugin storage is document and key-value only, which rules it out as the source of truth for orders and inventory.
- EmDash sets `Astro.locals.user` from its auth middleware, so CartDE can protect its own routes without a second login system.
- EmDash is MIT licensed, as are Astro and Wrangler, so an MIT or Apache-2.0 CartDE license is compatible.

Sources: [EmDash repository](https://github.com/emdash-cms/emdash), [Deploy to Cloudflare guide](https://docs.emdashcms.com/deployment/cloudflare/), [Core migrations](https://docs.emdashcms.com/deployment/core-migrations/), [Authentication](https://docs.emdashcms.com/guides/authentication/), [Plugin storage](https://docs.emdashcms.com/plugins/creating-plugins/storage/), [Choosing a plugin format](https://docs.emdashcms.com/plugins/creating-plugins/choosing-a-format/), [MCP server](https://docs.emdashcms.com/reference/mcp-server/), [Cloudflare deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/).

## 2. Working agreements

These apply to every coding session, human or AI.

1. Inspect before editing; read the real file, never assume.
2. Build only the current milestone; no speculative features.
3. Preserve the generated Wrangler and Astro configuration; change it only with a stated reason.
4. Add a dependency only with a reason recorded in the pull request.
5. Every behaviour change ships with its test and its documentation update.
6. Never claim something works without running it; record commands and results.
7. Never commit secrets, merchant data or generated manifests that the scaffold ignores.
8. Migrations are forward-only, versioned and reviewed; destructive changes need a backup step.
9. AI tools and the dashboard call the same application services; nothing mutates the database directly.
10. Distinguish implemented, partial and planned in all docs and in the README status table.
11. Prefer simple, explicit code over clever code; correctness beats brevity.
12. When blocked on credentials or infrastructure, finish everything else and state the blocker.

## 3. Architecture decisions

| ID | Decision | Alternatives considered | Why |
| --- | --- | --- | --- |
| ADR-1 | One Astro application with EmDash as an integration; no monorepo yet | Monorepo with `apps/` and `packages/` from day one | A single app is what EmDash tooling, the deploy button and Workers Builds expect; packages are extracted only when real reuse appears (0.6 or later) |
| ADR-2 | Commerce data lives in CartDE's own D1 tables (`cartde_*`) accessed through repositories in `src/cartde/db/` | Model products as EmDash collections; use plugin document storage | Orders and inventory need relational constraints, conditional updates and batch atomicity; EmDash collections are content, plugin storage is document/KV with no SQL or multi-document transactions |
| ADR-3 | Commerce migrations are Wrangler D1 migration files in `migrations/`, applied by the `deploy` script; EmDash core migrations stay in `auto` mode | Custom migration runner; EmDash seed-based schema | Wrangler migrations are supported by the deploy button, track state in their own table and do not interfere with `_emdash_migrations` |
| ADR-4 | Reuse EmDash authentication; CartDE admin routes under `/admin/*` are guarded by Astro middleware that requires `Astro.locals.user` with Admin role | Separate login; native EmDash plugin React pages for all admin UI | One identity and session; Astro pages are simpler and fully under CartDE control. A native plugin can later add navigation into the EmDash admin without moving the data |
| ADR-5 | MCP tools (0.5) are exposed through a thin native EmDash plugin whose routes call CartDE application services | Standalone MCP endpoint | EmDash already provides OAuth 2.1, personal access tokens, scopes, consent screens and tool audit; re-implementing that is risk without benefit. Fall back to a standalone endpoint only if plugin routes cannot host the tools |
| ADR-6 | Money as integer minor units in BDT by default; formatting with `Intl.NumberFormat` at the edge | Decimal strings; floating point | Exact arithmetic, simple SQL aggregation |
| ADR-7 | ULID primary keys; sequential order numbers from a counter row updated in the same batch | UUID v4; autoincrement | Sortable, URL-safe IDs; human-friendly order numbers for phone conversations |
| ADR-8 | Cart is client-side state validated at checkout; no cart table in 0.3 | Server-side carts | Avoids writes for anonymous browsing and a cleanup job; revisit if abandoned-cart features are wanted |
| ADR-9 | Product descriptions as Markdown in 0.2 | EmDash Portable Text | Fewer moving parts; the EmDash rich editor can be adopted in 0.6 if merchants need it (owner decision pending) |
| ADR-10 | License MIT, pending owner confirmation | Apache-2.0 | Matches EmDash and Astro; simplest for contributors. Apache-2.0 adds a patent grant if the owner prefers it |
| ADR-11 | pnpm with a committed lockfile and `packageManager` pin; CI installs with `--frozen-lockfile` | npm | Matches the scaffold; the registry error seen in the probe shows why a lockfile matters |
| ADR-12 | Sandboxed plugins stay disabled; no Worker Loader binding | Enable from the start | Keeps the free plan viable; nothing in 0.1 to 0.6 needs sandboxed plugins |

## 4. Milestone 0.1 — Foundation

Goal: the unchanged EmDash foundation works locally and remotely, branded as CartDE, documented, under version control, with CI.

### Tasks

- [x] Scaffold into the project directory: `npm create emdash@1.2.0 . -- --template cloudflare:starter --pm pnpm --no-install --no-sandboxed-plugins --yes --force` (`--force` because `docs/` already exists; verify afterwards that `docs/` is untouched).
- [x] `git init`, review `.gitignore`, confirm `.env` is ignored, commit the pristine scaffold as the first commit so CartDE changes are diffable against upstream.
- [x] Rename: `package.json` name `cartde`, version `0.1.0`; `wrangler.jsonc` name `cartde`, D1 `cartde-db`, R2 `cartde-media` (owner may rename).
- [x] Brand the homepage: `seed/seed.json` title "CartDE" and tagline; `src/pages/index.astro` becomes a CartDE landing page that reads store name and logo from site settings and keeps the posts and pages routes working.
- [x] Add `.env.example` with `EMDASH_ENCRYPTION_KEY` and `EMDASH_SITE_URL` placeholders and comments (deploy button reads this file for secret prompts).
- [x] Add `LICENSE` (MIT unless the owner chooses otherwise), `README.md` (what, status table, local dev, deploy, links), `CONTRIBUTING.md`, `SECURITY.md`, `docs/architecture.md`, `docs/development.md`, `docs/deployment.md`. Keep `docs/PRD.md`, `docs/SRS.md`, `docs/DEVELOPMENT_PLAN.md`.
- [x] Add `.github/workflows/ci.yml`: checkout, pnpm via `packageManager`, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`, `pnpm wrangler deploy --dry-run`.
- [ ] Run locally (partly done: homepage and setup redirect checked over HTTP; the setup wizard passkey and media upload still need a browser): `pnpm install`, `pnpm typecheck`, `pnpm build`, `pnpm dev`; complete the EmDash setup wizard at `/_emdash/admin`; upload an image to the media library; create a page; confirm the homepage renders the CartDE brand. Record results in the pull request.
- [x] Deployment (done 2026-10-10, see docs/deployment.md; wizard, media upload and image rendering still to verify in a browser): `pnpm build`, `pnpm wrangler secret put EMDASH_ENCRYPTION_KEY`, `pnpm wrangler secret put EMDASH_SITE_URL`, `pnpm wrangler deploy`; open the Worker URL and complete the wizard immediately; upload media; record the compressed bundle size and whether image rendering works.
- [ ] Verify free-tier fit: confirm the current Workers, D1, R2 and Images free limits on Cloudflare's pricing pages, record the dates checked, and measure CPU time per request on the deployed baseline's home and product pages against the free plan CPU limit. Record the result in `docs/deployment.md` before any "free hosting" claim appears in the README.
- [ ] Publish the public GitHub repository (blocked: owner names it) (owner names it) and push.

### Deliverables

Branded, documented, version-controlled scaffold with green CI and a baseline deployment.

### Acceptance

`pnpm install --frozen-lockfile && pnpm typecheck && pnpm build` passes locally and in CI; admin login and media upload verified locally and on the deployed Worker; README reflects reality.

### Explicitly not in 0.1

No commerce tables, no admin pages, no theme system.

## 5. Milestones 0.2 to 0.6

Sizes are relative (S, M, L, XL) rather than dates; each milestone depends on the previous one being accepted.

### 0.2 Commerce core (L)

Progress (2026-10-10): migration, domain, repositories, guard, admin API, admin pages and minimal storefront are written. 45 automated tests pass. Not yet done: browser verification of the admin pages (needs a logged-in administrator), the Worker-runtime integration tests, and a deploy of 0.2. Deviation: database tests use a `node:sqlite` stand-in for D1 instead of `@cloudflare/vitest-pool-workers`; see docs/development.md.

- Migration `0001_init.sql`: store, categories, products, product_categories, product_media, options, option values, variants, variant option values, inventory events, counters.
- Domain: money helpers, slug generation, product and variant validation schemas (zod), inventory adjustment rules.
- Repositories and services: product CRUD, category CRUD, variant management, stock adjustment with events, store settings.
- Admin pages: `/admin/products` (list, search), `/admin/products/new`, `/admin/products/[id]` with variant editor, media picker using the EmDash media library, `/admin/categories`, `/admin/settings`. Middleware guard for `/admin/*` and `/api/cartde/admin/*`.
- Storefront read path: product queries by slug and category used by a minimal product page (full theme in 0.3).
- Tests: Vitest unit tests for the domain; integration tests with `@cloudflare/vitest-pool-workers` for migrations and CRUD; route sweep proving unauthenticated access is refused.
- Acceptance: a merchant creates, previews and publishes a product with two variants and images; the storefront reads it; all tests green.

### 0.3 COD order journey (XL)

Progress (2026-10-10): migration `0002_orders.sql`, domain (districts, phone, cart totals, state machine), atomic checkout, order and customer admin, storefront theme, cart, checkout, confirmation and JSON-LD are written. 96 automated tests pass, including every status pair, the last-unit race, idempotent retry and rollback. An HTTP run against the dev server placed an order, replayed the key, refused an oversell and checked confirmation tokens. Not done: Playwright end-to-end (no browser tooling installed; plan deviation), a real-D1 concurrency test, FR-SF-5's no-JavaScript form post (the cart is client-side by design, so checkout needs JavaScript), rate limiting of the public checkout endpoint, and a deploy.

- Migration `0002_orders.sql`: customers, addresses, orders, order items, order events.
- Domain: cart totals, delivery zones, checkout validation (Bangladesh phone, districts), order state machine.
- Checkout service: batch with conditional stock updates, idempotency key, order number counter, snapshots, access token.
- Storefront theme "default": homepage sections, listing, product page with variant selector, cart, checkout, confirmation, 404, SEO tags and JSON-LD.
- Admin: Overview, Orders list and detail with transitions and notes, Customers, printable summary.
- Tests: concurrent checkout test for the last unit, idempotent retry, every state transition pair, Playwright end-to-end journey.
- Acceptance: a test COD order is placed from a phone and moved through confirmed, shipped and delivered in the admin; a cancellation restores stock.

### 0.4 Deployment experience (M)

- README deploy button pointing at the public repository; `deploy` script running `wrangler d1 migrations apply DB --remote` then `wrangler deploy`.
- Setup detection middleware; `/setup` step for store settings after the EmDash wizard; idempotency and resume.
- Secure first admin: rely on the EmDash wizard; document the window between deploy and wizard completion; evaluate a one-time setup token if the window proves risky.
- Docs: secrets, backup (`wrangler d1 export`, R2 copy, EmDash backup guide), restore, troubleshooting.
- Test from a clean Cloudflare account and a fresh GitHub fork; redeploy and confirm no data loss.
- Acceptance: a new user deploys and initialises a working store without editing source.

### 0.5 AI-ready commerce (L)

- Application services formalised as typed operations with shared schemas.
- Audit log table and writes for all admin mutations.
- Native EmDash plugin registering read-only tools first (`search_products`, `list_orders`, `get_order_details`, `get_sales_summary`), then draft and mutation tools with confirmation flags.
- Permission tests: tokens with insufficient scope or role are refused; tool arguments cannot select another store.
- Acceptance: an authorised AI client queries the store through MCP without bypassing business rules.

### 0.6 Extensions and themes (M)

- Theme settings schema (colours, typography, homepage sections, footer, SEO defaults) stored as validated settings with a settings page.
- Extension interface: documented hooks for pricing, order events and storefront sections; compatibility rules and tests.
- Bengali storefront strings; storefront search.
- Acceptance: a second theme preset and a sample extension work without changes to the commerce core.

## 6. Testing and CI strategy

| Stage | Local | GitHub Actions (every pull request) |
| --- | --- | --- |
| 0.1 | `pnpm typecheck`, `pnpm build` | Install with frozen lockfile, typecheck, build, `wrangler deploy --dry-run` |
| 0.2 | Vitest unit and integration (`pnpm test`) | Adds `pnpm test` and `pnpm audit --audit-level=high` |
| 0.3 | Playwright against `wrangler dev` (`pnpm test:e2e`) | Adds end-to-end job with a Miniflare-backed D1 and R2 |
| 0.4 | Deployment checklist script | Optional manual workflow for deploy to a staging Worker |
| 0.5+ | Permission and MCP tool tests | Included in `pnpm test` |

Test data uses a dedicated fixture seed, never merchant data. Flaky tests are fixed or removed, never retried blindly.

## 7. Deployment and environments

| Environment | How | Data |
| --- | --- | --- |
| Local | `pnpm dev` (Astro dev server with Wrangler's local D1 and R2 emulation); `.env` for the encryption key | Local SQLite file under `.wrangler/`; disposable |
| Staging (optional, from 0.4) | `wrangler deploy --env staging` with separate D1 and R2 names | Test data only |
| Production | `pnpm deploy` or the deploy button; Workers Builds on push to `main` once connected | Merchant data; backed up before migrations |

Secrets are set with `wrangler secret put` or in the Cloudflare dashboard, never in files. Backups: `wrangler d1 export` on a schedule the merchant controls, R2 bucket copy, and the EmDash backup guide for CMS content; restore is rehearsed in 0.4 before the deploy button is advertised as production-ready.

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| EmDash API changes quickly after 1.0 | Build breaks on upgrade | Pin exact versions, upgrade in dedicated pull requests with changelog review, keep CI green |
| First visitor after deploy can claim admin | Store takeover | Complete the wizard immediately; document it; evaluate a setup token or Cloudflare Access in 0.4 |
| D1 lacks interactive transactions | Oversell or partial orders | Single batch per checkout with conditional updates; concurrency test |
| Worker bundle size limit | Deploy refused | Measure at first deploy; code-split admin and storefront; lazy-load heavy admin components |
| Images binding or free-tier transformation limit (5,000 per month) | Broken or costly images | Verify at first deploy; rely on EmDash media endpoint; document limits |
| Passkey-only login unfamiliar to merchants | Lockout, support load | Document passkeys with screenshots; enable magic link when email is configured |
| Two admin surfaces | Confusing navigation | Cross-link; integrate navigation via native plugin in 0.6 |
| Registry propagation delays for fresh Astro releases | Flaky installs | Committed lockfile; frozen installs in CI |
| Deploy button needs a public repository and `.env.example` | Button fails silently | Keep both from 0.1; test from a clean account in 0.4 |
| Scope creep toward payments or SaaS | Core never stabilises | Milestone gating; non-goals in the PRD |

## 9. Decisions needed from the owner

1. License: MIT (recommended) or Apache-2.0.
2. GitHub organisation and repository name; confirm it will be public.
3. Worker, D1 and R2 names (proposed `cartde`, `cartde-db`, `cartde-media`).
4. Permission to deploy the 0.1 baseline to the currently logged-in Cloudflare account, and the production hostname if any.
5. Product descriptions: Markdown (recommended for 0.2) or EmDash Portable Text.
6. Delivery charge model for 0.3: inside and outside Dhaka zones (recommended) or a single flat charge.
7. Default locale for the first release: `en-BD` with Bengali in 0.6 (recommended), or Bengali first.
