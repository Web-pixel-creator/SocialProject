# Interaction Matrix (Web E2E)

Last updated: 2026-02-18

This matrix maps key user-facing controls and indicators to automated checks.
Use it as a quick audit source when answering: "Does each button/indicator work?"

Legend:
- `E2E`: covered by Playwright
- `Unit`: covered by component/page tests
- `Manual`: not fully automated, verify in browser/staging

## Feed (`/feed`)

| Control / Indicator | Expected behavior | Coverage | References |
| --- | --- | --- | --- |
| Primary tabs (`All`, `Hot Now`, `Live Drafts`, `Battles`, `For You`) | Switches feed mode, syncs URL | E2E | `apps/web/e2e/feed-navigation.spec.ts` |
| `Following` tab filters + quick reset chips | `sort/status` sync to query, `All statuses`/`Recency` quick resets, no `range/intent` quick chips | E2E + Unit | `apps/web/e2e/feed-navigation.spec.ts`, `apps/web/src/__tests__/feed-ui.spec.tsx` |
| `Following` card context badge | Draft cards on Following tab show `From studios you follow` label | Unit | `apps/web/src/__tests__/feed-ui.spec.tsx` |
| `More` tabs menu | Opens/closes, keyboard + Escape/outside close, selects extra tabs | E2E | `apps/web/e2e/feed-navigation.spec.ts` |
| `Filters` panel | Opens/closes, syncs query params, hydrates from URL | E2E | `apps/web/e2e/feed-navigation.spec.ts` |
| Battle status chips | Filters battle list by status | E2E | `apps/web/e2e/feed-navigation.spec.ts` |
| Battle vote controls | Left/right vote, "your vote" state | E2E | `apps/web/e2e/feed-navigation.spec.ts` |
| Observer card actions `Watch`, `Compare` | Navigates to draft/compare page | E2E | `apps/web/e2e/feed-observer-actions.spec.ts` |
| Observer card actions `More`, `Follow`, `Rate`, `Save` | Expand/Collapse + persistence/hydration | E2E | `apps/web/e2e/feed-observer-actions.spec.ts` |
| Observer action non-auth failure rollback | Failed persist (`500`) reverts optimistic `Follow`/`Rate`/`Save` toggles | E2E | `apps/web/e2e/feed-observer-actions.spec.ts` |
| Observer actions pending state | `aria-busy` + disabled while follow request in-flight | E2E | `apps/web/e2e/feed-observer-actions.spec.ts` |
| Observer actions keyboard (`More`, `Follow`) | Keyboard activation works for core toggle flow | E2E | `apps/web/e2e/feed-observer-actions.spec.ts` |
| Observer rail `Show all` / `Hide all` | Toggles all panel visibility with persistence | E2E | `apps/web/e2e/feed-observer-rail.spec.ts` |
| Observer rail per-panel toggles | Flat visibility model, persisted after reload | E2E | `apps/web/e2e/feed-observer-rail.spec.ts` |
| Fallback rail status (`Fallback data`) | Fallback badge + default counters/widgets | E2E | `apps/web/e2e/feed-observer-rail.spec.ts` |
| Observer rail reduced-motion | Live indicators disable motion under `prefers-reduced-motion` | E2E | `apps/web/e2e/feed-observer-rail.spec.ts` |
| Back-to-top button | Appears after scroll, returns top, observer offset class, uses `auto` scroll under reduced-motion | E2E | `apps/web/e2e/feed-navigation.spec.ts` |
| Keyboard focus-visible (critical feed controls) | Tab navigation shows visible focus on `All`, feed search input, `Filters` | E2E | `apps/web/e2e/focus-visible-critical-controls.spec.ts` |
| Feed card hover lift motion | Draft/Battle cards lift on hover in normal mode and stay static in reduced-motion mode | E2E | `apps/web/e2e/reduced-motion-feed-widgets.spec.ts` |
| Mobile feed menu and overlays | Mobile open/close + focus restore | E2E | `apps/web/e2e/feed-mobile.spec.ts` |

## Draft Detail (`/drafts/:id`)

| Control / Indicator | Expected behavior | Coverage | References |
| --- | --- | --- | --- |
| Version timeline buttons (`v1`, `v2`, ...) | Switches selected version | E2E | `apps/web/e2e/draft-detail.spec.ts` |
| Prediction actions (`Predict merge/reject`) | Submit success and error handling | E2E | `apps/web/e2e/draft-detail.spec.ts` |
| Follow button (`Follow chain` / `Following`) | Follow/unfollow and activity hint update | E2E | `apps/web/e2e/draft-detail.spec.ts` |
| Observer auth-required state | Sign-in guidance for follow, digest, and prediction widgets on 401/403 | E2E | `apps/web/e2e/draft-detail.spec.ts` |
| Follow pending state | `aria-busy` + disabled while request in-flight | E2E | `apps/web/e2e/draft-detail.spec.ts` |
| Digest `Mark seen` | Marks entry as seen, unseen counter updates | E2E | `apps/web/e2e/draft-detail.spec.ts` |
| Digest `Mark seen` pending state | `aria-busy` + disabled while request in-flight | E2E | `apps/web/e2e/draft-detail.spec.ts` |
| Follow + digest keyboard | Keyboard activation for follow and mark-seen | E2E | `apps/web/e2e/draft-detail.spec.ts` |
| Keyboard focus-visible (critical draft controls) | Tab navigation shows visible focus on `Run demo flow`, `Predict merge`, `Follow chain` | E2E | `apps/web/e2e/focus-visible-critical-controls.spec.ts` |
| Observer telemetry (`watchlist_*`, `digest_open`) | Emits expected telemetry events | E2E | `apps/web/e2e/draft-detail.spec.ts` |

## Pull Request Review (`/pull-requests/:id`)

| Control / Indicator | Expected behavior | Coverage | References |
| --- | --- | --- | --- |
| Decision buttons (`Merge`, `Request changes`, `Reject`) | Sends decision request and updates status | E2E | `apps/web/e2e/pull-request-review.spec.ts` |
| Unauthorized decision response | Shows auth-required error and keeps review status unchanged | E2E | `apps/web/e2e/pull-request-review.spec.ts` |
| Reject reason validation | Reject requires reason | E2E | `apps/web/e2e/pull-request-review.spec.ts` |
| Decision error banner | Renders API failure message | E2E | `apps/web/e2e/pull-request-review.spec.ts` |
| Review telemetry (`pr_review_open`, `pr_merge`, `pr_reject`) | Emits expected events; no event for `request_changes` | E2E | `apps/web/e2e/pull-request-review.spec.ts` |
| Keyboard shortcuts (`M`/`R`) | Shortcut behavior + input safety | Unit | `apps/web/src/__tests__/pull-request-review.spec.tsx` |
| Keyboard focus-visible (critical review controls) | Tab navigation shows visible focus on feedback textarea + `Merge`/`Request changes`/`Reject` | E2E | `apps/web/e2e/focus-visible-critical-controls.spec.ts` |

## Search (`/search`)

| Control / Indicator | Expected behavior | Coverage | References |
| --- | --- | --- | --- |
| Text / visual mode controls | Mode switch and relevant results | E2E | `apps/web/e2e/search.spec.ts` |
| Keyword input and result state | Search rendering + follow-up error fallback | E2E | `apps/web/e2e/search.spec.ts` |
| Slash shortcut behavior | Focus rules, including mobile path | E2E | `apps/web/e2e/search.spec.ts` |
| Keyboard focus-visible (critical search controls) | Tab navigation shows visible focus on `Text search`, keyword input, `Reset filters` | E2E | `apps/web/e2e/focus-visible-critical-controls.spec.ts` |
| Similar-entrypoint scroll behavior | `/search?from=similar` scroll uses `auto` when reduced-motion is enabled | E2E | `apps/web/e2e/search.spec.ts` |

## Privacy / Commissions / Studio / Onboarding / Auth / Legal / Home

| Area | Core controls / indicators | Coverage | References |
| --- | --- | --- | --- |
| Privacy | Export data flow, auth-expiry recovery UI | E2E | `apps/web/e2e/privacy.spec.ts` |
| Commissions list/detail | Search/filter, responses, empty/not-found/error states | E2E | `apps/web/e2e/commissions.spec.ts`, `apps/web/e2e/commissions-detail.spec.ts` |
| Studio detail | Profile/metrics/ledger rendering + fallback states | E2E | `apps/web/e2e/studio-detail.spec.ts` |
| Studio onboarding | Connect, save profile, skip flow, slash/mobile behavior | E2E | `apps/web/e2e/studios-onboarding.spec.ts` |
| Auth pages | Login/register controls, success + error flows | E2E | `apps/web/e2e/auth.spec.ts` |
| Legal pages | Inter-page policy links + slash behavior | E2E | `apps/web/e2e/legal-pages.spec.ts` |
| Home | Hero/navigation/CTA routing | E2E | `apps/web/e2e/homepage.spec.ts` |

## Global Shell / Cross-Cutting

| Control / Indicator | Expected behavior | Coverage | References |
| --- | --- | --- | --- |
| Header language toggle | Language switch + persistence | E2E | `apps/web/e2e/language.spec.ts` |
| Locale layout regression (EN/RU critical controls) | Feed/Search/Draft/PR action controls stay within viewport after locale switch; no page-level horizontal overflow | E2E | `apps/web/e2e/locale-critical-controls.spec.ts` |
| Header search routing | Non-feed routing + mobile menu behavior | E2E | `apps/web/e2e/header-search.spec.ts` |
| Mobile navigation drawer | Open/close/focus restore/navigation | E2E | `apps/web/e2e/mobile-navigation.spec.ts` |
| Cross-tab auth storage sync | Logout in one tab clears token/user and invalidates protected actions in another tab | E2E + Unit | `apps/web/e2e/session-multi-tab.spec.ts`, `apps/web/src/__tests__/auth-context.spec.tsx` |
| Accessibility semantic smoke | Semantic guardrail via `axe-core` on `/feed`, `/search`, `/login`, `/register`, `/demo`, `/drafts/:id`, `/pull-requests/:id`, `/privacy`, `/commissions`, `/commissions/:id`, `/studios/onboarding`, `/studios/:id`, `/admin/ux`, and legal routes (`/legal/terms`, `/legal/privacy`, `/legal/refund`, `/legal/content`) | E2E | `apps/web/e2e/accessibility-smoke.spec.ts` |
| Visual baseline | Desktop/mobile snapshot regressions | E2E | `apps/web/e2e/visual-smoke.spec.ts` |
| Cross-browser sanity | Firefox/WebKit critical flows, sticky header persistence (feed + non-feed + detail routes), fixed safe-area non-overlap checks, and mobile menu viewport overflow guards (non-feed + detail routes) | E2E | `apps/web/e2e/browser-compat.spec.ts` |
| Reduced-motion non-feed animations | Shared shell/home icon animations disable under `prefers-reduced-motion` on `/`, `/privacy`, `/commissions`, `/studios/onboarding`, `/legal/privacy` | E2E | `apps/web/e2e/reduced-motion-non-feed.spec.ts` |
| Reduced-motion feed widget animations | Feed route card hover motion (`draft` + `battle`) respects `prefers-reduced-motion` | E2E | `apps/web/e2e/reduced-motion-feed-widgets.spec.ts` |
| Realtime reconnect behavior | Resync warning appears and clears after manual resync + reconnect success | E2E + Unit | `apps/web/e2e/feed-observer-rail.spec.ts`, `apps/web/src/__tests__/realtime-hook.spec.tsx` |

## Remaining Manual Checks

- Pixel-level visual QA (spacing/contrast aesthetics beyond snapshots).
- Real backend behavior without mocks (network jitter, auth edge cases in production).
- Accessibility deep pass with screen reader (announcements/semantics in long flows).
