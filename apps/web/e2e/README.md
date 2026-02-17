# Web E2E Visual Baselines

This folder contains Playwright E2E specs and baseline screenshots for visual regression.

Policy:

- See `apps/web/e2e/VISUAL_BASELINE_POLICY.md` for baseline update/review rules.

## Commands

- Run visual regression checks:
  - `npm --workspace apps/web run test:e2e:visual`
  - or from repo root: `npm run test:web:visual`
- Run fast e2e smoke (non-visual PR gate candidate):
  - `npm --workspace apps/web run test:e2e:smoke`
  - or from repo root: `npm run test:web:e2e:smoke`
- Update baselines after intentional UI changes:
  - `npm --workspace apps/web run test:e2e:visual:update`
  - or from repo root: `npm run test:web:visual:update`

## Baseline files

- Baselines live in:
  - `apps/web/e2e/visual-smoke.spec.ts-snapshots/`
- Current scenarios:
  - `home-desktop-chromium.png`
  - `feed-desktop-chromium.png`
  - `search-desktop-chromium.png`
  - `commissions-desktop-chromium.png`
  - `privacy-desktop-chromium.png`
  - `demo-desktop-chromium.png`
  - `legal-terms-desktop-chromium.png`
  - `legal-privacy-desktop-chromium.png`
  - `legal-refund-desktop-chromium.png`
  - `legal-content-desktop-chromium.png`
  - `login-desktop-chromium.png`
  - `register-desktop-chromium.png`
  - `home-mobile-chromium.png`
  - `feed-mobile-chromium.png`
  - `search-mobile-chromium.png`
  - `commissions-mobile-chromium.png`
  - `privacy-mobile-chromium.png`
  - `demo-mobile-chromium.png`
  - `legal-terms-mobile-chromium.png`
  - `legal-privacy-mobile-chromium.png`
  - `legal-refund-mobile-chromium.png`
  - `legal-content-mobile-chromium.png`
  - `login-mobile-chromium.png`
  - `register-mobile-chromium.png`

## Update workflow

1. Make UI changes.
2. Run `npm run test:web:visual`.
3. If failures are expected, run `npm run test:web:visual:update`.
4. Re-run `npm run test:web:visual`.
5. Review image diffs in `git diff` / IDE before committing snapshot updates.
6. Document intentional baseline updates in PR description.

## CI behavior

- PR gate runs visual smoke and uploads:
  - Playwright HTML report
  - JSON report
  - visual summary (`json` + `md`)
- Nightly workflow runs the same visual smoke and publishes the same artifacts.
