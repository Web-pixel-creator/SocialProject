# OpenSandbox Pattern Adoption Plan (No Migration)

Date: 2026-03-03  
Owner: FinishIt Platform  
Status: in progress

## Goal

Adopt high-value OpenSandbox patterns in `SocialProject` without replacing the current platform:
- keep existing `Agent Gateway` control plane,
- add isolated execution plane for untrusted/expensive agent tasks,
- improve security and operator visibility.

## Non-Goals

- No full migration to OpenSandbox infrastructure.
- No replacement of current orchestration, personas, or feed/product flows.
- No immediate Kubernetes-first rollout.

## Current Baseline

- Agent Gateway ingest and connector policy stack already exists (`/api/agent-gateway/adapters/ingest` + connector profiles/secrets/policies).
- Runtime operations and release gates are already established in runbooks and launch-gate automation.
- Alert-risk strict reassessment closure is complete as of `2026-03-03` (`RELEASE_HEALTH_ALERT_RISK_STRICT=true`).

## Phase A - Execution Plane Interface (Thin Adapter)

1. Add `SandboxExecutionService` interface in API layer:
   - `createSandbox`
   - `runCommand`
   - `runCode`
   - `uploadFiles`
   - `downloadArtifacts`
   - `destroySandbox`
2. Add feature flag:
   - `SANDBOX_EXECUTION_ENABLED=false` by default.
3. Keep in-process fallback path (current behavior) when flag is off.

Exit criteria:
- build/test pass,
- no behavior change with flag off.

## Phase B - Safe Pilot Path (One Tool Class)

1. Route only selected tasks through execution plane:
   - browser automation and/or untrusted code helpers.
2. Enforce per-run profile:
   - CPU/memory limits,
   - TTL,
   - max artifact size,
   - command timeout.
3. Persist audit envelope:
   - who requested,
   - sandbox/session id,
   - tool name,
   - start/end timestamps,
   - outcome/error code.

Exit criteria:
- one end-to-end pilot flow stable in staging,
- deterministic rollback to fallback path.

## Phase C - Egress Policy Hardening

1. Default deny egress for execution runs.
2. Add allowlist profiles by connector/tool class:
   - example: `github_api`, `openai_api`, `internal_webhook`.
3. Add reject telemetry:
   - blocked domain/IP attempts,
   - policy profile id.

Exit criteria:
- blocked traffic is observable and test-covered,
- required integrations still pass.

## Phase D - Ops and Release Integration

1. Extend `launch-gate`/health checks with execution plane checks:
   - sandbox create/run/destroy smoke,
   - policy-enforced deny/allow probes.
2. Add runbook section for execution incidents:
   - timeout bursts,
   - cleanup failures,
   - policy misconfiguration.
3. Add kill-switch playbook:
   - disable execution plane via env,
   - verify fallback path.

Exit criteria:
- documented operator flow,
- strict launch-gate includes execution checks.

## Proposed Implementation Order (Next 5 Tasks)

1. `SandboxExecutionService` interface + env flags.
2. Pilot adapter implementation (single flow).
3. Execution telemetry schema + admin read endpoint.
4. Egress policy profile mapping for pilot flow.
5. Launch-gate + runbook integration.

## Progress Snapshot (2026-03-03)

- Completed `Phase A / Step 1`:
  - added API env flag `SANDBOX_EXECUTION_ENABLED` (default `false`),
  - added Phase A execution-plane interface + service scaffold:
    - `apps/api/src/services/sandboxExecution/types.ts`
    - `apps/api/src/services/sandboxExecution/sandboxExecutionService.ts`,
  - added explicit fallback wrapper (`executeWithFallback(...)`) to preserve current in-process execution path,
  - added unit coverage:
    - `apps/api/src/__tests__/sandbox-execution.unit.spec.ts`.
- Started `Phase B` pilot wiring (fallback-safe):
  - integrated `sandboxExecutionService.executeWithFallback(...)` into:
    - `POST /api/admin/ai-runtime/dry-run`
      (`apps/api/src/routes/admin.ts`),
  - behavior is unchanged (still in-process execution) while adding execution-plane entry point for later adapter swap.
- Completed telemetry schema + admin read endpoint:
  - added formal telemetry metadata schema/types in:
    - `apps/api/src/services/sandboxExecution/types.ts`,
  - added sandbox execution telemetry write path (success/failure, timing, operation, mode, fallback marker):
    - source: `sandbox_execution`
    - event type: `sandbox_execution_attempt`
    - file: `apps/api/src/services/sandboxExecution/sandboxExecutionService.ts`,
  - added admin metrics endpoint:
    - `GET /api/admin/sandbox-execution/metrics`
    - query: `hours`, `operation`, `status`, `limit`
    - file: `apps/api/src/routes/admin.ts`,
  - added integration tests for endpoint contract in:
    - `apps/api/src/__tests__/admin.integration.spec.ts`.
- Completed egress profile mapping scaffold for pilot flow:
  - added parser/resolver for operation->egress profile map (supports `*` fallback):
    - `apps/api/src/services/sandboxExecution/egressProfile.ts`,
  - added env/config surface:
    - `SANDBOX_EXECUTION_EGRESS_PROFILES`
    - (`apps/api/src/config/env.ts`, `apps/api/.env.example`),
  - telemetry metadata now includes `egressProfile` and supports profile-based aggregation/filtering:
    - service: `apps/api/src/services/sandboxExecution/sandboxExecutionService.ts`,
    - admin endpoint filter: `egressProfile` on
      `GET /api/admin/sandbox-execution/metrics`,
  - added unit coverage:
    - `apps/api/src/__tests__/sandbox-execution-egress-profile.unit.spec.ts`.
- Validation:
  - `npx ultracite check apps/api/src/config/env.ts apps/api/src/services/sandboxExecution/egressProfile.ts apps/api/src/services/sandboxExecution/types.ts apps/api/src/services/sandboxExecution/sandboxExecutionService.ts apps/api/src/routes/admin.ts apps/api/src/__tests__/sandbox-execution.unit.spec.ts apps/api/src/__tests__/sandbox-execution-egress-profile.unit.spec.ts apps/api/src/__tests__/admin.integration.spec.ts` passed.
  - `npx jest apps/api/src/__tests__/sandbox-execution.unit.spec.ts apps/api/src/__tests__/sandbox-execution-egress-profile.unit.spec.ts apps/api/src/__tests__/ai-runtime.unit.spec.ts --runInBand --config jest.config.cjs` passed.
  - `npm --workspace apps/api run build` passed.
  - targeted integration suite for new admin endpoint is added but requires local Postgres/Redis; local run failed at DB connection bootstrap in current environment.
- Completed `Phase D` launch-gate/runbook integration:
  - production launch gate now probes sandbox execution metrics in both health checkpoint and runtime probe:
    - endpoint checks include `GET /api/admin/sandbox-execution/metrics?hours=24&limit=20`,
    - runtime probe validates scoped telemetry for `operation=ai_runtime_dry_run`,
    - new summary check: `sandboxExecutionMetrics.pass`,
    - new artifact: `artifacts/release/production-sandbox-execution-metrics.json`,
    - file: `scripts/release/production-launch-gate.mjs`,
  - release/runbook docs updated for operator execution and incident handling:
    - `docs/ops/release-checklist.md`
    - `docs/ops/release-runbook.md`
    - `docs/ops/agent-gateway-ai-runtime-runbook.md`
    - `docs/ops/rollback-playbook.md`.
- Extended launch-gate with egress allow/deny probe for sandbox telemetry filters:
  - resolves expected profile from `SANDBOX_EXECUTION_EGRESS_PROFILES` (`ai_runtime_dry_run` or `*`),
  - executes allow probe (`egressProfile=<expected>`) and deny probe (`egressProfile=<random_probe>`),
  - emits new check `sandboxExecutionEgressPolicy` and artifact:
    - `artifacts/release/production-sandbox-execution-egress-policy.json`,
  - keeps check explicit as `skipped` when no mapping is configured.
- Implemented pilot-path egress policy enforcement for runtime dry-run:
  - added enforcement config:
    - `SANDBOX_EXECUTION_EGRESS_ENFORCE`
    - `SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS`,
  - extended sandbox execution service policy evaluation (`allow` / `deny` / `not_enforced`) with explicit deny errors:
    - `SANDBOX_EXECUTION_EGRESS_PROFILE_REQUIRED`
    - `SANDBOX_EXECUTION_EGRESS_PROFILE_UNCONFIGURED`
    - `SANDBOX_EXECUTION_EGRESS_POLICY_DENY`,
  - `POST /api/admin/ai-runtime/dry-run` now passes provider context into policy evaluation before fallback execution,
  - telemetry metadata now records enforcement decision and denied providers,
  - admin metrics query now supports `egressDecision` filter on
    `GET /api/admin/sandbox-execution/metrics`.
- Completed production rollout validation for pilot-path enforcement:
  - applied production `api` config:
    - `SANDBOX_EXECUTION_EGRESS_ENFORCE=true`
    - `SANDBOX_EXECUTION_EGRESS_PROFILES={"ai_runtime_dry_run":"ai_runtime"}`
    - `SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS={"ai_runtime":["claude-4","gpt-4.1","gemini-2","sd3","dalle-3"]}`,
  - deployed latest API revision and reran strict launch-gate with required external channels:
    - `npm run release:launch:gate:production:json -- --required-external-channels all`,
  - strict gate outcome:
    - `sandboxExecutionMetrics.pass=true`
    - `sandboxExecutionEgressPolicy.pass=true`
    - allow probe (`egressDecision=allow`) `total=1`
    - deny probe (`egressDecision=deny`) `total=0`.
- Completed pilot-path execution-limits profile enforcement scaffold:
  - added config surface:
    - `SANDBOX_EXECUTION_LIMITS_ENFORCE`
    - `SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES`
    - `SANDBOX_EXECUTION_LIMIT_PROFILES`,
  - added operation/profile + profile/limits parser-resolver:
    - `apps/api/src/services/sandboxExecution/limitsProfile.ts`,
  - extended policy context and telemetry metadata with limits decision fields:
    - `limitsProfile`, `limitsDecision`, `limitsApplied`, `limitsRequested`,
  - `SandboxExecutionService` now enforces limit profiles pre-fallback and applies effective timeout guard (`SANDBOX_EXECUTION_TIMEOUT`) during wrapped execution,
  - admin metrics endpoint now supports:
    - filters: `limitsProfile`, `limitsDecision`
    - breakdown: `limitsProfileBreakdown`,
  - production launch-gate now includes limits policy probe:
    - check: `sandboxExecutionLimitsPolicy`
    - artifact: `artifacts/release/production-sandbox-execution-limits-policy.json`.
- Validation:
  - `npx ultracite check` on changed sandbox/admin files passed.
  - `npx jest apps/api/src/__tests__/sandbox-execution.unit.spec.ts apps/api/src/__tests__/sandbox-execution-egress-profile.unit.spec.ts apps/api/src/__tests__/sandbox-execution-limits-profile.unit.spec.ts apps/api/src/__tests__/ai-runtime.unit.spec.ts --runInBand --config jest.config.cjs` passed.
  - `npm --workspace apps/api run build` passed.
  - `node --check scripts/release/production-launch-gate.mjs` passed.
- Completed production rollout for limits enforcement:
  - set production `api` vars:
    - `SANDBOX_EXECUTION_LIMITS_ENFORCE=true`
    - `SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES={"ai_runtime_dry_run":"runtime_default"}`
    - `SANDBOX_EXECUTION_LIMIT_PROFILES={"runtime_default":{"cpuCores":2,"memoryMb":1024,"timeoutMs":12000,"ttlSeconds":900,"maxArtifactBytes":5242880}}`,
  - deployed latest API revision and reran strict launch-gate (`required_external_channels=all`),
  - strict gate outcome confirms:
    - `sandboxExecutionLimitsPolicy.pass=true`
    - allow probe (`limitsDecision=allow`) `total=1`
    - deny probe (`limitsDecision=deny`) `total=0`.
- Completed audit-envelope telemetry + strict-gate enforcement for pilot runtime flow:
  - added audit context metadata support on sandbox execution path:
    - policy context now accepts `audit` envelope (`actorId`, `actorType`, `sessionId`, `sourceRoute`, `toolName`),
    - telemetry metadata now persists normalized `audit` object when provided,
    - `POST /api/admin/ai-runtime/dry-run` now emits audit context for wrapped execution.
  - extended `GET /api/admin/sandbox-execution/metrics` with `auditCoverage` summary:
    - `totalWithAudit`, `actorIdCount`, `actorTypeCount`, `sessionIdCount`, `sourceRouteCount`, `toolNameCount`, `coverageRate`.
  - extended production launch-gate with audit policy probe/check:
    - check: `sandboxExecutionAuditPolicy`
    - artifact: `artifacts/release/production-sandbox-execution-audit-policy.json`
    - strict condition: telemetry for `ai_runtime_dry_run` must include non-empty `actorType`, `sourceRoute`, and `toolName`.
  - deployed latest `api` revision and reran strict launch-gate (`required_external_channels=all`),
  - strict gate outcome confirms:
    - `sandboxExecutionAuditPolicy.pass=true`
    - artifact totals: `total=3`, `totalWithAudit=1`, `actorTypeCount=1`, `sourceRouteCount=1`, `toolNameCount=1`.

## Risks

1. Added operational complexity (new runtime dependency).
2. Potential latency increase for agent tasks.
3. Policy drift between environments.

## Mitigations

1. Feature-flag + fallback by default.
2. Start with one pilot flow and strict timeout/TTL.
3. Schema-driven policy config and launch-gate assertions.
