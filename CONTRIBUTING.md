# Contributing

## Web E2E Policy

Use this policy for all `apps/web` changes before opening a PR.

1. Run lint/static checks:
   - `npm run ultracite:check`
2. Run fast Web E2E smoke suite:
   - `npm run test:web:e2e:smoke`
3. If UI changed, run visual smoke:
   - `npm run test:web:visual`
4. If visual change is intentional, update baselines:
   - `npm run test:web:visual:update`
   - `npm run test:web:visual`

CI model:
- PR: smoke is required, visual runs conditionally for `apps/web/e2e/**` changes.
- Daily: smoke E2E.
- Weekly: full E2E.
- Nightly: visual smoke.

Detailed runbook:
- `docs/ops/web-e2e-ci-runbook.md`
