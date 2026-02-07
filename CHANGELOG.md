# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog.

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
