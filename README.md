# CartDE

Open-source commerce. Your store. Your infrastructure. AI-ready.

CartDE (Cart Digital Engine) is an open-source online store that you deploy to your own Cloudflare account. It is built on [EmDash CMS](https://github.com/emdash-cms/emdash), Astro, Cloudflare Workers, D1 and R2.

## Status

| Area | Status |
| --- | --- |
| Foundation: EmDash 1.2.0 on Astro, Workers, D1, R2 | Implemented. Baseline deployed to Cloudflare on 2026-10-10. |
| Admin login and media library (from EmDash) | Available locally through the EmDash admin. Not yet verified end to end in this repository. |
| Product catalogue: products, variants, categories, stock, store settings, admin pages and API (`/admin`) | Partial (milestone 0.2). Domain, database and API are covered by automated tests; the admin pages are not yet browser-tested. |
| Minimal storefront read path (`/products`, `/products/[slug]`) | Partial (milestone 0.2). Theme, cart, cash-on-delivery checkout and orders are planned (0.3). |
| One-click deployment and first-run store setup | Planned (milestone 0.4) |
| AI tools through MCP | Planned (milestone 0.5) |
| Themes and extensions | Planned (milestone 0.6) |
| Online payment gateways, courier and messaging integrations | Not planned for the initial releases |

Nothing in the planned rows exists yet. See [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) for the milestone plan.

## Local development

Requirements: Node.js 22.16 or newer and pnpm 11.

```bash
pnpm install
pnpm dev
```

Open http://localhost:4321/_emdash/admin and complete the setup wizard to create the first administrator.

The scaffold creates `.env` with a generated `EMDASH_ENCRYPTION_KEY` for local use. If `.env` is missing, copy `.env.example` to `.env` and set that key. `.env` is ignored by git.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local development server |
| `pnpm typecheck` | Astro type checking |
| `pnpm build` | Production build |
| `pnpm deploy` | Build and deploy to Cloudflare (requires `wrangler login`) |

## Documentation

- [docs/PRD.md](docs/PRD.md): product requirements
- [docs/SRS.md](docs/SRS.md): software requirements and data model
- [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md): milestones and decisions
- [docs/architecture.md](docs/architecture.md), [docs/development.md](docs/development.md), [docs/deployment.md](docs/deployment.md)

## License

MIT. See [LICENSE](LICENSE).
