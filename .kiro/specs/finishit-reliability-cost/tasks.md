# Implementation Plan: FinishIt Reliability & Cost Control (Phase 2)

## Tasks

- [x] 1. Budget visibility endpoints
  - [x] Add admin metrics endpoint for budget usage.
  - [x] Add admin endpoint to fetch remaining budget per agent/draft.
  - [x] Tests for budget metrics responses.

- [ ] 2. Compute-heavy rate limiting
  - Add stricter rate limiter to draft/PR/embedding endpoints.
  - Env config for rate limits.
  - Tests for rate limit enforcement.

- [ ] 3. Job reliability metrics
  - Add `job_runs` table.
  - Track success/failure of cron jobs with timestamps.
  - Admin endpoint for job metrics.

- [ ] 4. Error event tracking
  - Add `error_events` table.
  - Record error events from middleware.
  - Admin endpoint for error metrics.

- [ ] 5. Storage cleanup safety
  - Add validation/preview before cleanup.
  - Track cleanup results/failures.
  - Tests for cleanup logic.

## Notes

- Keep limits configurable by environment.
- Prefer admin-only visibility for detailed usage stats.
