# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog.

## [0.1.28] - 2026-02-08

### Added
- Dedicated preview-selection schema validator:
  - `scripts/release/validate-retry-preview-selection-json.mjs`
  - supports `--strict` mode for CI.
- New npm scripts:
  - `release:smoke:retry:schema:base:check`
  - `release:smoke:retry:schema:preview:check`
  - `release:smoke:retry:schema:preview:check:strict`

### Changed
- `release:smoke:retry:schema:check` now composes strict gates:
  - base retry schema checks (`cleanup` + `collect`)
  - preview-selection strict checks (including unknown-filter non-zero path)
- `validate-retry-json-schemas.mjs` now validates cleanup/collect contracts only.
- Release checklist now references standalone strict preview-selection validation command.

## [0.1.27] - 2026-02-08

### Added
- Runtime schema validation for non-zero preview-selection JSON outputs in `release:smoke:retry:schema:check`.
- New validation path executes:
  - `node scripts/release/generate-retry-schema-samples.mjs --preview --preview=missing-label --json`
  - expects non-zero exit while still requiring schema-valid JSON payload.

### Changed
- `release:smoke:retry:schema:check` now validates both:
  - successful runtime preview-selection JSON payload.
  - unknown-filter runtime preview-selection JSON payload (non-zero exit path).
- Retry schema validation payload count increased from `7` to `8`.
- Release checklist now explicitly includes unknown-filter preview JSON schema verification.

## [0.1.26] - 2026-02-08

### Added
- New JSON schema contract for preview-selection output:
  - `docs/ops/schemas/release-retry-preview-selection-output.schema.json`
- New preview-selection sample fixtures:
  - `docs/ops/schemas/samples/release-retry-preview-selection-output.sample.json`
  - `docs/ops/schemas/samples/release-retry-preview-selection-output-unknown.sample.json`
- Shared schema constants for preview-selection output:
  - `RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH`
  - `RETRY_PREVIEW_SELECTION_JSON_SCHEMA_VERSION`

### Changed
- Retry schema sample fixture set now includes preview-selection samples (total fixtures: `5`).
- `release:smoke:retry:schema:check` now validates preview-selection schema fixtures and runtime preview JSON payload.
- `release:smoke:retry:schema:sync:check` now enforces schemaPath/schemaVersion sync for cleanup, collect, and preview-selection contracts.
- Preview-selection JSON output now includes explicit `schemaPath` + `schemaVersion`.
- Release checklist now references preview-selection schema contract verification.

## [0.1.25] - 2026-02-08

### Added
- Compact preview-selection JSON mode for retry schema fixtures:
  - `npm run release:smoke:retry:schema:samples:preview:json`
  - `npm run release:smoke:retry:schema:samples:generate -- --preview=<label> --preview-file=<path> --json`
- JSON output includes filter inputs and compact dashboard-friendly summary:
  - `totals.available`, `totals.matched`, `totals.selected`, `totals.deduped`
  - `unknown.labels`, `unknown.files`
  - selected fixture metadata (`label`, `samplePath`, `schemaPath`)

### Changed
- Retry schema sample preview now supports `--json` in preview mode and exits non-zero on unknown filters after emitting JSON summary.
- Release checklist now includes JSON preview-selection commands for CI dashboards.

## [0.1.24] - 2026-02-08

### Added
- Sample-file targeted retry schema preview:
  - `npm run release:smoke:retry:schema:samples:generate -- --preview-file=<path>`
  - supports repeatable `--preview-file` filters and mixed usage with `--preview=<label>`.

### Changed
- Retry schema sample generator now accepts `--preview-file` in both `--preview-file=<path>` and `--preview-file <path>` forms.
- Preview output now separates label filters and file filters when both are provided.
- Release checklist now includes repeatable sample-file preview command.

## [0.1.23] - 2026-02-08

### Added
- Multi-filter retry schema fixture preview:
  - `npm run release:smoke:retry:schema:samples:generate -- --preview=<label> --preview=<label>`
  - supports combining multiple fixture targets in one non-destructive preview run.

### Changed
- Retry schema sample generator now accepts repeated `--preview=<label>` arguments and merges matching fixtures.
- Unknown preview filters are now reported together in one validation error.
- Release checklist targeted preview example now shows repeatable `--preview` usage.

## [0.1.22] - 2026-02-08

### Added
- Targeted retry schema fixture preview argument:
  - `npm run release:smoke:retry:schema:samples:generate -- --preview=<label>`
  - supports lookup by fixture label slug, sample path, or sample filename.

### Changed
- Retry schema sample generator help/preview flow now supports both `--preview` (all fixtures) and `--preview=<label>` (single fixture or subset).
- Release checklist now includes targeted preview command for focused review workflows.

## [0.1.21] - 2026-02-08

### Added
- Retry schema sample preview command:
  - `npm run release:smoke:retry:schema:samples:preview`
  - prints generated fixture payloads to stdout without modifying files.

### Changed
- Retry schema sample generator help/argument parser now supports `--preview`.
- Updated release checklist with preview command for quick review workflows.

## [0.1.20] - 2026-02-08

### Added
- Canonical retry diagnostics mock builders:
  - `scripts/release/retry-schema-mock-builders.mjs`

### Changed
- Retry schema sample fixtures now derive payloads from canonical builder functions instead of duplicated inline JSON structures.
- Fixture generation/check and schema validation now run against builder-derived payloads from one source of truth.

## [0.1.19] - 2026-02-08

### Added
- Auto-generated retry schema sample fixtures:
  - `npm run release:smoke:retry:schema:samples:generate`
  - `npm run release:smoke:retry:schema:samples:check`
- Shared fixture definitions module:
  - `scripts/release/retry-schema-sample-fixtures.mjs`

### Changed
- Retry schema sync and validation scripts now use the shared fixture source to avoid duplicated sample definitions.
- Release checklist now includes fixture generate/check commands.

## [0.1.18] - 2026-02-08

### Added
- New schema-sync check command:
  - `npm run release:smoke:retry:schema:sync:check`
- Shared retry diagnostics schema contract constants:
  - `scripts/release/retry-json-schema-contracts.mjs`

### Changed
- `retry:cleanup --json`, `retry:collect --json`, and schema validation scripts now use shared schema path/version constants.
- CI `test` job now runs schema-sync check before schema validation.
- Release checklist now includes schema-sync check in pre-release gates.

## [0.1.17] - 2026-02-08

### Added
- New retry diagnostics schema validation command:
  - `npm run release:smoke:retry:schema:check`
- Added sample payload fixtures for schema checks:
  - `docs/ops/schemas/samples/release-retry-cleanup-output.sample.json`
  - `docs/ops/schemas/samples/release-retry-collect-output-empty.sample.json`
  - `docs/ops/schemas/samples/release-retry-collect-output-success.sample.json`

### Changed
- CI `test` job now runs retry diagnostics schema validation before builds/tests.
- Release checklist now includes `release:smoke:retry:schema:check` in pre-release gates.

## [0.1.16] - 2026-02-08

### Added
- JSON schema contracts for retry diagnostics outputs:
  - `docs/ops/schemas/release-retry-cleanup-output.schema.json`
  - `docs/ops/schemas/release-retry-collect-output.schema.json`

### Changed
- `release:smoke:retry:cleanup --json` now includes `schemaPath` and `schemaVersion`.
- `release:smoke:retry:collect --json` now includes `schemaPath` and `schemaVersion`.
- Updated release checklist with schema references and payload-version checks.

## [0.1.15] - 2026-02-08

### Added
- `release:smoke:retry:collect` now supports `--json` for machine-readable cleanup and capture results.
- Added `--help` usage output for collector command arguments.

### Changed
- Updated release checklist with collector JSON output example for automation/dashboard ingestion.

## [0.1.14] - 2026-02-08

### Added
- `release:smoke:retry:cleanup` now supports `--json` for machine-readable retention metrics output.
- Added `--help` usage output for cleanup command arguments.

### Changed
- Updated release checklist with cleanup JSON output example for dashboard/automation ingestion.

## [0.1.13] - 2026-02-08

### Changed
- Retry diagnostics cleanup now applies retention by run group (`runid`) to evict related files together.
- Added `RELEASE_RETRY_LOGS_MAX_RUNS` (default: `100`) for primary run-level retention control.
- `RELEASE_RETRY_LOGS_MAX_FILES` is now an additional safety cap that removes oldest run groups until the file count fits.
- Updated release checklist with run-cap and file-cap dry-run examples.

## [0.1.12] - 2026-02-08

### Changed
- Retry diagnostics cleanup now supports file-count retention cap in addition to TTL:
  - `RELEASE_RETRY_LOGS_MAX_FILES` (default: `200`).
- Cleanup now removes oldest matching diagnostics files when the cap is exceeded.
- Updated release checklist with max-files cleanup controls and dry-run example.

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
