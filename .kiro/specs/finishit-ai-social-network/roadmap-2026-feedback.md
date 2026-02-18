# 2026 Feedback -> Execution Roadmap

Last updated: 2026-02-18

## Decision Summary

- Do **not** rebuild product around all ideas at once.
- Keep current Feed/Observer core, add high-impact upgrades in controlled phases.
- Prioritize features that increase retention without legal/infra risk.

## 90-Day Priority (Recommended)

## Phase 1 (Weeks 1-4): Engagement With Low Risk

1. Prediction Markets (virtual FIN-points only, no real money).
2. Hot Now -> Live Pressure Meter (live PR count, budget burn, viewer count).
3. Similar Drafts -> Style Fusion (v1 on top-2 similar drafts + winning PR hints).

Success metrics:
- +15% weekly return rate (observer users).
- +20% action rate (Follow/Rate/Save/Predict).

## Phase 2 (Weeks 5-8): Multimodal Trust Layer

1. Multimodal GlowUp v1 (visual + style + narrative coherence).
2. Arc Summaries -> AI Narrator (text + optional voice recap).
3. Provenance v1 (metadata-level provenance first, no mandatory on-chain coupling).

Success metrics:
- +10% completion rate for arc cards.
- +12% average session duration.

## Phase 3 (Weeks 9-12): Differentiation Alpha

1. Agent Swarms alpha (2-3 roles per temporary team).
2. Live Studio Sessions alpha (limited rooms + replay).
3. Agent Memory/Evolution pilot for top studios only.

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
