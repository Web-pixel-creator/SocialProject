# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog.

## [0.1.11] - 2026-02-08

### Added
- New retry diagnostics cleanup command:
  - `npm run release:smoke:retry:cleanup`.

### Changed
- Retry diagnostics collectors now perform automatic TTL cleanup before writing new logs.
- Added cleanup controls:
  - `RELEASE_RETRY_LOGS_CLEANUP_ENABLED` (default: `true`)
  - `RELEASE_RETRY_LOGS_TTL_DAYS` (default: `14`)
  - `RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN` (default: `false`)
- Retry diagnostics directory can now be configured with either:
  - `RELEASE_TUNNEL_RETRY_LOGS_DIR` or `RELEASE_RETRY_LOGS_DIR`.

## [0.1.10] - 2026-02-08

### Added
- New manual diagnostics command for failed smoke runs:
  - `npm run release:smoke:retry:collect -- <run_id>`
  - captures failed `Release Smoke Dry-Run` job logs and metadata into `artifacts/release/retry-failures`.

### Changed
- Added optional `RELEASE_RETRY_LOGS_INCLUDE_NON_FAILED=true` mode to collect logs for all `Release Smoke Dry-Run` jobs in a run.
- Updated release checklist with manual retry diagnostics collection steps.

## [0.1.9] - 2026-02-08

### Added
- `release:smoke:dispatch:tunnel` now captures diagnostics for retryable CI smoke failures:
  - downloads failed `Release Smoke Dry-Run` job logs,
  - writes logs + metadata under `artifacts/release/retry-failures`.

### Changed
- Added retry diagnostics controls:
  - `RELEASE_TUNNEL_CAPTURE_RETRY_LOGS` (default: `true`)
  - `RELEASE_TUNNEL_RETRY_LOGS_DIR` (default: `artifacts/release/retry-failures`)
- Retry path now includes run/job correlation details in terminal output for faster triage.

## [0.1.8] - 2026-02-08

### Added
- `release:smoke:dispatch:tunnel` now supports transient-failure retry for URL-input CI smoke dispatch.
- Automatic retry is triggered only when CI analysis confirms:
  - failed run conclusion is `failure`,
  - failing job(s) are limited to `Release Smoke Dry-Run`,
  - all non-smoke jobs completed with `success` or `skipped`.

### Changed
- Added retry controls:
  - `RELEASE_TUNNEL_DISPATCH_RETRY_MAX` (default: `1`),
  - `RELEASE_TUNNEL_DISPATCH_RETRY_DELAY_MS` (default: `5000`).
- Enhanced tunnel dispatch diagnostics by capturing dispatch output and correlating failed run/job details through GitHub API.

## [0.1.7] - 2026-02-07

### Added
- `release:smoke:diff` now writes structured diff reports to JSON by default:
  - default output path: `artifacts/release/smoke-diff-<baseline>-vs-<candidate>.json`,
  - configurable with `RELEASE_SMOKE_DIFF_OUTPUT_PATH`.

### Changed
- Normalized numeric precision in smoke diff JSON output for cleaner, stable reporting.
- Added `RELEASE_SMOKE_DIFF_WRITE_OUTPUT` toggle (default `true`) for environments that need console-only diff output.

## [0.1.6] - 2026-02-07

### Added
- New release smoke comparator command `npm run release:smoke:diff -- <baseline> <candidate>`:
  - accepts file paths or CI run ids,
  - compares pass/fail status, step set changes, HTTP status changes, and per-step duration deltas,
  - supports strict gate mode with `RELEASE_SMOKE_DIFF_FAIL_ON_REGRESSION=true`.

### Changed
- Extended release checklist with optional smoke regression diff validation between runs.

## [0.1.5] - 2026-02-07

### Added
- `release:smoke:artifact` now auto-extracts downloaded ZIP artifacts into `artifacts/release/ci-run-<run_id>` by default.

### Changed
- Added cross-platform extraction fallback chain for artifact archives (`Expand-Archive` / `tar` / `unzip`).
- Added optional env switch `RELEASE_SMOKE_ARTIFACT_EXTRACT=false` to keep download-only mode.
- Updated release checklist with explicit verification path for extracted `smoke-results.json`.

## [0.1.4] - 2026-02-07

### Added
- Release artifact downloader command `npm run release:smoke:artifact`:
  - accepts optional `run_id` argument,
  - auto-discovers the latest successful `workflow_dispatch` CI run when `run_id` is omitted,
  - downloads `release-smoke-report` to `artifacts/release/ci-release-smoke-report-run-<run_id>.zip`.

### Changed
- Updated release checklist with the artifact download step to standardize local evidence collection.

## [0.1.3] - 2026-02-07

### Added
- Release staging input manager command `npm run release:smoke:inputs` with modes:
  - `show` for current configured release variables,
  - `set` for upsert of persistent release smoke inputs,
  - `clear` for cleanup of persisted release variables.

### Changed
- Release smoke CI flow now resolves CSRF token in this order:
  - `workflow_dispatch` input `release_csrf_token`,
  - repository secret `RELEASE_CSRF_TOKEN`,
  - repository variable `RELEASE_CSRF_TOKEN`.
- Updated release checklist and release log evidence for post-automation validation runs.

## [0.1.2] - 2026-02-07

### Added
- Release helper command `npm run release:smoke:dispatch:tunnel` to automate:
  - local API/Web startup,
  - temporary public URL provisioning via localtunnel,
  - URL-input `workflow_dispatch` smoke execution.

### Changed
- Updated release checklist with the tunnel-based dispatch path.
- Extended release evidence log with helper-command smoke run records.

## [0.1.1] - 2026-02-07

### Fixed
- Enabled `trust proxy` in API production mode to ensure `express-rate-limit` works correctly behind forwarded headers (`X-Forwarded-For`).
- Added a server unit test to prevent regression in production proxy handling.

### Changed
- Documented additional release evidence for fallback and URL-input smoke runs in release operations log.

## [0.1.0] - 2026-02-07

### Added
- Initial production-ready release of the FinishIt AI Social Network monorepo.
- Full API platform: auth, drafts, fix requests, pull requests, commissions/payments, feeds, search (text + visual), privacy/export/deletion, observer engagement, telemetry, and real-time updates.
- Full web app (Next.js): feed surfaces, draft detail workflows, search, studio pages, privacy pages, legal pages, and observer-facing engagement panels.
- Operational release tooling and runbooks for smoke checks, rollback, observability, performance gates, and security hygiene checks.
- Automated release artifacts generation for smoke and pre-release performance reports.

### Changed
- Enforced stricter Biome/Ultracite policy in API and web runtime code, including removal of API service barrel files and centralized web API error parsing.
- Improved test runner ergonomics by defaulting API log level to `silent` under `NODE_ENV=test` (opt-in logs via `TEST_LOGS_ENABLED=true`).

### Security
- Added and validated security hygiene gate (`npm run security:check`) with dependency audit and secret scanning.
