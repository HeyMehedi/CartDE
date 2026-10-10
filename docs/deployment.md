# Deployment

Status: baseline deployed on 2026-10-10 to `https://cartde.heymehedi.workers.dev` (Cloudflare account "Mehedi").

| Check | Result |
| --- | --- |
| `wrangler deploy` | Passed. Auto-provisioned KV `cartde-session`, D1 `cartde-db`, R2 `cartde-media`. Worker startup 26 ms. |
| Secrets | `EMDASH_ENCRYPTION_KEY` and `EMDASH_SITE_URL` set with `wrangler secret put`. |
| `/` and `/posts` | HTTP 200. The very first request took about 45 s (database initialisation); later requests about 1 s. |
| `/_emdash/admin` | Redirects to `/_emdash/admin/setup`; setup wizard not yet completed. |
| Not yet verified | Passkey setup, media upload, image rendering through the Images binding, CPU time per request. |

## Resources

| Resource | Name | Created by |
| --- | --- | --- |
| Worker | `cartde` | `wrangler deploy` |
| D1 database | `cartde-db` (binding `DB`) | First `wrangler deploy` (auto-provisioned) |
| R2 bucket | `cartde-media` (binding `MEDIA`) | First `wrangler deploy` (auto-provisioned) |
| KV namespace (sessions) | `cartde-session` | Added by the Astro adapter on deploy |

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

## Free plan fit (to verify)

Checked against the Cloudflare Workers limits page (updated 2026-10-08):

| Limit | Workers Free |
| --- | --- |
| Script size | 64 MiB uncompressed (compressed size not limited) |
| CPU time per request | 10 ms |
| Requests per day | 100,000 |
| Subrequests per request | 50 |

The 0.6 build uploads 18,462 KiB uncompressed (4,751 KiB gzipped, measured by `wrangler deploy --dry-run` on 2026-10-10), which is within the script size limit. The 10 ms CPU limit is not yet measured for the storefront. Measuring it on a deployed baseline is an open task in the Development Plan.

D1, R2 and Images free-tier limits are not yet recorded here. Record them with their check date before any free hosting claim is published.

## Backups

Merchant data lives in three places. Back up all three.

| What | How |
| --- | --- |
| Orders, products, customers, EmDash content and users (D1) | `pnpm db:export` writes `backups/cartde-<timestamp>.sql` using `wrangler d1 export`. The `backups/` directory is git-ignored because it contains customer data. |
| Uploaded images (R2 bucket `cartde-media`) | Copy the bucket with `rclone` or `wrangler r2 object get`, or enable another copy in the Cloudflare dashboard. |
| `EMDASH_ENCRYPTION_KEY` | Keep a copy in a password manager. |

EmDash also has its own site export; see its backup guide at https://docs.emdashcms.com/guides/backups/. Take a D1 export **before every deploy that adds a migration**.

## Restore

Rehearse this on a scratch Cloudflare database before you need it.

```bash
pnpm wrangler d1 create cartde-restore-test
pnpm wrangler d1 execute cartde-restore-test --remote --file backups/cartde-<timestamp>.sql
```

To restore production, point `wrangler.jsonc` at the restored database (or empty the existing one), then redeploy. Restore the R2 objects into the bucket with the same keys, because product images reference EmDash media IDs.

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
- CPU time per request against the free-plan limit.
- A rehearsed restore from a `db:export` file.
- Behaviour of the 0.2 to 0.6 code on the deployed Worker. The deployed baseline is still the 0.1 code, and the remote database does not yet have the commerce migrations (`pnpm deploy` applies them).
