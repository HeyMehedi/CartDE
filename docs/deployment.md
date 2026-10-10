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

### Redeploy with end-to-end fixes (2026-10-10, live store)

| Step | Result |
| --- | --- |
| Before deploying | Time Travel bookmark `00000023-00000000-00005100-22b001d85f7f5d52d9e925389eb85348`; commerce export saved locally to the git-ignored `backups/` |
| `pnpm deploy` | No new migrations; version `1c29fc3a-2423-47ea-8033-348bc95db7cc` |
| Storefront (`/`, `/products`, `/cart`, `/checkout`, `/search`) | 200 (the store is set up and open) |
| Admin, setup, admin APIs, plugin route | 302 to login / 401 |
| EmDash dev bypass | 403 (development only) |

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
pnpm exec emdash secrets generate                # prints emdash_enc_v1_…; paste it into the next command
pnpm wrangler secret put EMDASH_ENCRYPTION_KEY
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

`/setup` requires an administrator, is safe to run again, and records `setup_completed_at` only the first time.

**Setup token: evaluated, not built (plan 0.4).** A CartDE token cannot close the window, because the first administrator is created by EmDash's own wizard, before any CartDE code is involved, and EmDash 1.2 has no hook to gate it. The supported options are: complete the wizard immediately after deploying (done on this site on 2026-10-10), or protect `/_emdash/*` with Cloudflare Access until you have (see "Cloudflare Access" in the EmDash authentication guide). The development-only sign-in bypass is refused in production (`403`, checked 2026-10-10). Demo products are added only if you tick the box and the catalogue is empty. Nothing in CartDE can reset or reseed a store.

## Free plan fit (limits checked and CPU measured 2026-10-10)

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

### Measured CPU time on the deployed Worker

Measured with `wrangler tail --format json` on 2026-10-10 against https://cartde.heymehedi.workers.dev: 6 GET requests per path from one client, a store with no products yet. `cpuTime` and `wallTime` are Cloudflare's own figures for each invocation.

| Path | CPU median | CPU max | Wall time median |
| --- | --- | --- | --- |
| `/` (home: settings, menus, posts, products, theme, extensions) | 16 ms | 108 ms (cold start) | 302 ms |
| `/products` | 14 ms | 64 ms | 187 ms |
| `/posts` (EmDash) | 13 ms | 32 ms | 145 ms |
| `/checkout` | 11 ms | 17 ms | 114 ms |
| `/cart` | 10 ms | 22 ms | 68 ms |
| `/search?q=tee` | 9 ms | 38 ms | 118 ms |
| `/nope` (404) | 8 ms | 21 ms | 122 ms |
| `/sitemap-products.xml` | 4 ms | 7 ms | 57 ms |
| `/robots.txt` | 3 ms | 30 ms | 58 ms |
| Cron (EmDash maintenance, every minute) | 14 ms | 14 ms | 297 ms |

**Conclusion: CartDE does not fit the Workers Free plan's 10 ms CPU limit.** Most page renders take 10 to 16 ms of CPU at the median, and cold starts reach 108 ms. Every request above completed with outcome `ok`, but a Free-plan Worker that exceeds its CPU limit can be stopped with an error, so a shop should not rely on it. **Run CartDE on the Workers Paid plan** (30 s default CPU limit). The Free plan remains fine for trying it out.

This contradicts PRD §7 ("Runs on the Cloudflare Workers free plan by default") and SRS NFR-10; see docs/traceability.md. Most of the CPU is EmDash's runtime (`/posts`, which runs no CartDE code, costs 13 ms), so the fix is not in CartDE alone.

**Server time (SRS NFR-5, target under 200 ms at p95).** After the home page's database reads were made parallel (redeploy of 2026-10-10), 10 requests each measured: home 174 ms median, 463 ms p95; `/products` 126 ms median, 368 ms p95 (CPU medians 16 ms and 9 ms). The median is now under 200 ms; the p95 is not, mostly because of cold starts. Wall time includes waiting for D1. Caching the storefront with Astro's route cache (or Workers Cache) is the next step for the p95. A load test with 1,000 products has not been done.

**D1 writes.** Each order writes roughly 12 to 20 rows (stock updates, order, items, events, customer), so the Free plan's 100,000 daily writes allow on the order of 5,000 orders a day before other writes.

## Backups and restore

Merchant data lives in four places. Back up all of them.

| What | How | Verified |
| --- | --- | --- |
| Commerce data: products, orders, customers, stock, settings (`cartde_*` tables in D1) | `pnpm db:export` writes `backups/cartde-remote-<time>.sql` (git-ignored, contains customer data) | Restore rehearsed 2026-10-10: export, fresh database, migrations, apply file; every row count and the order counter matched |
| Whole database, point in time (commerce and EmDash) | D1 Time Travel: `pnpm db:bookmark` before risky changes; `pnpm wrangler d1 time-travel restore DB --bookmark=<id>` | Rehearsed 2026-10-10 on a scratch database: damaged data was fully restored |
| EmDash content, pages, media records, menus, users | `pnpm exec emdash site export --url https://your-site --output site.emdash` | Export ran 2026-10-10. It does **not** include CartDE's tables, which is why `db:export` exists |
| Uploaded images (R2 bucket `cartde-media`) | Copy the bucket with `rclone`, or enable another copy in the Cloudflare dashboard | Not rehearsed |
| `EMDASH_ENCRYPTION_KEY` | Keep a copy in a password manager | n/a |

**Why not one `wrangler d1 export`?** D1 refuses to export a database that contains virtual tables ("cannot export databases with virtual tables (like FTS5)"), and EmDash creates FTS5 search tables. Exporting named tables works, which is what `db:export` does.

### Restore commerce data from an export

```bash
pnpm wrangler d1 create cartde-db-restored          # or empty the existing database
# point wrangler.jsonc's DB binding at it, then:
pnpm wrangler d1 migrations apply DB --remote       # creates the cartde_* tables
pnpm wrangler d1 execute DB --remote --file backups/cartde-remote-<time>.sql
```

The export starts with `DELETE FROM cartde_counters` so the order counter is restored instead of colliding with the value the first migration seeds. Restore EmDash content with `emdash site import` into an empty site, and R2 objects into the bucket with the same keys (product images reference EmDash media IDs).

### Roll back with Time Travel

```bash
pnpm db:bookmark                                                     # note the bookmark first
pnpm wrangler d1 time-travel restore DB --bookmark=<bookmark>
```

This rolls back everything after the bookmark, including orders placed since; Wrangler prints an undo bookmark. Retention depends on your plan: https://developers.cloudflare.com/d1/reference/time-travel/.

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

- The deploy button from a clean Cloudflare account and a fresh GitHub fork: the repository is not public yet.
- Product images served through the Images binding on the deployed Worker (media upload and product images were verified locally by the end-to-end tests).
- Copying the R2 bucket.
- A load test with 1,000 products (SRS NFR-5).
