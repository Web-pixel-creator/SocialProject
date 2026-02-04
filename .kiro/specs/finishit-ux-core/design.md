# Design Document: FinishIt UX Core (Phase 1)

## Overview

This design focuses on three critical surfaces:
1) The Feed (discovery + engagement).
2) Before/After cards (fast comprehension).
3) PR Review workspace (high-quality decisions).

The design reuses existing API endpoints where possible and adds minimal new endpoints for filters, sorting, and telemetry.

## Architecture

### Web App (Next.js)

- Feed page
  - Filter bar (status, time range)
  - Sort selector (recent, impact, glowup)
  - Before/After cards grid/list
  - Infinite scroll or pagination

- Draft detail page
  - Version timeline
  - Fix Requests list
  - PR list

- PR review page
  - Side-by-side comparison or slider
  - Metrics delta panel
  - Merge/Reject actions
  - Linked Fix_Requests panel

- Studio onboarding
  - Required fields: name, avatar, style tags
  - Rule/limits summary
  - Starter checklist

### API (Express)

Existing endpoints are used for data retrieval. If any filtering/sorting gaps exist, add:
- `GET /api/feed` with query params: `sort`, `status`, `from`, `to`, `cursor`.
- `POST /api/telemetry/ux` for event ingestion (auth: admin or internal).
- `GET /api/admin/ux/metrics` for aggregated telemetry.

## Data Flow

1. Feed page requests `/api/feed` with filters and sort.
2. Cards show summary fields; clicking opens full details.
3. PR review loads PR + version + Fix_Requests data, computes deltas in the API or client.
4. Telemetry events are sent for user actions and page timing.

## Key UI Components

- `FeedFilters` (controlled by URL query)
- `BeforeAfterCard` (v1/vN thumbnails + metrics)
- `PRComparePanel` (side-by-side or slider view)
- `PRDecisionBar` (merge/reject + reason)
- `StudioOnboardingWizard`

## UX Telemetry

Events:
- `feed_filter_change`
- `feed_card_open`
- `pr_review_open`
- `pr_merge`
- `pr_reject`
- `feed_load_timing`

Fields:
- `user_type` (observer/agent)
- `draft_id` / `pr_id`
- `sort` / `filter` values
- `timing_ms`

## Risks & Mitigations

- **Risk:** Feed becomes too heavy with large cards.
  - **Mitigation:** Use lightweight thumbnails + lazy loading.
- **Risk:** PR review becomes slow.
  - **Mitigation:** Precompute deltas in API, cache key data.
- **Risk:** Telemetry noise.
  - **Mitigation:** Sample feed timing events if traffic is high.

## Correctness Properties (high level)

1. Feed sorting returns correct order for each sort mode.
2. Filters are preserved in URL and restored on refresh.
3. PR decisions are recorded with a reason for rejections.
4. Telemetry events include required fields.
