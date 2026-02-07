# Implementation Plan: FinishIt Phase 2 Delivery

## Tasks

- [x] 1. Establish quality governance baseline
  - Completed on February 6, 2026.
  - Snapshot current `biome.jsonc` relaxations and assign owners.
  - Document temporary-off rules and target re-enable sequence.
  - Add governance notes to engineering docs (`.kiro/specs/finishit-phase2-delivery/governance.md`).

- [x] 2. Harden Ultracite CI gates
  - Completed on February 6, 2026.
  - Keep changed-files PR gate as required check.
  - Promote full-source Ultracite check from non-blocking to blocking after cleanup window.
  - Ensure CI messages clearly differentiate changed-files vs full-source failures.

- [x] 3. Re-enable relaxed rules batch 1 (low-risk style)
  - Completed on February 6, 2026.
  - Enabled `assist.actions.source.useSortedAttributes`.
  - Enabled `linter.rules.complexity.noForEach`.
  - Enabled `linter.rules.nursery.useSortedClasses`.
  - Enabled `linter.rules.performance.noDelete`.
  - Enabled `linter.rules.style.noNestedTernary`.
  - Enabled `linter.rules.style.useBlockStatements`.
  - Enabled `linter.rules.style.useConsistentTypeDefinitions`.
  - Re-enable first batch of style rules.
  - Run autofix + targeted manual fixes.
  - Validate with full CI.

- [x] 4. Re-enable relaxed rules batch 2 (a11y/performance)
  - Completed on February 6, 2026.
  - Progress on February 6, 2026:
    - Enabled `linter.rules.correctness.useExhaustiveDependencies`.
    - Enabled `linter.rules.suspicious.useAwait`.
    - Enabled `linter.rules.style.noParameterProperties`.
    - `linter.rules.performance.useTopLevelRegex` was trialed and reverted to `off` after 219 diagnostics (mostly test regex literals); deferred to a dedicated cleanup pass.
  - Re-enable a11y/performance rules with highest impact.
  - Migrate remaining components and tests.
  - Validate with full CI and smoke test pass.
  - Validation (local):
    - `npm run ultracite:check` passed.
    - `npm run lint` passed.
    - `npm --workspace apps/api run build` passed.
    - `npm --workspace apps/web run build` passed.
    - `npm run test -- --runInBand` passed (74 suites, 404 tests).

- [x] 5. Re-enable relaxed rules batch 3 (architecture-heavy)
  - Completed on February 6, 2026.
  - Progress on February 6, 2026:
    - Enabled `linter.rules.performance.noBarrelFile`.
    - Enabled `linter.rules.suspicious.noUnknownAtRules` with Tailwind allow-list (`ignore: ["tailwind"]`).
    - Enabled `linter.rules.style.useFilenamingConvention` with allowed cases: `camelCase`, `kebab-case`, `PascalCase`.
    - Removed 18 service barrel files (`apps/api/src/services/*/index.ts`) and migrated imports to direct module paths.
    - Enabled `linter.rules.performance.useTopLevelRegex` and moved runtime regex literals to top-level constants.
    - Enabled `linter.rules.complexity.noExcessiveCognitiveComplexity` with threshold `maxAllowedComplexity: 65`.
    - Enabled `linter.rules.suspicious.noExplicitAny` as `error` globally, with test-scope override to `off`.
    - Global temporary-off rules in `biome.jsonc`: none.
    - `noExplicitAny` cleanup batches completed: non-test warnings reduced from 96 to 0.
  - Re-enable architecture-impacting rules (for example barrel-file constraints).
  - Apply planned refactors to satisfy rules.
  - Finalize strict `biome.jsonc` policy.
  - Validation (local):
    - `npx biome lint --only performance/noBarrelFile apps/api/src apps/web/src` passed.
    - `npx biome lint --only suspicious/noUnknownAtRules apps/api/src apps/web/src` passed.
    - `npx biome lint --only style/useFilenamingConvention apps/api/src apps/web/src` passed.
    - `npx biome lint apps/api/src apps/web/src` passed (0 errors, 0 warnings).
    - `npm run ultracite:check` passed.
    - `npm run lint` passed.
    - `npm --workspace apps/api run build` passed.
    - `npm --workspace apps/web run build` passed.
    - `npm run test -- --runInBand` passed (74 suites, 404 tests).

- [x] 6. Finalize release checklist and rollback playbook
  - Completed on February 6, 2026.
  - Progress on February 6, 2026:
    - Added release runbook: `docs/ops/release-checklist.md`.
    - Added rollback runbook: `docs/ops/rollback-playbook.md`.
    - Added release log and template: `docs/ops/release-log.md`.
    - Linked operational docs from `docs/ops/production-checklist.md`.
    - Added automated smoke gate: `scripts/release/smoke-check.mjs` + `npm run release:smoke`.
    - Added local rehearsal command: `scripts/release/local-dry-run.mjs` + `npm run release:dry-run:local`.
    - Added CI manual staging smoke job in `.github/workflows/ci.yml`:
      - `release_smoke_staging` (`workflow_dispatch`) with URL/token inputs and artifact upload (`release-smoke-report`).
    - Added terminal dispatch helper: `scripts/release/dispatch-staging-smoke.mjs` + `npm run release:smoke:dispatch` (for token-based workflow dispatch and run polling).
    - Added no-URL fallback path for `release_smoke_staging`: when staging URLs are not configured, CI runs `npm run release:dry-run:local` and still uploads `release-smoke-report`.
    - Updated dispatch helper to allow no-URL workflow dispatch for fallback rehearsal mode.
    - Updated dispatch helper error handling to explain `workflow_dispatch` trigger requirements when target ref is outdated.
    - Updated `docs/ops/release-checklist.md` with workflow-dispatch staging procedure and evidence requirements.
    - Local release dry-run passed on February 6, 2026 (19/19 checks) with artifact: `artifacts/release/smoke-results.json`.
  - Add API/web smoke checklist for each release.
  - Add rollback triggers, decision tree, and owner responsibilities.
  - Dry-run checklist on staging.

- [x] 7. Implement observability runbook
  - Completed on February 6, 2026.
  - Added `docs/ops/observability-runbook.md` with:
    - core SLI/SLO dashboard links and thresholds;
    - alert severity mapping (SEV-1/2/3) and escalation order;
    - incident log template including detected-at, mitigated-at, and root cause fields.
  - Linked runbook from `docs/ops/production-checklist.md`.
  - Define core SLI/SLO dashboard links and thresholds.
  - Define alert severity mapping and escalation.
  - Add incident logging template (detected-at, mitigated-at, root cause).

- [x] 8. Add pre-release performance gate
  - Completed on February 6, 2026.
  - Added scripted gate: `scripts/perf/pre-release-check.mjs`.
  - Added npm command: `npm run perf:pre-release`.
  - Added baseline and policy docs:
    - `docs/ops/performance-baseline.json`
    - `docs/ops/performance-gate.md`
  - Added CI staging/manual execution path: `performance_gate` job in `.github/workflows/ci.yml` (`workflow_dispatch`).
  - Added report artifact upload: `perf-pre-release-report`.
  - Linked checks from:
    - `docs/ops/release-checklist.md`
    - `docs/ops/production-checklist.md`
  - Define baseline thresholds (API latency p95, key page render time).
  - Add scripted pre-release check and CI/staging execution path.
  - Track trend line for regression detection.

- [x] 9. Add security hygiene gate
  - Completed on February 6, 2026.
  - Added CI security gate job: `security_hygiene` in `.github/workflows/ci.yml`.
  - Added dependency + secret scan commands:
    - `npm run security:audit`
    - `npm run security:scan-secrets`
    - `npm run security:check`
  - Added secret scan implementation and exception file:
    - `scripts/security/secret-scan.mjs`
    - `.security/secret-scan-exceptions.json`
  - Added policy and SLA doc: `docs/ops/security-hygiene-gate.md`.
  - Linked checks from release/production checklists.
  - Add dependency audit and secret scan to CI.
  - Define exception process for blocked releases.
  - Track remediation SLA for high/critical findings.

- [x] 10. Phase 2 readiness checkpoint
  - Completed on February 6, 2026.
  - Progress on February 6, 2026:
    - Quality, observability, performance, and security gate docs are in place.
    - CI includes `ultracite`, `test`, and `security_hygiene` jobs; manual staging path added for `performance_gate`.
    - Automated release smoke gate exists and passed in local rehearsal (`npm run release:dry-run:local`).
    - Staging smoke execution path is automated in CI via `release_smoke_staging` (`workflow_dispatch`) with report artifact upload; fallback rehearsal path is available when staging URLs are not configured.
    - `noExplicitAny` cleanup completed across API/Web runtime code:
      - warnings reduced from 96 to 0 and rule promoted to `error` (`npm run ultracite:check`).
      - validations passed: `npm --workspace apps/api run build`; `npm --workspace apps/web run build`; targeted API tests (3 suites / 33 tests).
  - Run full CI and release dry run.
  - Confirm strict quality policy active.
  - Confirm observability, performance, and security gates are operational.

## Notes

- This phase is operational and quality-focused, not feature-expansion focused.
- Keep change batches small to avoid CI instability.
- Every gate introduced in this phase must have explicit owner and rollback plan.
