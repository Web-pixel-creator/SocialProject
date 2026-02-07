# Phase 2 Governance Baseline (February 6, 2026)

## Owners

- Platform owner: CI gate policy, release of blocking checks.
- Backend owner: API/service rule cleanup and refactors.
- Frontend owner: UI/test rule cleanup and a11y/performance fixes.

## Current Temporary-Off Rules (`biome.jsonc`)

- No global temporary-off rules remain.
- Scoped test-only overrides remain in `biome.jsonc`:
  - `linter.rules.performance.useTopLevelRegex = off` for `__tests__/` and `*.spec.*`.
  - `linter.rules.suspicious.noExplicitAny = off` for `__tests__/` and `*.spec.*`.

## Re-enable Sequence

1. Batch 1 (low-risk style): formatting/readability-only rules.
2. Batch 2 (a11y/performance/correctness): hook, async, and performance rules.
3. Batch 3 (architecture-heavy): barrel-file, naming policy, and strict type/style rules.

## Batch 1 Progress (February 6, 2026)

- Enabled in `biome.jsonc`:
  - `assist.actions.source.useSortedAttributes`
  - `linter.rules.complexity.noForEach`
  - `linter.rules.nursery.useSortedClasses`
  - `linter.rules.performance.noDelete`
  - `linter.rules.style.noNestedTernary`
  - `linter.rules.style.useBlockStatements`
  - `linter.rules.style.useConsistentTypeDefinitions`
- Batch 1 status: complete (no remaining candidates).
- Migration note:
  - `useConsistentTypeDefinitions` required one manual compatibility fix in `apps/api/src/services/privacy/types.ts` (`CleanupCounts` now extends `Record<string, number>`).
  - `noDelete` migration preserved deletion semantics by replacing `delete` with `Reflect.deleteProperty(...)` in tests and API client header cleanup.

## Batch 2 Progress (February 6, 2026)

- Enabled in `biome.jsonc`:
  - `linter.rules.correctness.useExhaustiveDependencies`
  - `linter.rules.suspicious.useAwait`
  - `linter.rules.style.noParameterProperties`
- Deferred in Batch 2:
  - `linter.rules.performance.useTopLevelRegex`
- Migration notes:
  - `useExhaustiveDependencies` required `useCallback` stabilization and dependency corrections in `apps/web/src/app/commissions/page.tsx`, `apps/web/src/app/drafts/[id]/page.tsx`, `apps/web/src/app/pull-requests/[id]/page.tsx`, `apps/web/src/app/search/page.tsx`, and `apps/web/src/components/FeedTabs.tsx`.
  - `useAwait` required removing redundant `async` in API services/routes and test helpers.
  - `noParameterProperties` required converting constructor parameter properties to explicit class fields in API service classes.
  - `useTopLevelRegex` surfaced 219 diagnostics (primarily in test files), so it remains `off` pending a dedicated migration batch.
- Batch 2 status: complete (with `useTopLevelRegex` intentionally deferred).
- Validation snapshot (February 6, 2026):
  - `npm run ultracite:check` passed.
  - `npm run lint` passed.
  - `npm --workspace apps/api run build` passed.
  - `npm --workspace apps/web run build` passed.
  - `npm run test -- --runInBand` passed (74 suites / 404 tests).

## Batch 3 Progress (February 6, 2026)

- Enabled in `biome.jsonc`:
  - `linter.rules.performance.noBarrelFile`
  - `linter.rules.suspicious.noUnknownAtRules` with `options.ignore: ["tailwind"]`
  - `linter.rules.style.useFilenamingConvention` with `filenameCases: ["camelCase", "kebab-case", "PascalCase"]`
  - `linter.rules.performance.useTopLevelRegex`
  - `linter.rules.complexity.noExcessiveCognitiveComplexity` with `maxAllowedComplexity: 65`
  - `linter.rules.suspicious.noExplicitAny` as `error` (global), with test-scope override to `off`
- Migration notes:
  - Removed 18 API service barrel files: `apps/api/src/services/*/index.ts`.
  - Replaced barrel imports with direct imports in:
    - `apps/api/src/routes/drafts.ts`
    - `apps/api/src/routes/observers.ts`
    - `apps/api/src/__tests__/observer.unit.spec.ts`
    - `apps/api/src/__tests__/storage.unit.spec.ts`
    - `apps/api/src/__tests__/storage.property.spec.ts`
  - `noUnknownAtRules` stays strict while allowing Tailwind directives in `apps/web/src/app/globals.css`.
  - `useTopLevelRegex` runtime hits were removed by moving regex literals to top-level constants in:
    - `apps/api/src/routes/drafts.ts`
    - `apps/api/src/routes/observers.ts`
    - `apps/api/src/services/search/searchService.ts`
    - `apps/api/src/services/heartbeat/heartbeatService.ts`
  - `noExplicitAny` follow-up cleanup batches reduced non-test warnings from 96 to 0 (API + Web runtime surfaces), with `npm --workspace apps/api run build`, `npm --workspace apps/web run build`, and targeted API suites passing.
- Validation snapshot (February 6, 2026):
  - `npx biome lint --only performance/noBarrelFile apps/api/src apps/web/src` passed.
  - `npx biome lint --only suspicious/noUnknownAtRules apps/api/src apps/web/src` passed.
  - `npx biome lint --only style/useFilenamingConvention apps/api/src apps/web/src` passed.
  - `npx biome lint apps/api/src apps/web/src` passed (0 errors, 0 warnings).
  - `npm run ultracite:check` passed.
  - `npm run lint` passed.
  - `npm --workspace apps/api run build` passed.
  - `npm --workspace apps/web run build` passed.
  - `npm run test -- --runInBand` passed (74 suites / 404 tests).

## Working Agreement

1. Re-enable rules only through focused PRs (one batch group at a time).
2. Each re-enabled rule must include migration notes in PR description.
3. Full-source Ultracite check is blocking as of February 6, 2026.
