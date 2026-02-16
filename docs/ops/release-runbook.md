# Release Runbook

This runbook is the operational path for production release execution.

Canonical references:
- `docs/ops/release-checklist.md`
- `docs/ops/deploy.md`
- `docs/ops/rollback-playbook.md`

## 1. Preflight (must pass before rollout)

1. Validate required release environment variables in the target environment:
   - `npm run release:preflight:env`
   - Optional JSON output: `npm run release:preflight:env:json`
2. Run quality + security + smoke gates from the release checklist.
   - Run web test suite: `npm run test:web`
   - For API pre-release verification with Postgres/Redis bootstrap: `npm run test:api -- --runInBand`
   - If services are already running manually: `npm run test:api:skip-deps -- --runInBand`
3. Complete staging dry-run and attach smoke artifacts.

## 2. Rollout sequence

1. Announce release start.
2. Deploy API artifact.
3. Run DB migrations (if any).
4. Deploy Web artifact.
5. Execute production smoke checks (`/health`, `/ready`, critical UI/API flows).

## 3. Post-release verification

1. Generate and validate health report:
   - `npm run release:health:report`
   - `npm run release:health:schema:check`
2. Confirm alerts, latency, and error rates are within thresholds.
3. Record outcome in release log.

## 4. Rollback quick path

If rollback triggers are met, execute:
1. Freeze deployments.
2. Roll back Web to previous stable artifact.
3. Roll back API to previous stable artifact.
4. Roll back DB only when DB owner approves reversibility.
5. Re-run smoke checks and confirm recovery.

For full trigger thresholds and decision tree, follow `docs/ops/rollback-playbook.md`.
