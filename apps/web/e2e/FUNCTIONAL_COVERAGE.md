# Functional Coverage (Web UI)

Last updated: 2026-02-17

## Automated Coverage (Playwright)

- Feed:
  - tab navigation (`All`, `Hot Now`, `Live Drafts`, `Battles`, `For You`, `More`)
  - filter panel open/close, query sync, hydration from URL
  - battle status filtering (`All battles`, `Pending`, `Changes requested`, `Merged`)
  - battle voting controls (`Vote left/right`, `Your vote` state)
  - observer rail controls (`Show all`, `Hide all`, panel toggles, persistence)
  - observer rail fallback mode (`Fallback data` badge + default widgets/counters)
  - observer actions on cards:
    - `Watch` -> draft page navigation
    - `Compare` -> compare mode navigation
    - `More` expand/collapse for secondary actions
    - `Follow`, `Rate`, `Save` persistence and hydration
    - covered for both `Draft` and `Battle` cards
  - card CTA link `Open detail` -> draft page navigation
  - keyboard shortcuts: `/`, `Shift+F`, Escape flows for overlays
  - mobile behavior: feed menu, more/filter overlays, focus restore
  - back-to-top button behavior and observer offset class

- Search:
  - text/visual flows
  - slash shortcut handling + focus exceptions
  - error fallback behavior

- Draft detail:
  - version timeline interaction (`Selected version` switch)
  - prediction submit success + error flow
  - follow/unfollow chain toggle (`Follow chain` / `Following`)
  - observer digest action (`Mark seen`) and unseen counter update

- Pull request review:
  - render review payload (`PR Review`, summary, metrics)
  - decision actions: merge success and reject error handling
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

- Legal pages:
  - render static policy content for `/legal/terms`, `/legal/privacy`, `/legal/refund`, `/legal/content`
  - in-page legal link routing between policy pages
  - slash shortcut focuses global header search on legal pages

- Commissions / Privacy / Demo / Auth / Home:
  - page-level primary interactions
  - slash shortcut behavior
  - auth success and error flows

- Global:
  - language switch and persistence
  - header search routing
  - mobile nav flows
  - visual baseline smoke (desktop + mobile routes)

## Current Quality Gate

- `npm --workspace apps/web run test:e2e:smoke` -> pass
- `npm --workspace apps/web run test:e2e` -> pass
- `npm run ultracite:check` -> pass
- `npm --workspace apps/web run build` -> pass

## Manual-Only Checks (Not fully asserted by E2E)

- Fine-grained visual semantics (exact color contrast, spacing perception)
- Real external integrations beyond mocks:
  - websocket runtime behavior under unstable network
  - production auth token/session edge cases
  - browser-specific rendering quirks outside Chromium project matrix
- Copy/content review in both locales for all non-critical text blocks
