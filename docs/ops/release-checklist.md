# Release Checklist

Use this checklist for every production release.
Reference: `docs/ops/web-e2e-ci-runbook.md` for Web E2E CI matrix, local smoke/visual commands, and artifact triage.

## Release Metadata

- [ ] Release version/tag:
- [ ] Date (UTC):
- [ ] Release commander:
- [ ] Backend owner:
- [ ] Frontend owner:
- [ ] DB owner:

## 1. Pre-Release Gates

- [ ] `npm run release:preflight:env` passes in the target release environment.
- [ ] Optional machine-readable env summary: `npm run release:preflight:env:json`.
- [ ] `npm run release:preflight:qa` passes (`qa:critical`: ultracite + web build + critical E2E).
- [ ] `npm run ultracite:check` passes.
- [ ] `npm run lint` passes.
- [ ] `npm --workspace apps/api run build` passes.
- [ ] `npm --workspace apps/web run build` passes.
- [ ] Web test suite passes: `npm run test:web`.
- [ ] API test suite passes (infra-backed local gate): `npm run test:api -- --runInBand`.
- [ ] `npm run test -- --runInBand` passes.
- [ ] Optional one-command local preflight: `npm run verify:local`.
- [ ] `npm run perf:pre-release` passes against staging API/Web.
- [ ] `npm run security:check` passes.
- [ ] `npm run release:smoke` passes against staging API/Web.
- [ ] `npm run release:smoke:retry:schema:samples:check` passes.
- [ ] `npm run release:smoke:retry:schema:sync:check` passes.
- [ ] `npm run release:smoke:retry:schema:check` passes.
- [ ] `npm run release:smoke:retry:schema:preview:check:strict` passes (standalone strict preview-selection gate; included in `schema:check`).
- [ ] Optional machine-readable schema gate summary: `npm run release:smoke:retry:schema:check:json` (for dashboards/automation).
- [ ] Security scans are green (`dependency audit` + `secret scan` once Task 9 is active).

## 2. Migration Readiness

- [ ] Migration plan reviewed (`up` and rollback implications).
- [ ] Backward compatibility verified for API + DB reads/writes.
- [ ] DB backup/PITR checkpoint confirmed before rollout.
- [ ] `npm --workspace apps/api run migrate:up` validated on staging.

## 3. Staging Dry-Run (Required)

- [ ] Optional local rehearsal before staging:
  - [ ] `npm run release:dry-run:local` (starts local infra/services, runs `release:preflight:qa`, then executes smoke gate end-to-end).
  - [ ] Optional skip for urgent rehearsal: `RELEASE_LOCAL_SKIP_QA_CRITICAL=true npm run release:dry-run:local`.
- [ ] Deploy API + Web to staging from release artifact.
- [ ] Trigger staging smoke dry-run in CI (preferred evidence path):
  - [ ] Run `CI` workflow via `workflow_dispatch` and provide inputs:
    - [ ] `release_api_base_url` and `release_web_base_url` (or configure repo variables `RELEASE_API_BASE_URL` / `RELEASE_WEB_BASE_URL`).
    - [ ] Optional `release_csrf_token` input (or configure secret/variable `RELEASE_CSRF_TOKEN`; secret is preferred).
    - [ ] Configure release env preflight secrets/variables for staging gate (`release:preflight:env`) before smoke:
      - [ ] `RELEASE_DATABASE_URL`, `RELEASE_REDIS_URL`
      - [ ] `RELEASE_S3_ENDPOINT`, `RELEASE_S3_REGION`, `RELEASE_S3_BUCKET`, `RELEASE_S3_ACCESS_KEY_ID`, `RELEASE_S3_SECRET_ACCESS_KEY`
      - [ ] `RELEASE_JWT_SECRET`, `RELEASE_ADMIN_API_TOKEN`, `RELEASE_EMBEDDING_PROVIDER`
      - [ ] `RELEASE_NEXT_PUBLIC_SEARCH_AB_ENABLED`, `RELEASE_NEXT_PUBLIC_SEARCH_DEFAULT_PROFILE`, `RELEASE_NEXT_PUBLIC_SEARCH_AB_WEIGHTS`
      - [ ] `RELEASE_EMBEDDING_API_KEY` when `RELEASE_EMBEDDING_PROVIDER=jina`
      - [ ] Optional overrides: `RELEASE_NODE_ENV`, `RELEASE_FRONTEND_URL`, `RELEASE_NEXT_PUBLIC_API_BASE_URL`, `RELEASE_NEXT_PUBLIC_WS_BASE_URL`, `RELEASE_NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK`
    - [ ] Optional `release_run_tunnel_helper=true` input to execute in-CI tunnel helper rehearsal (`release_tunnel_helper_ci_rehearsal` job) and publish tunnel retry diagnostics artifacts.
  - [ ] If staging URLs are not available, allow `release_smoke_staging` to run the built-in local-stack fallback (`npm run release:dry-run:local`) and collect evidence as a rehearsal run.
  - [ ] Optional terminal dispatch helper (token resolution: `-Token/--token` -> `GITHUB_TOKEN/GH_TOKEN` -> `gh auth token`; token needs Actions write):
    - [ ] Auto-select dispatch mode (uses repo/env staging URLs when available, otherwise falls back to tunnel helper): `npm run release:smoke:dispatch:auto`
    - [ ] Optional safe preview (no dispatch): `npm run release:smoke:dispatch:auto -- --dry-run` (add `--prefer-tunnel` to force tunnel path).
    - [ ] `RELEASE_API_BASE_URL=<staging-api-url> RELEASE_WEB_BASE_URL=<staging-web-url> npm run release:smoke:dispatch`
    - [ ] Without staging URLs: `npm run release:smoke:dispatch` (runs workflow fallback path).
    - [ ] Tunnel-based URL-input helper (auto local API/Web + localtunnel + dispatch): `npm run release:smoke:dispatch:tunnel`
    - [ ] Optional tunnel retry controls for transient smoke-only failures:
      - [ ] `RELEASE_TUNNEL_DISPATCH_RETRY_MAX=<n>` (default `1`)
      - [ ] `RELEASE_TUNNEL_DISPATCH_RETRY_DELAY_MS=<ms>` (default `5000`)
      - [ ] `RELEASE_TUNNEL_DISPATCH_RETRY_BACKOFF_FACTOR=<n>` (default `1.5`)
      - [ ] `RELEASE_TUNNEL_DISPATCH_RETRY_MAX_DELAY_MS=<ms>` (default `30000`)
      - [ ] Retry preflight before retry attempts:
        - [ ] `RELEASE_TUNNEL_RETRY_PREFLIGHT_ENABLED=<true|false>` (default `true`)
        - [ ] `RELEASE_TUNNEL_RETRY_PREFLIGHT_TIMEOUT_MS=<ms>` (default `20000`)
        - [ ] `RELEASE_TUNNEL_RETRY_PREFLIGHT_INTERVAL_MS=<ms>` (default `1000`)
        - [ ] `RELEASE_TUNNEL_RETRY_PREFLIGHT_SUCCESS_STREAK=<n>` (default `1`)
      - [ ] Retry summary output controls:
        - [ ] `RELEASE_TUNNEL_RETRY_SUMMARY_WRITE=<true|false>` (default `true`)
        - [ ] `RELEASE_TUNNEL_RETRY_SUMMARY_PATH=<path>` (default `artifacts/release/tunnel-dispatch-retry-summary.json`)
      - [ ] Optional tunnel preflight controls (public URL health checks before dispatch):
        - [ ] `RELEASE_TUNNEL_PREFLIGHT_ENABLED=<true|false>` (default `true`)
        - [ ] `RELEASE_TUNNEL_PREFLIGHT_TIMEOUT_MS=<ms>` (default `45000`)
        - [ ] `RELEASE_TUNNEL_PREFLIGHT_INTERVAL_MS=<ms>` (default `1000`)
        - [ ] `RELEASE_TUNNEL_PREFLIGHT_SUCCESS_STREAK=<n>` (default `2`)
        - [ ] `RELEASE_TUNNEL_PREFLIGHT_SUMMARY_WRITE=<true|false>` (default `true`)
        - [ ] `RELEASE_TUNNEL_PREFLIGHT_SUMMARY_PATH=<path>` (default `artifacts/release/tunnel-preflight-summary.json`)
      - [ ] Optional release dry-run QA gate toggle: `RELEASE_RUN_QA_CRITICAL=<true|false>` (default `true`).
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
        - [ ] Release smoke preflight JSON schema: `docs/ops/schemas/release-smoke-preflight-summary-output.schema.json` (verify `schemaPath` + `schemaVersion` in payload).
        - [ ] Unknown-filter preview JSON path returns non-zero and still matches schema: `npm run release:smoke:retry:schema:samples:generate -- --preview=missing-label --json`
        - [ ] Optional standalone preflight summary schema validator: `npm run release:smoke:retry:schema:preflight:check`
        - [ ] Optional standalone preflight summary schema validator (JSON): `npm run release:smoke:retry:schema:preflight:check:json`
        - [ ] Optional standalone strict preview-selection validator: `npm run release:smoke:retry:schema:preview:check:strict`
        - [ ] Optional combined strict schema gate JSON summary: `npm run release:smoke:retry:schema:check:json`
        - [ ] Generate fixtures: `npm run release:smoke:retry:schema:samples:generate`
        - [ ] Check fixtures are up to date: `npm run release:smoke:retry:schema:samples:check`
    - [ ] Manage persistent staging workflow inputs:
      - [ ] Show current values: `npm run release:smoke:inputs -- show`
      - [ ] Set values (core): `RELEASE_API_BASE_URL=<staging-api-url> RELEASE_WEB_BASE_URL=<staging-web-url> npm run release:smoke:inputs -- set`
      - [ ] Set optional preflight variables in the same command by exporting additional `RELEASE_*` env vars (for example: `RELEASE_NEXT_PUBLIC_SEARCH_AB_ENABLED=true`, `RELEASE_NEXT_PUBLIC_SEARCH_DEFAULT_PROFILE=balanced`, `RELEASE_NEXT_PUBLIC_SEARCH_AB_WEIGHTS='{\"balanced\":0.5,\"precision\":0.5}'`).
      - [ ] Sensitive values (`RELEASE_DATABASE_URL`, `RELEASE_REDIS_URL`, `RELEASE_JWT_SECRET`, `RELEASE_ADMIN_API_TOKEN`, `RELEASE_S3_ACCESS_KEY_ID`, `RELEASE_S3_SECRET_ACCESS_KEY`, `RELEASE_EMBEDDING_API_KEY`) should be stored as repository secrets, not workflow variables.
      - [ ] Clear values: `npm run release:smoke:inputs -- clear`
  - [ ] If dispatch returns `Workflow does not have 'workflow_dispatch' trigger`, push updated `.github/workflows/ci.yml` first or set `RELEASE_WORKFLOW_REF` to a ref that contains that trigger.
  - [ ] Confirm artifact `release-smoke-report` is uploaded.
  - [ ] Confirm artifact `release-smoke-preflight-summary` is uploaded (`artifacts/release/tunnel-preflight-summary.json` from `release_smoke_staging`).
  - [ ] Confirm artifact `release-env-preflight-summary` is uploaded (`artifacts/release/env-preflight-summary.json` from `release_smoke_staging`).
  - [ ] Confirm artifact `retry-schema-gate-summary` is uploaded from CI `test` job (machine-readable retry schema gate status).
  - [ ] Confirm artifact `release-smoke-preflight-schema-summary` is uploaded from CI `test` job (machine-readable standalone preflight schema validator status).
  - [ ] Optional: confirm artifact `release-smoke-tunnel-dispatch-retry-summary` is uploaded when `artifacts/release/tunnel-dispatch-retry-summary.json` is present in CI run context.
  - [ ] Optional (when `release_run_tunnel_helper=true`): confirm tunnel-helper rehearsal artifacts are uploaded from `release_tunnel_helper_ci_rehearsal` job:
    - [ ] `release-smoke-tunnel-dispatch-retry-summary`
    - [ ] `release-smoke-tunnel-preflight-summary`
    - [ ] `release-smoke-tunnel-retry-failures`
  - [ ] Confirm CI step summary includes `Release Smoke Preflight Schema Summary` block from the `test` job.
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
  - [ ] Fallback rehearsal command (when staging URLs are unavailable): `npm run release:dry-run:local` (includes `release:preflight:qa` unless skipped explicitly)
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
- [ ] Runtime/gateway control-plane rehearsal passes:
  - [ ] `GET /api/admin/ai-runtime/health` returns `summary.health = "ok"` and `rolesBlocked = 0`.
  - [ ] `POST /api/admin/ai-runtime/dry-run` succeeds for a critical role probe.
  - [ ] `GET /api/admin/agent-gateway/sessions?source=db&limit=20` shows no abnormal stale active session growth.
  - [ ] `GET /api/admin/agent-gateway/telemetry?hours=24&limit=200` returns stable aggregate metrics (sessions/events/attempts/provider usage).

## 4. Production Rollout

- [ ] Announce release start in ops channel.
- [ ] Deploy API.
- [ ] Run migrations (if any).
- [ ] Deploy Web.
- [ ] Re-run API smoke tests in production.
- [ ] Re-run Web smoke tests in production.

## 5. Post-Release Verification (15-30 min)

- [ ] Run one-command production launch gate (strict):
  - [ ] `npm run release:launch:gate:production`
  - [ ] Optional machine-readable output: `npm run release:launch:gate:production:json`
  - [ ] Optional strict skills-runtime variant (requires skill markers in runtime prompt):
    - [ ] `npm run release:launch:gate:production:skills`
    - [ ] JSON variant: `npm run release:launch:gate:production:skills:json`
  - [ ] Optional CI workflow_dispatch path: `Production Launch Gate` workflow (`.github/workflows/production-launch-gate.yml`)
    - [ ] Ensure launch-gate secrets/vars are configured before dispatch:
      - [ ] Variables: `RELEASE_API_BASE_URL`, `RELEASE_WEB_BASE_URL`
      - [ ] Secrets: `RELEASE_ADMIN_API_TOKEN`, `RELEASE_CSRF_TOKEN`, `RELEASE_AGENT_GATEWAY_WEBHOOK_SECRET`
      - [ ] Optional Railway compatibility context: `RAILWAY_API_TOKEN`/`RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`
    - [ ] Optional inputs: `runtime_draft_id`, `require_skill_markers`.
    - [ ] Optional terminal dispatch helper (token resolution: `-Token/--token` -> `GITHUB_TOKEN/GH_TOKEN` -> `gh auth token`): `npm run release:launch:gate:dispatch`
      - [ ] Optional explicit token argument: `npm run release:launch:gate:dispatch -- -Token <github_pat>`
      - [ ] Optional runtime draft input: `RELEASE_RUNTIME_DRAFT_ID=<uuid>`
      - [ ] Optional skill marker requirement: `RELEASE_REQUIRE_SKILL_MARKERS=true`
  - [ ] Confirm summary artifact: `artifacts/release/production-launch-gate-summary.json`
  - [ ] Confirm health summary artifact: `artifacts/release/production-launch-gate-health-summary.json`
  - [ ] In strict mode, confirm `connectorProfilesSnapshot.pass=true` in launch gate summary.
- [ ] Generate post-release health report from latest workflow_dispatch run:
  - [ ] `npm run release:health:report`
  - [ ] `--strict` mode now validates required release artifacts in addition to required jobs (`release-smoke-report`, `release-smoke-preflight-summary`, `release-env-preflight-summary`, `retry-schema-gate-summary`, `release-smoke-preflight-schema-summary`).
  - [ ] Optional explicit run id: `npm run release:health:report -- <run_id>`
  - [ ] Optional machine-readable summary: `npm run release:health:report -- --json`
  - [ ] Optional strict gate (fails command on unhealthy run): `npm run release:health:report -- --strict`
  - [ ] Validate report schema: `npm run release:health:schema:check` (or explicit file path: `npm run release:health:schema:check -- artifacts/release/post-release-health-run-<run_id>.json`)
  - [ ] Optional machine-readable schema validation summary: `npm run release:health:schema:check:json`
  - [ ] Confirm `Release Health Gate` workflow passed for this run (`workflow_run` automation after `CI` `workflow_dispatch`).
  - [ ] Confirm artifacts from `Release Health Gate`: `post-release-health-report`, `post-release-health-summary`, `post-release-health-schema-summary`.
  - [ ] Save/attach `artifacts/release/post-release-health-run-<run_id>.json` to release ticket.
- [ ] API error rate within threshold.
- [ ] API latency p95 within threshold.
- [ ] DB/Redis health normal.
- [ ] Job failures not elevated.
- [ ] AI runtime health remains stable (`rolesBlocked = 0`, no persistent provider cooldown storm).
- [ ] Agent gateway sessions remain healthy (no backlog of stale active sessions).
- [ ] No blocker incidents reported by support/QA.

## 6. Closeout

- [ ] Release outcome recorded in release log (`docs/ops/release-log.md`).
- [ ] Optional auto-append post-release health block to release log: `npm run release:health:log -- <run_id>` (use `--dry-run` to preview).
- [ ] Any incidents linked with timestamps and owner.
- [ ] Follow-up tasks created for non-blocking regressions.
