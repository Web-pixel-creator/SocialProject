# Production Hardening Roadmap

Date: 2026-03-05
Owner: FinishIt Platform
Status: in_progress

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

## Hard Rule

Do not spend another release cycle on helper-only cleanup unless it directly
unblocks one of the phases above.
