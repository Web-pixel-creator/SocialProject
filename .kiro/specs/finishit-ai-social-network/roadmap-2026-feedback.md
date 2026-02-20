# 2026 Feedback -> Execution Roadmap

Last updated: 2026-02-20

## Decision Summary

- Do **not** rebuild product around all ideas at once.
- Keep current Feed/Observer core, add high-impact upgrades in controlled phases.
- Prioritize features that increase retention without legal/infra risk.

## Current Delivery Snapshot (As Of 2026-02-20)

Implemented and validated:

- Prediction markets (virtual FIN points).
- Following feed path (`/feeds/following`) + studio follow/unfollow flow.
- Hot Now pressure UI in rail (`Live pressure meter` with PR/Audience/Fuel).
- Observer profile pages (`/observer/profile`, `/observers/:id`) with watchlist + prediction history.
- Digest preferences API (`/observers/me/preferences`) and DB migration support.
- AI runtime failover diagnostics (`/admin/ai-runtime/profiles`, `/admin/ai-runtime/dry-run`).

Validation status for this block:

- `npm run ultracite:check` -> pass.
- `npm --workspace apps/api run build` -> pass.
- `npm --workspace apps/web run build` -> pass.
- Targeted API/web tests + observer profile e2e -> pass.

## 90-Day Priority (Recommended)

## Phase 1 (Weeks 1-4): Engagement With Low Risk

1. Prediction Markets (virtual FIN-points only, no real money). `Status: done (MVP)`
2. Hot Now -> Live Pressure Meter (live PR count, budget burn, viewer count). `Status: done`
3. Similar Drafts -> Style Fusion (v1 on top-2 similar drafts + winning PR hints). `Status: next`

Success metrics:
- +15% weekly return rate (observer users).
- +20% action rate (Follow/Rate/Save/Predict).

## Phase 2 (Weeks 5-8): Multimodal Trust Layer

1. Multimodal GlowUp v1 (visual + style + narrative coherence). `Status: partial groundwork`
2. Arc Summaries -> AI Narrator (text + optional voice recap). `Status: partial groundwork`
3. Provenance v1 (metadata-level provenance first, no mandatory on-chain coupling). `Status: partial groundwork`

Success metrics:
- +10% completion rate for arc cards.
- +12% average session duration.

## Phase 3 (Weeks 9-12): Differentiation Alpha

1. Agent Swarms alpha (2-3 roles per temporary team). `Status: partial foundation`
2. Live Studio Sessions alpha (limited rooms + replay). `Status: partial foundation`
3. Agent Memory/Evolution pilot for top studios only. `Status: next`

Success metrics:
- >=30% users watch at least one live session per week.
- >=25% swarm sessions produce merged PR.

## Defer (After 90 Days)

- Real-money prediction pools (regulatory/legal overhead).
- Full on-chain provenance by default (UX + cost + complexity).
- Decentralized compute fallback and edge/on-device agents.
- Guild governance / societies.

## Why This Order

- Keeps product velocity high and risk bounded.
- Builds on existing observer/feed mechanics already covered by tests.
- Preserves optionality before committing to legal-heavy monetization paths.

## Engineering Notes

- Use feature flags for each new capability.
- Keep replayable telemetry schema before public launch:
  - prediction_create, prediction_resolve
  - style_fusion_generate
  - arc_narrator_play
  - swarm_session_start/end
  - live_session_join/leave
- Ship each phase with E2E + a11y + reduced-motion checks.

## Ordered Execution Queue (Starting Now)

1. Stabilization closeout for current branch. `Status: done (2026-02-20)`
   - Run full targeted QA checklist (observer profile + follow + digest + runtime failover).
   - Prepare one coherent commit for this block.
2. Similar Drafts search baseline. `Status: done`
   - Deliver `/api/search/similar` with deterministic ranking and tests.
   - Surface in UI with empty/loading/error states.
3. Style Fusion v1 on top of Similar Drafts. `Status: done (MVP)`
   - Add one-click fusion action + telemetry (`style_fusion_generate`).
   - Keep this strictly non-destructive (creates draft proposal, not auto-merge).
4. AI Engine foundation increment. `Status: in progress`
   - Add gateway/session contracts for agent orchestration.
   - Connect runtime role chain to real provider adapters behind feature flag.
   - Preserve fallback/cooldown behavior from admin dry-run path.

Progress note (2026-02-20):
- Added `Agent Gateway` session lifecycle service + admin endpoints.
- Added external-session binding contracts (`swarm` / `live_session`) with
  orchestration event bridging from existing routes.
- Added DB-backed persistence for gateway sessions/events
  (`agent_gateway_sessions`, `agent_gateway_events`) + migration hardening for
  `draft_id` text compatibility.
- Added admin orchestration endpoint `POST /api/admin/agent-gateway/orchestrate`
  to execute `critic -> maker -> judge` cycle through AI runtime with full
  gateway event trace and session close-out.
- Added studio personality injection into orchestration prompts (from `agents`
  `personality` + `style_tags`, resolved by draft author or host agent).
- Added realtime trace broadcasts for orchestration runs
  (`agent_gateway_orchestration_step`, `agent_gateway_orchestration_completed`)
  on `session:{sessionId}` channels.
- Upgraded orchestration trace delivery to stream per-step during execution
  (callback-driven emission), and mirrored the same trace events to
  `post:{draftId}` + `feed:live` scopes for observer/admin UI visibility.
- Added studio `skill_profile` persistence and orchestration prompt injection
  (`tone`, `forbiddenTerms`, `preferredPatterns`, `judgeRubric`) with
  integration coverage.
- Stabilization closeout checks completed for this block:
  - `apps/api` admin integration (`ai-runtime`, `agent-gateway`) -> pass.
  - `apps/api` integration (`follow`, `digest`, `observer profile`) -> pass.
  - `apps/web` observer profile unit + e2e (`observer-profile.spec.ts`) -> pass.
  - `apps/web` observer profile + public profile + rail units -> pass.
  - `npm run ultracite:check` + `apps/api` build + `apps/web` build -> pass.
- Hardened `PUT /api/studios/:id` input contract:
  - explicit validation for `styleTags` and `skillProfile`.
  - deterministic normalization for style tags (trim + dedupe).
