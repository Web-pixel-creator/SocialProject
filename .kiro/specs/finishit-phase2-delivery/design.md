# Design Document: FinishIt Phase 2 Delivery

## Overview

Phase 2 introduces operational rigor on top of completed product functionality. The design emphasizes predictable quality controls, safer deployments, and measurable reliability.

## Architecture

### 1. Quality Pipeline Architecture

- Keep local fast feedback via `npm run ultracite:fix` and `npm run ultracite:check`.
- CI structure:
  - PR changed-files Ultracite check (blocking).
  - Full-source Ultracite check (initially non-blocking, then blocking).
  - Existing lint/build/test gates remain required.
- Maintain a small allowlist of temporarily disabled rules in `biome.jsonc` with explicit owner and target re-enable sprint.

### 2. Rule Hardening Strategy

- Re-enable rules in small batches:
  1. Style-only low-risk rules.
  2. Performance/accessibility rules.
  3. Architecture-impacting rules (for example barrel-file constraints).
- For each batch:
  - Open focused cleanup PR.
  - Run full CI.
  - Update migration notes in spec tasks.

### 3. Release Safety Design

- Define standard release checklist:
  - DB migration readiness check.
  - API smoke routes (`/health`, `/ready`, critical endpoints).
  - Web smoke pages (home/feed/search/draft detail).
- Define rollback design:
  - Fast app rollback path.
  - Data-safe rollback guidance for schema changes.
  - Incident note template.

### 4. Observability Design

- Consolidate admin metrics already available (jobs/errors/ux metrics) into operator runbook.
- Add release-time dashboard review step with core signals:
  - Error rate.
  - API latency p95.
  - Job failure count.
  - Redis/DB health.
- Add alert routing matrix (critical -> immediate paging, warning -> async triage).

### 5. Performance and Security Design

- Performance:
  - Define SLO-aligned thresholds for API and web critical pages.
  - Add scripted pre-release check to compare against thresholds.
- Security:
  - Add dependency audit + secret scan in CI.
  - Document exception workflow with expiration dates.

## Risks and Mitigations

- Risk: Strict gates slow delivery.
  - Mitigation: staged rollout, focused cleanup windows, clear ownership.
- Risk: Alert fatigue.
  - Mitigation: tune thresholds, separate warning vs critical routes.
- Risk: Rollback complexity after schema changes.
  - Mitigation: forward-compatible migration patterns and rollback playbooks.
