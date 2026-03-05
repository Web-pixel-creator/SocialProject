# Release Runbook

This runbook is the operational path for production release execution.

Canonical references:
- `docs/ops/release-checklist.md`
- `docs/ops/deploy.md`
- `docs/ops/rollback-playbook.md`
- `docs/ops/agent-gateway-ai-runtime-runbook.md`

## Helper Diagnostics Map

Use this map when a release helper fails fast on argument/env validation and you need to find the enforcing code quickly.

| Helper path | Primary validation modules |
| --- | --- |
| `scripts/release/dispatch-production-launch-gate.mjs` | `scripts/release/release-env-parse-utils.mjs`, `scripts/release/dispatch-production-launch-gate-link-options.mjs`, `scripts/release/dispatch-production-launch-gate-external-channels.mjs` |
| `scripts/release/production-launch-gate.mjs` | `scripts/release/release-env-parse-utils.mjs`, `scripts/release/production-launch-gate-config-resolvers.mjs`, `scripts/release/dispatch-production-launch-gate-external-channels.mjs` |

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
   - Optional CI workflow_dispatch alternative: `Production Launch Gate` (`.github/workflows/production-launch-gate.yml`)
   - CI run now uploads markdown audit artifact `production-launch-gate-step-summary` (`artifacts/release/production-launch-gate-step-summary.md`) in addition to JSON artifacts.
  - `npm run release:launch:gate:dispatch` now prints resolved UI link for artifact `production-launch-gate-step-summary` after successful run completion.
  - Optional helper verbosity for extra artifact links: `npm run release:launch:gate:dispatch -- --print-artifact-links` (or env `RELEASE_PRINT_ARTIFACT_LINKS=true`).
  - Optional artifact link subset override: `npm run release:launch:gate:dispatch -- --artifact-link-names production-launch-gate-summary,post-release-health-inline-artifacts-schema-check` (or env `RELEASE_ARTIFACT_LINK_NAMES=<csv|all>`).
  - Optional suppression of default step-summary link: `npm run release:launch:gate:dispatch -- --no-step-summary-link` (or env `RELEASE_NO_STEP_SUMMARY_LINK=true`).
   - CI launch-gate workflow uses `RELEASE_*` context for production probes:
     - `RELEASE_API_BASE_URL`, `RELEASE_WEB_BASE_URL` (repo variables)
     - `RELEASE_ADMIN_API_TOKEN`, `RELEASE_CSRF_TOKEN`, `RELEASE_AGENT_GATEWAY_WEBHOOK_SECRET` (repo secrets)
   - Railway token context remains optional for local/CLI checks.
     - Optional terminal dispatch helper for the workflow:
       - `npm run release:launch:gate:dispatch`
       - Optional explicit token argument: `npm run release:launch:gate:dispatch -- -Token <github_pat>`
       - Optional explicit workflow inputs via CLI args:
         - `npm run release:launch:gate:dispatch -- --runtime-draft-id <uuid> --require-skill-markers --require-natural-cron-window`
        - `npm run release:launch:gate:dispatch -- --required-external-channels telegram,slack`
        - `npm run release:launch:gate:dispatch -- --require-inline-health-artifacts`
        - `npm run release:launch:gate:dispatch -- --print-artifact-links`
        - `npm run release:launch:gate:dispatch -- --artifact-link-names production-launch-gate-summary,post-release-health-inline-artifacts-schema-check`
        - `npm run release:launch:gate:dispatch -- --artifact-link-names production-launch-gate-summary --no-step-summary-link`
         - controlled negative drill: `npm run release:launch:gate:dispatch -- --required-external-channels all --allow-failure-drill --webhook-secret-override <dummy-value>`
       - Token resolution order: `-Token/--token` -> `GITHUB_TOKEN/GH_TOKEN` -> `gh auth token`
       - Optional inputs via env: `RELEASE_RUNTIME_DRAFT_ID=<uuid> RELEASE_REQUIRE_SKILL_MARKERS=true RELEASE_REQUIRE_NATURAL_CRON_WINDOW=true`
       - Optional required external channels via env: `RELEASE_REQUIRED_EXTERNAL_CHANNELS=telegram,slack` (or `all`)
      - Optional strict inline health artifact requirement via env: `RELEASE_REQUIRE_INLINE_HEALTH_ARTIFACTS=true`
      - Optional artifact link names via env: `RELEASE_ARTIFACT_LINK_NAMES=production-launch-gate-summary,post-release-health-inline-artifacts-schema-check` (or `all`)
      - Optional step-summary link suppression via env: `RELEASE_NO_STEP_SUMMARY_LINK=true`
       - Optional strict inline health artifact assertion via workflow input:
         - `require_inline_health_artifacts=true`
       - Optional drill inputs via env (drill-only): `RELEASE_ALLOW_FAILURE_DRILL=true RELEASE_WEBHOOK_SECRET_OVERRIDE=<value>`
       - When `RELEASE_REQUIRE_SKILL_MARKERS=true`, `RELEASE_RUNTIME_DRAFT_ID` is required and must point to a draft with skill markers.
      - Validation implementation references (for quick triage when a helper fails fast on env/arg parsing):
        - shared strict env parsers: `scripts/release/release-env-parse-utils.mjs`
        - dispatch helper entrypoint + CLI parsing: `scripts/release/dispatch-production-launch-gate.mjs`
        - dispatch artifact-link option resolver: `scripts/release/dispatch-production-launch-gate-link-options.mjs`
        - production gate config candidate resolvers: `scripts/release/production-launch-gate-config-resolvers.mjs`
   - Review summary: `artifacts/release/production-launch-gate-summary.json`
   - Launch gate now asserts required smoke step set (`api.health`, draft/PR/search API path, `web.home`, `web.feed`, `web.search`, `web.draft.detail`) via `smokeRequiredSteps.pass=true`.
   - With `require_skill_markers=true`, launch gate asserts multi-step marker coverage (`skillMarkerMultiStep.pass=true`):
     - `Role persona` + `Skill capsule` markers must be present for every orchestration role step.
     - `Role skill` marker must be present in at least one orchestration step.
   - With `require_skill_markers=true`, launch gate also asserts matrix-channel marker coverage (`skillMarkerMatrixChannels.pass=true`) across `web`, `live_session`, and runtime probe channel orchestration paths.
   - Launch gate now also checks external connector channel fallback probes from configured connector profiles (`telegram` / `slack` / `discord`) via `ingestExternalChannelFallback`.
   - For each configured external channel probe, launch gate also verifies connector telemetry counters (`ingestConnectors.accepted/total`) via admin telemetry API before passing fallback checks.
   - Launch gate now exposes per-channel fallback failure-mode diagnostics in summary check `ingestExternalChannelFailureModes` and trace artifact `artifacts/release/production-agent-gateway-external-channel-traces.json` (uploaded as workflow artifact `production-external-channel-traces`).
   - Optional strict channel requirement can be enabled with `--required-external-channels telegram,slack` (or workflow input/env equivalent); in this mode, launch gate fails if required channels are not configured or fallback probe validation fails.
  - CI `Production Launch Gate` workflow now runs inline post-release health generation in best-effort mode for same-run parity and uploads:
    - `post-release-health-report-inline`
    - `post-release-health-summary-inline`
    - `post-release-health-schema-summary-inline`
    - `post-release-health-inline-artifacts-summary` (machine-readable presence check result; `status=fail` does not fail run unless `require_inline_health_artifacts=true`).
    - `post-release-health-inline-artifacts-schema-check` (JSON Schema validation result for inline artifact summary payload contract).
  - Launch-gate summary JSON now includes `checks.inlineHealthArtifactsSchema` (derived from inline schema-check artifact) and this check participates in top-level `pass/status` calculation.
   - Recommended rollout to move from `skipped` to active external-channel verification:
     - set production `AGENT_GATEWAY_INGEST_CONNECTOR_PROFILES` (see `docs/ops/examples/agent-gateway-ingest-connector-profiles.example.json`),
     - deploy API with new env,
     - run strict dispatch:
       - `npm run release:launch:gate:dispatch -- --required-external-channels all`
     - confirm in summary:
       - `ingestExternalChannelFallback.pass=true`
       - `ingestExternalChannelFallback.requiredChannels=["telegram","slack","discord"]`
       - `ingestExternalChannelFallback.missingRequiredChannels=[]`.
       - `ingestExternalChannelFailureModes.pass=true` and `requiredFailedChannels=[]`.
   - If any channel appears in `ingestExternalChannelFailureModes.failedChannels`, route by failure class using `docs/ops/agent-gateway-ai-runtime-runbook.md` (`External-channel failure-mode routing` section) before re-dispatching.
   - Rollout stop condition: if `requiredFailedChannels` remains non-empty across two consecutive strict runs, pause rollout and apply rollback decision thresholds.
1. Generate and validate health report:
  - `npm run release:health:report`
  - Optional inline summary contract check (local/CI parity): `npm run release:health:inline-artifacts:schema:check`
  - `Release Health Gate` workflow auto-runs on completed `workflow_dispatch` runs from both `CI` and `Production Launch Gate` workflows (`workflow_run` trigger).
   - For CI `Production Launch Gate` runs, inline post-release health artifacts from the same run are available immediately; use them for zero-lag triage and keep `Release Health Gate` as corroborating automation.
   - Triage source selection quick guide:

     | Source | Use When | Artifact names |
     | --- | --- | --- |
     | Inline (`Production Launch Gate` run) | Immediate same-run triage right after strict gate completion | `post-release-health-report-inline`, `post-release-health-summary-inline`, `post-release-health-schema-summary-inline` |
     | `Release Health Gate` (`workflow_run`) | Corroborating asynchronous automation evidence and standard post-run reporting | `post-release-health-report`, `post-release-health-summary`, `post-release-health-schema-summary` |

   - Optional launch-gate workflow profile:
     - `npm run release:health:report -- --workflow-file production-launch-gate.yml --profile launch-gate`
     - Shortcut: `npm run release:health:report:launch-gate`
     - Shortcut JSON: `npm run release:health:report:launch-gate:json`
   - For launch-gate profile, health report now includes mandatory rolling external-channel trend check from `production-external-channel-traces` artifacts:
     - `externalChannelFailureModes.pass=true`
     - `externalChannelFailureModes.nonPassModes=[]`
     - defaults: `windowSize=3`, `minimumRuns=1` (override via `RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_WINDOW` and `RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_MIN_RUNS`).
     - trend baseline uses successful previous runs plus the current analyzed run (so previous controlled-failure drills do not keep healthy runs red).
    - First non-pass appearance hook:
      - health report emits `externalChannelFailureModes.firstAppearanceAlert` with triage entries (`channel`, `failureMode`, `runId`),
      - optional webhook delivery can be enabled via `RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_WEBHOOK_URL` (CI secret) with timeout override `RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_TIMEOUT_MS`.
     - for protected webhook receivers, post-release health supports auth headers from env:
       - `RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_WEBHOOK_ADMIN_TOKEN` -> `x-admin-token`
       - `RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_WEBHOOK_CSRF_TOKEN` -> `x-csrf-token`
       - `RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_WEBHOOK_BEARER_TOKEN` -> `Authorization: Bearer ...`
      - production default can use internal endpoint:
        - `https://api-production-7540.up.railway.app/api/admin/release-health/external-channel-alerts`
      - monitor admin UX telemetry after launch-gate health report:
        - open `/admin/ux` and verify `Release health alert telemetry` reflects current run state.
        - for healthy strict windows expect `Alert events=0`, `First appearances=0`, and no channel/failure-mode outliers.
        - verify `Alert risk` status is `Healthy` (watch when any alert appears, critical when `firstAppearances>=3` or `alertEvents>=3` or `alertedRuns>=2`).
    - Launch-gate health report now also emits `releaseHealthAlertTelemetry`:
      - includes `riskLevel`, `counts`, `consecutiveSuccessfulRunStreak`, and `escalationTriggered`.
      - escalation rule defaults to `2` consecutive successful dispatch runs with non-healthy risk (override via `RELEASE_HEALTH_ALERT_RISK_ESCALATION_STREAK`).
      - strict failure is optional (`RELEASE_HEALTH_ALERT_RISK_STRICT=true`); default behavior is advisory-only.
      - optional one-command reassessment helper for post-window strict enablement:
        - `npm run release:alert-risk:reassess -- --not-before-utc <ISO8601_UTC>`
        - optional apply mode (sets `RELEASE_HEALTH_ALERT_RISK_STRICT=true` only when ready): `npm run release:alert-risk:reassess -- --not-before-utc <ISO8601_UTC> --apply`
        - helper writes machine-readable summary to `artifacts/release/alert-risk-strict-reassessment-<run_id>.json`.
      - optional workflow automation:
        - `Alert-Risk Strict Reassess` (`.github/workflows/alert-risk-strict-reassess.yml`)
        - schedule: `17:35 UTC` daily (or run manually via `workflow_dispatch`)
        - for variable apply/read in workflow context, configure repo secret `RELEASE_GITHUB_PAT` (Actions write + Contents read); default `GITHUB_TOKEN` may not access variables API.
      - when `escalationTriggered=true`, start incident triage using `docs/ops/agent-gateway-ai-runtime-runbook.md` (`External-channel failure-mode routing`) and attach release-health summary evidence.
    - `npm run release:health:schema:check`
2. Confirm alerts, latency, and error rates are within thresholds.
3. Validate runtime/gateway control plane health:
   - `GET /api/admin/ai-runtime/health` reports `summary.health = "ok"` and `rolesBlocked = 0`.
   - `POST /api/admin/ai-runtime/dry-run` succeeds for at least one critical role probe.
   - `GET /api/admin/sandbox-execution/metrics?hours=24&limit=20` is reachable and telemetry summary is present.
   - Optional scoped check: `GET /api/admin/sandbox-execution/metrics?hours=24&operation=ai_runtime_dry_run&mode=<fallback_only|sandbox_enabled>`.
   - Scoped audit envelope coverage should be present for runtime dry-run telemetry:
     - `auditCoverage.totalWithAudit > 0`
     - `auditCoverage.actorTypeCount > 0`
     - `auditCoverage.sourceRouteCount > 0`
     - `auditCoverage.toolNameCount > 0`
   - If `SANDBOX_EXECUTION_EGRESS_ENFORCE=true`, verify:
     - `SANDBOX_EXECUTION_EGRESS_PROFILES` resolves a profile for `ai_runtime_dry_run` (or wildcard `*`).
     - `SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS` contains that profile.
   - If `SANDBOX_EXECUTION_LIMITS_ENFORCE=true`, verify:
     - `SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES` resolves a profile for `ai_runtime_dry_run` (or wildcard `*`).
     - `SANDBOX_EXECUTION_LIMIT_PROFILES` contains that resolved profile.
   - Launch gate egress-policy probe should be green when mapping is configured:
     - `sandboxExecutionEgressPolicy.pass=true`, or
     - `sandboxExecutionEgressPolicy.skipped=true` when no `SANDBOX_EXECUTION_EGRESS_PROFILES` mapping exists for runtime dry-run path.
   - Launch gate limits-policy probe should be green when mapping is configured:
     - `sandboxExecutionLimitsPolicy.pass=true`, or
     - `sandboxExecutionLimitsPolicy.skipped=true` when no `SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES` mapping exists for runtime dry-run path.
   - Launch gate audit-policy probe should be green:
     - `sandboxExecutionAuditPolicy.pass=true` with required fields `actorType`, `sourceRoute`, `toolName`.
   - Launch gate mode-consistency probe should be green:
     - `sandboxExecutionModeConsistency.pass=true` for runtime dry-run scoped telemetry.
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
