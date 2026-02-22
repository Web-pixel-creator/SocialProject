# FinishIt Execution Roadmap (Security-First)

Date: 2026-02-21  
Owner: FinishIt Platform  
Status: In progress

## Goal
Move FinishIt from "well-instrumented platform shell" to a live AI-driven product with:
- agent personas and social follow loops,
- prediction engagement (virtual points only),
- multimodal/provenance trust signals,
- resilient agent runtime patterns inspired by OpenClaw (adapted, not copied).

## Principles
- Ship in thin vertical slices (API + UI + tests + telemetry each sprint).
- Security and abuse controls are mandatory gates, not post-release tasks.
- No real-money betting in current phase (virtual points only).
- Keep observer UX simple: existing feed/battle surfaces first, no routing explosion.

## Delivery Phases

### Phase 1 - Core Engagement Foundation
1. Studio Follow MVP hardening and "Following" experience polish.
2. Agent Personas v1:
   - structured role personas (`author`, `critic`, `maker`, `judge`),
   - owner-only edit API,
   - visible on studio surfaces.
3. Prediction Markets Lite (virtual FIN points):
   - battle-level predictions,
   - pool outcome settlement,
   - observer history and accuracy.
4. Live Pressure Meter in observer rail (PR pressure, audience, budget fuel).

Exit criteria:
- Follow + personas + prediction-lite usable end-to-end.
- E2E smoke green.
- Abuse controls enabled on prediction endpoints.

### Phase 2 - Trust + Intelligence Layer
1. Multimodal GlowUp scoring expansion.
2. Provenance v1:
   - source trace metadata,
   - human spark score surface.
3. Similar Search production hardening, then Style Fusion actions.
4. Observer digest prioritization from followed studios.

Exit criteria:
- scoring/provenance visible in feed and detail pages,
- fallback behavior documented and tested.

### Phase 3 - Runtime Depth (Alpha)
1. Agent Gateway (WS control plane pattern).
2. Orchestration flow hardening (role-to-role runtime steps).
3. Model failover chains (provider/profile fallback).
4. Live Sessions alpha (limited participant count, read-first observers).

Exit criteria:
- orchestrated runtime stable under failure injection,
- ops runbook updated for gateway/failover incidents.

## Security Gates (Apply to Every Phase)

### API Safety
- Strict payload validation (type + shape + bounds + enum checks).
- Ownership checks for all studio/agent mutations.
- UUID and identity validation at route boundary.
- Reject unknown critical keys for structured payloads.

### Abuse Prevention
- Rate limits on write endpoints (follow, prediction, persona updates).
- Cooldowns/idempotency where repeated actions are common.
- Telemetry events for suspicious mutation patterns.
- Soft-fail strategy for noisy clients (graceful 429 + structured errors).

### Data Integrity
- Avoid destructive overwrites of JSON profiles; merge intentionally.
- Keep immutable audit events for high-impact actions (prediction settle, persona updates).
- Contract tests for serialization between API and web.

### Runtime/Provider Resilience
- Provider fallback chains with per-provider cooldown.
- Timeouts and circuit-breaker behavior for external inference calls.
- Degraded mode UX (explicit fallback labels, no silent failure).

## Tracking
- Every roadmap item requires:
  - implementation task,
  - tests (unit/integration/e2e where relevant),
  - telemetry signal,
  - changelog entry.

## Current Sprint Focus
1. Agent Personas v1 (API + Web + tests).
2. Prediction-lite technical design hardening (virtual points only).
3. Live Pressure Meter integration into observer rail.

## Progress Snapshot (2026-02-22)
- Personas v1 connected in onboarding + studio profile surfaces, with API/web test coverage.
- Prediction-lite hardening updated with explicit abuse throttling on write endpoints:
  - `POST /api/drafts/:id/predict`
  - `POST /api/pull-requests/:id/predict`
  - `POST /api/studios/:id/follow`
  - `DELETE /api/studios/:id/follow`
  - `PUT /api/studios/:id/personas`
- Observer write flows are also throttled to protect engagement surfaces:
  - `PUT /api/observers/me/preferences`
  - `POST|DELETE /api/observers/watchlist/:draftId`
  - `POST|DELETE /api/observers/engagements/:draftId/save`
  - `POST|DELETE /api/observers/engagements/:draftId/rate`
  - `POST /api/observers/digest/:entryId/seen`
- Live Pressure Meter is wired in `ObserverRightRail` (`PR pressure`, `Audience`, `Fuel`) with dedicated rail tests.
- Observer digest now prioritizes entries from followed studios before other watchlist entries (while preserving unseen-first behavior).
- Similar Search hardening updated:
  - strict boundary validation for `draftId`, `limit`, and `offset` on `/api/search` and `/api/search/similar`,
  - strict field allowlist validation for `/api/search/visual` and `/api/search/style-fusion`,
  - compute-heavy throttling enabled for `/api/search/visual` and `/api/search/style-fusion`.
- AI runtime dry-run hardening updated:
  - strict field allowlist for `/api/admin/ai-runtime/dry-run`,
  - strict validation for `providersOverride`, `simulateFailures`, and bounded `timeoutMs`.
- Ops coverage updated for Phase 3 runtime depth:
  - added `docs/ops/agent-gateway-ai-runtime-runbook.md`,
  - linked runtime/gateway health checks into release + production checklists.
- QA checkpoint after ops updates:
  - `npm --workspace apps/api run build` passed,
  - `npm --workspace apps/web run build` passed,
  - `npm --workspace apps/web run test:e2e:smoke` passed (176/176),
  - `npm --workspace apps/web run test:e2e:critical` passed (115/115),
  - `npm run ultracite:check` passed,
  - full `npm --workspace apps/web run test:e2e` passed (220/220) after refreshing `feed-mobile` visual baseline.
- Prediction Markets Lite hardening update:
  - idempotent prediction submits now short-circuit without DB writes,
  - conflict updates are blocked if prediction was resolved concurrently (`ON CONFLICT ... WHERE resolved_at IS NULL`),
  - server-side telemetry now records `pr_prediction_submit` and `pr_prediction_result_view` directly from prediction endpoints,
  - observer unit tests cover idempotent submits and resolved-conflict protection.
- Studio social loop telemetry update:
  - server-side telemetry now records `studio_follow`, `studio_follow_duplicate`, `studio_unfollow`, and `studio_personas_update`,
  - integration coverage validates telemetry writes for follow/unfollow lifecycle and personas updates.
- Observer profile / following UX polish update:
  - observer and public profile cards now use consistent separators and localized metric labels (`impact`, `signal`, `followedAt`),
  - public observer profile now has explicit `invalid-id` and `not-found` fallback states,
  - manual QA checklist captured in `docs/ops/observer-following-manual-qa-checklist.md`,
  - web tests include `404` not-found fallback coverage for public profile.
- Prediction Markets Lite battle-card UX polish update:
  - battle prediction controls now include quick stake presets (min/mid/max) and explicit stake range hint,
  - usage-cap summary now surfaces remaining daily stake and remaining daily submissions,
  - card-level tests cover quick stake presets in `apps/web/src/__tests__/cards.spec.tsx`.
- Prediction trust-tier localization hardening update:
  - centralized tier formatting helper in `apps/web/src/lib/predictionTier.ts`,
  - localized tier rendering across battle cards, prediction widget, and observer/public profile summaries,
  - helper unit coverage added in `apps/web/src/__tests__/prediction-tier.spec.ts`.
- Style Fusion UX polish update:
  - draft detail style-fusion panel now includes quick copy action for a ready-to-share fusion brief,
  - fusion result now surfaces sampled source drafts (title + similarity) for better explainability,
  - draft detail tests now cover fusion-brief copy behavior.
- Multimodal GlowUp detail-surface update:
  - draft detail page now fetches `/drafts/:id/glowup/multimodal` with safe fallback on `404` / missing payload,
  - right-rail card now renders provider, aggregate score, confidence, and modality breakdown (visual/narrative/audio/video),
  - draft detail tests now cover multimodal panel render when score payload is present.
- Admin UX observability update for Similar Search / Style Fusion:
  - `/api/admin/ux/similar-search` now returns `styleFusion` aggregates (`total`, `success`, `errors`, `successRate`, `avgSampleCount`, `errorBreakdown`),
  - `/admin/ux` now renders dedicated `Style fusion metrics` cards and error breakdown list,
  - admin API and admin web tests updated for the new analytics payload.
- Multimodal + prediction observability trend update:
  - `/api/admin/ux/observer-engagement` now returns `multimodal.hourlyTrend` (UTC buckets with views/empty/errors + rates),
  - `/api/admin/ux/observer-engagement` now returns `predictionMarket.hourlyTrend` (UTC buckets with predictions/stake/payout + rates),
  - `/admin/ux` renders dedicated hourly trend tables for multimodal and prediction telemetry,
  - integration and web tests updated for both trend payloads and rendering.
- Agent orchestration persona-depth update:
  - draft orchestration now injects role personas (`tone`, `signaturePhrase`, `focus`, `boundaries`) from studio `skill_profile.rolePersonas` into runtime prompts,
  - critic/maker/judge prompts preserve studio-level context and add role-specific voice constraints,
  - admin orchestration integration coverage validates persona lines are present in generated prompts.
- Targeted observer engagement e2e QA pass:
  - `npm --workspace apps/web run test:e2e -- e2e/admin-ux.spec.ts e2e/draft-detail.spec.ts e2e/feed-observer-rail.spec.ts e2e/feed-observer-actions.spec.ts` passed (36/36).
- Full smoke QA reconfirmation:
  - `npm run test:web:e2e:smoke` passed (176/176).
