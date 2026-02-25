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

## Execution Snapshot (2026-02-23, pressure meter + observer actions polish)

- Full critical quality gate:
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Targeted observer regressions:
  - `npm --workspace apps/web run test:e2e -- e2e/feed-observer-actions.spec.ts --project=chromium` PASS (`13/13`)
  - `npm --workspace apps/web run test:e2e -- e2e/feed-observer-rail.spec.ts --project=chromium` PASS (`11/11`)
  - `npx jest apps/web/src/__tests__/observer-actions.spec.tsx --runInBand` PASS
  - `npx jest apps/web/src/__tests__/observer-right-rail.spec.tsx --runInBand` PASS
  - `npx jest apps/web/src/__tests__/admin-ux-page.spec.tsx --runInBand` PASS
- API compile verification:
  - `npm --workspace apps/api run build` PASS
- Scope validated by this run:
  - Observer actions pending-state behavior keeps `Watch`/`Compare` interactive.
  - Observer right rail pressure meter reacts to richer hot-now workload signals.
  - Admin UX metrics page remains stable after telemetry/rail adjustments.

## Execution Snapshot (2026-02-23, prediction settlement audit hardening)

- API + integration verification:
  - `npm --workspace apps/api run build` PASS
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/api.integration.spec.ts -t "observer predict mode lifecycle" --runInBand` PASS
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts -t "observer engagement metrics endpoint returns KPI aggregates and segments" --runInBand` PASS
- Web/admin verification:
  - `npx jest apps/web/src/__tests__/admin-ux-page.spec.tsx --runInBand` PASS
- Full critical gate:
  - `npm run qa:critical` PASS (`115/115`)
- Scope validated by this run:
  - pull-request settlement now emits immutable `pr_prediction_settle` events per observer prediction,
  - admin observer engagement metrics include `predictionSettles` and `predictionSettlementRate`,
  - observer prediction lifecycle telemetry remains stable (`submit/view/settle`) after PR decision flow.

## Execution Snapshot (2026-02-23, prediction payload boundary hardening)

- API boundary verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/api.integration.spec.ts -t "prediction endpoints reject unsupported fields and conflicting aliases" --runInBand` PASS
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/api.integration.spec.ts --runInBand` PASS (59/59)
- Full critical gate:
  - `npm run qa:critical` PASS (`115/115`)
- Scope validated by this run:
  - prediction write endpoints reject unsupported request keys and conflicting alias payloads before hitting service logic,
  - observer prediction lifecycle remains stable after stricter payload parsing.

## Execution Snapshot (2026-02-23, gateway telemetry + pressure meter v2 verification)

- Full API integration verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/api.integration.spec.ts --runInBand` PASS (59/59)
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (20/20)
- Targeted runtime/rail/web verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/ai-runtime.unit.spec.ts --runInBand` PASS (5/5)
  - `npx jest apps/web/src/__tests__/observer-right-rail.spec.tsx --runInBand` PASS
  - `npx jest apps/web/src/__tests__/observer-actions.spec.tsx --runInBand` PASS
  - `npx jest apps/web/src/__tests__/admin-ux-page.spec.tsx --runInBand` PASS
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - `Live Pressure Meter` now reacts to hot-now workload signals (`fixOpenCount`, `decisions24h`, `merges24h`, `hotScore`) without regressions,
  - observer action pending state keeps non-pending actions interactive (`Watch` while `Follow` is in-flight),
  - admin gateway telemetry endpoint + `/admin/ux` rendering remain stable in full regression.

## Execution Snapshot (2026-02-23, multimodal payload boundary hardening)

- API boundary verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/api.integration.spec.ts -t "multimodal glowup endpoint rejects unsupported fields and invalid provider" --runInBand` PASS
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/drafts.ts apps/api/src/__tests__/api.integration.spec.ts` PASS
- Scope validated by this run:
  - multimodal glowup writes now reject unsupported request keys at route boundary,
  - multimodal provider string now has strict format validation and normalization before service execution.

## Execution Snapshot (2026-02-23, multimodal read query boundary hardening)

- API boundary verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/api.integration.spec.ts -t "multimodal glowup read endpoint validates query fields and records invalid-query telemetry" --runInBand` PASS
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/api.integration.spec.ts --runInBand` PASS (61/61)
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/drafts.ts apps/api/src/__tests__/api.integration.spec.ts` PASS
- Scope validated by this run:
  - multimodal read endpoint now rejects unsupported query keys and invalid provider query format,
  - invalid query attempts are now persisted as `draft_multimodal_glowup_error` system telemetry with `reason=invalid_query`.

## Execution Snapshot (2026-02-23, admin multimodal guardrail metrics)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts -t "observer engagement metrics endpoint returns KPI aggregates and segments" --runInBand` PASS
  - `npm --workspace apps/api run build` PASS
- Web/admin verification:
  - `npx jest apps/web/src/__tests__/admin-ux-page.spec.tsx --runInBand` PASS
  - `npm --workspace apps/web run build` PASS
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts apps/web/src/app/admin/ux/page.tsx apps/web/src/__tests__/admin-ux-page.spec.tsx` PASS
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - admin observer-engagement API now exposes multimodal guardrail stats (`invalidQueryErrors`, `invalidQueryRate`),
  - admin UX page now surfaces invalid-query guardrails inside multimodal telemetry block.

## Execution Snapshot (2026-02-23, admin telemetry query-boundary hardening)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (22/22)
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts` PASS
- Regression verification:
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - admin gateway telemetry endpoint now rejects malformed/out-of-range `hours` and `limit` query params with explicit `ADMIN_INVALID_QUERY`,
  - observer engagement endpoint now rejects malformed/out-of-range `hours` query param with explicit `ADMIN_INVALID_QUERY`.

## Execution Snapshot (2026-02-23, gateway sessions + errors metrics query hardening)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (24/24)
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts` PASS
- Regression verification:
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - gateway session read endpoints now reject unsupported query fields and invalid `source` / `limit` values with explicit `ADMIN_INVALID_QUERY`,
  - error metrics endpoint now rejects unsupported query fields, malformed/out-of-range `hours` / `limit`, and oversized or multi-value `code` / `route` filters.

## Execution Snapshot (2026-02-23, admin metrics query hardening)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (25/25)
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts` PASS
- Regression verification:
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - embeddings, ux, similar-search, and jobs admin metrics endpoints now reject unsupported query fields and malformed/out-of-range `hours`,
  - ux metrics endpoint now also rejects invalid `eventType` filters (oversized/multi-value) with explicit `ADMIN_INVALID_QUERY`.

## Execution Snapshot (2026-02-23, admin budgets query hardening)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (26/26)
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts` PASS
- Regression verification:
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - budget remaining and budget metrics endpoints now reject unsupported query fields and malformed multi-value query inputs,
  - bounded parsing now protects `agentId`, `draftId`, and `date` query fields from oversized payload-style inputs.

## Execution Snapshot (2026-02-23, admin backfill + cleanup boundary hardening)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (28/28)
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts` PASS
- Regression verification:
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - embeddings backfill endpoint now rejects unsupported query/body fields, malformed `batchSize`/`maxBatches`, and query/body conflicts,
  - cleanup preview/run endpoints now reject unsupported query/body fields and invalid `confirm` formats before executing destructive cleanup flow.

## Execution Snapshot (2026-02-23, agent gateway mutation boundary hardening)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (29/29)
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts` PASS
- Regression verification:
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - agent gateway mutation endpoints now reject unsupported query/body fields and malformed mutation payloads before runtime/service execution,
  - compact/close controls now have strict request boundaries for keep-recent and no-op body/query noise.

## Execution Snapshot (2026-02-23, agent gateway orchestration boundary hardening)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (29/29)
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts` PASS
- Regression verification:
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - orchestration mutation endpoint now rejects unsupported query/body fields before runtime orchestration flow,
  - orchestration payload parsing now enforces bounded strings and strict `metadata` object shape validation,
  - observer-engagement admin endpoint now rejects unsupported query keys (allowlist: `hours`).

## Execution Snapshot (2026-02-23, admin ai-runtime boundary hardening)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (30/30)
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts` PASS
- Regression verification:
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - ai-runtime read endpoints (`/profiles`, `/health`) now reject unsupported query fields,
  - ai-runtime dry-run endpoint now rejects unsupported query fields and invalid non-object request body shapes before runtime role/prompt validation.

## Execution Snapshot (2026-02-23, admin system metrics query-boundary hardening)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (31/31)
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts` PASS
- Regression verification:
  - `npm run qa:critical` PASS (`115/115` critical e2e + build + ultracite)
- Scope validated by this run:
  - system metrics endpoint now rejects unsupported query fields with explicit `ADMIN_INVALID_QUERY`.

## Execution Snapshot (2026-02-23, admin prompt bound + integration stability pass)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (32/32)
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/api.integration.spec.ts --runInBand` PASS (76/76)
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts apps/api/src/__tests__/api.integration.spec.ts docs/plans/2026-02-21-finishit-execution-roadmap.md` PASS
- Web verification:
  - `npm run test:web:e2e:smoke` PASS (176/176)
- Scope validated by this run:
  - admin ai-runtime dry-run now rejects oversized `prompt` payloads at route edge (`AI_RUNTIME_INVALID_PROMPT`),
  - full API integration suite stabilized in local environment via explicit integration-test timeout headroom (`jest.setTimeout(30000)` in `api.integration.spec.ts`),
  - no regressions observed on smoke e2e surface after admin security boundary updates.

## Execution Snapshot (2026-02-23, admin error-metrics filter format hardening)

- API/admin verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/admin.integration.spec.ts --runInBand` PASS (32/32)
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/admin.ts apps/api/src/__tests__/admin.integration.spec.ts docs/plans/2026-02-21-finishit-execution-roadmap.md` PASS
- Scope validated by this run:
  - `/api/admin/errors/metrics` now rejects malformed `code` filters (whitespace/invalid tokens),
  - `/api/admin/errors/metrics` now rejects malformed `route` filters (missing leading `/`, query-string-like tokens),
  - existing valid error-metrics read flow remains stable.

## Execution Snapshot (2026-02-23, observer route boundary hardening)

- API verification:
  - `node scripts/ci/run-local-tests.mjs -- apps/api/src/__tests__/api.integration.spec.ts -t "observer read endpoints validate query fields and pagination|observer mutation endpoints validate query and body fields|observer endpoints validate uuid params" --runInBand` PASS
  - `npm --workspace apps/api run build` PASS
  - `npx ultracite check apps/api/src/routes/observers.ts apps/api/src/__tests__/api.integration.spec.ts docs/plans/2026-02-21-finishit-execution-roadmap.md` PASS
- Scope validated by this run:
  - observer read surfaces now reject unsupported query keys on `/api/observers/me/preferences`, `/api/observers/watchlist`, and `/api/observers/engagements`,
  - observer write surfaces now reject unexpected body fields before service execution (`watchlist`, `engagement save/rate`, `digest seen`),
  - duplicated query aliases for bounded limits/boolean flags now fail fast instead of being coerced.
