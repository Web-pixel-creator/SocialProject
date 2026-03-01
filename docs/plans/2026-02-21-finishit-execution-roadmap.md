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
4. Realtime Copilot slice for live sessions:
   - secure OpenAI Realtime session bootstrap (observer-only),
   - strict payload/query allowlists and bounded metadata,
   - push-to-talk toggle and safe tool declaration (`place_prediction`, `follow_studio`),
   - integration coverage for boundary + success path.

## Progress Snapshot (2026-02-22)
- Realtime copilot bootstrap update (OpenAI Realtime first vertical slice):
  - added observer-only endpoint `POST /api/live-sessions/:id/realtime/session` with observer-action throttling and strict query/body allowlists,
  - added validated realtime payload controls (`outputModalities`, `voice`, `pushToTalk`, bounded `topicHint`, bounded `metadata`),
  - added server-side OpenAI Realtime bootstrap service (`/v1/realtime/sessions`) with timeout handling and provider-safe error mapping,
  - endpoint blocks bootstrap for closed sessions (`completed`/`cancelled`) and preserves existing live-session boundary contract,
  - API integration coverage added for boundary validation, missing-key guard, and successful OpenAI bootstrap payload wiring.
- Realtime copilot web-surface update:
  - `LiveStudioSessionsRail` now calls `POST /api/live-sessions/:id/realtime/session` per session with guarded defaults (`audio`, `marin`, `pushToTalk=true`),
  - rail now renders explicit bootstrap state (`loading`, `ready`, `error`) and auth-required hint (`/login`) for observers without token,
  - web regression coverage added for successful bootstrap and auth-required error handling in `apps/web/src/__tests__/live-studio-sessions-rail.spec.tsx`.
- Realtime copilot tool execution bridge:
  - added observer-only endpoint `POST /api/live-sessions/:id/realtime/tool` with strict query/body allowlists and bounded `callId`,
  - added observer-only endpoint `POST /api/live-sessions/:id/realtime/send` for safe observer->role runtime events (`toRole` allowlist, `observer_*` event-type guard, bounded payload keys/size), with persistence into `agent_gateway_sessions/events` and API integration coverage for boundary + success paths,
  - endpoint executes only allowlisted tools (`place_prediction`, `follow_studio`) with argument-level validation and live-session scope checks,
  - tool execution now returns normalized output payloads suitable for `function_call_output` wiring on the client side,
  - API integration coverage added for realtime tool boundary validation and successful follow + prediction execution flow,
  - web client bridge helper added (`apps/web/src/lib/realtimeToolBridge.ts`) to parse `response.done` function calls, execute allowlisted tools via API, and emit `function_call_output` + follow-up `response.create`,
  - web unit coverage added for tool extraction, successful execution, and structured failure propagation (`apps/web/src/__tests__/realtime-tool-bridge.spec.ts`),
  - `LiveStudioSessionsRail` now exposes realtime server/client event bus hooks (`finishit:live-session-realtime-server-event` / `finishit:live-session-realtime-client-event`) and invokes bridge execution only for copilot-ready sessions,
  - observer bridge client-events are now mirrored server-side via `POST /api/live-sessions/:id/realtime/send` (best-effort) with safe event mapping (`observer_function_call_output`, `observer_response_create`) so gateway timeline captures observer-triggered realtime loop steps,
  - rail now surfaces tool bridge runtime state per session (`processed count`, `last sync`, `error`) with regression coverage in `live-studio-sessions-rail.spec.tsx`,
  - realtime tool bridge now also executes allowlisted calls from `response.function_call_arguments.done` events (in addition to `response.done` / `response.output_item.done`) to reduce end-to-end tool latency,
  - added OpenAI WebRTC transport adapter (`apps/web/src/lib/openaiRealtimeWebRtc.ts`) and wired `LiveStudioSessionsRail` to establish/cleanup realtime data-channel connections per session after bootstrap,
  - WebRTC adapter now sends an initial `session.update` on data-channel open (model/output modalities/voice), and enforces `turn_detection: null` when push-to-talk is enabled to prevent unintended auto-responses,
  - realtime client events emitted by tool bridge are now forwarded into active WebRTC channel, completing the first end-to-end browser loop (server event -> tool bridge -> client event -> realtime send),
  - adapter-level coverage added in `apps/web/src/__tests__/openai-realtime-webrtc.spec.ts` (env guard + SDP handshake path + client/server event flow),
  - push-to-talk and interruption controls are now wired end-to-end for realtime live sessions (mic track bootstrap, hold-to-talk commit flow, interrupt/clear response flow) with web coverage in `live-studio-sessions-rail.spec.tsx` and `openai-realtime-webrtc.spec.ts`.
  - observer keyboard push-to-talk (`Space`) is now supported for active voice session focus, and realtime transcript deltas/done events now render in live rail (`Live transcript`) for immediate observer feedback.
  - finalized transcript segments are now persisted into session chat via observer message endpoint with dedupe+cooldown guards; live rail now shows realtime voice runtime status (`Listening/Thinking/Speaking/Idle`) and transcript persistence state.
  - persisted transcript payloads now use ASCII truncation suffix (`...`) with bounded max-length enforcement to avoid mojibake/encoding drift in observer chat payloads.
  - `LiveStudioSessionsRail` now uses app i18n keys for session/overlay/voice/transcript/copilot/error copy (EN/RU parity) instead of hardcoded English strings.
  - added RU locale regression in `apps/web/src/__tests__/live-studio-sessions-rail.spec.tsx` to lock translated empty/title copy.
  - fallback live-session cards (title/objective/latest message) are now localized via i18n keys in EN/RU, with regression coverage for RU fallback rendering when feed data is unavailable.
  - feed e2e now verifies RU localized live-session fallback copy when `/api/live-sessions` fails (`apps/web/e2e/feed-observer-rail.spec.ts`), so locale-safe fallback behavior is covered in browser flow.
- Observer prediction history/accuracy UX polish:
  - extracted shared prediction-history helpers (`apps/web/src/lib/predictionHistory.ts`) for totals/accuracy/net calculation and deterministic sorting across filters,
  - private/public observer profile pages now share the same filter/sort logic and render filter buttons with live counts (`All`, `Resolved`, `Pending`),
  - prediction history headers now show resolved/pending counts, accuracy, and net points in one line for faster scanability,
  - prediction history outcome labels are now localized (`Merge/Reject` in EN, `Слияние/Отклонение` in RU) instead of raw backend enums (`merge/reject`) for cleaner observer readability,
  - private/public observer summary `Last resolved` line now also includes localized `Predicted` + `Resolved` outcome labels (via shared `predictionOutcome` helper) for clearer post-resolution context,
  - private/public profile pages now render prediction history through a shared panel component (`apps/web/src/components/ObserverPredictionHistoryPanel.tsx`) to keep behavior parity across observer surfaces,
  - added filter-specific empty state (`observerProfile.noPredictionsInFilter`) so empty `Pending/Resolved` views are explicit without masking existing history,
  - prediction history filter selection is now persisted per observer scope (`self` / `public`) using local storage so profile revisits keep the last selected filter,
  - prediction history filter toggles now emit server-side UX telemetry (`observer_prediction_filter_change`) with scope (`self`/`public`) and filter stats metadata for observer-engagement analysis,
  - prediction history sort selection (`Recency` / `Net` / `Stake`) is now persisted per scope and emits telemetry (`observer_prediction_sort_change`) with scope-aware metadata,
  - `/api/admin/ux/observer-engagement` now aggregates prediction-history filter telemetry (`totalSwitches`, `byScope`, `byFilter`, `scope x filter matrix`) and `/admin/ux` renders dedicated cards/table for operator visibility,
  - `/api/admin/ux/observer-engagement` now also aggregates prediction-history sort telemetry (`totalSwitches`, `byScope`, `bySort`, `scope x sort matrix`) with dedicated `/admin/ux` visibility,
  - observer-engagement KPIs now include prediction-history control shares (`predictionFilterSwitchShare`, `predictionSortSwitchShare`) and non-default sort adoption (`predictionNonDefaultSortRate`) surfaced in `/admin/ux` health + prediction telemetry cards,
  - observer profile API now exposes `predictions.streak.current` and `predictions.lastResolved` snapshot (private + public), and profile summary UI renders current streak plus last resolved outcome/net context,
  - observer profile API now also exposes `predictions.streak.best` and `predictions.recentWindow` (last 10 resolved accuracy), surfaced in private/public summary cards and helper copy,
  - observer profile API now exposes 7/30 day resolved prediction windows (`predictions.timeWindows.d7/d30`) with rate/net points; private/public summaries now show compact `7d | 30d` drill-down line for faster accuracy scan,
  - `/api/admin/ux/observer-engagement` now also exposes prediction resolution windows (`predictionMarket.resolutionWindows.d7/d30`) with predictors/accuracy/net, and `/admin/ux` renders a `Resolved windows` drill-down card in prediction telemetry,
  - `/admin/ux` prediction resolved windows now render threshold-based risk badges (`7d risk`, `30d risk`) with explicit watch/critical cutoffs and minimum resolved-sample guard.
  - prediction-window risk thresholds are now API-first (`predictionMarket.thresholds.resolutionWindows`) and per-window `riskLevel` is returned by backend so admin UI does not drift from server policy.
  - observer profile APIs (`/api/observers/me/profile`, `/api/observers/:id/profile`) now mirror API-first prediction window risk policy (`predictions.thresholds.resolutionWindows` + `predictions.timeWindows.*.riskLevel`), and private/public profile summaries render compact `7d/30d` risk with min-sample + threshold context.
  - private/public profile summary rendering for `recentWindow + 7d/30d + risk` is now centralized in `ObserverPredictionWindowsSummary` to keep observer surfaces behaviorally in sync.
  - web coverage updated for profile filter labels and shared history helpers (`observer-profile-page.spec.tsx`, `observer-public-profile-page.spec.tsx`, `prediction-history.spec.ts`, `observer-prediction-history-panel.spec.tsx`).
  - e2e coverage now verifies prediction-history filter/sort persistence is scope-isolated (`self` vs `public`) and restored after navigation (`apps/web/e2e/observer-profile.spec.ts`).
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
- Prediction-lite read-path throttling update:
  - `GET /api/pull-requests/:id/predictions` now uses observer-action throttling to reduce abuse from high-frequency polling.
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
- Prediction Markets Lite card-interaction hardening update:
  - observer action overflow panel now closes on `Escape` and outside-click (`CardPrimitives` + `observer-actions.spec.tsx`),
  - battle prediction submit path now deduplicates rapid in-flight actions per draft (`FeedTabs` + `feed-ui.spec.tsx`),
  - auth failures on prediction submit now render explicit sign-in CTA in-card (`BattleCard` + `feed-ui.spec.tsx`),
  - stake input now emits auto-adjust guidance when values are clamped to allowed min/max range, with RU/EN i18n coverage,
  - card-level regression coverage now verifies clamp + hint lifecycle in `apps/web/src/__tests__/cards.spec.tsx`,
  - prediction submit now maps known backend codes to localized observer-safe messages (stake range / daily caps / no pending PR) instead of exposing raw backend text (`FeedTabs` + `feed-ui.spec.tsx`),
  - draft detail prediction submit now reuses the same code-mapping strategy with market-aware stake range messaging (`app/drafts/[id]/page.tsx` + `draft-detail-page.spec.tsx`),
  - shared helper `predictionErrors.resolvePredictionSubmitErrorMessage(...)` now centralizes mapping rules for battle feed + draft detail with dedicated unit coverage (`prediction-errors.spec.ts`),
  - prediction submit and summary-load flows now map `429` to localized observer-safe copy (`prediction.rateLimited`), with draft-detail coverage for throttled summary reads.
  - battle-card prediction flow now preserves successful submit state and prior market snapshot even when summary refresh is throttled, while surfacing localized `429` hint instead of raw backend messages (`FeedTabs` + `feed-ui.spec.tsx`),
  - battle summary refresh now applies a short cooldown after `429` to avoid immediate repeated polling under throttling pressure.
  - smoke e2e now includes the throttled-summary scenario in battles to protect this UX path from regressions (`feed-navigation.spec.ts`).
  - draft-detail prediction submit now uses the same guarded summary refresh path with localized `429` hint and per-PR cooldown after throttling (`app/drafts/[id]/page.tsx`).
  - `PredictionWidget` now keeps rendering summary controls while showing inline prediction errors, so observers can retry without losing context.
  - draft-detail e2e now includes submit-time summary-throttle coverage and verifies cooldown prevents immediate re-poll loops (`draft-detail.spec.ts`).
- Prediction market summary formatting hardening update:
  - shared formatter helpers now standardize pool/odds/payout/usage/net labels across `BattleCard` and `PredictionWidget` (`predictionMarketText.ts`),
  - `BattleCard` prediction summary rendering now uses a single derived market snapshot instead of repeated inline object construction,
  - unit coverage added for formatter output and unknown-cap fallbacks (`prediction-market-text.spec.ts`).
- Prediction trust-tier localization hardening update:
  - centralized tier formatting helper in `apps/web/src/lib/predictionTier.ts`,
  - localized tier rendering across battle cards, prediction widget, and observer/public profile summaries,
  - helper unit coverage added in `apps/web/src/__tests__/prediction-tier.spec.ts`.
- Prediction outcome localization parity update:
  - introduced shared prediction-outcome helper (`apps/web/src/lib/predictionOutcome.ts`) for consistent outcome labels across observer surfaces,
  - `PredictionWidget` now renders localized observer/resolved outcomes instead of raw enums (`merge/reject`) in draft-detail/feed prediction summaries,
  - `BattleCard` prediction summary (`Your prediction ...`) now uses the same localized outcome labels for feed-card parity with draft-detail/profile surfaces,
  - observer private/public summary `Last resolved` lines now include localized `Predicted` + `Resolved` outcomes,
  - `/admin/ux` `Outcome mix` now renders normalized outcome labels (`Merge/Reject`) and uses the correct outcome-count metric (`predictions`) instead of defaulting to zero-count rows.
- Style Fusion UX polish update:
  - draft detail style-fusion panel now includes quick copy action for a ready-to-share fusion brief,
  - fusion result now surfaces sampled source drafts (title + similarity) for better explainability,
  - style-fusion brief copy now emits UX telemetry (`style_fusion_copy_brief`) with success/failure status and sample-size metadata,
  - draft detail tests now cover fusion-brief copy behavior.
- Multimodal GlowUp detail-surface update:
  - draft detail page now fetches `/drafts/:id/glowup/multimodal` with safe fallback on `404` / missing payload,
  - right-rail card now renders provider, aggregate score, confidence, and modality breakdown (visual/narrative/audio/video),
  - draft detail tests now cover multimodal panel render when score payload is present.
- Admin UX observability update for Similar Search / Style Fusion:
  - `/api/admin/ux/similar-search` now returns `styleFusion` aggregates (`total`, `success`, `errors`, `successRate`, `avgSampleCount`, `errorBreakdown`),
  - `/api/admin/ux/similar-search` now also returns `styleFusionCopy` aggregates (`total`, `success`, `errors`, `successRate`, `errorBreakdown`) sourced from `style_fusion_copy_brief` telemetry,
  - `/admin/ux` now renders dedicated `Style fusion metrics` cards and error breakdown list,
  - admin API and admin web tests updated for the new analytics payload.
- Multimodal + prediction observability trend update:
  - `/api/admin/ux/observer-engagement` now returns `multimodal.hourlyTrend` (UTC buckets with views/empty/errors + rates),
  - `/api/admin/ux/observer-engagement` now returns `predictionMarket.hourlyTrend` (UTC buckets with predictions/stake/payout + rates),
  - `/admin/ux` renders dedicated hourly trend tables for multimodal and prediction telemetry,
  - integration and web tests updated for both trend payloads and rendering.
- Agent gateway admin connector-filter update:
  - `/api/admin/agent-gateway/telemetry` and `/api/admin/agent-gateway/adapters` now accept optional `connector` query filter (validated connector id format),
  - ingest telemetry queries (`source = agent_gateway_ingest`) are now filtered by `metadata.connectorId` when `connector` is provided,
  - gateway telemetry now also scopes session/event aggregates by `connector` (DB session selection + event payload filtering) so connector drilldown is end-to-end consistent,
  - responses now include `filters.connector` for explicit operator visibility,
  - admin integration coverage updated for connector filtering and connector query validation.
- Agent gateway session-list connector parity update:
  - `/api/admin/agent-gateway/sessions` now also accepts optional `connector` filter with strict connector-id query validation,
  - in-memory and persisted session listing now both apply connector matching from session metadata and event payload (`payload.connectorId`),
  - session list response now echoes `filters.connector` for operator-visible scoped queries,
  - admin integration coverage extended for connector filter application and invalid connector query rejection on session-list endpoints.
- Agent gateway session-events connector parity update:
  - `/api/admin/agent-gateway/sessions/:sessionId/events` now accepts optional `connector` query filter with strict connector-id validation,
  - event stream filtering now supports provider+connector combined constraints using `payload.selectedProvider|provider` and `payload.connectorId`,
  - event response payload now echoes `filters.connector`,
  - admin integration coverage extended for invalid connector query rejection and connector-constrained event filtering.
- Agent gateway source-parity regression coverage update:
  - connector-scoped session-list and session-events filters are now covered for both `source=db` and `source=memory`,
  - parity assertions ensure identical `filters` echo and stable event/session targeting across storage sources.
- Agent gateway session-events DB query hardening update:
  - `/api/admin/agent-gateway/sessions/:sessionId/events` now pushes filter evaluation + `limit` into SQL when `source=db`,
  - DB path now executes explicit `COUNT` + filtered `ORDER BY created_at DESC LIMIT n` queries instead of loading full event history into memory,
  - DB + memory event sorting now uses stable descending order (`createdAt`, then `id`) to keep deterministic event ordering on ties,
  - endpoint contract remains unchanged (`filters`, `total`, `limit`, `events`) while reducing read amplification for long session timelines.
- Agent gateway session-events limit contract regression update:
  - admin integration coverage now asserts `total` is computed pre-limit and remains accurate when `limit` truncates event output,
  - coverage also pins descending event order for filtered DB reads to prevent regressions in timeline pagination UX.
- Agent gateway query-index hardening update:
  - added migration `1771603000000_agent_gateway_query_indexes.cjs` with composite indexes for common gateway admin reads (`sessions(channel,status,updated_at)` and event filters by `session_id + provider/connector + roles/type`),
  - session-list and telemetry DB reads now use direct `channel/status` comparisons (no `LOWER(column)` on normalized columns) for better index utilization,
  - DB event-filter path now uses direct equality on normalized `event_type/from_role/to_role` to match new composite index strategy.
- Agent orchestration persona-depth update:
  - draft orchestration now injects role personas (`tone`, `signaturePhrase`, `focus`, `boundaries`) from studio `skill_profile.rolePersonas` into runtime prompts,
  - critic/maker/judge prompts preserve studio-level context and add role-specific voice constraints,
  - admin orchestration integration coverage validates persona lines are present in generated prompts.
- Targeted observer engagement e2e QA pass:
  - `npm --workspace apps/web run test:e2e -- e2e/admin-ux.spec.ts e2e/draft-detail.spec.ts e2e/feed-observer-rail.spec.ts e2e/feed-observer-actions.spec.ts` passed (36/36).
- Full smoke QA reconfirmation:
  - `npm run test:web:e2e:smoke` passed (176/176).
- AI runtime dry-run isolation hardening update:
  - admin dry-run no longer mutates provider cooldown state (`mutateProviderState: false`),
  - runtime service now exposes explicit provider-state reset for deterministic integration setup,
  - admin integration coverage validates both health cooldown snapshot and orchestration flow without cross-test state leakage.
- Prediction settlement audit hardening update:
  - pull-request decisions now emit immutable server-side `pr_prediction_settle` events per resolved observer prediction (with outcome/stake/payout metadata),
  - admin observer-engagement metrics now track `predictionSettles` plus `predictionSettlementRate`,
  - API/admin integration coverage validates settlement event persistence and KPI aggregation.
- Prediction payload boundary hardening update:
  - `/api/drafts/:id/predict` and `/api/pull-requests/:id/predict` now reject unknown payload fields (`PREDICTION_INVALID_FIELDS`),
  - conflicting aliases (`predictedOutcome` vs `outcome`, `stakePoints` vs `points`) now fail fast with `PREDICTION_PAYLOAD_CONFLICT`,
  - API integration coverage validates both invalid-field and alias-conflict cases.
- Studio routes boundary hardening update:
  - `/api/studios/:id`, `/api/studios/:id/metrics`, and `/api/studios/:id/personas` now reject unsupported query keys with explicit service errors,
  - follow/unfollow mutations now enforce empty query/body allowlists (`STUDIO_FOLLOW_INVALID_QUERY_FIELDS`, `STUDIO_FOLLOW_INVALID_FIELDS`),
  - studio profile and personas update mutations now reject unsupported body fields and unsupported query keys (`STUDIO_UPDATE_INVALID_FIELDS`, `STUDIO_ROLE_PERSONAS_INVALID_FIELDS`),
  - API integration coverage now validates invalid query/body rejection across studio detail, follow/unfollow, update, personas, and metrics endpoints.
- Swarm routes mutation-boundary hardening update:
  - `/api/swarms/:id` now rejects unsupported query keys (`SWARM_INVALID_QUERY_FIELDS`) on detail reads,
  - `/api/swarms` create and `:id/start`, `:id/judge-events`, `:id/complete` mutations now enforce strict query allowlists plus endpoint-specific body allowlists,
  - mutation surfaces now reject unsupported body fields with explicit errors (`SWARM_INVALID_FIELDS`, `SWARM_START_INVALID_FIELDS`, `SWARM_JUDGE_EVENT_INVALID_FIELDS`, `SWARM_COMPLETE_INVALID_FIELDS`),
  - API integration coverage now validates invalid query/body rejection across swarm detail and all swarm mutation routes.
- Swarm payload boundary hardening update:
  - route-edge payload parsing now validates `draftId` UUID, bounded `title`/`objective`, and strict `members[]` shape/types for `/api/swarms` create requests (`DRAFT_ID_INVALID`, `SWARM_INVALID_INPUT`, `SWARM_INVALID_MEMBER`),
  - `/api/swarms/:id/judge-events` now validates strict `eventType` enum, bounded `notes`, and `score` numeric range at route edge (`SWARM_INVALID_EVENT`, `SWARM_INVALID_SCORE`),
  - `/api/swarms/:id/complete` now validates bounded `judgeSummary` and strict numeric `judgeScore` range before service invocation (`SWARM_INVALID_INPUT`, `SWARM_INVALID_SCORE`),
  - API integration coverage now validates malformed type/enum/range/length rejection paths for swarm payloads.
- Live session routes mutation-boundary hardening update:
  - `/api/live-sessions/:id` now rejects unsupported query keys (`LIVE_SESSION_INVALID_QUERY_FIELDS`) on detail reads,
  - `/api/live-sessions` create and `:id/start`, `:id/complete`, `:id/presence/*`, `:id/messages/*` mutations now enforce strict query allowlists plus endpoint-specific body allowlists,
  - mutation surfaces now reject unsupported body fields with explicit errors (`LIVE_SESSION_INVALID_FIELDS`, `LIVE_SESSION_START_INVALID_FIELDS`, `LIVE_SESSION_COMPLETE_INVALID_FIELDS`, `LIVE_SESSION_PRESENCE_INVALID_FIELDS`, `LIVE_SESSION_MESSAGE_INVALID_FIELDS`),
  - API integration coverage now validates invalid query/body rejection across live-session detail and mutation routes.
- Live session payload boundary hardening update:
  - route-edge payload parsing now strictly validates `draftId` UUID, `title`/`objective` bounded text, and `isPublic` boolean for `/api/live-sessions` create requests (`DRAFT_ID_INVALID`, `LIVE_SESSION_INVALID_INPUT`),
  - `/api/live-sessions/:id/complete` now validates bounded `recapSummary` and strict http(s) `recapClipUrl` format at route edge (`LIVE_SESSION_INVALID_INPUT`),
  - presence updates now reject non-string `status` payloads before service invocation (`INVALID_PRESENCE_STATUS`),
  - observer/agent message routes now validate bounded message content and bounded optional `authorLabel` at route edge (`LIVE_SESSION_INVALID_MESSAGE`),
  - API integration coverage now validates malformed type/range/url rejection paths for live-session payloads.
- Agent gateway control-plane telemetry update:
  - new admin endpoint `/api/admin/agent-gateway/telemetry` now returns aggregated session/event/attempt signals,
  - `/admin/ux` now renders gateway telemetry cards (`failed step rate`, `runtime success rate`, cooldown skip rate) plus provider/channel usage samples,
  - admin integration + admin web tests cover telemetry aggregation and rendering.
- Multimodal payload boundary hardening update:
  - `/api/drafts/:id/glowup/multimodal` now rejects unknown request keys (`MULTIMODAL_GLOWUP_INVALID_FIELDS`),
  - `provider` is now strictly validated (`^[a-z0-9][a-z0-9._-]{0,63}$`, case-normalized to lowercase),
  - modality scores now enforce strict route-edge type/range validation (`finite number` in `0..100`) and require at least one provided modality (`MULTIMODAL_GLOWUP_INVALID_INPUT`),
  - integration coverage validates invalid-field, invalid-provider, invalid score type/range, missing modality payload, and valid normalized-provider paths.
- Multimodal read boundary + invalid-query telemetry hardening update:
  - `/api/drafts/:id/glowup/multimodal` read/write endpoints now reject unknown query keys (`MULTIMODAL_GLOWUP_INVALID_QUERY_FIELDS`),
  - `provider` query now reuses strict format validation before score lookup,
  - invalid query attempts on the read path emit server-side `ux_events` (`draft_multimodal_glowup_error`, `user_type=system`, `reason=invalid_query`) for auditability,
  - integration coverage now validates invalid write-query rejection on multimodal update.
- Admin multimodal guardrails observability update:
  - `/api/admin/ux/observer-engagement` now returns `multimodal.guardrails` (`invalidQueryErrors`, `invalidQueryRate`),
  - `/admin/ux` now renders guardrail cards (`Invalid query errors`, `Invalid query share`) inside multimodal telemetry section,
  - admin integration + admin web tests updated to validate guardrail metrics.
- Admin telemetry query-boundary hardening update:
  - `/api/admin/agent-gateway/telemetry` now strictly validates `hours` / `limit` and returns explicit `ADMIN_INVALID_QUERY` (`400`) for malformed or out-of-range values,
  - `/api/admin/ux/observer-engagement` now enforces strict query allowlist (`hours`) and bounded `hours` validation with explicit `ADMIN_INVALID_QUERY`,
  - admin integration coverage now asserts invalid-query rejection paths for both endpoints.
- Admin gateway + error metrics query-boundary hardening update:
  - `/api/admin/agent-gateway/sessions` and session read endpoints (`:sessionId`, `:sessionId/events`, `:sessionId/summary`, `:sessionId/status`) now enforce strict query allowlists and validated `source`/`limit` values,
  - `/api/admin/errors/metrics` now enforces strict query allowlist plus bounded `hours`/`limit` and strict single-value `code`/`route` format guards (no whitespace/malformed route tokens),
  - admin integration coverage now asserts invalid-query rejection paths for gateway session reads and error metrics filtering.
- Admin metrics query-boundary hardening update:
  - `/api/admin/embeddings/metrics`, `/api/admin/ux/metrics`, `/api/admin/ux/similar-search`, and `/api/admin/jobs/metrics` now enforce strict query allowlists,
  - each endpoint now rejects malformed/out-of-range `hours` and invalid optional metric filters (for `/api/admin/ux/metrics`, including strict `eventType` identifier format) with explicit `ADMIN_INVALID_QUERY`,
  - admin integration coverage now asserts invalid-query rejection paths for all four metrics surfaces.
- Admin budgets query-boundary hardening update:
  - `/api/admin/budgets/remaining` now enforces strict query allowlist, UUID parsing for `agentId`/`draftId`, and bounded single-value parsing for `date`,
  - `/api/admin/budgets/metrics` now enforces strict query allowlist and bounded single-value parsing for `date`,
  - admin integration coverage now asserts invalid-query rejection paths for both budget endpoints.
- Admin backfill + cleanup mutation-boundary hardening update:
  - `/api/admin/embeddings/backfill` now enforces strict query/body allowlists, bounded integer parsing for `batchSize` / `maxBatches`, and explicit query/body conflict rejection (`ADMIN_INPUT_CONFLICT`),
  - `/api/admin/cleanup/preview` now rejects unsupported query fields,
  - `/api/admin/cleanup/run` now enforces strict query/body allowlists for `confirm`, strict boolean parsing, and explicit query/body conflict rejection (`ADMIN_INPUT_CONFLICT`).
- Agent gateway mutation-boundary hardening update:
  - `/api/admin/agent-gateway/sessions` now enforces strict query/body allowlists and bounded body parsing for `channel`, `draftId`, `externalSessionId`, `roles`, and `metadata`,
  - gateway session/orchestration `channel` now enforces normalized slug format at route edge (`ADMIN_INVALID_BODY`),
  - gateway session/orchestration `externalSessionId` now enforces strict identifier format (no whitespace/malformed tokens) at route edge (`ADMIN_INVALID_BODY`),
  - gateway `roles` and event `fromRole`/`toRole`/`type` now enforce normalized identifier formats at route edge (`ADMIN_INVALID_BODY`),
  - session create now validates optional `draftId` as UUID at route edge before service invocation (`ADMIN_INVALID_BODY`),
  - gateway `metadata` / event `payload` objects now enforce key-count and serialized-size limits at route edge (`ADMIN_INVALID_BODY`),
  - `/api/admin/agent-gateway/sessions/:sessionId/events` now enforces strict query/body allowlists with required bounded `fromRole`/`type` and validated optional `toRole`/`payload`,
  - `/api/admin/agent-gateway/sessions/:sessionId/compact` and `/api/admin/agent-gateway/sessions/:sessionId/close` now reject unsupported query/body fields and invalid compact keep-recent payloads.
- Agent gateway auto-compaction update (OpenClaw-style session pruning):
  - `AgentGatewayService` now auto-compacts oversized in-memory sessions into a bounded recent context window (`autoCompactTrigger`, `autoCompactKeepRecent`),
  - compaction emits an explicit `session_compacted` event with prune summary (`reason`, `prunedCount`, `eventTypeCounts`) instead of silently dropping history,
  - background persistence now rewrites compacted session event history atomically and emits `agent_gateway_session_compact_auto` telemetry for ops visibility,
  - unit coverage added for auto-compaction behavior in `apps/api/src/__tests__/agent-gateway.unit.spec.ts`.
- Agent gateway telemetry detail update for compaction observability:
  - `/api/admin/agent-gateway/telemetry` now returns auto/manual compaction counters (`autoCompactionEvents`, `manualCompactionEvents`) and `autoCompactionShare`,
  - telemetry now also returns normalized risk levels for auto-compaction share (`autoCompactionRiskLevel` globally and per-hour in `compactionHourlyTrend`) to keep API/UI alert semantics aligned,
  - `/api/admin/agent-gateway/telemetry` now returns aggregate `health` summary (`level`, `failedStepLevel`, `runtimeSuccessLevel`, `cooldownSkipLevel`, `autoCompactionLevel`) so alert logic can be owned server-side,
  - `/api/admin/agent-gateway/telemetry` now also returns canonical telemetry `thresholds` for risk calculations (`autoCompactionShare`, `failedStepRate`, `runtimeSuccessRate`, `cooldownSkipRate`) so UI no longer owns hardcoded cutoffs,
  - `/api/admin/agent-gateway/telemetry` now supports scoped drilldown filters via query (`channel`, `provider`) with strict format validation and echoes applied `filters` in payload,
  - session aggregates now expose `autoCompacted` and `autoCompactedRate`,
  - event aggregates now include `compactionHourlyTrend` (UTC buckets with `compactions`, `autoCompactions`, `manualCompactions`, `autoCompactionShare`, `prunedEventCount`),
  - `/admin/ux` gateway telemetry section now renders dedicated auto-compaction cards (`Auto compacted sessions`, `Auto compaction share`) plus auto/manual breakdown in the event summary line,
  - `/admin/ux` now renders `Gateway compaction trend (UTC)` table for hourly auto/manual pruning dynamics,
  - `/admin/ux` now applies risk thresholds for auto-compaction share (healthy/watch/critical) with an explicit `Auto compaction risk` badge and per-hour risk badges in the trend table,
  - `/admin/ux` gateway telemetry now also exposes aggregate `Telemetry health` badge derived from failed-step, runtime-success, cooldown-skip, and auto-compaction-risk signals,
  - `/admin/ux` gateway telemetry now renders per-signal health badges (`Failed-step risk`, `Runtime success`, `Cooldown skip risk`) with API-first levels and threshold-based fallback,
  - `/admin/ux` now forwards optional gateway drilldown query params (`gatewayChannel`, `gatewayProvider`) to telemetry API, renders applied scope labels (`channel`, `provider`), and exposes `Apply scope`/`Reset scope` controls for operator drilldown,
  - `/admin/ux` now shows explicit operator-facing threshold hints for gateway telemetry (`failed step`, `runtime success`, `cooldown skip`, `auto compaction share`) sourced from API thresholds to prevent API/UI drift,
  - admin API and admin UX tests updated for the new telemetry fields and rendering.
- Agent gateway sessions drilldown alignment update:
  - `/api/admin/agent-gateway/sessions` now supports strict scoped filters (`channel`, `provider`, `status`) with explicit validation and echoes applied `filters` in response payload,
  - in-memory and persisted session listings now apply the same filter semantics (including provider extraction from event payloads),
  - `/admin/ux` now forwards gateway scope to sessions list fetch and preserves optional `gatewayStatus` across gateway forms/mutations.
- Agent gateway session-events drilldown alignment update:
  - `/api/admin/agent-gateway/sessions/:sessionId/events` now supports strict scoped filters (`eventType`, `fromRole`, `toRole`, `provider`) with explicit query validation and echoes applied `filters` in response payload,
  - events endpoint now also supports bounded free-text `eventQuery` over type/from-role/to-role for operator drilldown without client-only filtering,
  - events endpoint now reports `total` for the filtered result set before `limit` truncation to keep operator expectations consistent,
  - `/admin/ux` now forwards selected event-type/query scope (and provider scope when present) to the events API so event drilldown remains server-aligned,
  - `/admin/ux` now keeps gateway `source` scope (`db`/`memory`) aligned across sessions/events/summary/status reads.
- Agent gateway session-id boundary hardening update:
  - all `/api/admin/agent-gateway/sessions/:sessionId*` read and mutation routes now validate `sessionId` format at route edge and reject malformed ids with `ADMIN_INVALID_SESSION_ID` (`400`) before service access,
  - admin integration coverage now validates malformed session-id rejection across detail/events/summary/status reads and events/compact/close mutations.
- Agent gateway orchestration boundary hardening update:
  - `/api/admin/agent-gateway/orchestrate` now enforces strict query/body allowlists (`draftId`, `channel`, `externalSessionId`, `promptSeed`, `hostAgentId`, `metadata`),
  - orchestration `draftId` now validates UUID format at route edge before orchestration service invocation (`ADMIN_INVALID_BODY`),
  - orchestration `hostAgentId` now validates optional UUID format at route edge (`ADMIN_INVALID_BODY`),
  - orchestration payloads now use bounded body parsing for all string inputs and strict object validation for `metadata`,
  - admin integration coverage now validates invalid query/body rejection paths for orchestration mutation payloads.
- Admin AI runtime boundary hardening update:
  - `/api/admin/ai-runtime/profiles` and `/api/admin/ai-runtime/health` now reject unsupported query fields via strict allowlists,
  - `/api/admin/ai-runtime/dry-run` now rejects unsupported query fields and invalid non-object body shapes before runtime input parsing,
  - dry-run `prompt` now enforces required non-empty bounded length at route edge (`AI_RUNTIME_INVALID_PROMPT`) to prevent oversized inference payloads,
  - dry-run `providersOverride` / `simulateFailures` arrays now enforce provider identifier format + per-item length bounds at route edge (`AI_RUNTIME_INVALID_INPUT`),
  - admin integration coverage now validates ai-runtime read/write invalid-query and invalid-body-shape rejection paths.
- Admin system metrics query-boundary hardening update:
  - `/api/admin/system/metrics` now rejects unsupported query fields via strict allowlist,
  - admin integration coverage now validates `ADMIN_INVALID_QUERY` on unsupported query keys for system metrics.
- Collaboration surfaces query-boundary hardening update:
  - `/api/creator-studios`, `/api/creator-studios/mine`, and `/api/creator-studios/funnels/summary` now enforce strict query allowlists (`CREATOR_STUDIO_INVALID_QUERY_FIELDS` on unsupported keys),
  - `/api/swarms` now enforces strict query allowlist (`SWARM_INVALID_QUERY_FIELDS` on unsupported keys),
  - `/api/live-sessions` now enforces strict query allowlist (`LIVE_SESSION_INVALID_QUERY_FIELDS` on unsupported keys),
  - API integration coverage now validates invalid-query rejection paths for creator studios, swarms, and live sessions list endpoints.
- Collaboration id-boundary hardening update:
  - creator studio, guild, swarm, and live session `:id` detail routes now fail fast on malformed ids (`CREATOR_STUDIO_ID_INVALID`, `GUILD_ID_INVALID`, `SWARM_ID_INVALID`, `LIVE_SESSION_ID_INVALID`),
  - collaborative mutation routes with `:id` (`creator-studios/:id/governance`, `creator-studios/:id/billing/connect`, `creator-studios/:id/retention/ping`, `swarms/:id/*`, `live-sessions/:id/*`) now reject malformed ids before service execution,
  - integration coverage now validates invalid-id rejection across both collaborative detail and mutation entrypoints.
- Collaboration pagination-boundary hardening update:
  - `/api/creator-studios`, `/api/creator-studios/mine`, `/api/swarms`, and `/api/live-sessions` now require integer and bounded `limit`/`offset` values (no float/negative/infinite inputs),
  - `/api/creator-studios/funnels/summary` now enforces bounded integer `windowDays`,
  - integration coverage now validates malformed pagination rejection on collaboration list and funnel summary endpoints.
- Creator studio mutation payload-boundary hardening update:
  - `/api/creator-studios` and `:id` collaboration mutations (`governance`, `billing/connect`, `retention/ping`) now enforce strict query/body allowlists with endpoint-specific invalid-field errors,
  - create/governance payloads now use route-edge parsing for bounded text, strict enum/boolean/number types, and bounded numeric ranges before service execution,
  - nested governance payloads now reject unsupported keys and malformed field types at route edge (`CREATOR_STUDIO_INVALID_INPUT`, `CREATOR_STUDIO_INVALID_THRESHOLD`, `CREATOR_STUDIO_INVALID_MODERATION_MODE`, `CREATOR_STUDIO_INVALID_REVENUE_SHARE`),
  - integration coverage now validates creator studio mutation invalid-query, invalid-field, and malformed payload rejection paths.
- Guild list query-boundary hardening update:
  - `/api/guilds` now enforces strict query allowlist (`GUILD_INVALID_QUERY_FIELDS`) and explicit numeric pagination validation (`GUILD_PAGINATION_INVALID`),
  - API integration coverage now validates unsupported query key rejection and invalid limit/offset handling.
- Feed/commission/studio-ledger query-boundary hardening update:
  - feed list/unified endpoints now enforce strict query allowlists and explicit numeric pagination validation (`FEED_INVALID_QUERY_FIELDS`, `FEED_PAGINATION_INVALID`),
  - `/api/commissions` now enforces strict query allowlist and strict parsing for `status`/`forAgents` (`COMMISSION_INVALID_QUERY_FIELDS`, `INVALID_COMMISSION_STATUS`, `INVALID_FOR_AGENTS_FLAG`),
  - `/api/studios/:id/ledger` now enforces strict query allowlist and explicit `limit` validation (`STUDIO_LEDGER_INVALID_QUERY_FIELDS`, `STUDIO_LEDGER_LIMIT_INVALID`),
  - API integration coverage now validates negative query-field and malformed-pagination paths for feeds, commissions, and studio ledger.
- Studio metrics/ledger id-boundary hardening update:
  - `/api/studios/:id/metrics` and `/api/studios/:id/ledger` now fail fast on malformed studio ids (`STUDIO_ID_INVALID`) before DB/service execution,
  - integration coverage now validates malformed id rejection for both metrics and ledger reads.
- Commission id-boundary hardening update:
  - `/api/commissions/:id` read/mutation endpoints now fail fast on malformed commission ids (`COMMISSION_ID_INVALID`) before service execution,
  - integration coverage now validates malformed id rejection on detail, response submit, select winner, pay-intent, and cancel endpoints.
- Privacy export id-boundary hardening update:
  - `/api/account/exports/:id` now fails fast on malformed export ids (`EXPORT_ID_INVALID`) before privacy service lookup,
  - integration coverage now validates invalid export id rejection alongside existing not-found and rate-limit privacy checks.
- Draft list query-boundary hardening update:
  - `/api/drafts` now enforces strict query allowlist and explicit validation for `status`, `authorId`, `limit`, and `offset` (`DRAFT_LIST_INVALID_QUERY_FIELDS`, `DRAFT_LIST_INVALID_STATUS`, `DRAFT_LIST_AUTHOR_ID_INVALID`, `DRAFT_LIST_PAGINATION_INVALID`),
  - draft pagination parsing now requires integer values in safe bounds (`limit: 1..100`, `offset: 0..10000`) to prevent hidden DB-level failures on malformed numeric input,
  - integration coverage now validates invalid-field, invalid-status, invalid-authorId, and malformed-pagination rejection paths for draft listing.
- Draft create payload/query-boundary hardening update:
  - `/api/drafts` now rejects unsupported query keys (`DRAFT_CREATE_INVALID_QUERY_FIELDS`) and unknown body fields (`DRAFT_CREATE_INVALID_FIELDS`) before service execution,
  - draft create payload now enforces strict `imageUrl`/`thumbnailUrl` http(s) URL validation and `metadata` object shape limits at the route edge (`DRAFT_CREATE_INVALID`),
  - integration coverage now validates invalid query, unknown fields, malformed media URLs/types, and invalid metadata payloads for draft creation.
- Draft read query-boundary hardening update:
  - `/api/drafts/:id`, `/api/drafts/:id/provenance`, `/api/drafts/:id/provenance/export`, and `/api/drafts/:id/arc` now enforce strict empty query allowlists,
  - read surfaces now reject unsupported query keys before id/service resolution (`DRAFT_DETAIL_INVALID_QUERY_FIELDS`, `DRAFT_PROVENANCE_INVALID_QUERY_FIELDS`, `DRAFT_PROVENANCE_EXPORT_INVALID_QUERY_FIELDS`, `DRAFT_ARC_INVALID_QUERY_FIELDS`),
  - integration coverage now validates invalid query rejection across draft detail/provenance/export/arc endpoints.
- Observer read-surface query-boundary hardening update:
  - `/api/observers/me/profile`, `/api/observers/:id/profile`, `/api/me/following`, and `/api/observers/digest` now enforce strict query allowlists (`OBSERVER_INVALID_QUERY_FIELDS`),
  - observer read endpoints now enforce explicit numeric bounds for list limits/offsets (`OBSERVER_PAGINATION_INVALID`) instead of silently swallowing malformed values,
  - integration coverage now validates invalid-field and malformed-pagination rejection paths across observer profile/following/digest reads.
- Observer mutation/query boundary hardening update:
  - `/api/observers/me/preferences`, `/api/observers/watchlist`, and `/api/observers/engagements` now reject unsupported query keys (`OBSERVER_INVALID_QUERY_FIELDS`),
  - observer write endpoints (`watchlist`, `engagement save/rate`, `digest seen`) now reject unexpected body payload keys (`OBSERVER_INVALID_BODY_FIELDS`) before service calls,
  - observer preferences write now enforces strict top-level and nested digest key allowlists (`OBSERVER_PREFERENCES_INVALID`),
  - pagination and boolean parsers now reject repeated multi-value query aliases instead of coercing arrays (`OBSERVER_PAGINATION_INVALID`, `OBSERVER_PREFERENCES_INVALID`),
  - integration coverage now validates invalid query/body and duplicated-query alias rejection on observer read/write surfaces.
- Feed/guild/studio-ledger pagination strictness update:
  - `/api/feed`, feed list endpoints, and `/api/guilds` now require integer bounded pagination values (`limit`/`offset`) and reject float/negative/out-of-range input with explicit service errors,
  - `/api/studios/:id/ledger` now keeps safe clamping behavior for bounds while rejecting non-integer `limit` values at the route boundary,
  - integration coverage now validates float/negative/out-of-range pagination rejection for feed and guild surfaces plus non-integer rejection for studio ledger.
- Pull-request prediction/decision boundary hardening update:
  - `/api/pull-requests/:id`, `/api/pull-requests/:id/decide`, and `/api/pull-requests/:id/fork` now fail fast on malformed pull-request ids (`PR_ID_INVALID`),
  - prediction read/write surfaces now enforce strict query allowlists (`PREDICTION_INVALID_QUERY_FIELDS`) on `/api/drafts/:id/predict`, `/api/pull-requests/:id/predict`, and `/api/pull-requests/:id/predictions`,
  - prediction payload stake aliases (`stakePoints`, `points`) now enforce strict numeric boundary rules at route edge (finite integer, 5..500) before service execution (`PREDICTION_STAKE_INVALID`),
  - prediction payloads now reject non-object request bodies (`PREDICTION_INVALID_FIELDS`) and fail fast when outcome aliases are missing (`PREDICTION_INVALID`),
  - `/api/pull-requests/:id` review reads and `/api/pull-requests/:id/decide`/`fork` mutations now reject unsupported query keys (`PR_REVIEW_INVALID_QUERY_FIELDS`, `PR_DECISION_INVALID_QUERY_FIELDS`, `PR_FORK_INVALID_QUERY_FIELDS`),
  - `/api/pull-requests/:id/fork` now rejects non-empty body payloads (`PR_FORK_INVALID_FIELDS`) because the endpoint is parameter-only,
  - `/api/drafts/:id/fix-requests` and `/api/drafts/:id/pull-requests` read endpoints now enforce strict empty query allowlists (`FIX_REQUEST_LIST_INVALID_QUERY_FIELDS`, `PULL_REQUEST_LIST_INVALID_QUERY_FIELDS`),
  - `/api/drafts/:id/release`, `/api/drafts/:id/fix-requests`, `/api/drafts/:id/pull-requests`, and `/api/drafts/:id/embedding` mutations now fail fast on malformed draft ids and reject unsupported query keys (`DRAFT_RELEASE_INVALID_QUERY_FIELDS`, `FIX_REQUEST_CREATE_INVALID_QUERY_FIELDS`, `PULL_REQUEST_CREATE_INVALID_QUERY_FIELDS`, `DRAFT_EMBEDDING_INVALID_QUERY_FIELDS`),
  - create payloads for `/api/drafts/:id/fix-requests` and `/api/drafts/:id/pull-requests` now enforce strict field allowlists + type/enum/url validation before service calls (`FIX_REQUEST_CREATE_INVALID_FIELDS`, `FIX_REQUEST_CREATE_INVALID`, `PULL_REQUEST_CREATE_INVALID_FIELDS`, `PULL_REQUEST_CREATE_INVALID`),
  - `/api/drafts/:id/release` now rejects unsupported body fields (`DRAFT_RELEASE_INVALID_FIELDS`) and `/api/drafts/:id/embedding` now enforces strict payload allowlist/type bounds (`DRAFT_EMBEDDING_INVALID_FIELDS`, `DRAFT_EMBEDDING_INVALID`),
  - PR decision payloads now enforce strict field allowlist and decision enum validation (`PR_DECISION_INVALID_FIELDS`, `PR_DECISION_INVALID`) before business logic execution.
- Admin UX gateway query-state maintainability update:
  - `AdminUxObserverEngagementPage` now reuses `resolveGatewayQueryState(...)` and `resolveAiRuntimeQueryState(...)` instead of duplicating query parsing in-page,
  - complexity gate is back under threshold (`ultracite` pass) without behavior changes in gateway session/events and AI dry-run controls.
- Local API test-runner reliability update:
  - `scripts/ci/run-local-tests.mjs` now retries `migrate:up` with bounded backoff (`LOCAL_TEST_MIGRATE_RETRIES`, `LOCAL_TEST_MIGRATE_RETRY_DELAY_MS`) to reduce cold-start flakiness when Postgres accepts connections before full readiness,
  - dry-run validation confirms the runner still parses args/passthrough as expected.
- Redis integration-test lifecycle hardening update:
  - redis wrapper now tracks explicit connection state in test mode (`connectedState`) so `redis.isOpen` reflects wrapper-level successful connects even when fallback hooks are active,
  - `redis.quit()` now always attempts close and gracefully no-ops on already-closed client, removing lingering Redis `TCPWRAP` handles in API integration runs,
  - previously blocked targeted API integration checks now pass with live Docker infra (`admin.integration` similar-search metrics and `api.integration` telemetry UX scenario).
- Feed provenance consistency update (`Battle` + `Change`):
  - `/api/feeds/changes` now joins `draft_provenance` for both `pr_merged` and `fix_request` branches and returns normalized provenance on each change item,
  - web feed types/mappers now preserve provenance for `BattleFeedItem` and `ChangeFeedItem` (`mapBattles`, `mapChanges`) instead of dropping it at client mapping,
  - `BattleCard` and `ChangeCard` now render provenance status badge and Human Spark metadata so provenance indicators are consistent across draft/progress/hot/battle/change surfaces,
  - regression coverage updated in API integration (`feeds endpoints return data`) and web card tests (`cards.spec.tsx`) to lock the behavior.
- Observer actions UX hardening update:
  - `ObserverActions` now closes its expanded panel on `Escape` and click-outside to prevent sticky action trays in dense feed interactions,
  - `More` toggle now exposes `aria-controls` with a stable panel id for better assistive-tech semantics,
  - web interaction coverage added in `observer-actions.spec.tsx` for escape/outside-close behavior.
- Prediction submit dedupe hardening update:
  - `FeedTabs` battle prediction flow now uses an in-flight draft guard (`pendingBattlePredictionDraftIdsRef`) to block duplicate submit bursts before next render commit,
  - rapid double-clicks on `Predict merge/reject` can no longer issue duplicate `/drafts/:id/predict` requests while one request is in flight,
  - web feed coverage added in `feed-ui.spec.tsx` (`deduplicates rapid prediction submits while battle request is in flight`).
- Prediction auth-required UX update:
  - battle prediction state now carries explicit `authRequired` flag from `FeedTabs` (`401/403` handling) instead of relying only on error text matching,
  - `BattleCard` now renders a dedicated sign-in CTA (`/login`) inside the prediction alert when observer auth is required,
  - web feed coverage added in `feed-ui.spec.tsx` (`shows sign-in CTA when battle prediction returns auth error`).
- Prediction widget auth-required CTA parity update:
  - `PredictionWidget` now renders a dedicated sign-in CTA (`/login`) in auth-required mode, matching battle-card prediction UX,
  - draft-detail coverage now validates prediction auth-required card shows localized sign-in link target in `draft-detail-page.spec.tsx`.
- Prediction widget stake-input guardrails parity update:
  - `PredictionWidget` now normalizes invalid stake bounds (`max >= min`) before rendering and prediction submit,
  - widget now shows explicit auto-adjust guidance when stake input is out of allowed bounds (`prediction.stakeAutoAdjusted`),
  - dedicated component coverage added in `prediction-widget.spec.tsx` for auth CTA and normalized submit stake behavior.
- Shared prediction stake/limits logic extraction update:
  - introduced `apps/web/src/lib/predictionStake.ts` to centralize stake-bound normalization, stake input resolution, and daily-cap checks (`normalizePredictionStakeBounds`, `resolvePredictionStakeInput`, `derivePredictionUsageLimitState`),
  - `BattleCard` and `PredictionWidget` now use the shared helper, removing duplicated clamp/limit logic and keeping behavior aligned across feed and draft detail surfaces,
  - dedicated helper coverage added in `apps/web/src/__tests__/prediction-stake.spec.ts` (bounds, clamp/fallback, and cap-state derivation).
- Shared prediction market summary extraction update:
  - introduced `apps/web/src/lib/predictionMarket.ts` to centralize market pool, odds, payout multipliers, potential payouts, trust tier normalization, and usage-cap summary derivation (`buildPredictionMarketSnapshot`),
  - `BattleCard`, `PredictionWidget`, and `FeedTabs.parseBattlePredictionMarket(...)` now reuse the same market-summary normalization path to keep feed snapshot and draft-detail numbers in sync,
  - dedicated helper coverage added in `apps/web/src/__tests__/prediction-market.spec.ts` (stake-derived odds/payouts, provided-value precedence, trust-tier/odds normalization).
- Realtime tool-bridge event compatibility + dedupe hardening update:
  - `extractRealtimeToolCalls(...)` now supports both `response.done` and `response.output_item.done` function-call event shapes so tool execution starts as soon as output items are finalized,
  - `handleRealtimeToolCallsFromResponseDone(...)` now accepts optional per-session `processedCallIds` and skips duplicate `call_id` executions across repeated server events,
  - `LiveStudioSessionsRail` now keeps session-scoped processed call-id sets and clears them on reconnect/session cleanup to prevent duplicate `/realtime/tool` calls while preserving clean session restarts,
  - regression coverage added in `apps/web/src/__tests__/realtime-tool-bridge.spec.ts` for `response.output_item.done` extraction and duplicate call-id suppression.
- Realtime tool endpoint idempotency hardening update:
  - `/api/live-sessions/:id/realtime/tool` now reuses agent-gateway session history to detect previously successful tool executions by `{sessionId, observerId, toolName, callId}`,
  - duplicate tool calls with the same `callId` now short-circuit with cached output (`deduplicated: true`) instead of re-running side effects,
  - successful realtime tool gateway events now persist normalized execution payload (`observerId`, `toolName`, `callId`, `argumentsHash`, `output`) to back idempotent replay,
  - repeated `callId` with mismatched arguments now fails fast with `LIVE_SESSION_REALTIME_TOOL_CALL_CONFLICT` (`409`) instead of silently reusing stale output,
  - repeated `callId` with a different tool name now also fails with `LIVE_SESSION_REALTIME_TOOL_CALL_CONFLICT` (`409`) to prevent cross-tool replay,
  - cache lookup is now strictly observer-scoped (`observerId` required in payload) so one observer's `callId` cannot dedupe another observer's tool execution,
  - realtime tool boundary now enforces strict `callId` identifier format (`[A-Za-z0-9][A-Za-z0-9_.:-]*`) before execution,
  - API integration coverage updated to verify duplicate follow-tool execution returns deduplicated cached output, conflict on mismatched-arguments/tool-name reuse, invalid-callId rejection, and follow-row singularity.
- Realtime tool damage-control cooldown update (inspired by `pi-vs-claude-code` guardrail patterns):
  - `/api/live-sessions/:id/realtime/tool` now enforces short cooldown on repeated same-arguments tool executions (`sessionId + observerId + tool + argumentsHash`) to prevent rapid side-effect spam with rotating `callId`,
  - blocked calls now return `429 LIVE_SESSION_REALTIME_TOOL_COOLDOWN` plus `Retry-After`,
  - blocked attempts are written into gateway timeline (`live_realtime_tool_blocked`, reason `duplicate_args_cooldown`) for operator visibility,
  - integration coverage added in `api.integration.spec.ts` (second follow call with different `callId` but same args is throttled).

## Cross-Repo Audit Update (2026-02-26)

### OpenClaw parity (what is already in code)
- Gateway session model and compaction: implemented (`agentGatewayService`, `session_compacted`, admin compact/close APIs, telemetry + trend cards).
- Multi-step orchestration flow: implemented (`draftOrchestrationService`, role sequencing, persisted events).
- Model failover + provider cooldown: implemented (`aiRuntimeService`, role chains, cooldown skip logic, health/dry-run endpoints).
- Realtime tool loop (function calls -> tool execution -> function_call_output): implemented (`openaiRealtimeSessionService`, `realtimeToolBridge`, live session realtime tool route).
- Persona-driven runtime prompts: implemented (studio `skill_profile.rolePersonas` injected into orchestration prompts).

### OpenClaw parity (still missing)
- File-based skills runtime loader is implemented (including runtime auto-discovery), but full production traffic adoption still needs operational validation under sustained connector traffic.
- External connector baseline parity (Telegram/Slack/Discord) is now operational via connector profiles + strict launch-gate required-channel verification. Remaining gap is sustained-traffic soak and operator routing playbooks for channel-specific failure classes.

### pi-vs-claude-code takeaways applied
- Guardrail-first tool execution strategy has started:
  - strict allowlists + argument validation (already present),
  - call-id idempotency (already present),
  - same-args cooldown throttle (implemented in this update).

### Next implementation queue (code-first)
1. `External connector ecosystem` hardening slice:
   - run sustained-traffic connector validation on production paths (Telegram/Slack/Discord) and track channel-specific failure-mode distribution from launch-gate traces,
   - formalize operator routing playbooks/escalation actions per channel failure class.
2. `Skills-runtime production workflow` vertical slice:
   - validate full skills-runtime lifecycle on production traffic (load -> prompt injection -> orchestration path -> telemetry),
   - add launch-gate assertions for skills-runtime operational markers beyond single runtime probe.

## Progress Snapshot (2026-02-26 - channel adapter scaffold slice)
- Agent gateway adapter routing update:
  - added internal adapter service (`apps/api/src/services/agentGatewayAdapter/agentGatewayAdapterService.ts`) with explicit adapter types (`web`, `live_session`, `external_webhook`),
  - added adapter-aware event routing APIs for external-session and existing-session flows (`routeExternalEvent`, `appendSessionEvent`),
  - all routed events now carry adapter metadata in payload (`gatewayAdapter.name`, `gatewayAdapter.channel`).
- Runtime event wiring update:
  - live session gateway events and observer realtime send path now route through adapter service (`live_session`),
  - swarm gateway events now route through adapter service (`external_webhook`),
  - draft orchestration cycle events now route through adapter service (`web` by channel mapping).
- Telemetry + error budget update:
  - adapter route success/failure telemetry is now written to `ux_events` (`source=agent_gateway_adapter`),
  - `/api/admin/agent-gateway/telemetry` now includes adapter usage and error-budget counters (`adapters.total/success/failed/errorRate/errorBudget/usage`).
- Adapter ops visibility update:
  - added `/api/admin/agent-gateway/adapters` to expose adapter registry (`web`, `live_session`, `external_webhook`) with per-adapter success/fail totals, risk levels, last-seen timestamps, and error-budget thresholds,
  - `/api/admin/agent-gateway/adapters` now also exposes `ingestConnectors` runtime block (accept/replay/reject/rate-limited counts + configured risk + reject-rate risk level) so connector policy and live behavior are visible together,
  - `/api/admin/agent-gateway/adapters` now exposes explicit `connectorPolicies` config snapshot (defaults + per-connector overrides) alongside runtime metrics.
  - added admin integration coverage for adapter registry output + query validation in `apps/api/src/__tests__/admin.integration.spec.ts`.
- Coverage:
  - added unit coverage for adapter routing/failure telemetry (`apps/api/src/__tests__/agent-gateway-adapter.unit.spec.ts`),
  - extended admin integration telemetry assertions for adapter usage/error budget (`apps/api/src/__tests__/admin.integration.spec.ts`).

## Progress Snapshot (2026-02-26 - skills loader slice)
- Agent skills loader runtime update:
  - added `agentSkillsService` (`apps/api/src/services/agentSkills/agentSkillsService.ts`) that parses `skill_profile.skills`, `globalSkills`, and `roleSkills` into bounded, sanitized capsules,
  - added dedupe and safety limits for prompt injection (`max capsule count`, `per-role/global limits`, `instruction length bounds`, `total char budget`),
  - added safe file-based skill ingestion from `skill_profile.skillFiles` / `skillFilePaths` (`.md` / `.txt` only) with root-jail resolution (`AGENT_SKILLS_ROOT` or repo cwd), traversal/absolute-path rejection, file-size/line extraction bounds, and markdown/code-fence stripping before capsule injection,
  - integrated loaded skill capsules into orchestration prompt building (`draftOrchestrationService`) as explicit `Skill capsule` and `Role skill` instructions,
  - extended admin orchestration integration test to validate prompt injection from new skill capsule fields,
  - added unit coverage in `apps/api/src/__tests__/agent-skills.unit.spec.ts` for safe markdown ingestion and unsafe-path rejection.

## Progress Snapshot (2026-02-26 - runtime sessions.send slice)
- Live runtime observer send API update:
  - added observer-safe endpoint `POST /api/live-sessions/:id/realtime/send` with strict query/body allowlists and closed-session guard,
  - enforced `toRole` allowlist (`author`, `critic`, `maker`, `judge`) and `observer_*` event type prefix,
  - added bounded payload constraints (object-only, max keys, max serialized size) and gateway persistence (`agent_gateway_sessions/events`),
  - added API integration coverage for boundary + success persistence paths in `apps/api/src/__tests__/api.integration.spec.ts`.
- Realtime web bridge wiring update:
  - `LiveStudioSessionsRail` now mirrors bridge client events to `/live-sessions/:id/realtime/send` as best-effort sync,
  - safe event mapping added for observer runtime loop events (`observer_function_call_output`, `observer_response_create`),
  - web regression coverage updated in `apps/web/src/__tests__/live-studio-sessions-rail.spec.tsx`.

## Progress Snapshot (2026-02-26 - external adapter ingest slice)
- External adapter-ingest endpoint update:
  - added `POST /api/agent-gateway/adapters/ingest` (`apps/api/src/routes/agentGateway.ts`) with strict query/body allowlists and bounded payload/metadata/roles validation,
  - added HMAC signature verification (`x-gateway-signature`, `x-gateway-timestamp`) with skew checks and constant-time compare,
  - added connector-tenant signature policy with per-connector secret map + key-id routing (`x-gateway-key-id`) and multi-secret rotation fallback (`AGENT_GATEWAY_WEBHOOK_SECRET_PREVIOUS`),
  - added connector trust-policy map (`AGENT_GATEWAY_INGEST_CONNECTOR_POLICIES`) with per-connector `riskLevel`, optional `rateLimitMax`, and `requireConnectorSecret` enforcement,
  - connector policy now also supports risk-budget caps (`maxPayloadBytes`, `maxPayloadKeys`, `maxMetadataKeys`) with route-level enforcement and default-ceiling clamp for safety,
  - added connector/event id guardrails (`connectorId`, `eventId`) plus Redis idempotency dedupe window to block replay side effects,
  - routed accepted events through `agentGatewayAdapterService.routeExternalEvent(..., persist: true)` so adapter telemetry and payload tagging remain unified,
  - ingest telemetry now records connector risk context (`connectorRiskLevel`) for accept/replay/reject paths.
- Security/config update:
  - added env controls in `apps/api/src/config/env.ts`: `AGENT_GATEWAY_WEBHOOK_SECRET`, `AGENT_GATEWAY_WEBHOOK_SECRET_PREVIOUS`, `AGENT_GATEWAY_INGEST_MAX_TIMESTAMP_SKEW_SEC`, `AGENT_GATEWAY_INGEST_IDEMPOTENCY_TTL_SEC`, `AGENT_GATEWAY_INGEST_ALLOWED_CONNECTORS`, `AGENT_GATEWAY_INGEST_CONNECTOR_SECRETS`, `AGENT_GATEWAY_INGEST_REQUIRE_CONNECTOR_SECRET`, `AGENT_GATEWAY_INGEST_CONNECTOR_RATE_LIMIT_WINDOW_SEC`, `AGENT_GATEWAY_INGEST_CONNECTOR_RATE_LIMIT_MAX`, `AGENT_GATEWAY_INGEST_CONNECTOR_POLICIES`,
  - production safety gate now requires strong `AGENT_GATEWAY_WEBHOOK_SECRET`.
  - ingest route now enforces per-connector Redis window limiter (`AGENT_GATEWAY_INGEST_CONNECTOR_RATE_LIMIT_*`) after signature verification, returns `429 AGENT_GATEWAY_INGEST_CONNECTOR_RATE_LIMITED`, and sets `Retry-After`.
- Coverage:
  - added API integration coverage in `apps/api/src/__tests__/api.integration.spec.ts` for signature/boundary validation and replay-dedup persistence guarantees.
  - extended API integration coverage for connector limiter behavior (`x-gateway-rate-limit-override` in test mode, `Retry-After` assertion).
  - added unit coverage for connector/global signature policy + rotation matching in `apps/api/src/__tests__/agent-gateway-ingest-signature-policy.unit.spec.ts`.
  - added connector policy parser + risk-budget resolution coverage in `apps/api/src/__tests__/agent-gateway-ingest-connector-policy.unit.spec.ts`,
  - extended admin gateway telemetry integration coverage with `ingestConnectors` breakdown (`connectorId`, `configuredRiskLevel`, reject/rate-limit metrics).

## Progress Snapshot (2026-02-26 - auth profile rotation slice)
- AI runtime auth profile failover update:
  - `aiRuntimeService` now supports per-provider auth profile chains via env (`AI_RUNTIME_<PROVIDER>_AUTH_PROFILES`),
  - provider execution now rotates within provider profiles before switching to the next provider in the role chain,
  - profile-scoped cooldown and failure memory added (`coolingDown`, `lastFailureCode`) with provider-level aggregation (`activeProfile`).
- Health/telemetry surface update:
  - `/api/admin/ai-runtime/profiles` and `/api/admin/ai-runtime/health` now expose profile-level provider states through `aiRuntimeService.getProviderStates()/getHealthSnapshot()`.
- Coverage:
  - added unit coverage for profile rotation/failover in `apps/api/src/__tests__/ai-runtime.unit.spec.ts`,
  - updated admin integration coverage for profile-state fields in `apps/api/src/__tests__/admin.integration.spec.ts`.

## Progress Snapshot (2026-02-26 - gateway provider fallback + ux_events index slice)
- Provider fallback normalization update:
  - admin gateway telemetry/adapters SQL now uses the same normalized provider expression (`selectedProvider` -> `provider` fallback with empty-string guard),
  - in-memory provider usage accumulation now also falls back to `payload.provider` when `selectedProvider` is empty/missing,
  - persisted session provider filtering uses normalized SQL fallback in `agentGatewayService.listPersistedSessions`.
- Query/index performance update:
  - added migration `apps/api/migrations/1771604000000_agent_gateway_ux_event_query_indexes.cjs`,
  - added normalized provider index for `agent_gateway_events(session_id, providerExpr)` aligned with new filter expression,
  - added partial `ux_events` indexes for gateway adapter/ingest telemetry filters (`event_type`, `created_at`, `channel/provider/connector` expressions).
- Coverage update:
  - extended admin integration coverage in `apps/api/src/__tests__/admin.integration.spec.ts` for provider fallback cases in session/telemetry paths and adapter+ingest provider-filter metrics.

## Progress Snapshot (2026-02-26 - observer prediction history UX compact summary slice)
- Observer prediction history panel UX update:
  - `ObserverPredictionHistoryPanel` now renders a compact, live summary of current result-set state (`showing`, active `filter`, active `sort`) above prediction rows,
  - summary accuracy/net/resolved/pending metrics are now calculated from the currently filtered list (not global history) to keep values context-accurate while toggling controls,
  - summary line is now `aria-live="polite"` so assistive tech gets non-disruptive updates when filter/sort changes.
- Localization update:
  - added new i18n keys for compact summary labels (`observerProfile.predictionHistoryShowing`, `observerProfile.predictionHistoryFilterLabel`, `observerProfile.predictionHistorySortLabel`) in EN/RU bundles.
- Coverage update:
  - extended `apps/web/src/__tests__/observer-prediction-history-panel.spec.tsx` to assert compact-summary rendering and dynamic updates across filter/sort toggles.

## Progress Snapshot (2026-02-26 - admin prediction state drill-down slice)
- Observer-engagement API update:
  - `/api/admin/ux/observer-engagement` now exposes `predictionHistoryStateTelemetry.byScope` with the latest active prediction-history controls per scope (`activeFilter`, `activeSort`) and scope-level change timestamps (`filterChangedAt`, `sortChangedAt`, `lastChangedAt`).
- Admin UX update:
  - `/admin/ux` now renders a dedicated `Active prediction controls by scope` drill-down table in prediction telemetry so operators can inspect current scope state, not just switch volume.
- Coverage update:
  - extended API integration assertions in `apps/api/src/__tests__/admin.integration.spec.ts`,
  - extended admin UX rendering coverage in `apps/web/src/__tests__/admin-ux-page.spec.tsx`.

## Progress Snapshot (2026-02-27 - admin prediction accuracy/settlement cohort drill-down slice)
- Observer-engagement API update:
  - `/api/admin/ux/observer-engagement` now exposes `predictionMarket.cohorts.byOutcome` and `predictionMarket.cohorts.byStakeBand` with prediction/resolved/correct counts plus computed `settlementRate`, `accuracyRate`, and `netPoints`.
  - stake-band cohorts use fixed FIN-point buckets (`5-24`, `25-74`, `75-199`, `200+`) so cohort trends are comparable between windows.
- Admin UX update:
  - `/admin/ux` now renders two new drill-down tables in Prediction market telemetry:
    - `Resolution cohorts by outcome`,
    - `Resolution cohorts by stake band`.
- Coverage update:
  - API integration coverage extended for non-empty and empty cohort payloads in `apps/api/src/__tests__/admin.integration.spec.ts`,
  - admin UI coverage extended for new cohort sections in `apps/web/src/__tests__/admin-ux-page.spec.tsx`.

## Progress Snapshot (2026-02-27 - observer prediction outcome-accuracy summary polish slice)
- Observer profile UX update:
  - `ObserverPredictionHistoryPanel` compact summary now includes per-outcome resolved accuracy (`Merge`/`Reject`) and filtered average stake signal (`Stake ~ N`) for faster confidence scanning while toggling filter/sort.
  - outcome accuracy display now gracefully falls back to `observerProfile.health.unknown` when a filtered outcome has no resolved samples.
  - compact summary now also includes a filter-scoped `Risk` label (healthy/watch/critical/unknown) derived from the same prediction window risk thresholds used elsewhere in observer surfaces.
- Shared helper update:
  - added `derivePredictionResolutionBreakdown(...)` in `apps/web/src/lib/predictionHistory.ts` to compute filtered average stake and per-outcome resolved/correct/accuracy metrics in one reusable pass.
- Localization update:
  - added `observerProfile.predictionHistoryRisk` in EN/RU bundles.
- Coverage update:
  - extended `apps/web/src/__tests__/observer-prediction-history-panel.spec.tsx` with assertions for the new compact outcome-accuracy line and empty-filter fallback behavior,
  - extended `apps/web/src/__tests__/observer-prediction-history-panel.spec.tsx` with `Risk` assertions (including `Healthy` when resolved sample is sufficient),
  - added helper coverage for `derivePredictionResolutionBreakdown(...)` in `apps/web/src/__tests__/prediction-history.spec.ts`.

## Progress Snapshot (2026-02-27 - observer history risk-threshold parity slice)
- Observer profile/public profile parity update:
  - `ObserverPredictionHistoryPanel` now accepts optional backend thresholds (`riskThresholds`) and resolves compact-summary risk against provided policy when available.
  - both profile surfaces now pass `profile.predictions.thresholds.resolutionWindows` into the history panel:
    - `apps/web/src/app/observer/profile/page.tsx`,
    - `apps/web/src/app/observers/[id]/page.tsx`.
- Consistency improvement:
  - risk label in history panel now follows the same server-driven threshold policy used by prediction windows summaries instead of being hardcoded to defaults.
- Coverage update:
  - extended `apps/web/src/__tests__/observer-prediction-history-panel.spec.tsx` with threshold-override assertion (`Critical` risk when custom `minResolvedPredictions=1` policy is provided),
  - verified self/public profile pages still render with updated prop wiring (`observer-profile-page.spec.tsx`, `observer-public-profile-page.spec.tsx`).

## Progress Snapshot (2026-02-27 - admin cohort risk badges slice)
- Admin prediction telemetry UX update:
  - added cohort risk policy for prediction telemetry tables (`resolution cohorts by outcome` / `resolution cohorts by stake band`) using explicit thresholds:
    - settlement rate (`watch < 60%`, `critical < 40%`),
    - accuracy rate (`watch < 60%`, `critical < 45%`),
    - minimum resolved sample (`>= 1`).
  - each cohort row now renders risk badge (`Healthy`/`Watch`/`Critical`/`n/a`) and both tables display threshold summary copy for operator clarity.
- Consistency update:
  - risk resolution now uses shared health-label/badge utilities already used by gateway and window-risk cards, keeping visual severity language consistent in `/admin/ux`.
- Coverage update:
  - updated `apps/web/src/__tests__/admin-ux-page.spec.tsx` to assert cohort threshold copy, risk column rendering, and risk badge presence in both cohort tables.

## Progress Snapshot (2026-02-27 - admin cohort thresholds API parity slice)
- Observer-engagement API update:
  - `/api/admin/ux/observer-engagement` now exposes `predictionMarket.thresholds.cohorts` alongside `thresholds.resolutionWindows`.
  - cohort thresholds are now server-owned and returned as:
    - settlement rate (`watch < 60%`, `critical < 40%`),
    - accuracy rate (`watch < 60%`, `critical < 45%`),
    - minimum resolved sample (`>= 1`).
- Admin UX contract update:
  - updated `/admin/ux` response typing to include `predictionMarket.thresholds.cohorts`, keeping threshold parsing explicit and aligned with API payload shape.
- Coverage update:
  - extended API integration expectations in `apps/api/src/__tests__/admin.integration.spec.ts` to assert `predictionMarket.thresholds.cohorts`,
  - extended `apps/web/src/__tests__/admin-ux-page.spec.tsx` to assert cohort-threshold copy from API-provided policy (not only fallback defaults).

## Progress Snapshot (2026-02-27 - observer prediction outcome-gap summary slice)
- Observer profile UX update:
  - `ObserverPredictionHistoryPanel` summary now exposes `Outcome gap` (`Merge accuracy - Reject accuracy`, pp) next to outcome accuracy and average stake,
  - gap rendering follows a safe guardrail: if one of outcomes has no resolved sample, panel renders localized `n/a` instead of misleading numeric delta.
- Localization update:
  - added `observerProfile.predictionOutcomeGap` in EN/RU bundles.
- Coverage update:
  - extended `apps/web/src/__tests__/observer-prediction-history-panel.spec.tsx` to assert:
    - `Outcome gap: n/a` when one side has no resolved sample,
    - numeric gap rendering (`-50.0pp`) when both outcomes have resolved data.

## Progress Snapshot (2026-02-27 - observer market summary parity slice)
- Observer profile/public profile parity update:
  - extracted shared market-summary surface into `apps/web/src/components/ObserverPredictionMarketSummary.tsx`,
  - both `apps/web/src/app/observer/profile/page.tsx` and `apps/web/src/app/observers/[id]/page.tsx` now render the same prediction market tier + daily caps summary block,
  - removed duplicated trust-tier formatting logic from profile pages to keep summary behavior in one place.
- Coverage update:
  - added unit coverage for market-summary rendering and no-market fallback in `apps/web/src/__tests__/observer-prediction-market-summary.spec.tsx`,
  - updated public profile coverage in `apps/web/src/__tests__/observer-public-profile-page.spec.tsx` to assert daily stake summary parity,
  - updated public profile e2e locator assertions in `apps/web/e2e/observer-profile.spec.ts` to avoid strict-mode collisions after shared summary extraction.

## Progress Snapshot (2026-02-27 - Railway production gate automation slice)
- Release automation update:
  - added executable Railway release gate `scripts/release/railway-production-gate.mjs`,
  - gate now validates linked Railway project/environment, required web service deployment status, required env keys, and public health checks (`/`, `/feed`),
  - gate also supports optional/required API service checks (deployment, env keys, `/health`, `/ready`) and strict warning-as-error mode,
  - script works across local/global Railway CLI setups (native `railway` or `npx @railway/cli` fallback).
- Ops workflow update:
  - added npm commands:
    - `npm run release:railway:gate`
    - `npm run release:railway:gate:strict`
  - integrated gate usage into:
    - `docs/ops/production-checklist.md`,
    - `docs/ops/release-runbook.md`,
    - `docs/ops/deploy.md`,
    - `docs/ops/railway-production-gate.md` (new detailed runbook).

## Progress Snapshot (2026-02-27 - observer prediction history reset-control + telemetry-depth slice)
- Observer prediction history UX update:
  - `ObserverPredictionHistoryPanel` now includes `Reset view` control that restores history controls to defaults (`All` + `Recency`) and rewrites persisted local-storage preferences for the active scope.
  - reset control is disabled when the panel is already in default state, preventing redundant actions.
- Telemetry depth update:
  - history control telemetry (`observer_prediction_filter_change`, `observer_prediction_sort_change`) now includes filter-scoped metrics and risk context:
    - `activeFilter`, `activeSort`,
    - `filteredTotal`, `filteredResolved`, `filteredPending`,
    - `filteredAccuracyRate`, `filteredNetPoints`, `filteredRiskLevel`.
  - `Reset view` reuses existing control events (filter/sort) so admin analytics stay compatible without adding a new event type.
- Localization update:
  - added `observerProfile.predictionViewReset` to EN/RU dictionaries.
- Coverage update:
  - extended `apps/web/src/__tests__/observer-prediction-history-panel.spec.tsx` for reset flow, persisted-state reset, and enriched telemetry payload assertions.

## Progress Snapshot (2026-03-01 - ingest connector-profile defaults + runtime skill autodiscovery slice)
- Runtime skills loader update:
  - `agentSkillsService` now supports profile-driven auto-discovery of runtime `SKILL.md`/`SKILL.txt` files (`autoLoadSkillFiles`, `skillRuntime.autoLoadFiles`, `skillFilesRoot` / `skillRuntime.rootPath`),
  - auto-discovery is root-jail constrained, symlink-safe, depth-bounded, and deduplicated with explicit `skillFiles`,
  - role scope can now be inferred from skill file path segments (`author`/`critic`/`maker`/`judge`) before capsule injection.
- Connector ecosystem update:
  - added configurable connector profiles parser (`apps/api/src/services/agentGatewayIngest/connectorProfile.ts`) with startup validation via `AGENT_GATEWAY_INGEST_CONNECTOR_PROFILES`,
  - ingest route now supports connector-level defaults for `adapter`, `channel`, `fromRole`, `toRole`, and `type` when those fields are omitted in incoming payloads,
  - connector default application path is now centralized in `resolveConnectorProfileDefaults(...)` (body-overrides-profile precedence), and ingest route reuses this resolver,
  - added optional strict profile enforcement (`AGENT_GATEWAY_INGEST_ENFORCE_CONNECTOR_PROFILE=true`) that rejects payload/profile conflicts with explicit `AGENT_GATEWAY_INGEST_CONNECTOR_PROFILE_CONFLICT` (`409`),
  - ingest route now also supports channel-aware `externalSessionId` fallback extraction from payload/metadata (`telegram`/`slack`/`discord`) when explicit `externalSessionId` is not provided (`apps/api/src/services/agentGatewayIngest/connectorEnvelope.ts`),
  - `/api/admin/agent-gateway/telemetry` and `/api/admin/agent-gateway/adapters` now expose `connectorProfiles` snapshot (defaults + resolved profile list) alongside `connectorPolicies`,
  - added ready-to-copy connector profile example (`docs/ops/examples/agent-gateway-ingest-connector-profiles.example.json`) for Telegram/Slack/Discord + launch probe channels,
  - keeps existing explicit-body precedence and existing signature/idempotency/rate-limit guardrails unchanged.
- Launch-gate automation update:
  - `scripts/release/production-launch-gate.mjs` now validates `connectorProfiles` snapshot presence on both admin gateway endpoints,
  - in `--strict` mode this check is required (`connectorProfilesSnapshot.pass=true`), while non-strict mode records it as informational.
  - added optional strict cron-window assertion (`--require-natural-cron-window` / `RELEASE_REQUIRE_NATURAL_CRON_WINDOW=true`) to require that expected cron jobs have successful runs for the current UTC date.
  - wired workflow/dispatch inputs for cron-window strictness (`require_natural_cron_window` in `.github/workflows/production-launch-gate.yml`, `RELEASE_REQUIRE_NATURAL_CRON_WINDOW=true` in `dispatch-production-launch-gate.mjs`).
  - fixed launch dispatch run-discovery logic to always wait on a newly created workflow run (baseline run-id filtering), preventing false positives from reusing immediately previous successful runs.
  - added fail-fast guardrails for skill-marker mode: `require_skill_markers=true` now requires explicit `runtime_draft_id` in workflow/dispatch and `--require-skill-markers` now requires explicit runtime draft id in the gate script.
- Coverage update:
  - extended skills-loader coverage in `apps/api/src/__tests__/agent-skills.unit.spec.ts` for runtime auto-load on/off behavior,
  - added connector-profile parser coverage in `apps/api/src/__tests__/agent-gateway-ingest-connector-profile.unit.spec.ts`,
  - added connector-profile default-precedence coverage (`resolveConnectorProfileDefaults`) in `apps/api/src/__tests__/agent-gateway-ingest-connector-profile.unit.spec.ts`,
  - added connector-envelope session-id extraction coverage in `apps/api/src/__tests__/agent-gateway-ingest-connector-envelope.unit.spec.ts`,
  - extended API integration ingest coverage for telegram fallback external-session derivation in `apps/api/src/__tests__/api.integration.spec.ts`.

## Progress Snapshot (2026-03-01 - connector-profile strict enforcement + CI launch-gate revalidation)
- Ingest strictness update:
  - added optional runtime guard `AGENT_GATEWAY_INGEST_ENFORCE_CONNECTOR_PROFILE=true` so configured connector profile fields become strict constraints (instead of defaults-only),
  - ingress now rejects profile/body divergence with explicit `409 AGENT_GATEWAY_INGEST_CONNECTOR_PROFILE_CONFLICT`,
  - conflict detection is centralized via `collectConnectorProfileConflicts(...)` in connector-profile service.
- Admin telemetry/config visibility update:
  - `/api/admin/agent-gateway/telemetry` and `/api/admin/agent-gateway/adapters` connector profile snapshot now includes `defaults.enforceProfile`.
- Coverage update:
  - extended connector-profile unit coverage for conflict detection behavior and unconstrained-field no-conflict path in `apps/api/src/__tests__/agent-gateway-ingest-connector-profile.unit.spec.ts`.
  - added API integration coverage for strict connector-profile conflict rejection path in `apps/api/src/__tests__/api.integration.spec.ts`.
- Launch-gate revalidation:
  - workflow dispatch strict matrix re-run on latest `main` passed:
    - run `#14` (`22538929205`) with `runtime_draft_id=3fefc86d-eb94-42f2-8c97-8b57eff8944e`, `require_skill_markers=true`, `require_natural_cron_window=true`.
  - post-change strict matrix re-run after connector-profile route-path update also passed:
    - run `#15` (`22539023145`) on head `7f09bf1` with the same strict inputs (`runtime_draft_id` + `require_skill_markers=true` + `require_natural_cron_window=true`).

## Progress Snapshot (2026-03-01 - launch-gate smoke required-step guardrail)
- Launch-gate reliability update:
  - `scripts/release/production-launch-gate.mjs` now validates explicit required smoke step set (API critical path + web surfaces) instead of relying on summary-only smoke status.
  - added `smokeRequiredSteps` check block in summary artifact with `required`, `missing`, and `failed` arrays for easier operator triage.
  - required web surfaces now include seeded draft detail coverage (`web.draft.detail`) to match release checklist expectations for `/drafts/[id]`.
- Ops docs update:
  - `docs/ops/release-checklist.md` strict launch-gate section now explicitly requires `smokeRequiredSteps.pass=true`.
  - `docs/ops/release-runbook.md` now documents the enforced smoke required-step set.
- Revalidation:
  - strict dispatch matrix re-run passed after guardrail patch:
    - run `#18` (`22540039019`) with `runtime_draft_id=3fefc86d-eb94-42f2-8c97-8b57eff8944e`, `require_skill_markers=true`, `require_natural_cron_window=true`.

## Progress Snapshot (2026-03-01 - post-release health report profile parity)
- Release-health automation update:
  - `scripts/release/post-release-health-report.mjs` now supports workflow-aware profiles:
    - `ci` (existing required jobs/artifacts gate),
    - `launch-gate` (Production Launch Gate job + launch artifact set gate).
  - added CLI selectors:
    - `--workflow-file <name>`
    - `--profile <ci|launch-gate>`
  - summary output now includes resolved workflow metadata (`file`, `profile`) for traceability.
- Ops workflow update:
  - added npm shortcuts:
    - `release:health:report:launch-gate`
    - `release:health:report:launch-gate:json`
  - release checklist/runbook now document launch-gate health profile commands.
- Verification:
  - launch-gate profile strict check passed on run `#18` (`22540039019`) with required jobs/artifacts `1/1` and `9/9`.
  - default CI profile strict check remains green on run `#469` (`22482957944`) with required jobs/artifacts `5/5` and `5/5`.

## Progress Snapshot (2026-03-01 - external connector fallback probe instrumentation)
- Launch-gate ingest coverage update:
  - `production-launch-gate.mjs` ingest stage now supports connector-profile-driven external channel fallback probes for `telegram`, `slack`, `discord`.
  - for each configured channel profile, gate sends signed ingest payload without explicit `externalSessionId` and validates persisted session fallback id format via admin sessions API.
  - launch summary now includes dedicated check `ingestExternalChannelFallback`, and ingest artifact now includes `externalChannelFallback` details (`configuredChannels`, `checks`, `reason`, `skipped`).
- Ops expectations update:
  - release checklist/runbook now require `ingestExternalChannelFallback.pass=true` when external channel profiles are configured and allow explicit `skipped=true` when they are not configured.
- Revalidation:
  - strict launch-gate run `#20` (`22540366264`) passed with new check present:
    - `ingestExternalChannelFallback.pass=true`
    - `ingestExternalChannelFallback.skipped=true` (no `telegram/slack/discord` profiles configured in current production profile map).

## Progress Snapshot (2026-03-01 - skills-runtime multi-step marker gate)
- Launch-gate runtime marker update:
  - runtime probe marker validation now uses per-step coverage instead of first-step-only prompt check.
  - added launch summary check `skillMarkerMultiStep` with explicit marker diagnostics:
    - `missingRolePersonaRoles`
    - `missingSkillCapsuleRoles`
    - `roleSkillPresentRoles`
  - strict marker pass rule when `require_skill_markers=true`:
    - `Role persona` marker on every orchestration step,
    - `Skill capsule` marker on every orchestration step,
    - `Role skill` marker present on at least one orchestration step.
- Ops expectations update:
  - release checklist/runbook now document the new `skillMarkerMultiStep` launch-gate requirement semantics.
- Revalidation:
  - strict launch-gate run `#24` (`22540547708`) passed with:
    - `skillMarkerMultiStep.pass=true`
    - `missingRolePersonaRoles=[]`
    - `missingSkillCapsuleRoles=[]`
    - `roleSkillPresentRoles=["critic","maker"]`.
- Incident trace during rollout:
  - initial strict-all-roles `Role skill` criterion failed in run `#22` (`22540472390`) and run `#23` (`22540519731`),
  - criterion was corrected to match runtime intent (role-skill optional per-role, but required to appear on at least one orchestration step).

## Progress Snapshot (2026-03-01 - required external channels gate + failure diagnostics)
- Launch-gate control-plane update:
  - `production-launch-gate.mjs` now supports `--required-external-channels <csv|all>` (env alternative: `RELEASE_REQUIRED_EXTERNAL_CHANNELS`) to enforce required external connector channels (`telegram`, `slack`, `discord`) during ingest fallback verification.
  - launch-gate workflow now supports matching dispatch input `required_external_channels`, and dispatch helper forwards `RELEASE_REQUIRED_EXTERNAL_CHANNELS`.
  - summary check `ingestExternalChannelFallback` now reports:
    - `requiredChannels`
    - `missingRequiredChannels`
    - `requiredChannelsPass`
  - invalid control combination is now blocked (`--required-external-channels` + `--skip-ingest-probe`).
- Failure observability update:
  - ingest failures now still write explicit summary checks before exiting:
    - `checks.ingestExternalChannelFallback`
    - `checks.ingestProbe`
  - this removes prior truncated-check ambiguity on negative launch-gate runs.
- Ops docs update:
  - release checklist/runbook now include the `required_external_channels` workflow/env controls and expected summary assertions for strict required-channel runs.
- Revalidation matrix:
  - baseline pass run `#25` (`22540764904`) with no required channels.
  - strict matrix pass run `#27` (`22540811251`) with:
    - `runtime_draft_id=3fefc86d-eb94-42f2-8c97-8b57eff8944e`
    - `require_skill_markers=true`
    - `require_natural_cron_window=true`
  - negative required-channel run `#29` (`22540889549`) intentionally failed with:
    - `requiredChannels=["telegram"]`
    - `missingRequiredChannels=["telegram"]`
    - `ingestProbe.pass=false`
  - post-negative baseline sanity run `#30` (`22540913414`) passed.

## Progress Snapshot (2026-03-01 - external connector fallback telemetry assertions)
- Launch-gate ingest verification update:
  - external channel fallback checks now also require connector telemetry evidence from `/api/admin/agent-gateway/telemetry` (scoped by `channel` + `connector`).
  - per-channel fallback pass now requires:
    - `ingestConnectors.total > 0`
    - `ingestConnectors.accepted > 0`
  - fallback diagnostics now include telemetry fields (`telemetryPass`, `telemetryAccepted`, `telemetryTotal`, `telemetryAttempts`, `telemetryStatus`, `telemetryRejected`) per channel check.
- Ops expectations update:
  - release checklist/runbook now explicitly call out telemetry assertion requirements for configured external channels.
- Revalidation:
  - baseline launch-gate run `#31` (`22540991179`) passed after patch deployment.

## Progress Snapshot (2026-03-01 - skills-runtime matrix marker coverage)
- Launch-gate runtime-depth update:
  - skills-runtime marker validation now extends beyond single runtime probe and covers matrix orchestration channels (`web`, `live_session`, runtime probe channel).
  - added summary check `skillMarkerMatrixChannels` with explicit `failedChannels` diagnostics.
  - `adapterMatrixProbe` summary now includes component-level signals (`channelFlowPass`, `adapterUsagePass`, `skillMarkerMatrixPass`) for clearer triage.
- Diagnostics reliability update:
  - runtime/matrix checks now persist summary check states before throwing on failure, reducing ambiguity in failed launch-gate artifacts.
- Ops expectations update:
  - release checklist/runbook now require `skillMarkerMatrixChannels.pass=true` when `require_skill_markers=true`.
- Revalidation:
  - strict launch-gate run `#32` (`22541079581`) passed with:
    - `skillMarkerMultiStep.pass=true`
    - `skillMarkerMatrixChannels.pass=true`
    - `skillMarkerMatrixChannels.failedChannels=[]`.
  - baseline run `#36` (`22541380483`) confirms skipped semantics remain clean when markers are not required:
    - `skillMarkerMatrixChannels.skipped=true`
    - `skillMarkerMatrixChannels.failedChannels=[]`.

## Progress Snapshot (2026-03-01 - launch-gate dispatch helper CLI inputs)
- Release operations UX update:
  - `dispatch-production-launch-gate.mjs` now supports direct CLI workflow inputs (in addition to env):
    - `--runtime-draft-id <uuid>`
    - `--require-skill-markers`
    - `--require-natural-cron-window`
    - `--required-external-channels <csv|all>`
  - shorthand `--runtime-draft-id=<uuid>` / `--required-external-channels=<csv|all>` forms added.
  - required external channels now use the same allowed-channel validation (`telegram`, `slack`, `discord`, `all`) for both CLI and env paths.
- Ops docs update:
  - release checklist/runbook now document CLI-first dispatch examples.
- Revalidation:
  - CLI-input dispatch run `#33` (`22541273708`) passed:
    - `--runtime-draft-id 3fefc86d-eb94-42f2-8c97-8b57eff8944e`
    - `--require-skill-markers`
    - `--require-natural-cron-window`.
  - CLI required-channel negative path run `#34` (`22541313729`) intentionally failed with:
    - `requiredChannels=["telegram"]`
    - `missingRequiredChannels=["telegram"]`.
  - baseline sanity run `#35` (`22541336245`) passed after negative validation.

## Progress Snapshot (2026-03-01 - external-channel strict rollout documentation)
- Ops documentation update:
  - release runbook/checklist now include an explicit pre-public-launch connector parity sequence:
    - configure production `AGENT_GATEWAY_INGEST_CONNECTOR_PROFILES`,
    - deploy API with updated env,
    - dispatch launch gate with `--required-external-channels all`,
    - assert `ingestExternalChannelFallback.requiredChannels` and `missingRequiredChannels=[]`.
- Objective:
  - close the remaining external connector ecosystem launch gap with reproducible operator steps, not ad-hoc manual flow.

## Progress Snapshot (2026-03-01 - external-channel strict rollout execution)
- Production connector parity run:
  - executed strict launch-gate dispatch with required channels:
    - `npm run release:launch:gate:dispatch -- --required-external-channels all`
  - workflow run `#37` (`22541810462`) completed with `success`.
- Required-channel verification evidence:
  - strict launch-gate summary confirms:
    - `ingestExternalChannelFallback.pass=true`
    - `ingestExternalChannelFallback.configuredChannels=["telegram","slack","discord"]`
    - `ingestExternalChannelFallback.requiredChannels=["telegram","slack","discord"]`
    - `ingestExternalChannelFallback.missingRequiredChannels=[]`
    - `ingestExternalChannelFallback.requiredChannelsPass=true`.
- Launch-gate health profile verification:
  - `npm run release:health:report -- 22541810462 --workflow-file production-launch-gate.yml --profile launch-gate --json --strict` passed with required jobs/artifacts `1/1` and `9/9`.
- Outcome:
  - external connector strict rollout gap is now closed with live production evidence, not documentation-only intent.

## Progress Snapshot (2026-03-01 - launch-gate health schema contract sync)
- Contract alignment update:
  - release health schema now reflects current launch-gate report shape:
    - added root `workflow` object (`file`, `profile`),
    - added smoke source enum value `local-launch-gate`,
    - bumped schema version to `1.2.0`.
  - schema version constant updated in `release-health-schema-contracts.mjs`.
  - sample payload updated with `workflow` block and `schemaVersion=1.2.0`.
- Revalidation:
  - `npm run release:health:report -- 22541810462 --workflow-file production-launch-gate.yml --profile launch-gate --json --strict`: pass.
  - `npm run release:health:schema:check -- artifacts/release/post-release-health-run-22541810462.json`: pass.

## Progress Snapshot (2026-03-01 - CI workflow_dispatch recovery + Release Health Gate success)
- CI dispatch failure triage:
  - initial CI workflow_dispatch run `#523` (`22542022452`) failed on:
    - `test` job (`Run lint`) due `no-empty` in `scripts/release/production-launch-gate.mjs`,
    - `release_smoke_staging` due missing `RELEASE_*` env preflight config (`DATABASE_URL`, `REDIS_URL`, `S3_*`, `JWT_SECRET`, `EMBEDDING_PROVIDER`, `NEXT_PUBLIC_SEARCH_*`).
- Remediation:
  - patched empty catch block in `production-launch-gate.mjs` (lint-safe non-empty catch).
  - synchronized missing GitHub `RELEASE_*` workflow config from current Railway production env:
    - variables (`RELEASE_NODE_ENV`, `RELEASE_FRONTEND_URL`, `RELEASE_S3_*`, `RELEASE_EMBEDDING_PROVIDER`, `RELEASE_NEXT_PUBLIC_*`),
    - secrets (`RELEASE_DATABASE_URL`, `RELEASE_REDIS_URL`, `RELEASE_JWT_SECRET`, `RELEASE_ADMIN_API_TOKEN`, `RELEASE_S3_ACCESS_KEY_ID`, `RELEASE_S3_SECRET_ACCESS_KEY`).
- Revalidation:
  - rerun CI workflow_dispatch `#524` (`22542195730`): `success`.
  - downstream `Release Health Gate` run (`22542270014`): `success`.
  - `npm run release:health:report -- 22542195730 --json --strict`: pass (`requiredJobs=5/5`, `requiredArtifacts=5/5`).
  - `npm run release:health:schema:check -- artifacts/release/post-release-health-run-22542195730.json`: pass.

## Progress Snapshot (2026-03-01 - strict launch-gate all-flags matrix run)
- Full strict matrix execution:
  - dispatched production launch-gate with all strict controls enabled in one run:
    - `--runtime-draft-id 3fefc86d-eb94-42f2-8c97-8b57eff8944e`
    - `--require-skill-markers`
    - `--require-natural-cron-window`
    - `--required-external-channels all`
  - workflow run `#38` (`22542439669`) completed with `success`.
- Summary assertions:
  - `skillMarkerMultiStep.pass=true`
  - `skillMarkerMatrixChannels.pass=true`
  - `ingestExternalChannelFallback.requiredChannels=["telegram","slack","discord"]`
  - `ingestExternalChannelFallback.missingRequiredChannels=[]`
  - `ingestExternalChannelFallback.requiredChannelsPass=true`
  - `connectorProfilesSnapshot.pass=true`.
- Health profile revalidation:
  - `npm run release:health:report -- 22542439669 --workflow-file production-launch-gate.yml --profile launch-gate --json --strict`: pass (`requiredJobs=1/1`, `requiredArtifacts=9/9`).
  - `npm run release:health:schema:check -- artifacts/release/post-release-health-run-22542439669.json`: pass.

## Progress Snapshot (2026-03-01 - smoke diff regression check after CI recovery)
- Release smoke comparison:
  - compared prior successful CI baseline run `#469` (`22482957944`) with recovered CI run `#524` (`22542195730`):
    - `npm run release:smoke:diff -- 22482957944 22542195730`
- Diff outcome:
  - overall status remained green (`pass -> pass`),
  - step coverage unchanged (`19 -> 19`),
  - failed steps unchanged (`0 -> 0`),
  - pass/fail regressions: none.
- Evidence:
  - diff report saved to `artifacts/release/smoke-diff-22482957944-vs-22542195730.json`.
- Observation:
  - candidate total smoke duration increased (~`+3600ms`) without functional regression; monitor latency trend via production observability.

## Progress Snapshot (2026-03-01 - external-channel failure-mode diagnostics live validation)
- Launch-gate hardening update:
  - added failure-mode classification for external connector fallback checks (`telegram`, `slack`, `discord`) and persisted per-channel traces.
  - added summary check `ingestExternalChannelFailureModes` with:
    - `failedChannels`
    - `requiredFailedChannels`
  - added dedicated workflow artifact upload:
    - `production-external-channel-traces` (`production-agent-gateway-external-channel-traces.json`).
- Strict production validation:
  - dispatched full strict matrix run with all controls:
    - `--runtime-draft-id 3fefc86d-eb94-42f2-8c97-8b57eff8944e`
    - `--require-skill-markers`
    - `--require-natural-cron-window`
    - `--required-external-channels all`
  - workflow run `#39` (`22547059063`) completed with `success`.
- Evidence:
  - launch summary confirms:
    - `ingestExternalChannelFailureModes.pass=true`
    - `ingestExternalChannelFailureModes.requiredFailedChannels=[]`
    - `ingestExternalChannelFallback.requiredChannels=["telegram","slack","discord"]`
    - `ingestExternalChannelFallback.missingRequiredChannels=[]`.
  - trace artifact confirms per-channel successful probes with `failureMode=null`.
  - `npm run release:health:report -- 22547059063 --profile launch-gate --strict --json`: pass (`requiredJobs=1/1`, `requiredArtifacts=9/9`).
  - `npm run release:health:schema:check -- artifacts/release/post-release-health-run-22547059063.json`: pass.
- Next hardening step:
  - run sustained-traffic connector soak and track channel-level failure-mode distribution from `production-external-channel-traces`.

## Progress Snapshot (2026-03-01 - external-channel failure-mode operator playbook formalization)
- Operator routing formalization:
  - documented per-`failureMode` response matrix in
    `docs/ops/agent-gateway-ai-runtime-runbook.md` (`External-channel failure-mode routing`),
    including first actions and escalation owner for:
    - `ingest_http_error`
    - `ingest_not_applied`
    - `sessions_lookup_error`
    - `fallback_session_mismatch`
    - `telemetry_http_error`
    - `telemetry_no_connector_events`
    - `telemetry_zero_accepted`
    - `unknown`.
- Release process integration:
  - release runbook now links strict launch-gate failure classes directly to this routing matrix.
  - release checklist now enforces:
    - explicit `failedChannels=[]` check on strict parity runs,
    - incident-routing requirement for any failed channel,
    - rollout pause when `requiredFailedChannels` is non-empty in two consecutive strict runs.
- Remaining gap:
  - automate rolling failure-mode trend extraction and operator alerting from repeated `production-external-channel-traces` artifacts.

## Progress Snapshot (2026-03-01 - sustained-traffic strict launch-gate soak baseline)
- Sustained strict validation runset:
  - executed 3 consecutive strict launch-gate runs with full controls:
    - run `#40` (`22547175018`)
    - run `#41` (`22547193363`)
    - run `#42` (`22547210842`)
  - shared inputs:
    - `--runtime-draft-id 3fefc86d-eb94-42f2-8c97-8b57eff8944e`
    - `--require-skill-markers`
    - `--require-natural-cron-window`
    - `--required-external-channels all`.
- Failure-mode distribution baseline:
  - collected `production-external-channel-traces` for each run and summarized to:
    - `artifacts/release/external-channel-failure-mode-soak-22547175018-22547210842.json`
  - aggregated result across 9 checks (`3 channels x 3 runs`):
    - `pass_null=9`
    - no non-null failure modes observed.
  - per-channel result:
    - `telegram|pass_null=3`
    - `slack|pass_null=3`
    - `discord|pass_null=3`.
- Health validation:
  - `npm run release:health:report -- 22547210842 --profile launch-gate --strict --json`: pass (`requiredJobs=1/1`, `requiredArtifacts=9/9`).
  - `npm run release:health:schema:check -- artifacts/release/post-release-health-run-22547210842.json`: pass.
- Next hardening increment:
  - automate rolling-window failure-mode trend extraction across recent strict runs and alert when any non-null mode appears.

## Progress Snapshot (2026-03-01 - rolling external-channel trend gate integration)
- Release-health gate integration:
  - `scripts/release/post-release-health-report.mjs` now computes rolling external-channel failure-mode trend for launch-gate profile from `production-external-channel-traces` artifacts.
  - trend result is surfaced in report as `externalChannelFailureModes` and is now part of mandatory `summary.pass` evaluation for launch-gate profile.
  - launch-gate health artifact requirements now include `production-external-channel-traces` (`requiredArtifactsTotal` for launch-gate profile moved from `9` to `10`).
- Controls:
  - `RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_WINDOW` (default `3`)
  - `RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_MIN_RUNS` (default `1`).
- Schema + docs sync:
  - release health schema version bumped to `1.3.0` with `externalChannelFailureModes` contract.
  - release checklist/runbook updated with mandatory assertions:
    - `externalChannelFailureModes.pass=true`
    - `externalChannelFailureModes.nonPassModes=[]`.
- Revalidation:
  - `npm run release:health:report -- 22547210842 --profile launch-gate --strict --json`: pass.
  - trend payload confirms:
    - `windowSize=3`
    - `analyzedRuns=3`
    - `nonPassModes=[]`
    - `runsWithRequiredFailures=[]`.
  - `npm run release:health:schema:check -- artifacts/release/post-release-health-run-22547210842.json`: pass.

## Progress Snapshot (2026-03-01 - release-health step-summary trend rendering + JSON stability)
- Release Health Gate UX/stability update:
  - `scripts/release/render-post-release-health-step-summary.mjs` now renders `externalChannelFailureModes` trend details from health summary payload.
  - BOM-safe JSON parse handling added for summary reader to prevent false parse failures on UTF-8 BOM files.
  - `scripts/release/run-post-release-health-gate.sh` now uses `npm --silent run` for JSON-producing commands so CI artifacts remain machine-parseable.
- Result:
  - operator step summary now exposes launch-gate external-channel trend state without manual JSON inspection.
- Next increment:
  - add automated alert hook on first non-pass mode appearance in rolling window (channel + mode + run id triage payload).
