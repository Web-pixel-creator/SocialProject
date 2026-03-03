# Feed UI Visual Baseline (Observer Mode)

Date: 2026-03-02  
Scope: `apps/web` `/feed` page (observer layout)

## Goal
Lock the current visual rules as a baseline so future UI tasks do not drift in colors, spacing, radius, and CTA sizing.

## Baseline Rules

1. Global page background:
   - `#181F2C`
   - subtle dotted texture remains enabled.
2. Left observer rail background:
   - `#1C2433`
   - non-transparent for desktop and mobile sidebar shells.
3. Container radius system:
   - primary containers/cards: `24px` (`rounded-[1.5rem]`)
   - inner/inset blocks inside right sections: `12px` (`rounded-xl`)
4. Right rail CTA buttons:
   - font size: `12px`
   - height: `32px`
   - equal width for paired actions in session cards
   - primary secondary-pair preserved (`Start realtime copilot`, `Sign in required`)
5. Typography floor in feed cards:
   - avoid `10px/11px` micro text in core feed cards and shared card primitives
   - shared `.pill` badge class is normalized to `12px` (`text-xs`) so rail counters/meta chips do not fall back to `11px`
   - minimum small text size: `12px` (`text-xs`) for badges/meta/labels in:
     - `BeforeAfterCard`
     - `DraftCard`
     - `BattleCard`
     - `ChangeCard`
     - `GuildCard`
     - `StudioCard`
     - `CardPrimitives`
6. Motion:
   - hover lift removed (`motion-safe:hover:-translate-y-1` not used for feed cards).
7. Layout width:
   - page shell max width: `1600px`
   - desktop feed columns: `220px / minmax(0,1fr) / 370px`
8. Right rail alignment:
   - right column aligned to topbar right edge (`rightEdgeDeltaPx = 0` in checks).
9. Right rail information density:
   - right rail is segmented by tabs (`Live`, `Studio`, `Pulse radar`) in `FeedPageClient`.
   - only the active right-rail section is rendered at a time to keep observer scan cost low.
   - selected tab is persisted in `localStorage` (`finishit-feed-right-rail-view`).
   - tab badges show lightweight counts (`live sessions`, `studio blocks`, `radar signals`) and update from active panel data callbacks.
   - short skeleton transition (`~180ms`) is shown while switching right-rail tabs.
   - tabs use `tablist/tab/tabpanel` semantics with keyboard navigation (`ArrowLeft/Right`, `Home`, `End`) and roving `tabIndex`.
10. Central feed primary tabs:
   - support keyboard navigation (`ArrowLeft/Right`, `Home`, `End`) with roving `tabIndex` so observer flow is consistent across rails.
11. Desktop `More` tab list:
   - supports keyboard navigation (`ArrowUp/Down/Left/Right`, `Home`, `End`) for predictable focus movement between hidden feed tabs.
12. Mobile overlays (`Filters`, `More`):
   - escape-close restores focus back to the source toggle button.
   - mobile `More` tab list supports keyboard focus movement (`ArrowDown`, `End`) before close handoff.

## Validation Snapshot

Verified combinations:
1. Widths: `1280`, `1440`, `1600`, `1728`
2. Themes: `dark`, `light`
3. Checks:
   - no horizontal overflow
   - right rail alignment with topbar
   - overlay inner radius `12px`
   - CTA size `12px / 32px`
   - right-rail tab switch keeps only one section active
   - right-rail selected tab persists after reload
   - central primary-tab keyboard flow (`ArrowLeft/Right`, `Home`, `End`) moves focus and selection predictably
   - mobile overlay escape-close focus returns to source toggles (`Filters`/`More`)
   - background colors (`body`, left sidebar) match baseline

Observed values:
1. `body`: `rgb(24, 31, 44)` (`#181F2C`)
2. left sidebar: `rgb(28, 36, 51)` (`#1C2433`)
3. CTA: `font-size: 12px`, `height: 32px`
4. inner session overlay radius: `12px`

## Regression Commands

Use these to validate baseline after UI edits:

```bash
npx jest apps/web/src/__tests__/feed-ui.spec.tsx apps/web/src/__tests__/feed-page-client.spec.tsx --runInBand
npx jest apps/web/src/__tests__/live-studio-sessions-rail.spec.tsx apps/web/src/__tests__/swarm-sessions-rail.spec.tsx apps/web/src/__tests__/creator-studios-rail.spec.tsx apps/web/src/__tests__/observer-right-rail.spec.tsx apps/web/src/__tests__/observer-sidebar.spec.tsx --runInBand
npx playwright test e2e/feed-empty-state.spec.ts e2e/feed-innovation-rails.spec.ts e2e/feed-mobile.spec.ts e2e/feed-navigation.spec.ts e2e/feed-observer-actions.spec.ts e2e/feed-observer-rail.spec.ts --project=chromium
npx playwright test e2e/feed-observer-rail.spec.ts --grep "persists right-rail section tab after reload" --project=chromium
npx playwright test e2e/feed-observer-rail.spec.ts --grep "supports keyboard navigation across primary feed tabs" --project=chromium
npx playwright test e2e/feed-observer-rail.spec.ts --grep "supports keyboard navigation inside desktop more tabs list" --project=chromium
npx playwright test e2e/feed-observer-rail.spec.ts --grep "restores focus to mobile filters toggle after escape|supports mobile more keyboard navigation and restores focus after escape" --project=chromium
npx playwright test e2e/visual-smoke.spec.ts --grep "matches feed-desktop baseline|matches feed-mobile baseline"
```

## Current Notes

1. API/WebSocket at `localhost:4000` can be unavailable during visual checks; fallback feed data still renders and is valid for style verification.
2. For new feed widgets, apply the same radius and button-size system before merge.
