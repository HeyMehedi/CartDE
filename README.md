# CartDE

Open-source commerce. Your store. Your infrastructure. AI-ready.

CartDE (Cart Digital Engine) is an open-source online store that you deploy to your own Cloudflare account. It is built on [EmDash CMS](https://github.com/emdash-cms/emdash), Astro, Cloudflare Workers, D1 and R2.

## Status

| Area | Status |
| --- | --- |
| Foundation: EmDash 1.2.0 on Astro, Workers, D1, R2 | Implemented. Deployed to Cloudflare on 2026-10-10 and open. Needs the Workers Paid plan for reliable CPU headroom (measured; see docs/deployment.md). |
| Admin login and media library (from EmDash) | Verified: browser tests upload media locally; the owner signed in with a passkey on production. CartDE also appears in EmDash's sidebar. |
| Product catalogue: products, variants, categories, stock, store settings, admin pages and API (`/admin`) | Implemented (0.2). Unit tests plus browser tests that create, preview and publish a product with variants and an image. |
| Storefront: home, product list (24 per page, category filter), product page with variant selector and Product JSON-LD, cart, cash-on-delivery checkout, order confirmation | Implemented (0.3). Browser tests order from an emulated 360 px phone, with and without JavaScript. Not yet tried on a physical phone. |
| Orders: placement with atomic stock decrement, idempotent retries, status workflow with stock restore, customers, printable summary | Implemented (0.3). Browser tests manage an order to Delivered and cancel one (stock restored); a parallel-checkout test proves the last unit sells once. |
| First-run store setup (`/setup`), store-not-ready page, Time Travel restore-point script, deployment and recovery guide | Implemented in code and tests (milestone 0.4). The deploy button and a clean-account install are untested. |
| AI tools through MCP (9 tools), activity log | Implemented (0.5). Tested with a real MCP request flow and personal access token, including scope refusal. See [docs/ai-tools.md](docs/ai-tools.md). |
| Themes (2 presets, validated settings, homepage sections, footer), extension hooks with a sample, Bengali storefront, product search | Implemented (0.6). Browser tests switch preset, enable the sample extension and the Bengali storefront. Bengali text awaits a native speaker's review. See [docs/extensions.md](docs/extensions.md). |
| Online payment gateways, courier and messaging integrations | Not planned for the initial releases |

Rows marked Partial or Planned are not finished. See [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) for the milestone plan.

## Deploy

See [docs/deployment.md](docs/deployment.md) for the deploy button, secrets, first-run setup, backups, restore and troubleshooting.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/HeyMehedi/CartDE)

The repository is public at https://github.com/HeyMehedi/CartDE. The button has not yet been tried from a clean Cloudflare account; if it fails, use the manual steps in the deployment guide.

## Local development

Requirements: Node.js 22.16 or newer and pnpm 11.

```bash
pnpm install
pnpm dev
```

Run `pnpm db:migrate` once, then open http://localhost:4321/_emdash/admin and complete the setup wizard to create the first administrator. You are then sent to `/setup` to configure the store.

The scaffold creates `.env` with a generated `EMDASH_ENCRYPTION_KEY` for local use. If `.env` is missing, copy `.env.example` to `.env` and set that key. `.env` is ignored by git.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local development server |
| `pnpm typecheck` | Astro type checking |
| `pnpm test` | Unit and database tests (Vitest) |
| `pnpm lint` / `pnpm format` | ESLint / Prettier (CI runs `lint` and `format:check`) |
| `pnpm test:e2e` | Playwright journeys and accessibility checks against `pnpm dev` (start it first) |
| `pnpm db:migrate` | Apply CartDE migrations to the local database |
| `pnpm db:export` | Export the commerce tables to `backups/` (restore rehearsed) |
| `pnpm db:bookmark` | Print the remote database's current Time Travel restore point |
| `pnpm build` | Production build |
| `pnpm deploy` | Apply migrations to the remote database, build and deploy (requires `wrangler login`) |

## Documentation

- [docs/PRD.md](docs/PRD.md): product requirements
- [docs/SRS.md](docs/SRS.md): software requirements and data model
- [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md): milestones and decisions
- [docs/extensions.md](docs/extensions.md): themes, languages, search and the extension API
- [docs/ai-tools.md](docs/ai-tools.md): connecting AI clients and the tool safety design
- [docs/architecture.md](docs/architecture.md), [docs/development.md](docs/development.md), [docs/deployment.md](docs/deployment.md)

## License

MIT. See [LICENSE](LICENSE).
