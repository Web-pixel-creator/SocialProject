# E2E Automation Backlog (From Manual QA Gaps)

Last updated: 2026-02-18

Purpose: convert manual-only checks into explicit automation tasks with a clear execution order.

Related docs:
- `apps/web/e2e/FUNCTIONAL_COVERAGE.md`
- `apps/web/e2e/MANUAL_QA_CHECKLIST.md`
- `apps/web/e2e/INTERACTION_MATRIX.md`

## Priority Queue

| Priority | Gap | Proposed automation | Target |
| --- | --- | --- | --- |
| P0 | Realtime recovery on unstable network | Add deterministic reconnect scenario in Playwright using mocked websocket fault/recovery hooks; assert stale badge/counters clear after reconnect | `/feed` |
| P0 | Auth-required action UX | Add E2E coverage for protected actions (`Follow`, `Save`, decision buttons) in anonymous session; assert explicit auth-required message/state | `/feed`, `/drafts/:id`, `/pull-requests/:id` |
| P0 | Keyboard focus visibility | Add keyboard-only assertions for visible focus ring on critical controls and overlays | `/feed`, `/search`, `/drafts/:id`, `/pull-requests/:id` |
| P1 | Locale regression in critical controls | Add EN/RU visual smoke baselines for key pages and verify no clipping/overflow in action rows | feed/search/draft/PR |
| P1 | Multi-tab session consistency | Add two-context E2E test: logout in one tab invalidates actions in second tab without stale state | auth/session flows |
| P1 | Reduced-motion behavior | Add `prefers-reduced-motion` Playwright suite and assert critical flows avoid disruptive motion classes | global |
| P2 | Browser rendering parity | Expand cross-browser smoke with tighter assertions around sticky/fixed controls and safe-area overlap | desktop + mobile |
| P2 | Accessibility semantic coverage breadth | Expand automated a11y smoke (`axe-core`) from core routes to remaining critical flows | global |

## Execution Order

1. Build shared test helpers for auth-state setup and realtime fault injection.
2. Land P0 auth-required action tests.
3. Land P0 realtime reconnect assertions.
4. Land P0 keyboard focus-visible assertions.
5. Extend visual/cross-browser matrix for P1 locale and P2 rendering parity.
6. Add a11y smoke and reduced-motion coverage.

## Done Criteria

- Each backlog item has:
  - a dedicated spec (or explicit extension of an existing spec),
  - deterministic assertions (no timing-only checks),
  - CI inclusion in smoke, cross-browser, or scheduled suites.
- Related manual checklist row is either:
  - removed (fully automated), or
  - marked as manual-by-design with a reason.

## Progress Update

- Done:
  - P0 realtime reconnect fault-injection E2E on feed observer rail (`resyncRequired` -> resync -> recovered).
  - P0 auth-required observer states on draft detail (`watchlist`/`digest`/`prediction`).
  - P0 auth-required decision error path on pull request review (`401`).
  - P0 observer action rollback on non-auth persistence failures (`Follow`/`Rate`/`Save`).
  - P1 cross-tab logout sync for auth context via `storage` events (unit).
  - P1 reduced-motion back-to-top behavior on feed (`behavior: 'auto'` under `prefers-reduced-motion`).
  - P1 reduced-motion similar-entrypoint search scroll (`/search?from=similar` uses `behavior: 'auto'`).
  - P2 cross-browser sticky/fixed guardrails in Firefox/WebKit (feed sticky header + `Back to top` safe-area non-overlap with right rail).
  - P2 accessibility semantic smoke (`axe-core`) for `/feed`, `/search`, `/login`.
- Remaining:
  - Reduced-motion dedicated suite expansion for non-feed flows.
  - Cross-browser/safe-area assertions beyond current feed-focused depth.
  - Accessibility semantic smoke expansion for additional critical routes.
