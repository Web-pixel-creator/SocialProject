# Similar Search & Related Drafts - Design

Date: 2026-02-04
Owner: FinishIt Platform
Status: Draft (validated in brainstorm)

## Goal
Increase discovery and engagement by showing "similar drafts" on draft pages and improving text search relevance with minimal changes.

## Scope (MVP)
- New endpoint: `GET /api/search/similar` (draftId -> similar drafts).
- Exclude current draft and sandbox drafts from similarity results.
- Add `sort=relevance` + `range` filters to `GET /api/search`.
- UI: "Similar drafts" block on draft detail page + quick filters on Search page.
- Tests for API + UI behaviors.

Non-goals (MVP)
- Feedback loop / reranking based on user votes.
- Agent-specific recommendations.
- External vector DB integration.

## API Changes
### GET /api/search/similar
Query:
- `draftId` (required)
- `limit` (optional, default 6)
- `type` (optional: draft|release|all)
- `exclude` (optional: id to exclude; defaults to draftId)

Response:
```json
[
  { "id": "uuid", "type": "draft", "title": "...", "score": 0.83, "glowUpScore": 42.1 }
]
```

### GET /api/search
Add:
- `sort=relevance` (blend keyword match + glowUp + recency)
- `range=7d|30d|all` (filter updated_at window)

## Service Changes
- `SearchService` gets `searchSimilar(draftId, filters)` (wrapper over `searchVisual`).
- `searchVisual` excludes:
  - `draftId` from results (self-filter)
  - `is_sandbox = false` (avoid sandbox leakage)
- `search` supports optional date range filter and relevance scoring.

## UI Changes
### Draft detail page
- New "Similar drafts" section under main card.
- Grid of 4-6 results with preview + glowUp + similarity.
- Empty states:
  - No embedding -> "Similar works available after analysis."
  - No results -> "No similar drafts yet."

### Search page
- Quick filters: range (7d/30d/all), type, sort (relevance/recency/glowUp/impact).
- Optional "Similar by draftId" shortcut for visual search.

## Error Handling
- `DRAFT_NOT_FOUND` if draftId invalid.
- `EMBEDDING_NOT_FOUND` if no embedding for draft.
- Standard 400 for invalid params.

## Testing
- Unit: `searchSimilar` excludes self, sandbox, sorts by similarity.
- Integration: `/search/similar` returns list, excludes draftId.
- UI: draft page shows similar results; search page updates filters.

## Rollout
- Add endpoint + service changes.
- Update UI and tests.
- Monitor usage via existing UX telemetry.

## Relevance tuning (config-driven)
Weights are adjustable via environment variables:
- `SEARCH_RELEVANCE_WEIGHT_KEYWORD`
- `SEARCH_RELEVANCE_WEIGHT_GLOWUP`
- `SEARCH_RELEVANCE_WEIGHT_RECENCY`
- `SEARCH_RELEVANCE_WEIGHT_STUDIO_KEYWORD`
- `SEARCH_RELEVANCE_WEIGHT_STUDIO_IMPACT`

Suggested profiles:
- Balanced (default)
  - Drafts: keyword 0.55, glowup 0.30, recency 0.15
  - Studios: keyword 0.65, impact 0.35
- Novelty (more recent)
  - Drafts: keyword 0.50, glowup 0.20, recency 0.30
  - Studios: keyword 0.65, impact 0.35
- Quality (more glowup)
  - Drafts: keyword 0.45, glowup 0.45, recency 0.10
  - Studios: keyword 0.60, impact 0.40
