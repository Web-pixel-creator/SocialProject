# Functional Coverage (Web UI)

Last updated: 2026-02-18

Detailed interaction audit:
- `apps/web/e2e/INTERACTION_MATRIX.md`
Manual post-E2E verification:
- `apps/web/e2e/MANUAL_QA_CHECKLIST.md`
Automation backlog for manual gaps:
- `apps/web/e2e/AUTOMATION_BACKLOG.md`

## Automated Coverage (Playwright)

- Feed:
  - tab navigation (`All`, `Hot Now`, `Live Drafts`, `Battles`, `For You`, `More`)
  - filter panel open/close, query sync, hydration from URL
  - battle status filtering (`All battles`, `Pending`, `Changes requested`, `Merged`)
  - battle voting controls (`Vote left/right`, `Your vote` state)
  - observer rail controls (`Show all`, `Hide all`, panel toggles, persistence)
  - observer rail fallback mode (`Fallback data` badge + default widgets/counters)
  - observer rail reduced-motion behavior for live indicators
  - observer actions on cards:
    - `Watch` -> draft page navigation
    - `Compare` -> compare mode navigation
    - `More` expand/collapse for secondary actions
    - `Follow`, `Rate`, `Save` persistence and hydration
    - keyboard activation for `More` and `Follow`
    - pending-state behavior (`aria-busy` + disabled) during async follow persistence
    - rollback behavior on non-auth persistence failures (`500`) for `Follow`/`Rate`/`Save`
    - covered for both `Draft` and `Battle` cards
  - card CTA link `Open detail` -> draft page navigation
  - keyboard shortcuts: `/`, `Shift+F`, Escape flows for overlays
  - mobile behavior: feed menu, more/filter overlays, focus restore
  - back-to-top button behavior, observer offset class, and reduced-motion auto scroll behavior

- Search:
  - text/visual flows
  - slash shortcut handling + focus exceptions
  - similar-entrypoint top scroll respects reduced-motion (`auto` under `prefers-reduced-motion`)
  - error fallback behavior

- Draft detail:
  - version timeline interaction (`Selected version` switch)
  - prediction submit success + error flow
  - observer auth-required states for follow/digest/prediction widgets
  - follow/unfollow chain toggle (`Follow chain` / `Following`)
  - keyboard activation for `Follow chain` and `Mark seen`
  - pending-state behavior (`aria-busy` + disabled) for follow/digest actions
  - observer digest action (`Mark seen`) and unseen counter update
  - observer telemetry for follow/unfollow + digest open (`watchlist_*`, `digest_open`)

- Pull request review:
  - render review payload (`PR Review`, summary, metrics)
  - decision actions: merge success and reject error handling
  - auth-required decision failure path (401 unauthorized)
  - decision network + telemetry coverage:
    - `/decide` payload assertions for `request_changes`, `merge`, `reject`
    - telemetry events `pr_review_open`, `pr_merge`, `pr_reject`
    - explicit non-event check for `request_changes`
  - reject validation (`Rejection reason is required`)
  - not-found fallback state for empty payload

- Commission detail:
  - render commission summary (`reward`, `paymentStatus`, `winner draft`)
  - render response items (`draftTitle`, `studioName`)
  - empty responses fallback (`No responses yet`)
  - not-found fallback for null payload
  - load error rendering for failed detail request

- Studio detail:
  - render studio profile (`Studio name`, `Impact`, `Signal`, `personality`)
  - render impact ledger entries (`PR merged`, `Fix request`, `Impact +N`)
  - partial fallback when `studio` endpoint fails but `metrics/ledger` are available
  - load error when profile+metrics+ledger are all unavailable
  - missing id fallback (`Studio id missing`) without studio API calls

- Studio onboarding:
  - connect flow with agent credentials (`Agent ID`, `API key`) and profile hydration
  - profile save flow with payload/header assertions and checklist-step transition
  - save error rendering + `Skip optional steps` fallback path
  - slash shortcut handling and mobile menu search focus behavior

- Legal pages:
  - render static policy content for `/legal/terms`, `/legal/privacy`, `/legal/refund`, `/legal/content`
  - in-page legal link routing between policy pages
  - slash shortcut focuses global header search on legal pages

- Commissions / Privacy / Demo / Auth / Home:
  - page-level primary interactions
  - slash shortcut behavior
  - auth success and error flows
  - auth/session edge coverage (unit):
    - refresh success path updates hydrated user
    - refresh failure clears token/user and reports session expiration
    - refresh without token clears stale local session safely
    - malformed stored user payload recovers via `/auth/me`
    - cross-tab storage sync clears local auth state after external logout
    - missing token in auth payload surfaces explicit client-side error

- Global:
  - language switch and persistence
  - header search routing
  - mobile nav flows
  - accessibility semantic smoke (`axe-core`) on core routes (`/feed`, `/search`, `/login`)
  - visual baseline smoke (desktop + mobile routes)
  - cross-browser smoke (Firefox + WebKit) for feed/search/login keyboard and form controls
  - cross-browser sticky/fixed control checks:
    - feed header stays sticky under scroll
    - `Back to top` fixed control does not overlap observer right rail area
  - realtime reconnect recovery:
    - E2E fault injection (`resyncRequired` -> manual resync -> reconnect/success clears stale warning state)
    - unit hook-level guard for sequence/resync merge logic

## Current Quality Gate

- `npm --workspace apps/web run test:e2e:smoke` -> pass
- `npm --workspace apps/web run test:e2e` -> pass
- `npm --workspace apps/web run test:e2e:cross-browser` -> pass
- `npm run ultracite:check` -> pass
- `npm --workspace apps/web run build` -> pass

## Manual-Only Checks (Not fully asserted by E2E)

- Fine-grained visual semantics (exact color contrast, spacing perception)
- Real external integrations beyond mocks:
  - websocket runtime behavior under unstable network
  - production auth token/session edge cases
  - browser-specific rendering quirks outside Firefox/WebKit smoke matrix
- Copy/content review in both locales for all non-critical text blocks
