# Visual Baseline Policy

This policy defines how Playwright visual baselines are updated and reviewed for `apps/web`.

## Scope

- Visual smoke spec: `apps/web/e2e/visual-smoke.spec.ts`
- Baseline files: `apps/web/e2e/visual-smoke.spec.ts-snapshots/*.png`
- CI gates:
  - PR: `.github/workflows/web-pr-gate.yml` (`visual_smoke` job)
  - PR: `.github/workflows/ci.yml` (`ultracite_pr` job checklist validation)
  - Nightly: `.github/workflows/web-nightly-visual.yml`

## Source of truth

- Baselines committed in git are the source of truth.
- Visual diffs in CI are blocking unless baseline updates are intentional and reviewed.

## Decision matrix

1. No intentional UI change:
   - Do not update baseline images.
   - Any visual failure is treated as regression and must be fixed in code.
2. Intentional UI change:
   - Update only affected baseline images.
   - Keep unrelated snapshots unchanged.
   - Document why the visual change is expected in PR notes.
3. Unsure if change is intentional:
   - Do not accept snapshot updates by default.
   - Investigate root cause first (layout shift, font loading, dynamic data, animation).

## Required PR checks for UI changes

1. Run:
   - `npm run test:web:visual`
2. If change is intentional:
   - `npm run test:web:visual:update`
   - Re-run `npm run test:web:visual`
3. Review snapshot diffs before commit.
4. Mention baseline update scope in PR description:
   - changed pages/viewports
   - reason for visual change

## Review rules

- Reviewers should reject broad snapshot churn without matching UI intent.
- Large baseline updates should be split from unrelated logic refactors.
- Baseline updates must stay deterministic:
  - no random/time-dependent visuals in smoke regions
  - no unmasked transient overlays

## CI artifact usage

- Use uploaded artifacts from PR/nightly runs:
  - Playwright HTML report
  - JSON report
  - Visual summary (`json`, `md`)
- CI PR gates (`ci.yml` and `web-pr-gate.yml`) post/update a remediation comment when checklist validation fails.
- If PR visual job fails, inspect diff traces first, then decide:
  - fix code regression
  - or update baselines intentionally

## Anti-patterns

- Updating all snapshots “to make CI green”.
- Mixing major feature work and snapshot churn in one commit without explanation.
- Accepting visual diffs without local reproduction.
