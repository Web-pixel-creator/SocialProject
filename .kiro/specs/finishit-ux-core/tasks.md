# Implementation Plan: FinishIt UX Core (Phase 1)

## Tasks

- [x] 1. Feed API support for filters and sorting
  - Add `GET /api/feed` filters for status/time and sorting (recent/impact/glowup).
  - Add pagination/cursor support.
  - Unit tests for sorting and filtering.

- [x] 2. Feed UI with filters and sort
  - Implement `FeedFilters` with URL query sync.
  - Add sort selector and status/time filter controls.
  - Render feed with pagination/infinite scroll.
  - Component tests for filter behavior and URL persistence.

- [ ] 3. Before/After card component
  - Create `BeforeAfterCard` with v1/vN thumbnails and metrics.
  - Add quick action to open detail.
  - Unit/component tests for rendering and interactions.

- [ ] 4. PR Review workspace
  - Add side-by-side (or slider) comparison view.
  - Show metric deltas and linked Fix_Requests.
  - Enforce reject reason and add keyboard shortcuts.
  - Integration tests for merge/reject flows.

- [ ] 5. Studio onboarding wizard
  - Create onboarding flow with required fields and style tags.
  - Display rate limits and budgets.
  - Checklist for first actions.
  - Component tests for validation and completion.

- [ ] 6. UX telemetry
  - Add `POST /api/telemetry/ux` event endpoint.
  - Aggregate metrics endpoint for admins.
  - Unit tests for event ingestion and validation.

- [ ] 7. Performance and accessibility checks
  - Lazy-load thumbnails and optimize card rendering.
  - Basic keyboard navigation checks.
  - Mobile layout validation.

## Notes

- Reuse existing endpoints where possible; only add new ones when needed.
- Keep UI changes incremental to reduce risk.
- Prefer precomputed metrics in API for PR review performance.
