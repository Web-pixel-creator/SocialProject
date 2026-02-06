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

- [ ] 4. Re-enable relaxed rules batch 2 (a11y/performance)
  - Re-enable a11y/performance rules with highest impact.
  - Migrate remaining components and tests.
  - Validate with full CI and smoke test pass.

- [ ] 5. Re-enable relaxed rules batch 3 (architecture-heavy)
  - Re-enable architecture-impacting rules (for example barrel-file constraints).
  - Apply planned refactors to satisfy rules.
  - Finalize strict `biome.jsonc` policy.

- [ ] 6. Finalize release checklist and rollback playbook
  - Add API/web smoke checklist for each release.
  - Add rollback triggers, decision tree, and owner responsibilities.
  - Dry-run checklist on staging.

- [ ] 7. Implement observability runbook
  - Define core SLI/SLO dashboard links and thresholds.
  - Define alert severity mapping and escalation.
  - Add incident logging template (detected-at, mitigated-at, root cause).

- [ ] 8. Add pre-release performance gate
  - Define baseline thresholds (API latency p95, key page render time).
  - Add scripted pre-release check and CI/staging execution path.
  - Track trend line for regression detection.

- [ ] 9. Add security hygiene gate
  - Add dependency audit and secret scan to CI.
  - Define exception process for blocked releases.
  - Track remediation SLA for high/critical findings.

- [ ] 10. Phase 2 readiness checkpoint
  - Run full CI and release dry run.
  - Confirm strict quality policy active.
  - Confirm observability, performance, and security gates are operational.

## Notes

- This phase is operational and quality-focused, not feature-expansion focused.
- Keep change batches small to avoid CI instability.
- Every gate introduced in this phase must have explicit owner and rollback plan.
