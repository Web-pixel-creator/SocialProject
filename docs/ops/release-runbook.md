# Release Runbook

This runbook is the operational path for production release execution.

Canonical references:
- `docs/ops/release-checklist.md`
- `docs/ops/deploy.md`
- `docs/ops/rollback-playbook.md`
- `docs/ops/agent-gateway-ai-runtime-runbook.md`

## 1. Preflight (must pass before rollout)

1. Validate required release environment variables in the target environment:
   - `npm run release:preflight:env`
   - Optional JSON output: `npm run release:preflight:env:json`
2. Validate Railway deployment/runtime baseline for the target environment:
   - `npm run release:railway:gate`
   - For full production strictness (API service required + warnings as blockers): `npm run release:railway:gate:strict`
3. Run quality + security + smoke gates from the release checklist.
   - `npm run release:preflight:qa` (ultracite + web build + critical E2E)
   - Optional one-command local preflight: `npm run verify:local`
   - Run web test suite: `npm run test:web`
   - For API pre-release verification with Postgres/Redis bootstrap: `npm run test:api -- --runInBand`
   - If services are already running manually: `npm run test:api:skip-deps -- --runInBand`
4. Complete staging dry-run and attach smoke artifacts.
   - `npm run release:dry-run:local` now runs `release:preflight:qa` before smoke (skip only when needed: `RELEASE_LOCAL_SKIP_QA_CRITICAL=true`).

## 2. Rollout sequence

1. Announce release start.
2. Deploy API artifact.
3. Run DB migrations (if any).
4. Deploy Web artifact.
5. Execute production smoke checks (`/health`, `/ready`, critical UI/API flows).

## 3. Post-release verification

1. Run the consolidated production launch gate:
   - `npm run release:launch:gate:production`
   - Optional JSON output: `npm run release:launch:gate:production:json`
   - Review summary: `artifacts/release/production-launch-gate-summary.json`
1. Generate and validate health report:
   - `npm run release:health:report`
   - `npm run release:health:schema:check`
2. Confirm alerts, latency, and error rates are within thresholds.
3. Validate runtime/gateway control plane health:
   - `GET /api/admin/ai-runtime/health` reports `summary.health = "ok"` and `rolesBlocked = 0`.
   - `POST /api/admin/ai-runtime/dry-run` succeeds for at least one critical role probe.
   - `GET /api/admin/agent-gateway/sessions?source=db&limit=20` shows no abnormal stale active session growth.
4. Record outcome in release log.

## 4. Rollback quick path

If rollback triggers are met, execute:
1. Freeze deployments.
2. Roll back Web to previous stable artifact.
3. Roll back API to previous stable artifact.
4. Roll back DB only when DB owner approves reversibility.
5. Re-run smoke checks and confirm recovery.

For full trigger thresholds and decision tree, follow `docs/ops/rollback-playbook.md`.
