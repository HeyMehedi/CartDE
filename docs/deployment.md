# Deployment

Status: not yet deployed. The steps below are the plan for milestone 0.1 and have not been run against a Cloudflare account.

## Resources

| Resource | Name | Created by |
| --- | --- | --- |
| Worker | `cartde` | `wrangler deploy` |
| D1 database | `cartde-db` (binding `DB`) | First `wrangler deploy` if missing |
| R2 bucket | `cartde-media` (binding `MEDIA`) | First `wrangler deploy` if missing |
| KV namespace (sessions) | Added by the Astro adapter | Wrangler on deploy, to verify |

## Secrets

Set with Wrangler. Never put them in `wrangler.jsonc` or in git.

```bash
pnpm wrangler secret put EMDASH_ENCRYPTION_KEY
pnpm wrangler secret put EMDASH_SITE_URL
```

`EMDASH_ENCRYPTION_KEY` encrypts plugin secret settings. Keep a copy outside the database backups; losing it makes those settings unreadable.

`EMDASH_SITE_URL` must be the public HTTPS origin. Passkeys only work on the hostname where they were registered.

## Steps

```bash
pnpm wrangler login
pnpm build
pnpm deploy
```

After the first deploy, open the Worker URL and complete the EmDash setup wizard immediately. Until the wizard is complete, the first visitor can become administrator.

## Free plan fit (to verify)

Checked against the Cloudflare Workers limits page (updated 2026-10-08):

| Limit | Workers Free |
| --- | --- |
| Script size | 64 MiB uncompressed (compressed size not limited) |
| CPU time per request | 10 ms |
| Requests per day | 100,000 |
| Subrequests per request | 50 |

The current build uploads about 18 MB uncompressed, which is within the script size limit. The 10 ms CPU limit is not yet measured for the storefront. Measuring it on a deployed baseline is an open task in the Development Plan.

D1, R2 and Images free-tier limits are not yet recorded here. Record them with their check date before any free hosting claim is published.

## Backups and recovery

To be documented in milestone 0.4: D1 export, R2 copy, EmDash backup guide, and a rehearsed restore.
