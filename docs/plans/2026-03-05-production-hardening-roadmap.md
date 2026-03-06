# Production Hardening Roadmap

Date: 2026-03-05
Owner: FinishIt Platform
Status: completed

## Goal

Close the remaining operational gaps between "feature complete" and
"production-grade":

- safe release and automation command execution,
- deterministic traceability across release/runtime/admin flows,
- safe config reload with last-known-good fallback,
- trigger-based diagnostics and artifact collection,
- OTEL-first observability for staging and production investigation,
- stricter CI/E2E evidence discipline.

## Existing Baseline

- Product/task ledgers under `.kiro/specs/*/tasks.md` are fully checked.
- `admin/ux` operator surface is active and already includes signal/risk-focused
  all-panel controls.
- Sandbox execution pilot path, telemetry, and strict launch-gate checks are
  already in place via:
  - `docs/plans/2026-03-03-opensandbox-pattern-adoption-plan.md`
  - `docs/ops/release-checklist.md`
  - `docs/ops/release-runbook.md`
- Release tooling is already testable and green, but recent work has skewed
  toward helper deduplication instead of the next system layer.

## Non-Goals

- No migration to a different application platform.
- No full OpenSandbox infrastructure migration.
- No Aspire/YARP-style control-plane replacement.
- No new product-scope expansion before hardening phases land.

## Phase 1 - Release Command Policy Runner

Add one shared command-policy layer for `scripts/release` and other automation
entrypoints.

Deliverables:

- shared policy profiles:
  - `workspace_write`
  - `workspace_read_only`
  - `no_network_workspace_write`
  - `system_process`
- protected path blocking for `.git`, `.codex`, `.agents`
- workspace-root path enforcement for persistent artifact writes
- shell allowlist policy for trusted commands only
- best-effort proxy/env stripping for no-network profiles
- structured policy errors with stable error codes

Exit criteria:

- key release runners use the shared policy layer
- unit tests cover protected paths, outside-workspace paths, shell allowlist,
  and no-network env sanitization
- `ci:workflow:inline-node-check`, `lint`, and `ultracite:check` pass

## Phase 2 - Correlation and Audit Layer

Make tracing deterministic across release, runtime, and operator views.

Deliverables:

- one correlation model:
  - `releaseRunId`
  - `correlationId`
  - `executionSessionId`
- propagation through release scripts, sandbox telemetry, launch-gate, and
  `/admin/ux`
- operator drill-down by one id

Exit criteria:

- one synthetic run can be traced end-to-end by id
- audit coverage is visible in operator tooling

## Phase 3 - Last-Known-Good Config

Protect runtime and release flows from bad config changes.

Deliverables:

- validated candidate config snapshots
- last-known-good persistence for critical config surfaces
- rollback to LKG on invalid apply/reload
- operator-visible apply/fallback artifacts

Exit criteria:

- invalid config does not replace active good config
- reload/fallback behavior is test-covered

## Phase 4 - Trigger-Based Diagnostics

Collect investigation evidence automatically on high-risk signals.

Deliverables:

- trigger rules for repeated timeouts, failed launch gates, and runtime
  degradation
- artifact bundle capture for logs and JSON summaries
- retention-safe storage layout under `artifacts/release`

Exit criteria:

- one synthetic failure drill produces a complete diagnostics bundle
- artifact schema is validated

## Phase 5 - OTEL-First Observability

Add a minimal but real observability layer.

Deliverables:

- API and release-flow telemetry for latency, failures, fallback mode, and
  policy decisions
- staging dashboard and investigation notes
- correlation between admin metrics and observability signals

Exit criteria:

- staging dashboard shows live signals for one release/runtime window
- telemetry checks are documented in ops docs

## Phase 6 - CI and E2E Discipline

Make investigation artifacts and selective execution standard.

Deliverables:

- path-based E2E/workflow execution where safe
- guaranteed artifacts for failed critical flows
- stronger admin/operator smoke coverage

Exit criteria:

- failed CI runs always leave actionable artifacts
- selective runs do not weaken blocking coverage

## Phase 7 - Final Operator UX Polish

Only after the operational layer is stable.

Deliverables:

- saved `admin/ux` operator views
- correlation-aware incident cards
- faster navigation from alert -> artifact -> drill-down

Exit criteria:

- operators can move from failing gate to root evidence without manual hunting

## Current Execution Order

1. Phase 1 - release command policy runner
2. Phase 2 - correlation and audit layer
3. Phase 3 - last-known-good config
4. Phase 4 - trigger-based diagnostics
5. Phase 5 - OTEL-first observability
6. Phase 6 - CI and E2E discipline
7. Phase 7 - operator UX polish

## Progress Snapshot

### 2026-03-05 - Phase 1 started

- Added shared release command policy module:
  - `scripts/release/release-command-policy.mjs`
- Integrated initial policy coverage into:
  - `scripts/release/local-dry-run.mjs`
  - `scripts/release/dispatch-staging-smoke-tunnel.mjs`
  - `scripts/release/post-release-health-report.mjs`
- Added unit coverage:
  - `apps/api/src/__tests__/release-command-policy.unit.spec.ts`
- Initial validation:
  - `node --check` on changed release scripts: pass
  - targeted `jest` suite for release command policy: pass

### 2026-03-05 - Phase 2 completed

- Added shared release correlation helper:
  - `scripts/release/release-correlation-utils.mjs`
- Propagated `releaseRunId`, `correlationId`, and audit-session linkage through:
  - `scripts/release/production-launch-gate.mjs`
  - `scripts/release/post-release-health-report.mjs`
  - `apps/api/src/routes/admin.ts`
  - `apps/api/src/services/sandboxExecution/*`
- Extended sandbox metrics filters/coverage for:
  - `correlationId`
  - `releaseRunId`
  - `executionSessionId`
- Updated release-health report schema/sample to `1.11.0`.
- Added unit/integration coverage:
  - `apps/api/src/__tests__/release-correlation-utils.unit.spec.ts`
  - expanded `admin.integration.spec.ts`
  - expanded `sandbox-execution.unit.spec.ts`
- Validation:
  - `node --check` on changed release scripts: pass
  - targeted `jest` suites for correlation/audit path: pass
  - `ci:workflow:inline-node-check`: pass
  - `lint`: pass
  - `ultracite:check`: pass
  - `node scripts/release/validate-release-health-report-schema.mjs docs/ops/schemas/samples/release-health-report-output.sample.json --json`: pass
  - `release:launch:gate:production:json -- --required-external-channels all`: pass after deploy

### 2026-03-06 - Phase 3 completed

- Added shared last-known-good config helper:
  - `scripts/release/release-last-known-good-config.mjs`
- Extracted critical production launch-gate config resolution and validation:
  - `scripts/release/production-launch-gate-critical-config.mjs`
  - critical sandbox execution config now resolves as raw candidate snapshot first,
  - validates before apply,
  - persists the latest valid snapshot,
  - falls back to the stored last-known-good snapshot when the candidate is invalid.
- Updated production launch-gate artifacts and operator summaries:
  - `scripts/release/production-launch-gate.mjs`
  - new artifacts:
    - `artifacts/release/production-launch-gate-config-last-known-good.json`
    - `artifacts/release/production-launch-gate-config-resolution.json`
  - launch-gate summary now records `lastKnownGoodConfig` status, fallback usage, and active source.
- Expanded test coverage:
  - `apps/api/src/__tests__/release-production-config-resolvers.unit.spec.ts`
  - `apps/api/src/__tests__/release-production-critical-config.unit.spec.ts`
  - `apps/api/src/__tests__/release-last-known-good-config.unit.spec.ts`
- Validation:
  - `node --check` on changed release scripts: pass
  - targeted `jest` suites for raw config resolution, critical config validation, and LKG fallback: pass
  - `ci:workflow:inline-node-check`: pass
  - `lint`: pass
  - `ultracite:check`: pass
  - `release:launch:gate:production:json -- --required-external-channels all`: pass

### 2026-03-06 - Phase 4 completed

- Added shared diagnostics bundle helper with retention-safe cleanup:
  - `scripts/release/release-diagnostics-bundle-utils.mjs`
  - captures bundle manifests plus copied artifacts under:
    - `artifacts/release/diagnostics`
  - supports cleanup caps by age, bundle count, and file count.
- Added diagnostics bundle schema contract and validator:
  - `scripts/release/release-diagnostics-schema-contracts.mjs`
  - `scripts/release/validate-release-diagnostics-bundle-schema.mjs`
  - `docs/ops/schemas/release-diagnostics-bundle-output.schema.json`
  - `docs/ops/schemas/samples/release-diagnostics-bundle-output.sample.json`
- Integrated trigger-based diagnostics into:
  - `scripts/release/production-launch-gate.mjs`
  - triggers now capture bundles for:
    - repeated smoke timeout retries,
    - failed launch-gate runs,
    - runtime degradation (`runtimeProbe`, `sandboxExecutionMetrics`, `sandboxExecutionModeConsistency`).
- Added synthetic drill/test coverage:
  - `apps/api/src/__tests__/release-diagnostics-bundle.unit.spec.ts`
  - `apps/api/src/__tests__/release-diagnostics-bundle-schema-check.unit.spec.ts`
- Added package scripts:
  - `release:diagnostics:schema:check`
  - `release:diagnostics:schema:check:json`
- Validation:
  - `node --check` on changed release scripts: pass
  - targeted `jest` suites for diagnostics bundle capture + schema validation: pass
  - `release:diagnostics:schema:check -- docs/ops/schemas/samples/release-diagnostics-bundle-output.sample.json --json`: pass
  - `ci:workflow:inline-node-check`: pass
  - `lint`: pass
  - `ultracite:check`: pass
  - `release:launch:gate:production:json -- --required-external-channels all`: pass

### 2026-03-06 - Phase 5 completed

- Added lightweight OTEL-first HTTP observability instrumentation:
  - `apps/api/src/middleware/observability.ts`
  - records `otel_http_server_request` telemetry into `ux_events` for:
    - `/health`
    - `/ready`
    - `/api/admin/ai-runtime/health`
    - `/api/admin/ai-runtime/dry-run`
    - `/api/admin/agent-gateway/telemetry`
    - `/api/admin/sandbox-execution/metrics`
    - `/api/admin/release-health/external-channel-alerts`
- Added aggregated observability snapshot service and admin endpoint:
  - `apps/api/src/services/observability/adminObservabilityService.ts`
  - `apps/api/src/routes/admin.ts`
  - `GET /api/admin/observability/otel?hours=<n>`
  - optional filters:
    - `routeKey`
    - `correlationId`
    - `releaseRunId`
    - `executionSessionId`
  - snapshot correlates:
    - API request latency/error telemetry,
    - sandbox execution fallback/policy telemetry,
    - release-health external-channel alert telemetry.
- Added operator-facing observability block in `admin/ux` debug panel:
  - `apps/web/src/app/admin/ux/components/admin-ux-data-client.ts`
  - `apps/web/src/app/admin/ux/components/admin-ux-page-orchestration.ts`
  - `apps/web/src/app/admin/ux/components/admin-ux-gateway-runtime-prop-builders.tsx`
  - `apps/web/src/app/admin/ux/components/debug-diagnostics-section.tsx`
  - shows:
    - API p95,
    - API error rate,
    - runtime failure rate,
    - fallback-path share,
    - correlation coverage.
- Added/expanded coverage:
  - `apps/api/src/__tests__/observability.unit.spec.ts`
  - `apps/api/src/__tests__/admin-observability-service.unit.spec.ts`
  - `apps/api/src/__tests__/server.unit.spec.ts`
  - `apps/api/src/__tests__/admin.integration.spec.ts`
  - `apps/web/src/__tests__/admin-ux-page.spec.tsx`
- Validation:
  - targeted `jest` suites for observability middleware/service and admin UX debug panel: pass
  - `npm --workspace apps/api run build`: pass
  - `npm --workspace apps/web run build`: pass
  - `ci:workflow:inline-node-check`: pass
  - `lint`: pass
  - `ultracite:check`: pass
  - `release:launch:gate:production:json -- --required-external-channels all`: pass (`generatedAtUtc=2026-03-06T04:35:11.598Z`)
  - note: full `admin.integration.spec.ts` requires local postgres/redis; in this shell both localhost ports `5432` and `6379` were unavailable and Docker engine pipe was not reachable.

### 2026-03-06 - Phase 6 completed

- Added path-based Playwright/E2E scope classification:
  - `scripts/ci/classify-web-e2e-changes-core.js`
  - `scripts/ci/classify-web-e2e-changes.mjs`
  - `.github/actions/playwright-change-scope/action.yml`
- Updated CI/workflow gates to share the same local scope rules:
  - `.github/workflows/ci.yml`
  - `.github/workflows/web-pr-gate.yml`
  - critical coverage now triggers on web/public/API-surface/CI-runtime changes,
  - visual coverage is scoped separately,
  - docs/release-only edits no longer fan out into full web E2E runs.
- Added guaranteed Playwright artifact summary/manifest handling:
  - `scripts/ci/summarize-playwright-artifacts-core.js`
  - `scripts/ci/summarize-playwright-artifacts.mjs`
  - `.github/actions/playwright-artifacts-upload/action.yml`
  - failure runs now always publish a manifest JSON/Markdown summary,
  - skip cases still leave a scope-summary artifact for operator review.
- Added targeted CI coverage:
  - `apps/api/src/__tests__/ci-web-e2e-change-scope.unit.spec.ts`
  - `apps/api/src/__tests__/ci-playwright-artifacts-summary.unit.spec.ts`
- Validation:
  - targeted `jest` suites for change-scope and artifact-summary helpers: pass
  - `node --check` on new CI scripts: pass
  - `ci:workflow:inline-node-check`: pass
  - `prettier --check` on changed workflow/script files: pass
  - manual CLI sanity checks for classifier/artifact-summary wrappers: pass

### 2026-03-06 - Phase 7 completed

- Added operator saved-view shortcuts and latest-incident drill-down for release health:
  - `apps/web/src/app/admin/ux/components/release-health-section.tsx`
  - `apps/web/src/app/admin/ux/components/admin-ux-engagement-prop-builders.tsx`
- Extended `admin/ux` query-state, panel chrome, and orchestration to preserve
  observability scope across navigation:
  - `correlationId`
  - `executionSessionId`
  - `releaseRunId`
  - `routeKey`
  - touched files include:
    - `apps/web/src/app/admin/ux/components/admin-ux-page-orchestration.ts`
    - `apps/web/src/app/admin/ux/components/admin-ux-page-shell-view-model.ts`
    - `apps/web/src/app/admin/ux/components/admin-ux-page-entry.tsx`
    - `apps/web/src/app/admin/ux/components/admin-ux-page-load-state.tsx`
    - `apps/web/src/app/admin/ux/components/admin-ux-page-content.tsx`
    - `apps/web/src/app/admin/ux/components/admin-ux-main-panel-builder-types.ts`
    - `apps/web/src/app/admin/ux/components/admin-ux-page-utils.ts`
- Added scoped observability context into runtime/debug operator surfaces:
  - `apps/web/src/app/admin/ux/components/admin-ux-gateway-runtime-prop-builders.tsx`
  - `apps/web/src/app/admin/ux/components/admin-ux-view-models.ts`
  - operators can move from latest release alert to a filtered debug view without
    re-entering the run id manually.
- Expanded web coverage for the new navigation contract:
  - `apps/web/src/app/admin/ux/components/admin-ux-page-entry.spec.ts`
  - `apps/web/src/__tests__/admin-ux-page.spec.tsx`
- Validation:
  - targeted `jest` suites for `admin-ux-page-entry` and `admin-ux-page`: pass
  - combined Phase 6/7 targeted `jest` suites: pass
  - `prettier --write` on changed `admin/ux` component/test files: pass
  - `npm --workspace apps/web run build`: pass
    - note: required network-enabled rerun in this shell because `next/font` fetched Google Fonts during build.
  - `npm --workspace apps/api run build`: pass
  - `ci:workflow:inline-node-check`: pass
  - `ultracite:check`: pass
  - exit criteria met: operators can move from a failing release alert to scoped
    debug evidence through saved views and incident cards without manual hunting.

### 2026-03-06 - Post-completion validation hardening

- Hardened release JSON readers for local Windows parity:
  - `scripts/release/release-runtime-utils.mjs`
  - tolerant decoding now handles:
    - UTF-8 BOM
    - UTF-16 LE BOM
    - transient file-read locks (`EBUSY`, `EPERM`) with bounded retry
- Updated release validators/annotator to use the shared tolerant reader:
  - `scripts/release/validate-inline-post-release-health-artifacts-summary-schema.mjs`
  - `scripts/release/validate-release-health-report-schema.mjs`
  - `scripts/release/annotate-launch-gate-summary-inline-schema-check.mjs`
- Aligned inline-artifact producer/consumer defaults for local parity:
  - `scripts/release/validate-inline-post-release-health-artifacts.mjs`
  - now writes `artifacts/release/post-release-health-inline-artifacts-summary-<run_id>.json` by default.
- Removed shell-redirection dependence for post-release health summaries:
  - `scripts/release/post-release-health-report.mjs`
    - added `--summary-output <path>` for UTF-8 machine-readable summary persistence
  - `scripts/release/validate-release-health-report-schema.mjs`
    - added `--output <path>` for UTF-8 machine-readable schema-summary persistence
  - `scripts/release/run-post-release-health-gate.sh`
    - now uses the new output flags instead of `>` redirection
  - `docs/ops/release-runbook.md`
    - documents the cross-platform local commands
- Cleared the remaining runtime `npm audit` advisory in the API storage dependency path:
  - updated lockfile entries under the AWS XML subgraph:
    - `@aws-sdk/xml-builder` `3.972.5 -> 3.972.10`
    - `fast-xml-parser` `5.3.6 -> 5.4.1`
  - `npm audit --omit=dev --audit-level=high`: pass with `0 vulnerabilities`
- Expanded regression coverage:
  - `apps/api/src/__tests__/release-runtime-utils.unit.spec.ts`
  - `apps/api/src/__tests__/release-inline-health-artifacts-check.unit.spec.ts`
  - `apps/api/src/__tests__/release-inline-health-artifacts-schema-check.unit.spec.ts`
- Validation:
  - targeted `jest` suites for release runtime utils and inline-artifact helpers: pass
  - `release:health:report -- <run_id> --summary-output ...`: pass
  - immediate `release:health:schema:check -- ... --output ...` on the freshly written runtime report: pass
  - regenerated `post-release-health-summary-22549331429.json` and `post-release-health-schema-summary-22549331429.json` as UTF-8
  - `release:health:inline-artifacts:schema:check -- --json`: pass
  - `verify:local`: pass after dependency remediation
  - `release:dry-run:local`: pass after dependency remediation

## Hard Rule

Do not spend another release cycle on helper-only cleanup unless it directly
unblocks one of the phases above.
