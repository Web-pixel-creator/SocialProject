Date: 2026-03-07
Owner: FinishIt Platform
Status: draft

# AI Runtime Capability Lanes Implementation Plan

## Goal

Turn the updated AI/runtime specification into a phased implementation plan that:

- keeps the current `SocialProject` control plane intact,
- adds provider lanes instead of one global model switch,
- lands the lowest-risk product wins first,
- keeps high-risk execution and browser work behind admin-only rollouts until
  telemetry and guardrails are real.

## Non-Goals

- No rewrite of the current web + API architecture.
- No attempt to clone OpenClaw or Manus as products.
- No "universal mega-adapter" before we have lane-level production evidence.
- No replacement of the existing OpenAI live voice path in the first rollout.
- No user-facing browser operator rollout before sandbox/browser controls are
  production-grade.

## External Findings Rechecked (2026-03-07)

- `OpenAI Realtime` remains the best fit for the existing low-latency live
  observer/copilot surface and still maps cleanly to WebRTC/function-calling
  style live sessions.
- `Deepgram Aura-2` is a strong render-only TTS fit for deterministic speech
  output and should not be forced into the live speech lane. Official docs
  support both REST and WebSocket delivery, so SocialProject should use
  `REST first, WebSocket later`.
- `fal Nano Banana 2 Edit` is a good first managed image-edit provider for
  prompt-plus-image draft remix and PR candidate generation.
- `Perplexity Search API` and `Perplexity Sonar` should be treated as separate
  building blocks: one for source retrieval, one for grounded answer synthesis.
- `Gemini Search Grounding` is the right alternate grounded-research provider
  with explicit web-search-backed responses.
- `Anthropic` is the strongest first choice for tool-heavy or long-context
  analysis where reliability matters more than lowest cost, and its current
  computer-use reference implementation is directly relevant to our
  browser-operator lane design.
- `Kimi` is useful as a long-context and MCP-aware secondary lane, not the
  first production-critical live lane. The current Moonshot/Kimi docs emphasize
  stronger agentic and long-horizon use cases than low-latency live UX.
- `DeepSeek` pricing and cache economics make it attractive for async batch
  reasoning, and the current official pricing/docs now expose
  `DeepSeek-V3.2`, `128K` context, tool calls, and cache-sensitive pricing.
  It should still start as a budget/offline lane rather than a tool-critical
  execution path.
- `OpenClaw` is valuable as a source of gateway, sandbox, browser, failover,
  policy, and observability patterns.
- `Manus` is useful mainly as a source of browser-operator workflow patterns:
  public-web mode, authenticated mode, and human takeover.
- Local reference clone `.external/openclaw` was fast-forwarded to
  `3d7bc595` before writing this plan.

## Current Baseline in SocialProject

- Live session and realtime bootstrap already exist:
  - `apps/api/src/routes/liveSessions.ts`
  - `apps/api/src/services/openaiRealtime/openaiRealtimeSessionService.ts`
- Search and embeddings already exist but are not citation-grounded:
  - `apps/api/src/services/search/searchService.ts`
  - `apps/api/src/services/search/embeddingService.ts`
- Sandbox execution pilot, telemetry, egress policy, and launch-gate coverage
  already exist:
  - `apps/api/src/services/sandboxExecution/*`
  - `docs/plans/2026-03-03-opensandbox-pattern-adoption-plan.md`
- Agent Gateway telemetry and provider filters already exist in admin/operator
  surfaces:
  - `apps/api/src/services/agentGateway/types.ts`
  - `apps/api/src/routes/admin.ts`
  - `apps/web/src/app/admin/ux/components/*`
- Env/config already has provider-oriented primitives:
  - `OPENAI_REALTIME_*`
  - `EMBEDDING_PROVIDER`
  - sandbox execution policy envs

## Lane Decisions

- `voice_live`
  - Primary: `OpenAI Realtime`
  - Secondary evaluation path: `Gemini Live`
  - Rollout: keep current path, do not replace in Phase 1
- `voice_render`
  - Primary: `Deepgram Aura-2`
  - Rollout: internal preview first via REST artifact generation, then
    reels/notifications, then optional WebSocket preview
- `grounded_research`
  - Primary retrieval: `Perplexity Search API`
  - Primary grounded answer: `Perplexity Sonar`
  - Secondary grounded provider: `Gemini Search Grounding`
  - Rollout: admin/internal surfaces first, then user-facing discovery helpers
- `image_edit`
  - Primary: `fal Nano Banana 2 Edit`
  - Secondary backlog provider: `OpenAI gpt-image-1`
  - Rollout: async candidate asset generation only, no auto-merge
- `long_context`
  - Primary: `Anthropic`
  - Secondary: `Kimi`
  - Budget lane: `DeepSeek`
  - Rollout: async internal jobs first
- `browser_operator`
  - Runtime base: current sandbox execution path
  - Pattern sources: `Anthropic computer use`, `OpenClaw`, and `Manus`
  - Rollout: admin-only until strict execution telemetry and approvals land

## Implementation Principles

- Build thin lane adapters plus one shared telemetry model.
- Prefer async jobs for everything except live voice.
- Reuse existing admin telemetry surfaces instead of creating a second operator
  dashboard.
- Keep provider choice in policy/config, not in route handlers.
- Treat citations, audio artifacts, and generated image candidates as
  first-class persisted records.
- Gate risky features with admin-only rollout before product exposure.

## Phase 0 - Provider Lane Registry and Shared Telemetry

Deliverables:

- add `ProviderRoutingService` and `ProviderLane` enum/types in API layer
- add per-lane config/env parsing for:
  - primary provider
  - fallback chain
  - budget caps
  - rollout flags
- add shared execution telemetry schema:
  - lane
  - provider
  - model
  - latency
  - cost
  - fallbackUsed
  - cacheHit
  - citationCount
  - safetyOutcome
- extend admin UX with lane-level provider cards and filters

Primary insertion points:

- `apps/api/src/config/env.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/services/agentGateway/*`
- `apps/web/src/app/admin/ux/components/*`

Exit criteria:

- build/test pass
- no user-visible behavior change with all new lanes disabled
- provider executions are queryable in admin metrics by lane

## Phase 1 - Voice Render Lane (`Deepgram Aura-2`)

Deliverables:

- add `VoiceLaneService` with:
  - live session passthrough to existing OpenAI path
  - render-only Deepgram TTS adapter
- implement `Deepgram REST` first for persisted audio artifacts
- add persisted audio artifact metadata:
  - script
  - transcript
  - provider
  - model
  - voice
  - duration
- add internal/admin preview endpoint for render-only audio
- keep WebSocket-based preview streaming as a later optional follow-up, not a
  Phase 1 dependency
- add reel/notification integration path behind feature flag

Primary insertion points:

- `apps/api/src/routes/liveSessions.ts`
- `apps/api/src/services/openaiRealtime/*`
- new `apps/api/src/services/voice/*`
- `apps/api/src/services/storage/*`

Exit criteria:

- one internal preview route generates stored TTS artifacts
- live voice flow remains green on current OpenAI path
- admin telemetry shows render volume, latency, and failures

## Phase 2 - Grounded Research Lane (`Perplexity` + `Gemini`)

Deliverables:

- add `GroundedResearchService`
- add citation persistence tables and API contract
- implement `Perplexity Search API` adapter for raw source retrieval
- implement `Perplexity Sonar` adapter for grounded answer synthesis
- implement `Gemini Search Grounding` fallback/alternate adapter
- add admin-only research endpoint and source-backed summary response
- extend search/discovery and commission helpers with optional citation-backed
  responses

Primary insertion points:

- `apps/api/src/services/search/*`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/routes/drafts.ts`
- `apps/web/src/app/admin/ux/components/*`

Exit criteria:

- one admin endpoint returns grounded answer + citations
- citations are persisted and refreshable
- ungrounded results cannot be mislabeled as grounded

## Phase 3 - Image Edit Lane (`fal Nano Banana 2 Edit`)

Deliverables:

- add async image-edit job model and queue
- add `ImageEditService` with provider adapter for `fal Nano Banana 2 Edit`
- persist:
  - source version
  - prompt
  - reference images
  - provider/model
  - candidate outputs
  - failure reasons
- add candidate-asset UI and promote-to-PR flow
- keep `OpenAI gpt-image-1` as a secondary-provider follow-up after the fal path
  is stable and measured

Primary insertion points:

- `apps/api/src/routes/drafts.ts`
- `apps/api/src/services/post/*`
- `apps/api/src/services/storage/*`
- new `apps/api/src/services/imageEdit/*`
- relevant web draft/studio screens

Exit criteria:

- one draft can produce async candidate image outputs
- outputs are stored as candidates, not merged automatically
- one candidate can be promoted into an existing PR workflow

## Phase 4 - Long-Context Lane (`Anthropic` / `Kimi` / `DeepSeek`)

Deliverables:

- add async long-context analysis job runner
- implement `Anthropic` as the first production-grade adapter
- implement `Kimi` as a secondary long-context adapter
- implement `DeepSeek` as a budget batch lane using its current
  cache-sensitive/128K-capable economics only after telemetry is visible
- persist cache and token economics:
  - cache hit/miss
  - input/output tokens
  - cost estimate
- connect first internal use cases:
  - Autopsy generation
  - style-fusion planning
  - moderation/review queue summaries
  - roadmap/spec analysis

Primary insertion points:

- new `apps/api/src/services/analysis/*`
- `apps/api/src/services/search/*`
- `apps/api/src/routes/admin.ts`
- scheduled jobs / background execution paths

Exit criteria:

- one async analysis job runs on `Anthropic`
- cache metrics are persisted and visible
- `Kimi` and `DeepSeek` can be enabled by policy without route changes

## Phase 5 - Browser Operator Lane (Sandbox + OpenClaw/Manus Patterns)

Deliverables:

- extend sandbox execution into browser-operator runs
- align the run loop with the reference task/tool/container pattern shown in
  Anthropic computer-use examples
- add run types:
  - `public_web`
  - `authenticated`
  - `human_takeover_required`
- persist browser artifacts:
  - screenshots
  - accessibility snapshots
  - downloads/uploads
  - run transcript
- add approval/takeover workflow for authenticated runs
- add browser-operator telemetry and cleanup checks

Primary insertion points:

- `apps/api/src/services/sandboxExecution/*`
- `apps/api/src/routes/admin.ts`
- admin UX runtime/gateway panels

Exit criteria:

- one admin-only browser run works end-to-end in staging
- authenticated/destructive steps require takeover or explicit approval
- kill switch and cleanup are covered by launch-gate or runbook checks

## Phase 6 - Governance, Budgets, and Production Rollout

Deliverables:

- per-lane budget caps and fallback rules
- provider quota exhaustion alerts
- citation-loss and cache-regression alerts
- runbooks for:
  - provider degradation
  - lane disable/fallback
  - browser operator incidents
  - image-edit provider outages
- staged rollout flags by surface

Exit criteria:

- operator can disable any lane or provider without redeploy
- monthly/per-lane spend is visible and bounded
- rollout gates exist for live voice, research, image edit, and browser lanes

## Proposed Implementation Order (Next 9 Tasks)

1. Add `ProviderRoutingService`, `ProviderLane` types, and shared telemetry.
2. Add `VoiceLaneService` and land `Deepgram` render-only preview route.
3. Add citation persistence and admin-only `GroundedResearchService`.
4. Add `Perplexity` adapter and wire citations into admin/search helpers.
5. Add `Gemini` grounded fallback path for the research lane.
6. Add image-edit job tables/queue and `fal` provider adapter.
7. Add candidate-asset promotion from image edit output into PR workflow.
8. Add async long-context job runner with `Anthropic` primary adapter.
9. Add `Kimi`, `DeepSeek`, and browser-operator lane only after the previous
   telemetry and budget surfaces are green.

## Key Risks and Controls

- `DeepSeek` should not be the first tool-critical lane.
  - Inference from official docs/pricing direction: use it first for async and
    budget-sensitive jobs, not for the most failure-intolerant tool loops.
- `Kimi` should stay policy-gated at first.
  - It is valuable for long context and MCP-aware flows, but it should not be a
    hidden dependency of the primary user journey.
  - It should ship behind explicit adapter contract tests instead of a blind
    "OpenAI-compatible" assumption, because Moonshot/Kimi compatibility details
    and tool-call conventions evolve quickly.
- `Manus` is a workflow reference, not a drop-in dependency.
  - We should copy the public/authenticated/takeover model, not couple our
    runtime to their product.
- `OpenClaw` should be treated as a pattern source.
  - Reuse its ideas around sandboxing, browser tooling, failover, plugin-like
    boundaries, and operator surfaces without importing its channel stack.
- Image-edit and browser lanes are the two highest abuse surfaces.
  - Keep them async/admin-gated first and require artifact/audit persistence.

## Success Criteria for the Whole Plan

- `voice_live` remains stable while new lanes are added around it.
- at least one new provider lane (`voice_render` or `grounded_research`) is
  product-usable without destabilizing the current stack.
- provider executions are visible in admin by lane, provider, model, and cost.
- high-risk lanes (`image_edit`, `browser_operator`) roll out only after audit,
  telemetry, and kill switches are proven.

## Sources Rechecked

- `OpenAI Realtime`: https://platform.openai.com/docs/guides/realtime
- `OpenAI Image Generation`: https://platform.openai.com/docs/guides/image-generation
- `Deepgram TTS`: https://developers.deepgram.com/docs/text-to-speech
- `fal Nano Banana 2 Edit`: https://fal.ai/models/fal-ai/nano-banana-2/edit
- `Perplexity Search`: https://docs.perplexity.ai/guides/search-guide
- `Gemini Search Grounding`: https://ai.google.dev/gemini-api/docs/google-search
- `Gemini Live`: https://ai.google.dev/gemini-api/docs/live
- `Anthropic Tool Use`: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- `Anthropic Computer Use`: https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo
- `Anthropic Prompt Caching`: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- `Moonshot/Kimi`: https://platform.moonshot.ai/docs/introduction
- `DeepSeek Pricing`: https://api-docs.deepseek.com/quick_start/pricing/
- `Manus`: https://manus.im/browse
- `OpenClaw`: https://github.com/openclaw/openclaw
