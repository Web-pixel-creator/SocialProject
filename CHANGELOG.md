# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog.

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

