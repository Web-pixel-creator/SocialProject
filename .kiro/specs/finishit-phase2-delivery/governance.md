# Phase 2 Governance Baseline (February 6, 2026)

## Owners

- Platform owner: CI gate policy, release of blocking checks.
- Backend owner: API/service rule cleanup and refactors.
- Frontend owner: UI/test rule cleanup and a11y/performance fixes.

## Current Temporary-Off Rules (`biome.jsonc`)

| Rule | Area | Owner | Planned Batch | Target Date |
|---|---|---|---|---|
| `assist.actions.source.useSortedAttributes` | JSX attribute sorting | Frontend | Batch 1 | February 13, 2026 |
| `linter.rules.complexity.noExcessiveCognitiveComplexity` | Complexity | Backend | Batch 3 | February 27, 2026 |
| `linter.rules.complexity.noForEach` | Iteration style | Backend | Batch 1 | February 13, 2026 |
| `linter.rules.correctness.useExhaustiveDependencies` | React hooks | Frontend | Batch 2 | February 20, 2026 |
| `linter.rules.nursery.useSortedClasses` | CSS class sorting | Frontend | Batch 1 | February 13, 2026 |
| `linter.rules.performance.noBarrelFile` | Module architecture | Backend | Batch 3 | February 27, 2026 |
| `linter.rules.performance.noDelete` | Object mutation safety | Backend | Batch 1 | February 13, 2026 |
| `linter.rules.performance.useTopLevelRegex` | Regex performance | Backend | Batch 2 | February 20, 2026 |
| `linter.rules.suspicious.noExplicitAny` | Type safety | Backend | Batch 3 | February 27, 2026 |
| `linter.rules.suspicious.noUnknownAtRules` | CSS at-rules | Frontend | Batch 3 | February 27, 2026 |
| `linter.rules.suspicious.useAwait` | Async correctness | Backend | Batch 2 | February 20, 2026 |
| `linter.rules.style.noNestedTernary` | Readability | Backend | Batch 1 | February 13, 2026 |
| `linter.rules.style.noParameterProperties` | TS class style | Backend | Batch 2 | February 20, 2026 |
| `linter.rules.style.useBlockStatements` | Statement style | Backend | Batch 1 | February 13, 2026 |
| `linter.rules.style.useConsistentTypeDefinitions` | TS style consistency | Backend | Batch 1 | February 13, 2026 |
| `linter.rules.style.useFilenamingConvention` | Naming standards | Platform | Batch 3 | February 27, 2026 |

## Re-enable Sequence

1. Batch 1 (low-risk style): formatting/readability-only rules.
2. Batch 2 (a11y/performance/correctness): hook, async, and performance rules.
3. Batch 3 (architecture-heavy): barrel-file, naming policy, and strict type/style rules.

## Working Agreement

1. Re-enable rules only through focused PRs (one batch group at a time).
2. Each re-enabled rule must include migration notes in PR description.
3. Full-source Ultracite check becomes blocking only after Batch 2 is complete.
