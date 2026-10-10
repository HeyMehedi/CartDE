# Deployment

Status: baseline deployed on 2026-10-10 to `https://cartde.heymehedi.workers.dev` (Cloudflare account "Mehedi").

| Check | Result |
| --- | --- |
| `wrangler deploy` | Passed. Auto-provisioned KV `cartde-session`, D1 `cartde-db`, R2 `cartde-media`. Worker startup 26 ms. |
| Secrets | `EMDASH_ENCRYPTION_KEY` and `EMDASH_SITE_URL` set with `wrangler secret put`. |
| `/` and `/posts` | HTTP 200. The very first request took about 45 s (database initialisation); later requests about 1 s. |
| `/_emdash/admin` | Redirects to `/_emdash/admin/setup`; setup wizard not yet completed. |
| Not yet verified | Passkey setup, media upload, image rendering through the Images binding, CPU time per request. |

### Deploy of milestones 0.2 to 0.6 (2026-10-10)

| Step | Result |
| --- | --- |
| Restore point | `wrangler d1 time-travel info DB` bookmark `00000012-0000000e-00005100-c690e5531c6210c8bfbe3bc388a3c4ad` taken before migrating |
| `pnpm deploy` | Applied migrations 0001 to 0004 to the remote D1 (19 `cartde_*` tables), built, deployed. Worker startup 23 ms. Upload 18,462 KiB (4,751 KiB gzip) |
| Storefront (`/`, `/products`, `/cart`, `/checkout`, `/search`) | HTTP 503 "This store is not open yet" until `/setup` is completed, as designed. Repeated 4 times, consistent |
| Admin pages and `/setup` | 302 to the EmDash login |
| `/api/cartde/admin/*`, plugin routes | 401 without a session. Public checkout without the CSRF header: 403 |
| EmDash wizard | `needsSetup:false`, so an administrator account exists |
| Not done | CartDE `/setup` (needs the administrator), any authenticated check, CPU time measurement |

### Redeploy after the requirements audit (2026-10-10)

| Step | Result |
| --- | --- |
| Restore point | Bookmark `00000015-0000000e-00005100-b49a8ec34c85e0abb3c815aea38ace5e` |
| `pnpm deploy` | No new migrations. Rate-limit bindings accepted by Cloudflare on this account |
| Storefront, admin, `/setup` | 503 not-ready page; 302 to login; unchanged |
| New endpoints (CSV export and import, EmDash sidebar page route) | 401 without a session |
| `/sitemap.xml`, `/sitemap-products.xml`, `/robots.txt` | 200; product sitemap listed in the index; CartDE paths disallowed |
| Cross-site form post to `/checkout` | 403 |

## Resources

| Resource | Name | Created by |
| --- | --- | --- |
| Worker | `cartde` | `wrangler deploy` |
| D1 database | `cartde-db` (binding `DB`) | First `wrangler deploy` (auto-provisioned) |
| R2 bucket | `cartde-media` (binding `MEDIA`) | First `wrangler deploy` (auto-provisioned) |
| KV namespace (sessions) | `cartde-session` | Added by the Astro adapter on deploy |
| Rate limits | `CHECKOUT_IP_LIMITER` (60/min per IP), `CHECKOUT_PHONE_LIMITER` (5/min per phone) | Declared in `wrangler.jsonc`. Limits apply per Cloudflare location and are approximate; the docs do not say whether the binding is on the Free plan, so confirm on first deploy |

## Deploy with the button

Once the repository is public, this button copies it to the visitor's GitHub account and deploys it to their Cloudflare account. It prompts for the secrets listed in `.env.example`.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/HeyMehedi/CartDE)

The button works only after `HeyMehedi/CartDE` is public, and it has not been tested from a clean Cloudflare account (see "Not yet verified" below). The build command must apply migrations: set the deploy command to `pnpm deploy` (see "How migrations run").

## Deploy from your machine

```bash
pnpm install --frozen-lockfile
pnpm wrangler login
pnpm deploy          # applies commerce migrations to the remote D1, builds, deploys
```

The first request after a fresh deploy can take about 45 seconds while EmDash initialises its tables.

### Secrets

Set with Wrangler or the Cloudflare dashboard. Never put them in `wrangler.jsonc` or in git.

```bash
pnpm wrangler secret put EMDASH_ENCRYPTION_KEY   # generate one: openssl rand -base64 32
pnpm wrangler secret put EMDASH_SITE_URL         # https://your-domain, no trailing slash
```

- `EMDASH_ENCRYPTION_KEY` encrypts plugin secret settings. Store a copy somewhere other than your database backups; losing it makes those settings unreadable.
- `EMDASH_SITE_URL` must be the public HTTPS origin. Passkeys only work on the hostname where they were registered, so set it before creating the first administrator and update it (and re-register passkeys) if you change domain.

### How migrations run

CartDE's tables are created by numbered files in `migrations/`, tracked by Wrangler in its own `d1_migrations` table. EmDash's own tables are migrated by EmDash. `pnpm deploy` runs `wrangler d1 migrations apply DB --remote` before `wrangler deploy`, and the command is safe to repeat. If the Worker runs before migrations, the storefront shows "store not ready" and `/setup` explains how to apply them.

## First-run setup (do this immediately)

1. Open `/_emdash/admin`. EmDash's wizard creates the first administrator with a passkey.
2. You are then taken to `/setup` (CartDE): store name, currency, time zone, contact details, delivery charges, optional demo products. Until this step is saved, shoppers see a "store not ready" page and `/admin` redirects to `/setup`.

**Security window.** From the first deploy until the EmDash wizard is finished, whoever opens the admin URL first can become the administrator. Complete the wizard right after deploying, or put the site behind Cloudflare Access until you have. If you suspect someone else got there first, delete the D1 database and R2 bucket and redeploy.

`/setup` requires an administrator, is safe to run again, and records `setup_completed_at` only the first time. Demo products are added only if you tick the box and the catalogue is empty. Nothing in CartDE can reset or reseed a store.

## Free plan fit (limits checked 2026-10-10; CPU time not yet measured)

Figures below were read from Cloudflare's documentation on 2026-10-10. They change; re-check before relying on them.

| Service | Free allowance | Source |
| --- | --- | --- |
| Workers requests | 100,000 per day (resets midnight UTC) | https://developers.cloudflare.com/workers/platform/limits/ |
| Workers CPU time | 10 ms per HTTP request | same |
| Workers subrequests | 50 per request | same |
| Worker size | 64 MiB uncompressed, no compressed limit. CartDE 0.6 is 18.0 MiB (4.6 MiB gzip) | same |
| D1 rows read / written | 5 million / 100,000 per day | https://developers.cloudflare.com/d1/platform/pricing/ |
| D1 storage | 5 GB total across the account | same |
| R2 | 10 GB-month storage, 1 million Class A and 10 million Class B operations per month, free egress | https://developers.cloudflare.com/r2/pricing/ |
| Images transformations | 5,000 unique per month. The docs do not say outright whether the Images *binding* counts against this; assume it does | https://developers.cloudflare.com/images/pricing/ |

**What this means for a shop.** Storage and request volumes in these tables suit a small store. The open risk is the **10 ms CPU limit**: EmDash, server rendering and the checkout batch all run in the Worker, and a request that exceeds the limit fails. I have not measured CPU time per request on the deployed Worker (wall-clock times of 0.4 to 1 s include network and database latency and say nothing about CPU). Until it is measured with `wrangler tail` or the Workers dashboard under real traffic, the README makes no "free hosting" claim, and the supported assumption is the **Workers Paid plan** (also needed for sandboxed plugins).

D1 write limits matter at checkout: each order writes roughly 12 to 20 rows (stock updates, order, items, events, customer), so the 100,000 daily write limit allows on the order of 5,000 orders a day before other writes.

## Backups and restore

Merchant data lives in three places. Back up all three.

| What | How |
| --- | --- |
| Orders, products, customers, EmDash content and users (D1) | **D1 Time Travel** point-in-time restore, plus EmDash's own site export (see below) |
| Uploaded images (R2 bucket `cartde-media`) | Copy the bucket with `rclone`, or enable another copy in the Cloudflare dashboard |
| `EMDASH_ENCRYPTION_KEY` | Keep a copy in a password manager |

**`wrangler d1 export` does not work on this database.** EmDash creates FTS5 search tables, and D1 refuses to export databases with virtual tables ("cannot export databases with virtual tables (like FTS5)"; seen on 2026-10-10). Use Time Travel instead:

```bash
pnpm db:bookmark                                   # note the bookmark before every deploy that adds a migration
pnpm wrangler d1 time-travel restore DB --bookmark=<bookmark>   # roll the database back to that moment
```

Time Travel retention depends on your Cloudflare plan; check the current figure at https://developers.cloudflare.com/d1/reference/time-travel/. It is a restore point inside Cloudflare, not a file you hold, so also use EmDash's site export for a copy you control (https://docs.emdashcms.com/guides/backups/). That export has not been tried against CartDE's tables: confirm that your `cartde_*` data is included before relying on it.

A restore to a bookmark rolls back everything after it, including orders placed since. Rehearse on a scratch database first.

## Redeploying without losing data

`pnpm deploy` never deletes data: migrations are forward-only and additive, Wrangler skips migrations it has already applied, and the Worker, D1 and R2 names in `wrangler.jsonc` do not change. Do not rename `cartde-db` or `cartde-media` on a live store.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Storefront shows "This store is not open yet" | Setup not finished. Sign in and complete `/setup`. |
| `/setup` says tables are missing | Run `pnpm deploy` (production) or `pnpm db:migrate` (local). |
| Passkey sign-in fails after a domain change | `EMDASH_SITE_URL` or the hostname changed. Restore the old hostname or re-register a passkey. |
| Admin API returns 403 "Cross-site request refused" | The request lacked `X-CartDE-Request: 1` or came from another origin. Use the dashboard, or send the header from the same origin. |
| Checkout says an item is out of stock | Stock changed after the cart loaded. The shopper reviews the cart; no stock was taken. |
| Deploy fails with a registry error on a fresh Astro release | Re-run; keep the lockfile committed and use `--frozen-lockfile`. |

## Not yet verified

- Deploy button from a clean Cloudflare account and a fresh GitHub fork.
- Passkey setup, media upload and image rendering through the Images binding on the deployed Worker.
- CPU time per request against the 10 ms free-plan limit.
- A rehearsed Time Travel restore, and EmDash's site export including `cartde_*` tables.
- Behaviour of the 0.2 to 0.6 code on the deployed Worker. The deployed baseline is still the 0.1 code, and the remote database does not yet have the commerce migrations (`pnpm deploy` applies them).
