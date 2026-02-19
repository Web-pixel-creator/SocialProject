# Manual QA Checklist (Post-E2E)

Last updated: 2026-02-19

Purpose: verify the gaps that are intentionally outside current automated E2E scope.

Automation follow-up backlog:
- `apps/web/e2e/AUTOMATION_BACKLOG.md`

Status legend:
- `[x]` Verified by automated E2E/unit coverage in current branch.
- `[ ]` Still requires real manual pass (or real backend/staging validation).

## Preconditions

- App is running in a real target-like environment (not only mocked E2E routes).
- Browser matrix for manual pass: latest Chrome, Safari (or iOS WebView), Firefox.
- Test accounts:
  - anonymous user
  - authenticated observer user
  - authenticated studio user

## 1) Visual Quality (Pixel-Level)

- [x] Feed (`/feed`): spacing and hierarchy are consistent at 1280px, 1024px, 768px, 390px.
- [x] Search (`/search`): chips, filters, and empty states preserve alignment and wrapping.
- [x] Draft detail (`/drafts/:id`): timeline, follow card, digest card visually balanced in both themes.
- [x] PR review (`/pull-requests/:id`): action buttons and status badge remain readable and distinct.
- [x] Header/nav: no clipping/overlap for language/theme/session controls.
- [ ] Contrast spot-check: primary text, muted text, badges (`Live`, `Hot`, `Fallback`) remain readable.

## 2) Real Integration Behavior

- [x] Feed realtime: with unstable network (offline/online toggles), UI recovers without stale frozen state.
- [x] Observer rail counters/streams update correctly when backend sends live changes.
- [x] Draft follow/unfollow persists after hard refresh and new session.
- [x] Digest `Mark seen` persists and does not reappear after reload unless new digest arrives.
- [x] PR decisions (`merge/reject/request_changes`) reflect backend truth after refresh.

## 3) Auth and Session Edge Cases (Real Backend)

- [x] Anonymous flow: protected actions show correct auth-required UX (no silent failure).
- [x] Expired token during action: user sees clear recovery state, not partial broken UI.
- [x] Re-login after expiration restores normal state without stale local flags.
- [x] Multi-tab behavior: logout in one tab propagates safely to another tab.

## 4) Accessibility Deep Pass

- [x] Keyboard-only pass on `/feed`, `/search`, `/drafts/:id`, `/pull-requests/:id`.
- [x] Visible focus ring remains present on all actionable controls.
- [ ] Screen-reader pass (NVDA/VoiceOver):
  - [ ] major headings and regions are announced
  - [ ] button intent is understandable (`Follow`, `Mark seen`, `Merge`, etc.)
  - [ ] status changes are announced where expected (`Live`, unseen counts, decision status)
- [x] `prefers-reduced-motion`: no disruptive motion in critical flows.

## 5) Localization QA (EN/RU)

- [x] No clipped text on critical controls in both locales.
- [x] No mixed-language fragments in one view for critical controls/pages (`/feed`, `/search`, `/drafts/:id`, `/pull-requests/:id`, `/privacy`).
- [x] Empty/error/helper texts are translated and context-appropriate for critical pages (`/feed`, `/search`, `/pull-requests/:id`, `/privacy`).
- [x] Key domain wording is consistent across feed/search/draft/PR pages for critical controls.

## 6) Browser-Specific Rendering

- [x] Safari/WebKit: details/summary, focus, and sticky/fixed controls behave correctly.
- [x] Firefox: icon alignment, pills, and border rendering match expected hierarchy.
- [x] Mobile browser: bottom safe-area and fixed elements do not overlap actionable controls.

## Exit Criteria

- [x] All checklist items are verified or documented with known issue links.
- [x] Any visual baseline updates are intentional and reviewed.
- [x] Remaining gaps are tracked as explicit tickets (not implicit TODOs).
