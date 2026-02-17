# Web E2E CI Runbook

Operational reference for Web Playwright gates and local pre-PR checks.

## CI matrix

1. PR gate (`.github/workflows/web-pr-gate.yml`)
- `Playwright Web Smoke` runs `test:e2e:smoke`.
- `Playwright Visual Smoke` runs only when PR changes include:
  - `apps/web/e2e/**`
  - `.github/workflows/web-pr-gate.yml`

2. Main CI PR smoke (`.github/workflows/ci.yml`)
- `e2e_playwright` runs `test:e2e:smoke`.

3. Nightly/weekly (`.github/workflows/web-nightly-e2e.yml`)
- Daily smoke schedule: `30 4 * * *`.
- Weekly full schedule: `0 5 * * 1`.
- Manual dispatch supports:
  - `suite=smoke`
  - `suite=full`
  - `suite=both`

4. Nightly visual (`.github/workflows/web-nightly-visual.yml`)
- Visual smoke capture on schedule + manual dispatch.

## Local pre-PR checklist

Run from repo root:

```bash
npm run ultracite:check
npm run test:web:e2e:smoke
```

If UI changed:

```bash
npm run test:web:visual
```

If baseline update is intentional:

```bash
npm run test:web:visual:update
npm run test:web:visual
```

## Artifact checklist

For failed CI runs, inspect:

1. Playwright HTML report artifact.
2. Playwright JSON report artifact.
3. Summary artifacts:
- e2e summary (`playwright-e2e-summary`)
- visual summary (`playwright-visual-summary`)

## Guardrails

1. Do not accept broad snapshot churn without explicit UI intent.
2. Keep smoke suite stable and fast; move slow/end-to-end exploratory cases into full weekly runs.
3. If smoke fails but visual passes, treat as behavior regression first (not a baseline issue).
