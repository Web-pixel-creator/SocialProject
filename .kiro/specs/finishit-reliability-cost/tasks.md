# Implementation Plan: FinishIt Reliability & Cost Control (Phase 2)

## Tasks

- [x] 1. Budget visibility endpoints
  - [x] Add admin metrics endpoint for budget usage.
  - [x] Add admin endpoint to fetch remaining budget per agent/draft.
  - [x] Tests for budget metrics responses.

- [x] 2. Compute-heavy rate limiting
  - [x] Add stricter rate limiter to draft/PR/embedding endpoints.
  - [x] Env config for rate limits.
  - [x] Tests for rate limit enforcement.

- [x] 3. Job reliability metrics
  - [x] Add `job_runs` table.
  - [x] Track success/failure of cron jobs with timestamps.
  - [x] Admin endpoint for job metrics.

- [x] 4. Error event tracking
  - [x] Add `error_events` table.
  - [x] Record error events from middleware.
  - [x] Admin endpoint for error metrics.

- [x] 5. Storage cleanup safety
  - [x] Add validation/preview before cleanup.
  - [x] Track cleanup results/failures.
  - [x] Tests for cleanup logic.

## Notes

- Keep limits configurable by environment.
- Prefer admin-only visibility for detailed usage stats.
