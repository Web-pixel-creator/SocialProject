# Release Checklist

Use this checklist for every production release.

## Release Metadata

- [ ] Release version/tag:
- [ ] Date (UTC):
- [ ] Release commander:
- [ ] Backend owner:
- [ ] Frontend owner:
- [ ] DB owner:

## 1. Pre-Release Gates

- [ ] `npm run ultracite:check` passes.
- [ ] `npm run lint` passes.
- [ ] `npm --workspace apps/api run build` passes.
- [ ] `npm --workspace apps/web run build` passes.
- [ ] `npm run test -- --runInBand` passes.
- [ ] `npm run perf:pre-release` passes against staging API/Web.
- [ ] `npm run security:check` passes.
- [ ] `npm run release:smoke` passes against staging API/Web.
- [ ] Security scans are green (`dependency audit` + `secret scan` once Task 9 is active).

## 2. Migration Readiness

- [ ] Migration plan reviewed (`up` and rollback implications).
- [ ] Backward compatibility verified for API + DB reads/writes.
- [ ] DB backup/PITR checkpoint confirmed before rollout.
- [ ] `npm --workspace apps/api run migrate:up` validated on staging.

## 3. Staging Dry-Run (Required)

- [ ] Optional local rehearsal before staging:
  - [ ] `npm run release:dry-run:local` (starts local infra/services and executes smoke gate end-to-end).
- [ ] Deploy API + Web to staging from release artifact.
- [ ] Trigger staging smoke dry-run in CI (preferred evidence path):
  - [ ] Run `CI` workflow via `workflow_dispatch` and provide inputs:
    - [ ] `release_api_base_url` and `release_web_base_url` (or configure repo variables `RELEASE_API_BASE_URL` / `RELEASE_WEB_BASE_URL`).
    - [ ] Optional `release_csrf_token` input (or configure secret/variable `RELEASE_CSRF_TOKEN`; secret is preferred).
  - [ ] If staging URLs are not available, allow `release_smoke_staging` to run the built-in local-stack fallback (`npm run release:dry-run:local`) and collect evidence as a rehearsal run.
  - [ ] Optional terminal dispatch helper (requires `GITHUB_TOKEN` with Actions write):
    - [ ] `RELEASE_API_BASE_URL=<staging-api-url> RELEASE_WEB_BASE_URL=<staging-web-url> npm run release:smoke:dispatch`
    - [ ] Without staging URLs: `npm run release:smoke:dispatch` (runs workflow fallback path).
    - [ ] Tunnel-based URL-input helper (auto local API/Web + localtunnel + dispatch): `npm run release:smoke:dispatch:tunnel`
    - [ ] Manage persistent staging workflow inputs:
      - [ ] Show current values: `npm run release:smoke:inputs -- show`
      - [ ] Set values: `RELEASE_API_BASE_URL=<staging-api-url> RELEASE_WEB_BASE_URL=<staging-web-url> RELEASE_CSRF_TOKEN=<csrf-token> npm run release:smoke:inputs -- set`
      - [ ] Clear values: `npm run release:smoke:inputs -- clear`
    - [ ] If dispatch returns `Workflow does not have 'workflow_dispatch' trigger`, push updated `.github/workflows/ci.yml` first or set `RELEASE_WORKFLOW_REF` to a ref that contains that trigger.
  - [ ] Confirm artifact `release-smoke-report` is uploaded.
  - [ ] Download CI artifact locally for release evidence:
    - [ ] `npm run release:smoke:artifact -- <run_id>`
    - [ ] Optional auto-select latest successful `workflow_dispatch` run: `npm run release:smoke:artifact`
    - [ ] Verify extracted report at `artifacts/release/ci-run-<run_id>/smoke-results.json` (set `RELEASE_SMOKE_ARTIFACT_EXTRACT=false` to skip extraction).
- [ ] Run automated smoke check:
  - [ ] `RELEASE_API_BASE_URL=<staging-api-url> RELEASE_WEB_BASE_URL=<staging-web-url> npm run release:smoke`
  - [ ] Fallback rehearsal command (when staging URLs are unavailable): `npm run release:dry-run:local`
  - [ ] Save `artifacts/release/smoke-results.json` to release ticket.
- [ ] Run API smoke tests:
  - [ ] `GET /health` returns `200` + `{ "status": "ok" }`.
  - [ ] `GET /ready` returns `200` + DB/Redis ready.
  - [ ] Critical API flows succeed:
    - [ ] Auth register/login.
    - [ ] Draft create/get/list.
    - [ ] Pull request submit/decide.
    - [ ] Search endpoint.
- [ ] Run Web smoke tests:
  - [ ] `/` loads.
  - [ ] `/feed` loads and data fetch succeeds.
  - [ ] `/search` loads and query returns results/empty state correctly.
  - [ ] `/drafts/[id]` detail page loads for a seeded draft.
- [ ] Verify no critical alerts fired during dry-run window.

## 4. Production Rollout

- [ ] Announce release start in ops channel.
- [ ] Deploy API.
- [ ] Run migrations (if any).
- [ ] Deploy Web.
- [ ] Re-run API smoke tests in production.
- [ ] Re-run Web smoke tests in production.

## 5. Post-Release Verification (15-30 min)

- [ ] API error rate within threshold.
- [ ] API latency p95 within threshold.
- [ ] DB/Redis health normal.
- [ ] Job failures not elevated.
- [ ] No blocker incidents reported by support/QA.

## 6. Closeout

- [ ] Release outcome recorded in release log (`docs/ops/release-log.md`).
- [ ] Any incidents linked with timestamps and owner.
- [ ] Follow-up tasks created for non-blocking regressions.
