# CartDE

Open-source commerce. Your store. Your infrastructure. AI-ready.

CartDE (Cart Digital Engine) is an open-source online store that you deploy to your own Cloudflare account. It is built on [EmDash CMS](https://github.com/emdash-cms/emdash), Astro, Cloudflare Workers, D1 and R2.

## Status

| Area | Status |
| --- | --- |
| Foundation: EmDash 1.2.0 on Astro, Workers, D1, R2 | Implemented. Deployed to Cloudflare on 2026-10-10 (0.1 baseline, then 0.2 to 0.6 the same day). |
| Admin login and media library (from EmDash) | Available locally through the EmDash admin. Not yet verified end to end in this repository. |
| Product catalogue: products, variants, categories, stock, store settings, admin pages and API (`/admin`) | Partial (milestone 0.2). Domain, database and API are covered by automated tests; the admin pages are not yet browser-tested. |
| Storefront: home, product list (24 per page, category filter), product page with variant selector and Product JSON-LD, cart, cash-on-delivery checkout, order confirmation | Partial (milestone 0.3). Server logic is covered by automated tests and an HTTP smoke run; the browser screens have not been exercised in a real browser. |
| Orders: placement with atomic stock decrement, idempotent retries, status workflow with stock restore, customers, printable summary | Partial (milestone 0.3). Same verification as above. |
| First-run store setup (`/setup`), store-not-ready page, Time Travel restore-point script, deployment and recovery guide | Implemented in code and tests (milestone 0.4). The deploy button and a clean-account install are untested. |
| AI tools through MCP (9 tools), activity log | Partial (milestone 0.5). Logic, permissions and audit are covered by tests; not yet tried with a live MCP client. See [docs/ai-tools.md](docs/ai-tools.md). |
| Themes (2 presets, validated settings, homepage sections, footer), extension hooks with a sample, Bengali storefront, product search | Partial (milestone 0.6). Server logic and storefront verified by tests and an HTTP run; the admin theme/extension screens are not yet used in a browser. See [docs/extensions.md](docs/extensions.md). |
| Online payment gateways, courier and messaging integrations | Not planned for the initial releases |

Rows marked Partial or Planned are not finished. See [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) for the milestone plan.

## Deploy

See [docs/deployment.md](docs/deployment.md) for the deploy button, secrets, first-run setup, backups, restore and troubleshooting.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/HeyMehedi/CartDE)

(The button works once the repository is public.)

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
| `pnpm db:migrate` | Apply CartDE migrations to the local database |
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
