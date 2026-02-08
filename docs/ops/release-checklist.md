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
- [ ] `npm run release:smoke:retry:schema:samples:check` passes.
- [ ] `npm run release:smoke:retry:schema:sync:check` passes.
- [ ] `npm run release:smoke:retry:schema:check` passes.
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
    - [ ] Optional tunnel retry controls for transient smoke-only failures:
      - [ ] `RELEASE_TUNNEL_DISPATCH_RETRY_MAX=<n>` (default `1`)
      - [ ] `RELEASE_TUNNEL_DISPATCH_RETRY_DELAY_MS=<ms>` (default `5000`)
      - [ ] `RELEASE_TUNNEL_CAPTURE_RETRY_LOGS=<true|false>` (default `true`)
      - [ ] `RELEASE_TUNNEL_RETRY_LOGS_DIR=<path>` or `RELEASE_RETRY_LOGS_DIR=<path>` (default `artifacts/release/retry-failures`)
      - [ ] Retry diagnostics retention cleanup controls:
        - [ ] `RELEASE_RETRY_LOGS_CLEANUP_ENABLED=<true|false>` (default `true`)
        - [ ] `RELEASE_RETRY_LOGS_TTL_DAYS=<n>` (default `14`, `0` = delete all eligible files older than now)
        - [ ] `RELEASE_RETRY_LOGS_MAX_RUNS=<n>` (default `100`, keeps newest run groups and evicts log+metadata together)
        - [ ] `RELEASE_RETRY_LOGS_MAX_FILES=<n>` (default `200`, additional safety cap applied by evicting oldest run groups until file count fits)
        - [ ] `RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN=<true|false>` (default `false`)
      - [ ] Manual retry diagnostics collection for a known failed run:
        - [ ] `npm run release:smoke:retry:collect -- <run_id>`
        - [ ] Optional JSON output (for automation/dashboard ingestion): `npm run release:smoke:retry:collect -- <run_id> --json`
        - [ ] Collector JSON schema: `docs/ops/schemas/release-retry-collect-output.schema.json` (check `schemaPath` + `schemaVersion` in payload).
        - [ ] Include non-failed smoke jobs when needed: `RELEASE_RETRY_LOGS_INCLUDE_NON_FAILED=true npm run release:smoke:retry:collect -- <run_id>`
      - [ ] Manual cleanup command (standalone):
        - [ ] `npm run release:smoke:retry:cleanup`
        - [ ] Optional JSON output (for automation/dashboard ingestion): `npm run release:smoke:retry:cleanup -- --json`
        - [ ] Cleanup JSON schema: `docs/ops/schemas/release-retry-cleanup-output.schema.json` (check `schemaPath` + `schemaVersion` in payload).
        - [ ] Optional dry-run preview: `RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN=true npm run release:smoke:retry:cleanup`
        - [ ] Optional run-cap preview: `RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN=true RELEASE_RETRY_LOGS_MAX_RUNS=50 npm run release:smoke:retry:cleanup`
        - [ ] Optional file-cap preview: `RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN=true RELEASE_RETRY_LOGS_MAX_FILES=50 npm run release:smoke:retry:cleanup`
      - [ ] Retry schema sample fixtures:
        - [ ] Preview generated payloads: `npm run release:smoke:retry:schema:samples:preview`
        - [ ] Optional compact selection summary (JSON for CI dashboards): `npm run release:smoke:retry:schema:samples:preview:json`
        - [ ] Optional targeted preview by label/slug/path (repeatable): `npm run release:smoke:retry:schema:samples:generate -- --preview=<label> --preview=<label>`
        - [ ] Optional targeted preview by sample file path (repeatable): `npm run release:smoke:retry:schema:samples:generate -- --preview-file=docs/ops/schemas/samples/release-retry-cleanup-output.sample.json --preview-file=docs/ops/schemas/samples/release-retry-collect-output-success.sample.json`
        - [ ] Optional targeted compact selection summary (JSON): `npm run release:smoke:retry:schema:samples:generate -- --preview=<label> --preview-file=<path> --json`
        - [ ] Preview-selection JSON schema: `docs/ops/schemas/release-retry-preview-selection-output.schema.json` (verify `schemaPath` + `schemaVersion` in payload).
        - [ ] Unknown-filter preview JSON path returns non-zero and still matches schema: `npm run release:smoke:retry:schema:samples:generate -- --preview=missing-label --json`
        - [ ] Generate fixtures: `npm run release:smoke:retry:schema:samples:generate`
        - [ ] Check fixtures are up to date: `npm run release:smoke:retry:schema:samples:check`
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
    - [ ] Optional regression check versus prior run:
      - [ ] `npm run release:smoke:diff -- <previous_run_id> <current_run_id>`
      - [ ] Save/attach generated diff JSON report (default: `artifacts/release/smoke-diff-<previous>-vs-<current>.json`).
      - [ ] Optional custom output path: `RELEASE_SMOKE_DIFF_OUTPUT_PATH=artifacts/release/diffs/<name>.json npm run release:smoke:diff -- <previous_run_id> <current_run_id>`
      - [ ] Optional console-only mode (skip JSON file): `RELEASE_SMOKE_DIFF_WRITE_OUTPUT=false npm run release:smoke:diff -- <previous_run_id> <current_run_id>`
      - [ ] Optional hard fail on regressions: `RELEASE_SMOKE_DIFF_FAIL_ON_REGRESSION=true npm run release:smoke:diff -- <previous_run_id> <current_run_id>`
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
