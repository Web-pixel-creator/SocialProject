# Implementation Plan: FinishIt Observer Engagement

## Tasks

- [x] 1. Add observer engagement schema
  - Create migration for `draft_arc_summaries`.
  - Create migration for `observer_draft_follows`.
  - Create migration for `observer_digest_entries`.
  - Create migration for `observer_pr_predictions`.
  - Add indexes for draft lookup, observer lookup, and unseen digest queries.

- [x] 2. Build arc and recap service
  - Implement `DraftArcService` with state transitions.
  - Implement 24h recap counters from event tables.
  - Add unit tests for transitions and recap edge cases.

- [x] 3. Wire arc updates to existing events
  - Trigger recomputation on Fix_Request create.
  - Trigger recomputation on PR create.
  - Trigger recomputation on PR decision.
  - Trigger recomputation on Draft release.
  - Add integration tests for event-to-arc pipeline.

- [x] 4. Implement watchlist and digest backend
  - Add follow/unfollow endpoints.
  - Add digest list and mark-seen endpoints.
  - Implement digest aggregation and deduplication window.
  - Add integration tests for digest lifecycle.

- [x] 5. Implement Hot Now feed
  - Add ranking service with configurable weights.
  - Add `GET /api/feeds/hot-now`.
  - Include rank reason in API response.
  - Add unit tests for score math and decay.
  - Add integration tests for ranking order.

- [x] 6. Implement Predict Mode APIs
  - [x] Add prediction submit endpoint for observers.
  - [x] Add predictions summary endpoint per PR.
  - [x] Resolve predictions on PR decision.
  - [x] Add unit/integration tests for correctness and permissions.

- [x] 7. Extend telemetry for observer engagement
  - [x] Add new telemetry event types.
  - [x] Add admin aggregate endpoint for engagement KPIs.
  - [x] Add tests for telemetry validation and aggregation.

- [x] 8. Implement observer UI components
  - [x] Add `Hot Now` tab in feed.
  - [x] Add `DraftArcCard` component.
  - [x] Add `24h recap` panel to draft detail.
  - [x] Replace localStorage-only follow with backend watchlist API.
  - [x] Add digest panel and unseen badges.
  - [x] Add predict widget for pending PRs.
  - [x] Add component tests for new UI.

- [x] 9. Validate end-to-end engagement loop
  - [x] Run full test suite.
  - [x] Manual QA script: follow draft -> receive digest -> open hot-now -> submit prediction -> see resolution.
  - [x] Verify no permission regressions for observer read-only constraints.
  - [x] Document rollout notes and feature flags.

## Notes

- Roll out behind feature flags: `ENABLE_HOT_NOW`, `ENABLE_OBSERVER_DIGEST`, `ENABLE_PREDICT_MODE`.
- Keep all observer features additive; do not alter core Draft/PR moderation rights.
