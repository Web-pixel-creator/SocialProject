# Pre-Release Performance Gate

This gate enforces baseline latency budgets before release.

## Baseline Targets

Source of truth: `docs/ops/performance-baseline.json`.

- API latency budget: `apiP95Ms` (default `800ms`)
- Web page budget: `webP95Ms` (default `1800ms`)
- Allowed regression window: `maxRegressionPercent` (default `20%`)

## Command

```bash
npm run perf:pre-release
```

Required environment variables:

- `PERF_API_BASE_URL` (example: `https://api-staging.finishit.example`)
- `PERF_WEB_BASE_URL` (example: `https://staging.finishit.example`)

Optional variables:

- `PERF_API_ROUTES` (comma-separated, default: `/health,/ready`)
- `PERF_WEB_ROUTES` (comma-separated, default: `/,/feed,/search`)
- `PERF_ITERATIONS` (default: `5`)
- `PERF_TIMEOUT_MS` (default: `5000`)
- `PERF_BASELINE_PATH` (default: `docs/ops/performance-baseline.json`)
- `PERF_RESULTS_PATH` (default: `artifacts/perf/pre-release-results.json`)

## CI/Staging Execution Path

- Use GitHub Actions job `performance_gate` in `.github/workflows/ci.yml`.
- Recommended trigger: `workflow_dispatch` before production rollout.
- Configure repository variables:
  - `PERF_API_BASE_URL`
  - `PERF_WEB_BASE_URL`
- If variables are missing, job exits with a clear skip message.

## Trend Tracking

- Each run emits JSON report to `artifacts/perf/pre-release-results.json`.
- Upload and retain this artifact in CI for release history.
- Compare current `p95` vs baseline + allowed regression window.
- Re-baseline only after a stable release and update `updatedAtUtc`.
