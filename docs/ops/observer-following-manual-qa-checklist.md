# Observer Following Manual QA Checklist

Date: 2026-02-22  
Scope: Follow loop polish for observer profile and public profile surfaces.

## Environment

- Local web app (`apps/web`) against local API (`apps/api`)
- Seeded observer with:
  - at least one followed studio,
  - at least one watchlist draft,
  - at least one resolved prediction

## Checklist

- [ ] Open `/observer/profile` as authenticated observer.
- [ ] Verify summary cards show following/watchlist/digest/prediction metrics.
- [ ] Verify "From studios you follow" section renders digest entries.
- [ ] Toggle digest preferences:
  - [ ] `Unseen only` saves successfully.
  - [ ] `Following studios only` saves successfully.
- [ ] Unfollow one studio from `/observer/profile`:
  - [ ] studio disappears from list,
  - [ ] counts update correctly after revalidation.
- [ ] Open public profile link from `/observer/profile` and verify:
  - [ ] summary cards,
  - [ ] following studios list,
  - [ ] watchlist highlights,
  - [ ] recent predictions.
- [ ] Validate not-found state:
  - [ ] open `/observers/<missing-id>` and verify "not found" fallback appears,
  - [ ] CTA links to `/feed` and `/observer/profile`.
- [ ] Validate invalid route state:
  - [ ] open `/observers/invalid-id`,
  - [ ] verify invalid-id fallback with `Explore feeds` action.

## Automated Coverage Mapping

- `apps/web/src/__tests__/observer-profile-page.spec.tsx`
- `apps/web/src/__tests__/observer-public-profile-page.spec.tsx`

## Notes

- Keep this checklist as a release attachment when observer follow loop changes land.

## Execution Snapshot (2026-02-22)

- Automated regression pass:
  - `npx jest apps/web/src/__tests__/observer-profile-page.spec.tsx apps/web/src/__tests__/observer-public-profile-page.spec.tsx --runInBand` ✅
  - `npm --workspace apps/web run test:e2e -- e2e/language.spec.ts e2e/locale-critical-controls.spec.ts` ✅
  - `npm --workspace apps/web run test:e2e:smoke` ✅ (176/176)
- Build verification:
  - `npm --workspace apps/web run build` ✅
  - `npm --workspace apps/api run build` ✅
- Remaining manual step:
  - run through UI checklist items on local environment and attach screenshots for release notes.

## Execution Snapshot (2026-02-22, observer engagement telemetry pass)

- Targeted e2e regression for observer engagement surfaces:
  - `npm --workspace apps/web run test:e2e -- e2e/admin-ux.spec.ts e2e/draft-detail.spec.ts e2e/feed-observer-rail.spec.ts e2e/feed-observer-actions.spec.ts` PASS (36/36)
- Full smoke regression:
  - `npm run test:web:e2e:smoke` PASS (176/176)
- Scope validated by this run:
  - Admin UX page stability and metrics rendering (`/admin/ux`)
  - Draft detail prediction flow, caps, and observer telemetry hooks
  - Feed observer rail visibility/state persistence and realtime reconnect handling
  - Feed observer actions persistence + keyboard accessibility + fallback handling
