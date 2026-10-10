# Contributing to CartDE

Thank you for considering a contribution.

## Ground rules

- Read [docs/SRS.md](docs/SRS.md) and [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) before proposing a feature. Work is organised by milestone, and features outside the current milestone are usually deferred.
- Keep pull requests focused on one change.
- Every behaviour change needs a test where one is practical, and a documentation update in the same pull request.
- Do not commit secrets, `.env` files, or real merchant or customer data.
- Only state in documentation what is implemented. Mark planned work as planned.

## Development

See [docs/development.md](docs/development.md).

## Checks before opening a pull request

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

CI runs these checks plus a Wrangler dry-run on every pull request.

## Licence of contributions

By contributing you agree that your contribution is licensed under the MIT License in [LICENSE](LICENSE).
