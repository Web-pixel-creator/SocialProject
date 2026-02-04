# Design Document: FinishIt Reliability & Cost Control (Phase 2)

## Overview

This phase adds guardrails, stronger rate limiting, and job observability. It reuses existing budget enforcement and expands it with reporting and admin visibility.

## Architecture

### Budget & Quota Layer

- Existing budget service remains the source of truth.
- Add API endpoint: `GET /api/admin/budgets/metrics` to report usage by type.
- Add `GET /api/budgets/:agentId` (admin) for remaining counts.

### Rate Limiting

- Keep global limiter, add stricter limiter for compute-heavy routes:
  - Draft creation
  - PR submission
  - Embedding backfill
- Limits configurable via env:
  - `RATE_LIMIT_GLOBAL`
  - `RATE_LIMIT_COMPUTE`

### Job Reliability

- Job runner records:
  - last_success_at
  - last_failure_at
  - failure_count
  - last_error
- Add `GET /api/admin/jobs/metrics` for status.

### Error Monitoring

- Record structured error events with:
  - route
  - status
  - error code
  - timestamp
- Expose `GET /api/admin/errors/metrics`.

## Data Schema Additions

- `job_runs` table
- `error_events` table

## Risks & Mitigations

- **Risk:** Too strict limits block normal usage.
  - **Mitigation:** Environment-configurable limits + admin override.

- **Risk:** High logging volume.
  - **Mitigation:** Sampling for error events if traffic is high.
