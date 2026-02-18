# Manual QA Checklist (Post-E2E)

Last updated: 2026-02-18

Purpose: verify the gaps that are intentionally outside current automated E2E scope.

## Preconditions

- App is running in a real target-like environment (not only mocked E2E routes).
- Browser matrix for manual pass: latest Chrome, Safari (or iOS WebView), Firefox.
- Test accounts:
  - anonymous user
  - authenticated observer user
  - authenticated studio user

## 1) Visual Quality (Pixel-Level)

- [ ] Feed (`/feed`): spacing and hierarchy are consistent at 1280px, 1024px, 768px, 390px.
- [ ] Search (`/search`): chips, filters, and empty states preserve alignment and wrapping.
- [ ] Draft detail (`/drafts/:id`): timeline, follow card, digest card visually balanced in both themes.
- [ ] PR review (`/pull-requests/:id`): action buttons and status badge remain readable and distinct.
- [ ] Header/nav: no clipping/overlap for language/theme/session controls.
- [ ] Contrast spot-check: primary text, muted text, badges (`Live`, `Hot`, `Fallback`) remain readable.

## 2) Real Integration Behavior

- [ ] Feed realtime: with unstable network (offline/online toggles), UI recovers without stale frozen state.
- [ ] Observer rail counters/streams update correctly when backend sends live changes.
- [ ] Draft follow/unfollow persists after hard refresh and new session.
- [ ] Digest `Mark seen` persists and does not reappear after reload unless new digest arrives.
- [ ] PR decisions (`merge/reject/request_changes`) reflect backend truth after refresh.

## 3) Auth and Session Edge Cases (Real Backend)

- [ ] Anonymous flow: protected actions show correct auth-required UX (no silent failure).
- [ ] Expired token during action: user sees clear recovery state, not partial broken UI.
- [ ] Re-login after expiration restores normal state without stale local flags.
- [ ] Multi-tab behavior: logout in one tab propagates safely to another tab.

## 4) Accessibility Deep Pass

- [ ] Keyboard-only pass on `/feed`, `/search`, `/drafts/:id`, `/pull-requests/:id`.
- [ ] Visible focus ring remains present on all actionable controls.
- [ ] Screen-reader pass (NVDA/VoiceOver):
  - [ ] major headings and regions are announced
  - [ ] button intent is understandable (`Follow`, `Mark seen`, `Merge`, etc.)
  - [ ] status changes are announced where expected (`Live`, unseen counts, decision status)
- [ ] `prefers-reduced-motion`: no disruptive motion in critical flows.

## 5) Localization QA (EN/RU)

- [ ] No clipped text on critical controls in both locales.
- [ ] No mixed-language fragments in one view.
- [ ] Empty/error/helper texts are translated and context-appropriate.
- [ ] Key domain wording is consistent across feed/search/draft/PR pages.

## 6) Browser-Specific Rendering

- [ ] Safari/WebKit: details/summary, focus, and sticky/fixed controls behave correctly.
- [ ] Firefox: icon alignment, pills, and border rendering match expected hierarchy.
- [ ] Mobile browser: bottom safe-area and fixed elements do not overlap actionable controls.

## Exit Criteria

- [ ] All checklist items are verified or documented with known issue links.
- [ ] Any visual baseline updates are intentional and reviewed.
- [ ] Remaining gaps are tracked as explicit tickets (not implicit TODOs).
