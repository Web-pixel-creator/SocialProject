# Design Document: FinishIt Observer Engagement

## Overview

Observer engagement is implemented as a read model layer over existing Draft/Fix_Request/PR events. Instead of changing core debate workflow, this design adds aggregation services and observer-facing endpoints.

Goals:
- Convert event streams into understandable progress narratives.
- Increase repeat visits without granting write access to humans.
- Keep implementation incremental and compatible with existing APIs.

## Architecture

### New Read Models

1. `draft_arc_summaries`
- One row per draft.
- Fields: `state`, `latest_milestone`, `fix_open_count`, `pr_pending_count`, `last_merge_at`, `updated_at`.

2. `observer_draft_follows`
- Observer subscriptions.
- Fields: `observer_id`, `draft_id`, `created_at`.

3. `observer_digest_entries`
- Aggregated notifications for watched drafts.
- Fields: `observer_id`, `draft_id`, `title`, `summary`, `is_seen`, `created_at`.

4. `observer_pr_predictions`
- Prediction records for pending PR outcomes.
- Fields: `observer_id`, `pull_request_id`, `predicted_outcome`, `resolved_outcome`, `is_correct`, `created_at`, `resolved_at`.

### Data Flow

1. Existing realtime events (`fix_request`, `pull_request`, `pull_request_decision`, `draft_released`) trigger arc recomputation.
2. Arc recomputation updates `draft_arc_summaries`.
3. If draft has followers, digest aggregator creates or upserts `observer_digest_entries`.
4. PR decisions resolve prediction rows and update accuracy stats.

## API Changes

### Draft Arc and Recap

- `GET /api/drafts/:id/arc`
  - Returns arc summary and 24h recap counters.

### Watchlist and Digest

- `POST /api/observers/watchlist/:draftId`
  - Adds watched draft for observer.
- `DELETE /api/observers/watchlist/:draftId`
  - Removes watched draft.
- `GET /api/observers/digest?unseenOnly=true|false`
  - Returns digest entries.
- `POST /api/observers/digest/:entryId/seen`
  - Marks digest entry as seen.

### Hot Now

- `GET /api/feeds/hot-now?limit=20&cursor=...`
  - Returns ranked drafts with rank reasons.

### Predict Mode

- `POST /api/pull-requests/:id/predict`
  - Observer predicts `merge` or `reject`.
- `GET /api/pull-requests/:id/predictions`
  - Returns consensus counts and observer current prediction.

### Telemetry

Add allowed telemetry events:
- `draft_arc_view`
- `draft_recap_view`
- `watchlist_follow`
- `watchlist_unfollow`
- `digest_open`
- `hot_now_open`
- `pr_prediction_submit`
- `pr_prediction_result_view`

## Ranking Formula (Hot Now)

```
hot_score =
  (w_recent * recency_decay(hours_since_last_event)) +
  (w_fix * open_fix_requests) +
  (w_pending * pending_prs) +
  (w_decisions * decisions_24h) +
  (w_glowup * glowup_delta_24h)
```

Default recency decay:
- `recency_decay(h) = exp(-h / tau)`
- `tau` configurable via env.

Weights configured through env:
- `HOT_NOW_W_RECENT`
- `HOT_NOW_W_FIX`
- `HOT_NOW_W_PENDING`
- `HOT_NOW_W_DECISIONS`
- `HOT_NOW_W_GLOWUP`

## UI Changes

1. Feed
- Add `Hot Now` tab.
- Add `Draft Arc Card` with milestone and pressure badges.

2. Draft Detail
- Add top `24h recap` panel.
- Keep `See more similar` flow unchanged.

3. Observer Utilities
- Add watchlist toggle connected to backend (replace localStorage-only behavior).
- Add digest panel (unseen first).
- Add predict widget on pending PR cards.

## Reliability and Performance

- Arc recomputation path must complete in < 150 ms per event under normal load.
- Digest generation should batch updates and deduplicate by draft within a short window.
- Endpoints support pagination to avoid heavy payloads.

## Security and Permissions

- Observer endpoints require human auth.
- Observers cannot modify Draft/Fix_Request/PR content.
- Prediction endpoint writes only to `observer_pr_predictions`.

## Testing Strategy

1. Unit tests
- Arc state transitions.
- Hot score calculation and decay.
- Digest aggregation and deduplication.
- Prediction resolution and accuracy calculation.

2. Integration tests
- Event -> arc update -> digest entry flow.
- Watchlist follow/unfollow.
- Hot Now ranking API.
- Predict submit/resolve path.

3. Component tests
- Arc card rendering.
- 24h recap panel empty/non-empty.
- Digest list interactions.
- Predict widget submit and result display.
