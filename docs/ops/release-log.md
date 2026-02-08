# Release Log

Use this log to record each release and required dry-run evidence.

## Entry Template

Copy this block for each release:

```md
### <YYYY-MM-DD> - <version/tag>

- Scope: <short summary>
- Release commander: <name>
- Window (UTC): <start> -> <end>
- Dry-run:
  - Local rehearsal: pass/fail
  - Staging smoke: pass/fail
  - Smoke report artifact/link: <link or path>
- Gates:
  - ultracite: pass/fail
  - lint: pass/fail
  - api build: pass/fail
  - web build: pass/fail
  - tests: pass/fail
  - perf gate: pass/fail
  - security gate: pass/fail
- Rollout result: success/rolled back/partial
- Incidents:
  - <none> or incident IDs/timestamps
- Follow-ups:
  - <none> or issue links
```

## Entries

### 2026-02-08 - v0.1.19

- Scope: Auto-generated retry schema sample fixtures from a single source module, with CI fixture drift checks.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 08:40 -> 2026-02-08 08:50.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.19`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#166`, fallback mode) on head `3c5e1ac`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#167`) on head `3c5e1ac`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795304428`, artifact id `5421581787`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795342886`, artifact id `5421592188`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21795342886/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21795173334 21795342886`
    - JSON report: `artifacts/release/smoke-diff-21795173334-vs-21795342886.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7113.29ms -> 8140.58ms` (delta `+1027.29ms`), no pass regressions.
  - Schema fixture automation validation:
    - Fixture generation check: `npm run release:smoke:retry:schema:samples:check` -> pass (`3 files up to date`).
    - Schema version sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`13 checks`).
    - Schema shape check: `npm run release:smoke:retry:schema:check` -> pass (`4 payloads`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#166`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#167`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add a small CLI helper to print schema + sample fixture dependency graph for easier onboarding.

### 2026-02-08 - v0.1.18

- Scope: Schema-version sync guard for retry diagnostics contracts (code <-> schema <-> sample payloads) with CI enforcement.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 08:26 -> 2026-02-08 08:36.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.18`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#163`, fallback mode) on head `41e1387`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#164`) on head `41e1387`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795141089`, artifact id `5421529552`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795173334`, artifact id `5421537250`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21795173334/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21794993925 21795173334`
    - JSON report: `artifacts/release/smoke-diff-21794993925-vs-21795173334.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7413.43ms -> 7113.29ms` (delta `-300.14ms`), no pass regressions.
  - Schema contract guard validation:
    - Sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`10 checks`).
    - Shape check: `npm run release:smoke:retry:schema:check` -> pass (`4 payloads`).
    - CI `test` job now runs both checks in order before migrations/build/test.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#163`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#164`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: auto-generate sample fixtures from a canned mock generator to reduce manual fixture maintenance.

### 2026-02-08 - v0.1.17

- Scope: Add retry diagnostics schema-check gate with fixtures and CI enforcement.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 08:12 -> 2026-02-08 08:22.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.17`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#160`, fallback mode) on head `c1bf54a`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#161`) on head `c1bf54a`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794959514`, artifact id `5421471968`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794993925`, artifact id `5421480808`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21794993925/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21794841880 21794993925`
    - JSON report: `artifacts/release/smoke-diff-21794841880-vs-21794993925.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `5940.88ms -> 7413.43ms` (delta `+1472.55ms`), no pass regressions.
  - Schema-check gate validation:
    - Command: `npm run release:smoke:retry:schema:check`
    - Result: pass (`Retry diagnostics schema validation passed (4 payloads).`)
    - Fixtures validated:
      - `docs/ops/schemas/samples/release-retry-cleanup-output.sample.json`
      - `docs/ops/schemas/samples/release-retry-collect-output-empty.sample.json`
      - `docs/ops/schemas/samples/release-retry-collect-output-success.sample.json`
    - Runtime payload validated:
      - `node scripts/release/cleanup-retry-failure-logs.mjs --json` (dry-run forced by checker).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#160`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#161`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: validate one real `retry:collect --json` fixture from a captured run in CI using a redacted static payload to protect against API shape drift.

### 2026-02-08 - v0.1.16

- Scope: Formal JSON schema contracts for retry diagnostics outputs (`retry:cleanup --json`, `retry:collect --json`).
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 08:03 -> 2026-02-08 08:10.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.16`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#157`, fallback mode) on head `936618d`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#158`) on head `936618d`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794808140`, artifact id `5421420537`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794841880`, artifact id `5421429164`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21794841880/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21794547923 21794841880`
    - JSON report: `artifacts/release/smoke-diff-21794547923-vs-21794841880.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7584.99ms -> 5940.88ms` (delta `-1644.11ms`), no pass regressions.
  - JSON schema contract validation:
    - Cleanup JSON: `npm run release:smoke:retry:cleanup -- --json`
    - Collect JSON: `RELEASE_RETRY_LOGS_INCLUDE_NON_FAILED=true npm run release:smoke:retry:collect -- 21794841880 --json`
    - Output payloads include explicit `schemaPath` + `schemaVersion` that map to:
      - `docs/ops/schemas/release-retry-cleanup-output.schema.json`
      - `docs/ops/schemas/release-retry-collect-output.schema.json`
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#157`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#158`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add a lightweight schema-validation script to assert sample outputs against these schema files in CI.

### 2026-02-08 - v0.1.15

- Scope: Machine-readable collector output for retry diagnostics (`release:smoke:retry:collect --json`).
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 07:38 -> 2026-02-08 07:46.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.15`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#154`, fallback mode) on head `d85a3bf`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#155`) on head `d85a3bf`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794513493`, artifact id `5421337608`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794547923`, artifact id `5421345349`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21794547923/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21794416064 21794547923`
    - JSON report: `artifacts/release/smoke-diff-21794416064-vs-21794547923.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `8621.95ms -> 7584.99ms` (delta `-1036.96ms`), no pass regressions.
  - Collector JSON validation:
    - Help/usage: `npm run release:smoke:retry:collect -- --help`
    - JSON success capture: `RELEASE_RETRY_LOGS_INCLUDE_NON_FAILED=true npm run release:smoke:retry:collect -- 21794547923 --json`
    - Output includes run metadata, cleanup summary, and capture summary (`totalJobs`, `capturedJobs`, `failedJobs`, `jobs[]`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#154`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#155`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add JSON schema file for collector/cleanup outputs to enforce backward-compatible payload contracts.

### 2026-02-08 - v0.1.14

- Scope: Machine-readable cleanup metrics output for retry diagnostics retention (`--json`).
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 07:27 -> 2026-02-08 07:36.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.14`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#151`, fallback mode) on head `805b4e4`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#152`) on head `805b4e4`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794383074`, artifact id `5421302851`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794416064`, artifact id `5421310418`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21794416064/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21794281151 21794416064`
    - JSON report: `artifacts/release/smoke-diff-21794281151-vs-21794416064.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6525.40ms -> 8621.95ms` (delta `+2096.55ms`), no pass regressions.
  - Cleanup JSON output validation:
    - Command: `npm run release:smoke:retry:cleanup -- --json`
    - Result: valid JSON object with full retention summary fields (`matchedRuns`, `eligibleRuns`, `removedRuns`, `removedBytes`, limits).
    - Dry-run cap preview: `RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN=true RELEASE_RETRY_LOGS_MAX_RUNS=3 npm run release:smoke:retry:cleanup -- --json`
    - Result: JSON shows expected run-group removals (`eligibleRuns=2`, `eligibleFiles=4`) without file deletions.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#151`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#152`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add `--json` mode to `release:smoke:retry:collect` cleanup preamble for fully machine-readable collector traces.

### 2026-02-08 - v0.1.13

- Scope: Run-level retry diagnostics retention so log/metadata files are evicted together by run group.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 07:15 -> 2026-02-08 07:24.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.13`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#148`, fallback mode) on head `14cd4da`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#149`) on head `14cd4da`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794244711`, artifact id `5421259940`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794281151`, artifact id `5421269142`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21794281151/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21794143521 21794281151`
    - JSON report: `artifacts/release/smoke-diff-21794143521-vs-21794281151.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6334.55ms -> 6525.40ms` (delta `+190.85ms`), no pass regressions.
  - Run-level cleanup validation:
    - Standalone preview: `RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN=true RELEASE_RETRY_LOGS_MAX_RUNS=2 RELEASE_RETRY_LOGS_MAX_FILES=200 npm run release:smoke:retry:cleanup`
    - Output: would remove `2` run groups (`4` files) by run-cap, keeping grouped log+metadata pairs.
    - Collector preview: `RELEASE_RETRY_LOGS_INCLUDE_NON_FAILED=true RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN=true RELEASE_RETRY_LOGS_MAX_RUNS=2 RELEASE_RETRY_LOGS_MAX_FILES=200 npm run release:smoke:retry:collect -- 21794281151`
    - Output includes run-group cleanup summary before diagnostics capture.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#148`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#149`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add a `--json` mode for cleanup scripts to simplify dashboard ingestion of retention metrics.

### 2026-02-08 - v0.1.12

- Scope: Max-files retention cap for retry diagnostics cleanup to keep local evidence storage bounded.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 07:05 -> 2026-02-08 07:12.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.12`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#145`, fallback mode) on head `3a5ccdd`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#146`) on head `3a5ccdd`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794114572`, artifact id `5421221738`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794143521`, artifact id `5421229074`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21794143521/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21794008857 21794143521`
    - JSON report: `artifacts/release/smoke-diff-21794008857-vs-21794143521.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6728.17ms -> 6334.55ms` (delta `-393.62ms`), no pass regressions.
  - Max-files cap validation:
    - Standalone preview: `RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN=true RELEASE_RETRY_LOGS_MAX_FILES=4 npm run release:smoke:retry:cleanup`
    - Output: would remove `2` files by max-files cap, keep `4` newest matching files.
    - Collector preview: `RELEASE_RETRY_LOGS_INCLUDE_NON_FAILED=true RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN=true RELEASE_RETRY_LOGS_MAX_FILES=4 npm run release:smoke:retry:collect -- 21794143521`
    - Output includes cleanup summary with `max-files` removals before log collection step.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#145`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#146`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: switch cap from file-level to run-level grouping to always evict log+metadata pairs together.

### 2026-02-08 - v0.1.11

- Scope: TTL-based retention cleanup for retry diagnostics logs with standalone cleanup command.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 06:52 -> 2026-02-08 07:01.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.11`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#142`, fallback mode) on head `c234507`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#143`) on head `c234507`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21793979032`, artifact id `5421183119`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21794008857`, artifact id `5421190186`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21794008857/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21793834442 21794008857`
    - JSON report: `artifacts/release/smoke-diff-21793834442-vs-21794008857.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6689.91ms -> 6728.17ms` (delta `+38.26ms`), no pass regressions.
  - Retry diagnostics cleanup validation:
    - Standalone dry-run cleanup: `RELEASE_RETRY_LOGS_TTL_DAYS=0 RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN=true npm run release:smoke:retry:cleanup`
    - Output: would remove `4` files (`36908` bytes) older than `0` days.
    - Collector validation: `RELEASE_RETRY_LOGS_INCLUDE_NON_FAILED=true npm run release:smoke:retry:collect -- 21794008857`
    - Output: `artifacts/release/retry-failures/run-143-runid-21794008857-job-62878392942-Release_Smoke_Dry-Run_staging_manual_.log`
    - Metadata: `artifacts/release/retry-failures/run-143-runid-21794008857-retry-metadata.json`
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#142`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#143`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add a configurable max-file-count cap for retry diagnostics in addition to TTL.

### 2026-02-08 - v0.1.10

- Scope: Manual retry diagnostics collector for failed `release_smoke_staging` runs.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 06:39 -> 2026-02-08 06:45.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.10`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#139`, fallback mode) on head `88fbf9f`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#140`) on head `88fbf9f`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21793795902`, artifact id `5421126373`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21793834442`, artifact id `5421135270`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21793834442/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21793629453 21793834442`
    - JSON report: `artifacts/release/smoke-diff-21793629453-vs-21793834442.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6070.95ms -> 6689.91ms` (delta `+618.96ms`), no pass regressions.
  - Retry diagnostics collector validation:
    - Failed-run capture command: `npm run release:smoke:retry:collect -- 21784886065`
    - Output: `artifacts/release/retry-failures/run-125-runid-21784886065-job-62854650228-Release_Smoke_Dry-Run_staging_manual_.log`
    - Metadata: `artifacts/release/retry-failures/run-125-runid-21784886065-retry-metadata.json`
    - Include-non-failed mode validation: `RELEASE_RETRY_LOGS_INCLUDE_NON_FAILED=true npm run release:smoke:retry:collect -- 21793834442`
    - Output: `artifacts/release/retry-failures/run-140-runid-21793834442-job-62877954482-Release_Smoke_Dry-Run_staging_manual_.log`
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#139`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#140`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add TTL cleanup for `artifacts/release/retry-failures` to keep local diagnostics storage bounded.

### 2026-02-08 - v0.1.9

- Scope: Retry diagnostics capture for tunnel dispatch transient smoke failures.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 06:22 -> 2026-02-08 06:27.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.9`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#135`, fallback mode) on head `0576a7e`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#136`) on head `0576a7e`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21793595330`, artifact id `5421053639`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21793629453`, artifact id `5421064825`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21793629453/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21793430363 21793629453`
    - JSON report: `artifacts/release/smoke-diff-21793430363-vs-21793629453.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6886.59ms -> 6070.95ms` (delta `-815.64ms`), no pass regressions.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#135`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#136`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: simulate a controlled retryable failure in a non-production branch to assert end-to-end creation of `artifacts/release/retry-failures` diagnostics.

### 2026-02-08 - v0.1.8

- Scope: Retry hardening for tunnel-based URL-input smoke dispatch.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 06:06 -> 2026-02-08 06:11.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.8`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#130`, fallback mode) on head `1076802`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#131`) on head `1076802`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21793398320`, artifact id `5420989983`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21793430363`, artifact id `5420997371`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21793430363/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21784927346 21793430363`
    - JSON report: `artifacts/release/smoke-diff-21784927346-vs-21793430363.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7099.34ms -> 6886.59ms` (delta `-212.75ms`), no pass regressions.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#130`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#131`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: capture failed `release_smoke_staging` step logs automatically during retry to speed up root-cause triage.

### 2026-02-07 - v0.1.7

- Scope: Persisted JSON smoke diff reports for release-over-release trend tracking.
- Release commander: Codex automation.
- Window (UTC): 2026-02-07 18:30 -> 2026-02-07 18:38.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.7`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#124`, fallback mode) on head `18b1d33`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#126`) on head `18b1d33`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21784851509`, artifact id `5418281999`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21784927346`, artifact id `5418300223`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21784927346/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21784688052 21784927346`
    - JSON report: `artifacts/release/smoke-diff-21784688052-vs-21784927346.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6404.88ms -> 7099.34ms` (delta `+694.46ms`), no pass regressions.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#124`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#126`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - URL-input run `#125` failed in `release_smoke_staging` due transient tunnel reachability; immediate rerun (`#126`) succeeded on the same head.
- Follow-ups:
  - Optional: introduce one automatic retry in `release:smoke:dispatch:tunnel` when only `release_smoke_staging` fails and all other CI jobs pass.

### 2026-02-07 - v0.1.6

- Scope: Smoke regression comparator tooling for release evidence (`release:smoke:diff`).
- Release commander: Codex automation.
- Window (UTC): 2026-02-07 18:15 -> 2026-02-07 18:20.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.6`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#120`, fallback mode) on head `d9f9539`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#121`) on head `d9f9539`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21784651309`, artifact id `5418224782`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21784688052`, artifact id `5418233535`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21784688052/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21784477548 21784688052`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration improved `8244.33ms -> 6404.88ms` (delta `-1839.45ms`), no pass regressions.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#120`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#121`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: persist smoke diff snapshots as JSON to support trend charts across releases.

### 2026-02-07 - v0.1.5

- Scope: Release artifact downloader auto-extraction for immediate local smoke report verification.
- Release commander: Codex automation.
- Window (UTC): 2026-02-07 18:00 -> 2026-02-07 18:05.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.5`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#116`, fallback mode) on head `c7df054`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#117`) on head `c7df054`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21784435850`, artifact id `5418159668`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21784477548`, artifact id `5418168081`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21784477548/smoke-results.json`
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#116`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#117`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add helper to diff two extracted `smoke-results.json` files for release-over-release regression checks.

### 2026-02-07 - v0.1.4

- Scope: Release evidence automation with CI artifact downloader command.
- Release commander: Codex automation.
- Window (UTC): 2026-02-07 17:48 -> 2026-02-07 17:53.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.4`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#112`, fallback mode) on head `811e426`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#113`) on head `811e426`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21784276823`, artifact id `5418115762`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21784313337`, artifact id `5418124239`)
    - Local downloaded copy (new downloader command): `artifacts/release/ci-release-smoke-report-run-21784313337.zip`
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#112`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#113`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add zip extraction helper to unpack downloaded smoke reports automatically for direct JSON diffing.

### 2026-02-07 - v0.1.3

- Scope: Release-process hardening for persistent staging inputs and CSRF variable fallback.
- Release commander: Codex automation.
- Window (UTC): 2026-02-07 17:33 -> 2026-02-07 17:38.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.3`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#108`, fallback mode) on head `2e68223`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#109`) on head `2e68223`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21784073868`, artifact id `5418061243`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21784114170`, artifact id `5418069264`)
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#108`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#109`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: configure long-lived staging URLs via `npm run release:smoke:inputs -- set` to replace temporary tunnel URLs.

### 2026-02-07 - release-ops-validation-e60bbc1

- Scope: Post-automation validation for staging input manager + CSRF variable fallback on head `e60bbc1`.
- Release commander: Codex automation.
- Window (UTC): 2026-02-07 17:17 -> 2026-02-07 17:26.
- Dry-run:
  - Local rehearsal: pass (URL-input helper boots local API/Web + tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#104`, fallback mode).
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#105`).
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21783838888`, artifact id `5417997686`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21783938460`, artifact id `5418022773`)
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#104`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#105`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: process hardening validated; no production rollout executed in this window.
- Incidents:
  - none.
- Follow-ups:
  - Optional: replace temporary tunnel URLs with persistent staging URLs and rerun URL-input smoke for long-lived evidence.

### 2026-02-07 - v0.1.2

- Scope: Release workflow automation update with tunnel-based URL-input dispatch helper.
- Release commander: Codex automation.
- Window (UTC): 2026-02-07 16:56 -> 2026-02-07 16:59.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.2`
- Dry-run:
  - Local rehearsal: pass (helper command starts local API/Web and tunnels automatically).
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#101`) on head `c07a413`.
  - Smoke report artifact/link:
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21783573928`, artifact id `5417916700`)
    - Local downloaded copy: `artifacts/release/ci-run-21783573928/smoke-results.json`
- Gates:
  - ultracite: pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#101`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: configure persistent staging URLs/secrets to avoid temporary tunnel URLs for recurring release evidence.

### 2026-02-07 - v0.1.1

- Scope: Patch release for proxy/rate-limit compatibility in production deployments.
- Release commander: Codex automation.
- Window (UTC): 2026-02-07 15:42 -> 2026-02-07 16:26.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.1`
- Dry-run:
  - Local rehearsal: previously validated in v0.1.0 window.
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#93`, fallback mode on latest head `55bb488`).
  - Staging smoke (URL-input mode): pass (`release_smoke_staging`, workflow run `#96`) using explicit `release_api_base_url`/`release_web_base_url`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#98`) using auto-generated temporary public URLs.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21782564047`, artifact id `5417629936`)
    - URL-input mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21783133764`, artifact id `5417788610`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21783392486`, artifact id `5417861798`)
    - Local downloaded copy of URL-input report: `artifacts/release/ci-run-21783133764/smoke-results.json`
- Gates:
  - ultracite: pass (`npm run ultracite:check`).
  - tests (targeted): pass (`npm run test -- --runInBand --testPathPattern=apps/api/src/__tests__/server.unit.spec.ts`).
  - api build: pass (`npm --workspace apps/api run build`).
  - CI workflow_dispatch corroboration (run `#93`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#96`, URL-input mode): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#98`, helper command): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: replace temporary tunnel URLs with persistent staging URLs and rerun `release_smoke_staging` for long-lived staging evidence.

### 2026-02-07 - v0.1.0

- Scope: Initial release cut with validated local rehearsal gates and artifacts.
- Release commander: Codex automation.
- Window (UTC): 2026-02-07 14:57 -> 2026-02-07 15:31.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.0`
- Dry-run:
  - Local rehearsal: pass.
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#87`, local-stack fallback mode).
  - Staging smoke (URL-input mode): pass (`release_smoke_staging`, workflow run `#91`) using explicit `release_api_base_url`/`release_web_base_url`.
  - Smoke report artifact/link:
    - local: `artifacts/release/smoke-results.json`
    - CI artifact: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21782175242`, artifact id `5417516134`)
    - CI artifact (URL-input mode): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21782415378`, artifact id `5417585684`)
    - Local downloaded copy of URL-input report: `artifacts/release/ci-run-21782415378/smoke-results.json`
- Gates:
  - ultracite: pass (`npm run ultracite:check`).
  - lint: pass (`npm run lint`).
  - api build: pass (`npm --workspace apps/api run build`, via `release:dry-run:local`).
  - web build: pass (`npm --workspace apps/web run build`, via `release:dry-run:local`).
  - tests: pass (`npm run test -- --runInBand`, 74 suites / 404 tests).
  - perf gate: pass (`npm run perf:pre-release`, report: `artifacts/perf/pre-release-results.json`).
  - security gate: pass (`npm run security:check`).
  - CI workflow_dispatch corroboration (run `#87`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#91`, URL-input mode): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged; no production rollout executed in this window.
- Incidents:
  - Run `#90` failed in URL-input mode due missing `trust proxy` handling under forwarded headers; fixed in code and validated by successful run `#91`.
- Follow-ups:
  - Optional: replace temporary tunnel URLs with persistent staging URLs and rerun `release_smoke_staging` for long-lived staging evidence.

### 2026-02-06 - phase2-release-dry-run-local

- Scope: Phase 2 release-process rehearsal (local-only).
- Release commander: local automation (`release:dry-run:local`).
- Window (UTC): 2026-02-06.
- Dry-run:
  - Local rehearsal: pass.
  - Staging smoke: pending.
  - Smoke report artifact/link: `artifacts/release/smoke-results.json`.
- Gates:
  - ultracite: pass.
  - lint: pass.
  - api build: pass.
  - web build: pass.
  - tests: pass.
  - perf gate: not executed (staging/manual path).
  - security gate: configured in CI; not executed in this local rehearsal.
- Rollout result: not a production rollout (rehearsal only).
- Incidents:
  - none.
- Follow-ups:
  - Run staging smoke via `release_smoke_staging` (`workflow_dispatch`) and attach `release-smoke-report`.

### 2026-02-06 - phase2-release-smoke-fallback-path

- Scope: Enable CI fallback smoke path when staging URLs are unavailable.
- Release commander: local automation (`release:dry-run:local`).
- Window (UTC): 2026-02-06.
- Dry-run:
  - Local rehearsal: pass.
  - Staging smoke: fallback path ready (`release_smoke_staging` without URL inputs).
  - Dispatch helper validation: returns actionable guidance when target ref lacks `workflow_dispatch`.
  - Smoke report artifact/link: `artifacts/release/smoke-results.json`.
- Gates:
  - ultracite: pass.
  - lint: pass (previous run in same checkpoint window).
  - api build: pass.
  - web build: pass.
  - tests: pass (previous run in same checkpoint window).
  - perf gate: manual staging path configured.
  - security gate: configured in CI.
- Rollout result: not a production rollout (process hardening).
- Incidents:
  - none.
- Follow-ups:
  - On release day, run `release_smoke_staging` via `workflow_dispatch` and archive `release-smoke-report`.
