# Architecture

Status: foundation only. Commerce modules are planned. The full specification is in [SRS.md](SRS.md), section 3.

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
| `wrangler.jsonc` | Worker name, D1 database, R2 bucket, cron trigger |

## Route ownership

- `/_emdash/*`: EmDash admin, authentication, media, REST and MCP endpoints.
- All other routes: CartDE and EmDash content pages.

Planned CartDE routes (`/admin/*`, `/api/cartde/*`, storefront routes) are listed in [SRS.md](SRS.md), section 3.2.

## Reuse versus build

EmDash supplies the admin shell, authentication, media library, content pages, site settings and MCP server. CartDE will build products, inventory, cart, checkout and orders in its own `cartde_*` D1 tables. EmDash plugin storage is document and key-value only, so commerce data does not go there.
