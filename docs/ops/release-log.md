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

### 2026-03-01 - dispatch helper CLI inputs for launch-gate workflow

- Scope: remove env-only friction for workflow dispatch by adding explicit CLI flags to `release:launch:gate:dispatch`.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 10:09 -> 2026-03-01 10:17.
- Changes:
  - Updated `scripts/release/dispatch-production-launch-gate.mjs`:
    - added CLI flags:
      - `--runtime-draft-id <uuid>`
      - `--require-skill-markers`
      - `--require-natural-cron-window`
      - `--required-external-channels <csv|all>`
    - added `--runtime-draft-id=<uuid>` and `--required-external-channels=<csv|all>` forms,
    - added channel-value validation for `--required-external-channels` / `RELEASE_REQUIRED_EXTERNAL_CHANNELS`.
    - CLI values now override env values for dispatch inputs.
    - improved GitHub request error surface for pre-response failures (now includes method + URL context instead of bare `fetch failed`).
  - Updated docs:
    - `docs/ops/release-checklist.md`
    - `docs/ops/release-runbook.md`
- Verification:
  - `node --check scripts/release/dispatch-production-launch-gate.mjs`: pass.
  - `node scripts/release/dispatch-production-launch-gate.mjs --help`: pass (new options rendered).
- Incidents:
  - temporary network outage from local automation shell to `api.github.com` blocked live dispatch verification during this checkpoint (`fetch failed` / unable to connect remote server).
- Follow-ups:
  - re-run one live dispatch using CLI input flags after network connectivity restores.

### 2026-03-01 - skills-runtime matrix marker coverage in launch-gate

- Scope: extend skills-runtime marker validation from single runtime probe to all matrix orchestration channels (`web`, `live_session`, runtime probe channel).
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 10:01 -> 2026-03-01 10:06.
- Changes:
  - Updated `scripts/release/production-launch-gate.mjs`:
    - added matrix-channel marker coverage checks derived from orchestration step prompts,
    - new summary check `skillMarkerMatrixChannels` with `failedChannels` diagnostics,
    - `adapterMatrixProbe` now reports component signals (`channelFlowPass`, `adapterUsagePass`, `skillMarkerMatrixPass`),
    - runtime/matrix checks now persist diagnostic check states in summary before failure exits.
  - Updated docs:
    - `docs/ops/release-checklist.md`
    - `docs/ops/release-runbook.md`
- Verification:
  - `node --check scripts/release/production-launch-gate.mjs`: pass.
  - `npm run ultracite:check`: pass.
  - workflow run `#32` (`22541079581`): `success` with strict inputs:
    - `runtime_draft_id=3fefc86d-eb94-42f2-8c97-8b57eff8944e`
    - `require_skill_markers=true`
    - `require_natural_cron_window=true`
  - run `#32` summary assertions:
    - `skillMarkerMultiStep.pass=true`
    - `skillMarkerMatrixChannels.pass=true`
    - `skillMarkerMatrixChannels.failedChannels=[]`
  - `npm run release:health:report -- 22541079581 --workflow-file production-launch-gate.yml --profile launch-gate --json --strict`: pass.
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-03-01 - external fallback telemetry assertions in launch-gate

- Scope: strengthen external connector fallback verification by asserting connector telemetry counters per channel probe.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 10:04 -> 2026-03-01 10:08.
- Changes:
  - Updated `scripts/release/production-launch-gate.mjs`:
    - each configured external channel fallback check now also polls `/api/admin/agent-gateway/telemetry` scoped by `channel + connector`,
    - per-channel pass now requires telemetry evidence (`ingestConnectors.total > 0` and `ingestConnectors.accepted > 0`),
    - fallback check details now include telemetry diagnostics (`telemetryPass`, `telemetryAccepted`, `telemetryTotal`, `telemetryAttempts`, `telemetryStatus`, `telemetryRejected`).
  - Updated docs:
    - `docs/ops/release-checklist.md`
    - `docs/ops/release-runbook.md`
- Verification:
  - `node --check scripts/release/production-launch-gate.mjs`: pass.
  - workflow run `#31` (`22540991179`): `success` (baseline launch-gate sanity after patch).
- Incidents:
  - none.
- Follow-ups:
  - execute one strict run with configured Telegram/Slack/Discord profiles to exercise telemetry assertions on active external-channel probes.

### 2026-03-01 - launch-gate required channels validation runs + ingest fail diagnostics

- Scope: validate new `required_external_channels` behavior on live workflow runs and ensure failing ingest probes expose explicit check state in summary artifacts.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 09:44 -> 2026-03-01 09:55.
- Changes:
  - Updated `scripts/release/production-launch-gate.mjs`:
    - when ingest probe fails, summary now still includes:
      - `checks.ingestExternalChannelFallback`
      - `checks.ingestProbe`
    - added explicit skipped defaults for both checks when `--skip-ingest-probe` is used.
- Verification:
  - Workflow run `#25` (`22540764904`): `success` (baseline, no required external channels).
  - Workflow run `#26` (`22540785777`): `failure` with `required_external_channels=telegram` (expected negative test).
  - Workflow run `#27` (`22540811251`): `success` (`runtime_draft_id` + `require_skill_markers=true` + `require_natural_cron_window=true`).
  - Workflow run `#29` (`22540889549`): `failure` with `required_external_channels=telegram` after diagnostics patch; summary now includes:
    - `ingestExternalChannelFallback.pass=false`
    - `missingRequiredChannels=["telegram"]`
    - `ingestProbe.pass=false`
  - Workflow run `#30` (`22540913414`): `success` (baseline sanity after negative test).
  - `npm run release:health:report -- 22540811251 --workflow-file production-launch-gate.yml --profile launch-gate --json --strict`: pass.
- Incidents:
  - run `#28` (`22540848262`) (triggered before pushing diagnostics patch) still showed truncated checks on ingest failure; addressed in current script patch.
- Follow-ups:
  - none.

### 2026-03-01 - launch-gate required external channels control

- Scope: add explicit launch-gate control to require specific external connector channels (`telegram` / `slack` / `discord`) during fallback ingest verification.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 10:02 -> 2026-03-01 10:10.
- Changes:
  - Updated `scripts/release/production-launch-gate.mjs`:
    - added `--required-external-channels <csv|all>` and env fallback `RELEASE_REQUIRED_EXTERNAL_CHANNELS`,
    - validates allowed channels and blocks invalid values,
    - blocks invalid combination `--required-external-channels` + `--skip-ingest-probe`,
    - `ingestExternalChannelFallback` now reports and evaluates:
      - `requiredChannels`
      - `missingRequiredChannels`
      - `requiredChannelsPass`
    - gate now fails when required channels are missing or their fallback checks fail.
  - Updated `.github/workflows/production-launch-gate.yml`:
    - new workflow input `required_external_channels`,
    - forwards input to launch-gate script,
    - renders `required_external_channels` in step summary.
  - Updated `scripts/release/dispatch-production-launch-gate.mjs`:
    - forwards `RELEASE_REQUIRED_EXTERNAL_CHANNELS` to workflow input `required_external_channels`,
    - prints resolved value in dispatch output.
  - Updated docs:
    - `docs/ops/release-checklist.md`
    - `docs/ops/release-runbook.md`
- Verification:
  - `node --check scripts/release/production-launch-gate.mjs`: pass.
  - `node --check scripts/release/dispatch-production-launch-gate.mjs`: pass.
  - `npm run ultracite:check`: pass.
- Incidents:
  - none.
- Follow-ups:
  - execute a strict workflow_dispatch run with `required_external_channels` once production connector profiles are finalized.

### 2026-03-01 - post-release health run #24 (id 22540547708)

- Source workflow run: #24 (https://github.com/Web-pixel-creator/SocialProject/actions/runs/22540547708).
- Overall health: pass.
- Required jobs: 1/1 passed.
- Required artifacts: 9/9 present.
- Failed jobs total: 0.
- Smoke summary: pass=true totalSteps=19 failedSteps=0.
- Report artifact: `artifacts/release/post-release-health-run-22540547708.json`.

### 2026-03-01 - skill-marker multi-step gate hardening + strict run #24

- Scope: harden skills-runtime launch-gate marker validation from first-step-only detection to multi-step orchestration coverage.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 09:24 -> 2026-03-01 09:32.
- Changes:
  - Updated `scripts/release/production-launch-gate.mjs`:
    - runtime probe now computes marker coverage per orchestration step (`critic/maker/judge`),
    - added summary check `skillMarkerMultiStep`,
    - strict marker rule with `require_skill_markers=true` is now:
      - `Role persona` marker on every step,
      - `Skill capsule` marker on every step,
      - `Role skill` marker on at least one step.
  - Updated release docs:
    - `docs/ops/release-checklist.md`
    - `docs/ops/release-runbook.md`
- Verification:
  - `node --check scripts/release/production-launch-gate.mjs`: pass.
  - strict dispatch matrix re-run after patch:
    - run `#24` (`22540547708`) `success`
    - URL: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/22540547708`
  - Summary checks from run `#24`:
    - `skillMarkerMultiStep.pass=true`
    - `missingRolePersonaRoles=[]`
    - `missingSkillCapsuleRoles=[]`
    - `roleSkillPresentRoles=["critic","maker"]`
- Incidents:
  - run `#22` (`22540472390`) and run `#23` (`22540519731`) failed with `Runtime probe failed` during intermediate strict-all-steps `Role skill` gate iteration.
  - fixed by separating marker requirements (`Role persona`/`Skill capsule` per-step, `Role skill` any-step).
- Follow-ups:
  - none.

### 2026-03-01 - external-channel fallback probe in launch-gate + strict run #20

- Scope: extend production launch-gate ingest probe with connector-profile-driven external channel fallback verification for Telegram/Slack/Discord.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 09:18 -> 2026-03-01 09:21.
- Changes:
  - Updated `scripts/release/production-launch-gate.mjs`:
    - ingest probe now resolves configured connector profiles for `telegram/slack/discord` (when present),
    - for each configured channel profile, gate sends signed ingest event without explicit `externalSessionId` and verifies persisted session external id fallback (`telegram_chat:*`, `slack_channel:*`, `discord_channel:*`),
    - added summary check `ingestExternalChannelFallback` and detailed `externalChannelFallback` block in `production-agent-gateway-ingest-probe.json`,
    - when no configured external channel profiles are present, check is explicit `skipped=true` with reason.
  - Updated release docs:
    - `docs/ops/release-checklist.md`
    - `docs/ops/release-runbook.md`
- Verification:
  - `node --check scripts/release/production-launch-gate.mjs`: pass.
  - `npm run release:launch:gate:dispatch` with strict matrix inputs:
    - `RELEASE_RUNTIME_DRAFT_ID=3fefc86d-eb94-42f2-8c97-8b57eff8944e`
    - `RELEASE_REQUIRE_SKILL_MARKERS=true`
    - `RELEASE_REQUIRE_NATURAL_CRON_WINDOW=true`
  - Workflow result: run `#20` (id `22540366264`) `success`.
  - Workflow URL: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/22540366264`
  - Launch gate summary check:
    - `ingestExternalChannelFallback.pass=true`
    - `ingestExternalChannelFallback.skipped=true`
    - `configuredChannels=[]`
- Incidents:
  - none.
- Follow-ups:
  - configure at least one production connector profile for `telegram/slack/discord` to move check from `skipped` to active channel verification.

### 2026-03-01 - post-release health run #18 (id 22540039019)

- Source workflow run: #18 (https://github.com/Web-pixel-creator/SocialProject/actions/runs/22540039019).
- Overall health: pass.
- Required jobs: 1/1 passed.
- Required artifacts: 9/9 present.
- Failed jobs total: 0.
- Smoke summary: pass=true totalSteps=19 failedSteps=0.
- Report artifact: `artifacts/release/post-release-health-run-22540039019.json`.

### 2026-03-01 - release health report workflow profiles (CI + launch-gate)

- Scope: extend post-release health reporting to support both `CI` and `Production Launch Gate` workflow-dispatch runs with profile-specific required job/artifact gates.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 08:37 -> 2026-03-01 08:43.
- Changes:
  - Updated `scripts/release/post-release-health-report.mjs`:
    - added workflow profile support (`ci`, `launch-gate`) with profile-aware required jobs/artifacts,
    - added CLI options `--workflow-file` and `--profile`,
    - added workflow metadata (`file`, `profile`) to JSON/text summary output,
    - launch-gate profile now validates `Production Launch Gate` job + 9 launch artifacts and reads local smoke summary from `artifacts/release/smoke-results-production-postdeploy.json`.
  - Added npm shortcuts:
    - `npm run release:health:report:launch-gate`
    - `npm run release:health:report:launch-gate:json`
  - Updated ops docs:
    - `docs/ops/release-checklist.md`
    - `docs/ops/release-runbook.md`
- Verification:
  - `node --check scripts/release/post-release-health-report.mjs`: pass.
  - `npm run release:health:report -- --workflow-file production-launch-gate.yml --profile launch-gate --json --strict`: pass.
    - resolved run: `#18` (`22540039019`)
    - required jobs/artifacts: `1/1`, `9/9`
  - `npm run release:health:report -- --json --strict` (default CI profile): pass.
    - resolved run: `#469` (`22482957944`)
    - required jobs/artifacts: `5/5`, `5/5`
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-03-01 - launch-gate smoke required-step guardrail + strict run #18

- Scope: tighten production launch-gate by enforcing required smoke step coverage (including seeded draft detail web surface) before runtime probes.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 08:21 -> 2026-03-01 08:32.
- Changes:
  - Updated `scripts/release/production-launch-gate.mjs`:
    - added `REQUIRED_SMOKE_STEP_NAMES` guardrail (`api.health`, `api.ready`, `api.draft.create/get/list`, `api.pr.submit/decide`, `api.search`, `web.home/feed/search/draft.detail`),
    - added `smokeRequiredSteps` summary check with explicit `missing`/`failed` arrays,
    - gate now fails early if smoke summary is pass but required step coverage is incomplete.
  - Updated release ops docs:
    - `docs/ops/release-checklist.md` (strict summary confirmation now includes `smokeRequiredSteps.pass=true`),
    - `docs/ops/release-runbook.md` (documents enforced smoke required-step set).
- Verification:
  - `node --check scripts/release/production-launch-gate.mjs`: pass.
  - `npm run release:launch:gate:dispatch` with strict matrix inputs:
    - `RELEASE_RUNTIME_DRAFT_ID=3fefc86d-eb94-42f2-8c97-8b57eff8944e`
    - `RELEASE_REQUIRE_SKILL_MARKERS=true`
    - `RELEASE_REQUIRE_NATURAL_CRON_WINDOW=true`
  - Workflow result: run `#18` (id `22540039019`) `success`.
  - Workflow URL: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/22540039019`
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-03-01 - strict launch-gate refresh run #16

- Scope: refresh strict production launch-gate evidence on latest `main` after integration-path hardening and docs sync commits.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 08:16 -> 2026-03-01 08:17.
- Verification:
  - `npm run release:launch:gate:dispatch` with:
    - `RELEASE_RUNTIME_DRAFT_ID=3fefc86d-eb94-42f2-8c97-8b57eff8944e`
    - `RELEASE_REQUIRE_SKILL_MARKERS=true`
    - `RELEASE_REQUIRE_NATURAL_CRON_WINDOW=true`
  - Workflow result: run `#16` (id `22539861626`) `success`.
  - Workflow URL: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/22539861626`
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-03-01 - connector-profile strict integration path revalidation (run #15)

- Scope: make connector-profile strict enforcement testable in live route path (runtime-cached profile map + strict-mode integration scenario), then re-run strict production launch-gate matrix on latest head.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 08:02 -> 2026-03-01 08:07.
- Changes:
  - Updated `apps/api/src/routes/agentGateway.ts`:
    - connector profiles now resolve via runtime-cached map (`resolveConnectorProfileMap()`),
    - strict enforcement toggle is evaluated at request time (`isConnectorProfileEnforcementEnabled()`),
    - keeps startup validation semantics while allowing controlled runtime profile updates.
  - Added strict conflict integration scenario in `apps/api/src/__tests__/api.integration.spec.ts`:
    - when strict mode is enabled and connector payload diverges from profile constraints, ingest returns `409 AGENT_GATEWAY_INGEST_CONNECTOR_PROFILE_CONFLICT`.
- Verification:
  - `npm run test -- --runInBand apps/api/src/__tests__/agent-gateway-ingest-connector-profile.unit.spec.ts apps/api/src/__tests__/agent-gateway-ingest-connector-envelope.unit.spec.ts`: pass (`13/13`).
  - `npm run ultracite:check`: pass.
  - `docker compose up -d postgres redis`: pass (both containers healthy).
  - `npm run test -- --runInBand apps/api/src/__tests__/api.integration.spec.ts -t "agent gateway adapter ingest endpoint enforces connector profile conflicts in strict mode"`: pass.
  - `npm run release:launch:gate:dispatch` with strict matrix inputs (`runtime_draft_id` + `require_skill_markers=true` + `require_natural_cron_window=true`): pass.
  - Workflow result: run `#15` (id `22539023145`) `success` on head `7f09bf1`.
  - Workflow URL: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/22539023145`
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-03-01 - connector profile strict mode + launch-gate run #14

- Scope: enforce optional strict connector-profile policy at ingest runtime and re-validate full strict production launch-gate matrix on latest `main`.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 07:38 -> 2026-03-01 07:53.
- Changes:
  - Added `AGENT_GATEWAY_INGEST_ENFORCE_CONNECTOR_PROFILE` env flag (default `false`).
  - Added profile conflict resolver `collectConnectorProfileConflicts(...)` and ingest guard:
    - when strict mode is enabled, profile/body conflicts now return `409 AGENT_GATEWAY_INGEST_CONNECTOR_PROFILE_CONFLICT`.
  - Extended admin connector-profile snapshot with `defaults.enforceProfile`.
  - Updated runbook/roadmap docs for strict connector profile mode.
- Verification:
  - `npm run test -- --runInBand apps/api/src/__tests__/agent-gateway-ingest-connector-profile.unit.spec.ts apps/api/src/__tests__/agent-gateway-ingest-connector-envelope.unit.spec.ts apps/api/src/__tests__/agent-skills.unit.spec.ts`: pass (`19/19`).
  - `npm run ultracite:check`: pass.
  - `npm run release:launch:gate:dispatch` with:
    - `RELEASE_RUNTIME_DRAFT_ID=3fefc86d-eb94-42f2-8c97-8b57eff8944e`
    - `RELEASE_REQUIRE_SKILL_MARKERS=true`
    - `RELEASE_REQUIRE_NATURAL_CRON_WINDOW=true`
  - Workflow result: run `#14` (id `22538929205`) `success` on head `949e1d2`.
  - Workflow URL: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/22538929205`
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-03-01 - launch-gate strict matrix stabilization (runtime draft + cron + skills)

- Scope: close strict launch-gate matrix by validating combined flags and hardening workflow-dispatch reliability.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 07:21 -> 2026-03-01 07:36.
- Changes:
  - fixed dispatch run discovery to ignore baseline runs and always wait for newly created workflow run (`fix(release): harden launch-dispatch run discovery`, `68b0fc3`).
  - added strict guardrail: `require_skill_markers=true` now requires explicit runtime draft id in gate script, dispatch helper, and workflow validation (`fix(release): require explicit runtime draft for skill markers`, `15cfc5a`).
- Verification:
  - run `#11` (id `22538508894`): pass (strict baseline)  
    https://github.com/Web-pixel-creator/SocialProject/actions/runs/22538508894
  - run `#12` (id `22538528611`): pass (`require_natural_cron_window=true`)  
    https://github.com/Web-pixel-creator/SocialProject/actions/runs/22538528611
  - run `#13` (id `22538669836`): pass (`runtime_draft_id=3fefc86d-eb94-42f2-8c97-8b57eff8944e`, `require_skill_markers=true`, `require_natural_cron_window=true`)  
    https://github.com/Web-pixel-creator/SocialProject/actions/runs/22538669836
  - run `#10` (id `22538448853`) intentionally captured failure root-cause before guardrail (`Runtime probe failed` because `require_skill_markers=true` was used without explicit runtime draft id).
- Incidents:
  - none.
- Follow-ups:
  - keep using explicit `runtime_draft_id` for all skill-marker strict runs.

### 2026-03-01 - production launch verification refresh (strict)

- Scope: refresh strict production verification after CI launch-gate unblocking and confirm cron/backup evidence remains valid.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 06:39 -> 2026-03-01 06:41.
- Verification:
  - `npm run release:launch:gate:production:json`: pass (`status=pass`, all checks pass).
  - Refreshed artifacts:
    - `artifacts/release/production-launch-gate-summary.json`
    - `artifacts/release/production-launch-gate-health-summary.json`
    - `artifacts/release/production-admin-health-summary.json`
    - `artifacts/release/production-runtime-orchestration-probe.json`
    - `artifacts/release/production-agent-gateway-adapter-matrix-probe.json`
    - `artifacts/release/production-agent-gateway-ingest-probe.json`
    - `artifacts/release/production-agent-gateway-telemetry.json`
    - `artifacts/release/production-agent-gateway-adapters.json`
  - Health snapshot confirms production checks: `health=true`, `ready=true`, `telemetryNonEmpty=true`, `expectedCronJobsPresent=true`.
  - Jobs snapshot confirms expected cron set present with 5 rows (`budgets_reset`, `glowup_reel`, `autopsy_report`, `retention_cleanup`, `embedding_backfill`).
  - Backup/restore requirement remains satisfied from latest drill artifacts:
    - `artifacts/release/backup-restore-checkpoint.json` (`restoreListValidated=true`)
    - `artifacts/release/restore-drill-summary.json` (`restoreDrillPassed=true`)
- Incidents:
  - none.
- Follow-ups:
  - rotate/revoke all exposed temporary tokens and keep only current secrets in Railway/GitHub.

### 2026-03-01 - post-release health run #469 (id 22482957944)

- Source workflow run: #469 (https://github.com/Web-pixel-creator/SocialProject/actions/runs/22482957944).
- Overall health: pass.
- Required jobs: 5/5 passed.
- Required artifacts: 5/5 present.
- Failed jobs total: 0.
- Smoke summary: pass=true totalSteps=19 failedSteps=0.
- Report artifact: `artifacts/release/post-release-health-run-22482957944.json`.

### 2026-03-01 - launch-gate CI fallback from Railway token to RELEASE context

- Scope: unblock production launch-gate workflow_dispatch when Railway API token linkage fails in CI (`railway link unauthorized`).
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 06:25 -> 2026-03-01 06:40.
- Changes:
  - Updated `.github/workflows/production-launch-gate.yml`:
    - removed mandatory `railway link` step from CI path,
    - now validates `RELEASE_API_BASE_URL`, `RELEASE_WEB_BASE_URL`, `RELEASE_ADMIN_API_TOKEN`, `RELEASE_CSRF_TOKEN`, `RELEASE_AGENT_GATEWAY_WEBHOOK_SECRET`,
    - runs gate with `--skip-railway-gate --api-base-url ... --web-base-url ...`.
  - Updated `scripts/release/production-launch-gate.mjs`:
    - supports env fallback for API/Web base URLs and API secrets via `RELEASE_*`,
    - keeps Railway variable lookup as fallback when `RELEASE_*` values are absent.
  - Updated release docs/checklist for the new CI context requirements.
- Verification:
  - Repository context updated via `gh`:
    - variables: `RELEASE_API_BASE_URL`, `RELEASE_WEB_BASE_URL`
    - secrets: `RELEASE_ADMIN_API_TOKEN`, `RELEASE_CSRF_TOKEN`, `RELEASE_AGENT_GATEWAY_WEBHOOK_SECRET`
  - `npm run release:launch:gate:dispatch`: pass (run `#4`, id `22537713929`)
  - Workflow URL: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/22537713929`
- Incidents:
  - none.
- Follow-ups:
  - keep Railway token path as optional strict infra gate and rotate leaked/invalid tokens.

### 2026-03-01 - dispatch token fallback + Railway secret compatibility

- Scope: harden local workflow dispatch auth and align production launch-gate CI with `RAILWAY_API_TOKEN` as primary secret.
- Release commander: Codex automation.
- Window (UTC): 2026-03-01 00:00 -> 2026-03-01 00:10.
- Changes:
  - Updated `scripts/release/dispatch-production-launch-gate.mjs`:
    - token resolution order is now `-Token/--token` -> `GITHUB_TOKEN/GH_TOKEN` -> `gh auth token`,
    - added `--help` usage output and auth fallback messaging when an earlier token source fails.
  - Updated `scripts/release/dispatch-staging-smoke.mjs` with the same token resolution order and CLI token options.
  - Updated `.github/workflows/production-launch-gate.yml` to map `RAILWAY_API_TOKEN: ${{ secrets.RAILWAY_API_TOKEN || secrets.RAILWAY_TOKEN }}` and keep `RAILWAY_TOKEN` as compatibility alias.
  - Updated release docs (`release-runbook.md`, `release-checklist.md`) with new token flow and Railway secret guidance.
- Verification:
  - `node --check scripts/release/dispatch-production-launch-gate.mjs`: pass.
  - `node --check scripts/release/dispatch-staging-smoke.mjs`: pass.
  - `npm run ci:workflow:inline-node-check`: pass.
- Incidents:
  - none.
- Follow-ups:
  - rotate leaked PATs (`GitHub` + `Railway`) and update local/repo secrets.

### 2026-02-28 - production launch-gate workflow automation

- Scope: add CI workflow_dispatch automation for the production launch gate command.
- Release commander: Codex automation.
- Window (UTC): 2026-02-28 18:42 -> 2026-02-28 18:46.
- Changes:
  - Added workflow: `.github/workflows/production-launch-gate.yml`.
  - Workflow runs `scripts/release/production-launch-gate.mjs` in strict mode, supports optional `runtime_draft_id` and `require_skill_markers` inputs, and uploads launch-gate artifacts.
  - Added Railway context validation (`RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`) and explicit Railway link step before gate execution.
  - Updated release checklist/runbook to include workflow dispatch path.
- Verification:
  - Local workflow policy check passed (`npm run ci:workflow:inline-node-check`).
  - Regression check of strict skills gate after workflow/update changes passed:
    - `npm run release:launch:gate:production:skills:json -- --runtime-draft-id 3fefc86d-eb94-42f2-8c97-8b57eff8944e`.
- Incidents:
  - none.
- Follow-ups:
  - configure repo secrets/vars if missing: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`.

### 2026-02-28 - launch-gate workflow terminal dispatch helper

- Scope: add one-command terminal helper to dispatch and optionally wait for the `Production Launch Gate` workflow run.
- Release commander: Codex automation.
- Window (UTC): 2026-02-28 18:47 -> 2026-02-28 18:50.
- Changes:
  - Added script: `scripts/release/dispatch-production-launch-gate.mjs`.
  - Added npm alias: `npm run release:launch:gate:dispatch`.
  - Supports optional inputs via env:
    - `RELEASE_RUNTIME_DRAFT_ID`
    - `RELEASE_REQUIRE_SKILL_MARKERS=true`
    - optional wait controls (`RELEASE_WAIT_FOR_COMPLETION`, `RELEASE_WAIT_TIMEOUT_MS`, `RELEASE_WAIT_POLL_MS`)
- Verification:
  - Local syntax check: `node --check scripts/release/dispatch-production-launch-gate.mjs`.
  - Runtime dispatch validation requires GitHub tokened environment (`GITHUB_TOKEN`/`GH_TOKEN`) and was not executed in current shell.
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-02-28 - launch-gate skills command alias

- Scope: add dedicated npm aliases for strict launch gate with required skills-runtime prompt markers.
- Release commander: Codex automation.
- Window (UTC): 2026-02-28 18:39 -> 2026-02-28 18:40.
- Changes:
  - Added:
    - `npm run release:launch:gate:production:skills`
    - `npm run release:launch:gate:production:skills:json`
  - Updated release checklist with the optional strict skills-runtime variant.
- Verification:
  - `npm run release:launch:gate:production:skills:json -- --runtime-draft-id 3fefc86d-eb94-42f2-8c97-8b57eff8944e`: pass.
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-02-28 - launch-gate automation hardening (transient deploy + matrix retry)

- Scope: improve robustness of the new one-command production launch gate after observing transient deploy and matrix-channel flakiness.
- Release commander: Codex automation.
- Window (UTC): 2026-02-28 18:17 -> 2026-02-28 18:33.
- Changes:
  - Updated `scripts/release/production-launch-gate.mjs` to:
    - handle non-zero strict gate runs during transient `BUILDING/DEPLOYING/INITIALIZING` states by parsing JSON output and retrying until convergence window closes,
    - use canonical deep-sort payload signing and send required ingest signature headers (`x-gateway-signature`, `x-gateway-timestamp`),
    - add adapter-matrix retry loop (up to 3 attempts per channel) with error capture in matrix artifact.
- Verification:
  - `npm run release:launch:gate:production:json -- --runtime-draft-id 3fefc86d-eb94-42f2-8c97-8b57eff8944e --require-skill-markers`: pass.
  - Summary artifact: `artifacts/release/production-launch-gate-summary.json` (`status=pass`).
  - Runtime probe confirms skill markers path (`require-skill-markers`) in production flow.
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-02-28 - production launch-gate automation command

- Scope: codify final post-deploy production launch gate into a single repeatable command.
- Release commander: Codex automation.
- Window (UTC): 2026-02-28 18:10 -> 2026-02-28 18:16.
- Implementation:
  - Added `scripts/release/production-launch-gate.mjs` to execute strict Railway gate, production smoke, launch health snapshot, runtime probe, adapter matrix probe, signed ingest probe, and telemetry/admin summary refresh.
  - Added npm commands:
    - `npm run release:launch:gate:production`
    - `npm run release:launch:gate:production:json`
  - Updated runbooks/checklists to include the one-command gate in post-release verification.
- Verification:
  - `npm run release:launch:gate:production:json`: pass.
  - Summary artifact: `artifacts/release/production-launch-gate-summary.json` (`status=pass`).
  - Generated artifacts include:
    - `artifacts/release/railway-gate-strict.json`
    - `artifacts/release/smoke-results-production-postdeploy.json`
    - `artifacts/release/production-launch-gate-health-summary.json`
    - `artifacts/release/production-runtime-orchestration-probe.json`
    - `artifacts/release/production-agent-gateway-adapter-matrix-probe.json`
    - `artifacts/release/production-agent-gateway-ingest-probe.json`
    - `artifacts/release/production-agent-gateway-telemetry.json`
    - `artifacts/release/production-agent-gateway-adapters.json`
    - `artifacts/release/production-admin-health-summary.json`
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-02-28 - production post-deploy launch-gate verification

- Scope: final production launch-gate verification after deployment convergence (strict infra gate + smoke + health/SLO + runtime/connector probes).
- Release commander: Codex automation.
- Window (UTC): 2026-02-28 17:51 -> 2026-02-28 18:01.
- Production checks and outcomes:
  - Railway strict production gate: pass (`node scripts/release/railway-production-gate.mjs --require-api-service --strict --json`), with `SocialProject` recovered from transient `BUILDING/DEPLOYING` to `SUCCESS`; API service health (`/health`, `/ready`) stayed `200`.
  - Post-deploy production smoke: pass (`npm run release:smoke`) against dedicated API + web origins (`api-production-7540.up.railway.app`, `socialproject-production.up.railway.app`), `19/19` steps green (`artifacts/release/smoke-results-production-postdeploy.json`).
  - Launch health/SLO checkpoint: pass (`artifacts/release/production-launch-gate-health-summary.json`) including `health=ok`, `ready=ok`, runtime healthy, stale sessions below threshold, telemetry non-empty, and expected cron jobs present + successful.
  - Runtime orchestration probe: pass (`POST /api/admin/agent-gateway/orchestrate`, channel `release_runtime_probe`) with 3-step chain `critic->maker->judge`, session persisted, and prompt markers present (`Skill capsule`, `Role skill`, `Role persona`).
  - Adapter matrix probe: pass across `web`, `live_session`, `release_runtime_probe` (`201` each, 3 steps each); adapter usage remains non-empty for `web`, `live_session`, `external_webhook`.
  - Signed connector ingest probe: pass (`POST /api/agent-gateway/adapters/ingest`, connector `launch_probe`, `201 applied=true`) with connector telemetry/adapters snapshots remaining non-empty.
  - Backup/restore launch requirement remains satisfied from latest drill (`2026-02-27`): backup checkpoint and restore drill both pass.
- Evidence:
  - `artifacts/release/railway-gate-strict.json` (refreshed)
  - `artifacts/release/smoke-results-production-postdeploy.json` (new)
  - `artifacts/release/production-launch-gate-health-summary.json` (new)
  - `artifacts/release/production-runtime-orchestration-probe.json` (refreshed)
  - `artifacts/release/production-agent-gateway-adapter-matrix-probe.json` (refreshed)
  - `artifacts/release/production-agent-gateway-ingest-probe.json` (refreshed)
  - `artifacts/release/production-agent-gateway-telemetry.json` (refreshed)
  - `artifacts/release/production-agent-gateway-adapters.json` (refreshed)
  - `artifacts/release/production-admin-health-summary.json` (refreshed)
  - `artifacts/release/backup-restore-checkpoint.json`
  - `artifacts/release/restore-drill-summary.json`
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-02-28 - production runtime/connector parity checkpoint

- Scope: close remaining runtime/adapter parity evidence on live production traffic.
- Release commander: Codex automation.
- Window (UTC): 2026-02-28 17:02 -> 2026-02-28 17:37.
- Production checks and outcomes:
  - `GET /api/admin/ai-runtime/health`: pass (`summary.health=ok`, `rolesBlocked=0`, `providersCoolingDown=0`).
  - `POST /api/admin/ai-runtime/dry-run`: pass (`failed=false`, selected provider `claude-4`).
  - `POST /api/admin/agent-gateway/orchestrate` (channel `release_runtime_probe`): pass (`201`, 3-step `critic->maker->judge`, session persisted/events closed, `sessionId=ags-99789664ba3a4e42bb627775`).
  - Adapter matrix probe (`web`, `live_session`, `release_runtime_probe`): pass (`201` for all 3 channels), with `/api/admin/agent-gateway/adapters?hours=24` showing all adapters non-empty (`web=5`, `live_session=5`, `external_webhook=25`).
  - Signed connector ingest refresh (`POST /api/agent-gateway/adapters/ingest`, connector `launch_probe`): pass (`201`), and `ingestConnectorsTotal=1` on both telemetry/adapters endpoints for the last 24h window.
  - Skills-runtime live signal: seeded production-safe smoke studio profile (`Smoke Author 2b0566`) and reran orchestration probe; prompt now includes `Skill capsule`, `Role skill`, and `Role persona` markers, with loaded skill counts (`global=1`, `critic=1`, `maker=1`).
  - Railway infra cleanup: deleted archived `s3mock` service via Railway GraphQL `serviceDelete(id, environmentId)` mutation; subsequent `railway status --json` confirms `s3mock` absent from both `serviceInstances` and project `services` list.
  - Legacy storage cleanup: deleted `minio` and `s3` services via Railway GraphQL `serviceDelete(id, environmentId)`; `railway status --json` confirms both absent from project services/environment instances.
  - Volume cleanup: deleted detached legacy volumes `minio-volume` and `s3-volume` via Railway GraphQL `volumeDelete(volumeId)`; follow-up `railway status --json` confirms both IDs absent from environment volume instances.
  - Post-cleanup gate: pass (`node scripts/release/railway-production-gate.mjs --json --require-api-service`) with zero failures/warnings; `/`, `/feed`, `/health`, `/ready` remain `200`.
  - Post-cleanup runtime checks: refreshed admin health summary remains stable (`health=ok`, `rolesBlocked=0`, gateway telemetry non-empty, natural cron complete).
- Evidence:
  - `artifacts/release/railway-service-delete-s3mock.json` (new)
  - `artifacts/release/railway-service-status-summary.json` (refreshed, no `s3mock`)
  - `artifacts/release/railway-service-delete-legacy-storage.json` (refreshed, includes service + volume deletion confirmation)
  - `artifacts/release/railway-gate-strict.json` (refreshed, post-cleanup pass)
  - `artifacts/release/production-skill-profile-seed.json` (new)
  - `artifacts/release/production-runtime-orchestration-probe.json`
  - `artifacts/release/production-agent-gateway-adapter-matrix-probe.json`
  - `artifacts/release/production-agent-gateway-ingest-probe.json` (refreshed)
  - `artifacts/release/production-agent-gateway-adapters.json` (refreshed)
  - `artifacts/release/production-agent-gateway-telemetry.json` (refreshed)
  - `artifacts/release/production-admin-health-summary.json` (refreshed)
- Incidents:
  - none.
- Follow-ups:
  - none.

### 2026-02-27 - post-release health run #469 (id 22482957944)

- Source workflow run: #469 (https://github.com/Web-pixel-creator/SocialProject/actions/runs/22482957944).
- Overall health: pass.
- Required jobs: 5/5 passed.
- Required artifacts: 5/5 present.
- Failed jobs total: 0.
- Smoke summary: pass=true totalSteps=19 failedSteps=0.
- Report artifact: `artifacts/release/post-release-health-run-22482957944.json`.

### 2026-02-27 - production launch hardening checkpoint

- Scope: close remaining production launch evidence for jobs/runtime telemetry and observability wiring.
- Release commander: Codex automation.
- Window (UTC): 2026-02-27 11:49 -> 2026-02-27 11:55.
- Production checks and outcomes:
  - `GET /api/admin/jobs/metrics?hours=24`: initially non-empty via manual probe (`manual_cleanup`, `totalRuns=1`, `lastStatus=success`).
  - Natural cron execution confirmed on `2026-02-28` (UTC): `budgets_reset` (`00:00`), `glowup_reel` (`00:05`), `autopsy_report` (`00:10`), `retention_cleanup` (`00:15`), `embedding_backfill` (`00:20`) all `success`.
  - `POST /api/agent-gateway/adapters/ingest` (signed probe): pass (`201`), with connector/adapters telemetry populated.
  - `GET /api/admin/agent-gateway/telemetry?hours=24&limit=200&connector=launch_probe`: pass, sessions/events/adapters/ingest totals > 0.
  - `GET /api/admin/agent-gateway/adapters?hours=24&connector=launch_probe`: pass, adapter usage shows `external_webhook` success activity.
  - Railway cleanup: experimental `minio`/`s3` services confirmed stopped (`activeDeployments=0`); `s3mock` remains stopped/crashed (non-serving).
  - Railway CLI limitation: service deletion is not exposed in current CLI commands; final removal of `s3mock` requires Railway dashboard/API.
- Evidence:
  - `artifacts/release/production-jobs-metrics-summary.json`
  - `artifacts/release/production-admin-health-summary.json` (updated `naturalCronComplete=true`)
  - `artifacts/release/production-agent-gateway-ingest-probe.json`
  - `artifacts/release/railway-service-status-summary.json`
  - `docs/ops/observability-runbook.md` (dashboard links replaced with concrete production URLs)
- Incidents:
  - none.
- Follow-ups:
  - Closed in 2026-02-28 runtime/connector parity checkpoint (`s3mock` deleted).

### 2026-02-09 - post-release health run #284 (id 21815945348)

- Source workflow run: #284 (https://github.com/Web-pixel-creator/SocialProject/actions/runs/21815945348).
- Overall health: pass.
- Required jobs: 5/5 passed.
- Failed jobs total: 0.
- Smoke summary: pass=true totalSteps=19 failedSteps=0.
- Report artifact: `artifacts/release/post-release-health-run-21815945348.json`.

### 2026-02-09 - v0.1.40

- Scope: recover CI release workflow after a blocking Ultracite full-scope failure by applying test-suite formatting and strict image-mock compliance, then re-running release dispatch gates end-to-end.
- Release commander: Codex automation.
- Window (UTC): 2026-02-09 03:57 -> 2026-02-09 06:59.
- Release artifact:
  - Git tag: `v0.1.40` (prepared in this release step).
- Dry-run:
  - Local rehearsal: pass (`npm run release:dry-run:local`), summary `pass=true`, `totalSteps=19`, `failedSteps=0`.
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#278`, fallback mode) on head `ab8870e`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#281`) on head `f1abaa7`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21814461498`, artifact id `5427704062`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21814461498/smoke-results.json`
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21815398448`, artifact id `5428034061`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21815398448/smoke-results.json`
    - Snapshot: `pass=true`, `totalSteps=19`, `failedSteps=0`.
  - Release smoke preflight summary artifact/link:
    - fallback mode: `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21814461498`, artifact id `5427703838`)
    - Snapshot: `status=skipped`, `mode=fallback-local-stack`, missing URL inputs.
    - URL-input mode (helper command): `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21815398448`, artifact id `5428033977`)
    - URL-input snapshot: `status=pass`, `mode=url-input`, `attempts=2`, `durationMs=2510`, first success latency `1142ms` for API/Web.
  - Retry schema gate summary artifact/link:
    - `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21814461498`, artifact id `5427701951`).
    - URL-input mode (helper command): `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21815398448`, artifact id `5428036393`).
  - Standalone preflight schema summary artifact/link:
    - `release-smoke-preflight-schema-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21814461498`, artifact id `5427702054`).
    - URL-input mode (helper command): `release-smoke-preflight-schema-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21815398448`, artifact id `5428036493`).
  - Tunnel helper local summary evidence:
    - `artifacts/release/tunnel-dispatch-retry-summary.json` -> `status=pass`, `totalAttempts=1`, `runId=21815398448`.
    - `artifacts/release/tunnel-preflight-summary.json` -> `status=pass`, `mode=url-input`, `attempts=2`, `durationMs=2510`.
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21814461498 21815398448`
    - JSON report: `artifacts/release/smoke-diff-21814461498-vs-21815398448.json`
    - Result: pass -> pass, failed steps `0 -> 0`, no pass regressions.
- Local perf gate snapshot:
  - `artifacts/perf/pre-release-results.json`
  - `api.p95Ms=26.68`, `web.p95Ms=10.75`, `failedRequests=0`, `pass=true`.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - tests (local): pass (`npm run test -- --runInBand`, `80/80` suites, `484/484` tests).
  - security gate (local): pass (`npm run security:check`).
  - CI workflow_dispatch corroboration (run `#278`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` completed with `success`; `ultracite_pr` and `release_tunnel_helper_ci_rehearsal` were `skipped` by design.
  - CI workflow_dispatch corroboration (run `#281`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` completed with `success`; `ultracite_pr` and `release_tunnel_helper_ci_rehearsal` were `skipped` by design.
- Rollout result: release prepared and tagged.
- Incidents:
  - Prior workflow run `#276` (`https://github.com/Web-pixel-creator/SocialProject/actions/runs/21814288733`) failed only on `Ultracite Full Scope (blocking)` while smoke/perf/security/test passed; resolved by formatting and mock-compliance updates in commit `ab8870e`.
- Follow-ups:
  - Rotate the exposed PAT used for manual dispatch and update local secret handling to avoid token leakage in chat/history.

### 2026-02-08 - v0.1.39

- Scope: add in-CI tunnel helper rehearsal path for retry-diagnostics artifact evidence, then fix helper process shutdown to prevent CI hangs in dispatch-only mode.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 15:39 -> 2026-02-08 16:20.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.39`
- Dry-run:
  - Local rehearsal: pass (`release:smoke:dispatch` dispatch-only verification with `RELEASE_WAIT_FOR_COMPLETION=false`, completed in ~2.66s).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#261`, fallback mode) on head `f812f9f`.
  - In-CI tunnel helper rehearsal: pass (`Release Tunnel Helper Rehearsal`, run `#261`, job `62897161416`), including successful completion of step `Run tunnel helper rehearsal` (`16:16:31Z -> 16:17:04Z`).
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21801289842`, artifact id `5423361728`)
    - Local downloaded and extracted copy: `artifacts/release/run261/ci-run-21801289842/smoke-results.json`
    - Snapshot: `pass=true`, `totalSteps=19`, `failedSteps=0`.
  - Release smoke preflight summary artifact/link:
    - fallback mode: `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21801289842`, artifact id `5423361673`)
    - Snapshot: `status=skipped`, `mode=fallback-local-stack`, missing URL inputs.
  - Retry schema gate summary artifact/link:
    - `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21801289842`, artifact id `5423360325`).
  - Standalone preflight schema summary artifact/link:
    - `release-smoke-preflight-schema-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21801289842`, artifact id `5423360378`).
  - In-CI tunnel helper artifact evidence:
    - `release-smoke-tunnel-dispatch-retry-summary` (artifact id `5423363042`)
    - `release-smoke-tunnel-preflight-summary` (artifact id `5423363119`)
    - `release-smoke-tunnel-retry-failures`: not emitted in successful no-retry path (`if-no-files-found: ignore`).
    - Local extracted helper snapshots:
      - `artifacts/release/run261-helper/ci-run-21801289842/tunnel-dispatch-retry-summary.json` -> `status=pass`, `totalAttempts=1`.
      - `artifacts/release/run261-helper/ci-run-21801289842/tunnel-preflight-summary.json` -> `status=pass`, `mode=url-input`, `attempts=2`, `durationMs=2084`.
- Gates:
  - CI workflow_dispatch corroboration (run `#261`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `release_tunnel_helper_ci_rehearsal`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - run `#256` (`https://github.com/Web-pixel-creator/SocialProject/actions/runs/21800771115`) entered long-running state in `Release Tunnel Helper Rehearsal`; canceled after evidence collection. Root fix: force process exit in `dispatch-staging-smoke-tunnel.mjs` after successful completion.
- Follow-ups:
  - none.

### 2026-02-08 - v0.1.38

- Scope: add dedicated CI upload step for tunnel dispatch retry summary artifact (`release-smoke-tunnel-dispatch-retry-summary`) with optional presence semantics (`if-no-files-found: ignore`).
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 14:00 -> 2026-02-08 14:19.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.38`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#243`, fallback mode) on head `11915ec`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#245`) on head `11915ec`.
  - Tunnel helper retry note:
    - Initial URL-input attempt run `#244` (`https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799456865`) ended with `release_smoke_staging` failure only and was auto-retried by helper.
    - Retry diagnostics captured:
      - `artifacts/release/retry-failures/run-244-runid-21799456865-job-62892413571-Release_Smoke_Dry-Run_staging_manual_.log`
      - `artifacts/release/retry-failures/run-244-runid-21799456865-retry-metadata.json`
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799417036`, artifact id `5422791724`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799493992`, artifact id `5422812216`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21799493992/smoke-results.json`
  - Release smoke preflight summary artifact/link:
    - fallback mode: `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799417036`, artifact id `5422791692`)
    - URL-input mode (helper command): `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799493992`, artifact id `5422812173`)
    - Fallback summary snapshot: `status=skipped`, `mode=fallback-local-stack`, missing URL inputs.
    - URL-input summary snapshot: `status=pass`, `mode=url-input`, `attempts=2`, `durationMs=1662`, first success latency `451ms` for API/Web.
  - Retry schema gate summary artifact/link:
    - fallback mode: `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799417036`, artifact id `5422790384`)
    - URL-input mode (helper command): `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799493992`, artifact id `5422813620`)
    - Gate totals: `validatedPayloads=11` (base `7`, preview strict `4`).
  - Standalone preflight schema summary artifact/link:
    - fallback mode: `release-smoke-preflight-schema-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799417036`, artifact id `5422790426`)
    - URL-input mode (helper command): `release-smoke-preflight-schema-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799493992`, artifact id `5422813696`)
    - Summary payload snapshot: `status=pass`, `validatedPayloads=3` (`fixturePayloads=2`, `runtimePayloads=1`).
  - New CI upload step evidence (`release_smoke_staging`):
    - Step `Upload tunnel dispatch retry summary` is present and completed with `success` on both run `#243` and run `#245`.
    - Artifact availability remains optional by design:
      - `release-smoke-tunnel-dispatch-retry-summary` artifact was not emitted in these runs because `artifacts/release/tunnel-dispatch-retry-summary.json` is not produced inside `release_smoke_staging` workflow context.
  - Local tunnel retry summary evidence:
    - `artifacts/release/tunnel-dispatch-retry-summary.json`
    - Snapshot: `status=pass`, `totalAttempts=2`, attempt `1` failed (`runId=21799456865`, endpoint probes returned `408/408`), retry preflight passed on attempt `2` and dispatch succeeded (`runId=21799493992`).
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21799237242 21799493992`
    - JSON report: `artifacts/release/smoke-diff-21799237242-vs-21799493992.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `5775.39ms -> 5284.70ms` (delta `-490.69ms`), no pass regressions.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - lint (local): pass (`npm run lint`).
  - CI workflow_dispatch corroboration (run `#243`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#245`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - transient URL-input smoke dry-run failure on run `#244`, auto-recovered by helper retry.
- Follow-ups:
  - Optional: add a dedicated CI path that executes `release:smoke:dispatch:tunnel` inside workflow context so `release-smoke-tunnel-dispatch-retry-summary` artifact is emitted with payload, not only as a local helper output.

### 2026-02-08 - v0.1.37

- Scope: CI test-step markdown summary for standalone preflight schema validation, plus tunnel URL-input retry hardening (adaptive backoff, retry preflight checks, machine-readable retry summary).
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 13:34 -> 2026-02-08 13:56.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.37`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#239`, fallback mode) on head `c2c5f03`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#240`) on head `c2c5f03`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799201852`, artifact id `5422727572`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799237242`, artifact id `5422734792`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21799237242/smoke-results.json`
  - Release smoke preflight summary artifact/link:
    - fallback mode: `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799201852`, artifact id `5422727527`)
    - URL-input mode (helper command): `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799237242`, artifact id `5422734744`)
    - Fallback summary snapshot: `status=skipped`, `mode=fallback-local-stack`, missing URL inputs.
    - URL-input summary snapshot: `status=pass`, `mode=url-input`, `attempts=2`, `durationMs=2169`, first success latency `771ms` for API/Web.
  - Retry schema gate summary artifact/link:
    - fallback mode: `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799201852`, artifact id `5422725055`)
    - URL-input mode (helper command): `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799237242`, artifact id `5422736182`)
    - Gate totals: `validatedPayloads=11` (base `7`, preview strict `4`).
  - Standalone preflight schema summary artifact/link:
    - fallback mode: `release-smoke-preflight-schema-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799201852`, artifact id `5422725104`)
    - URL-input mode (helper command): `release-smoke-preflight-schema-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21799237242`, artifact id `5422736280`)
    - Summary payload snapshot: `status=pass`, `validatedPayloads=3` (`fixturePayloads=2`, `runtimePayloads=1`).
  - CI step summary evidence:
    - `test` job includes `Append preflight schema summary to step summary` with `success` on both run `#239` and run `#240`.
  - Tunnel helper retry diagnostics summary:
    - Local file: `artifacts/release/tunnel-dispatch-retry-summary.json`
    - Snapshot: `status=pass`, `totalAttempts=2`, completed on first dispatch attempt (attempt `1`), adaptive retry policy persisted in payload (`baseDelayMs=5000`, `backoffFactor=1.5`, `maxDelayMs=30000`).
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21798929394 21799237242`
    - JSON report: `artifacts/release/smoke-diff-21798929394-vs-21799237242.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7814.06ms -> 5775.39ms` (delta `-2038.67ms`), no pass regressions.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - lint (local): pass (`npm run lint`).
  - CI workflow_dispatch corroboration (run `#239`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#240`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: upload `artifacts/release/tunnel-dispatch-retry-summary.json` as a dedicated CI artifact when helper output is available in CI-driven tunnel runs.

### 2026-02-08 - v0.1.36

- Scope: CI now uploads standalone preflight schema validator summary artifact (`release-smoke-preflight-schema-summary`) from `test` job.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 13:16 -> 2026-02-08 13:33.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.36`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#234`, fallback mode) on head `b134c3f`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#236`) on head `b134c3f`.
  - Tunnel helper retry note:
    - Initial URL-input attempt run `#235` (`https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798893888`) ended with `release_smoke_staging` failure only and was auto-retried by helper.
    - Retry diagnostics captured:
      - `artifacts/release/retry-failures/run-235-runid-21798893888-job-62890956779-Release_Smoke_Dry-Run_staging_manual_.log`
      - `artifacts/release/retry-failures/run-235-runid-21798893888-retry-metadata.json`
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798858735`, artifact id `5422625737`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798929394`, artifact id `5422645726`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21798929394/smoke-results.json`
  - Release smoke preflight summary artifact/link:
    - fallback mode: `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798858735`, artifact id `5422625681`)
    - URL-input mode (helper command): `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798929394`, artifact id `5422645653`)
    - Fallback summary snapshot: `status=skipped`, `mode=fallback-local-stack`, missing URL inputs.
    - URL-input summary snapshot: `status=pass`, `mode=url-input`, `attempts=4`, `durationMs=4276`, first success latency `3002ms` for API/Web.
  - Retry schema gate summary artifact/link:
    - fallback mode: `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798858735`, artifact id `5422623628`)
    - URL-input mode (helper command): `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798929394`, artifact id `5422646439`)
    - Gate totals: `validatedPayloads=11` (base `7`, preview strict `4`).
  - Standalone preflight schema summary artifact/link:
    - fallback mode: `release-smoke-preflight-schema-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798858735`, artifact id `5422623682`)
    - URL-input mode (helper command): `release-smoke-preflight-schema-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798929394`, artifact id `5422646509`)
    - Summary payload snapshot: `status=pass`, `validatedPayloads=3` (`fixturePayloads=2`, `runtimePayloads=1`).
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21798707594 21798929394`
    - JSON report: `artifacts/release/smoke-diff-21798707594-vs-21798929394.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7086.70ms -> 7814.06ms` (delta `+727.36ms`), no pass regressions.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - lint (local): pass (`npm run lint`).
  - CI workflow_dispatch corroboration (run `#234`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#236`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - transient URL-input smoke dry-run failure on run `#235`, auto-recovered by helper retry.
- Follow-ups:
  - Optional: add dedicated CI step summary annotation (`$GITHUB_STEP_SUMMARY`) for `release-smoke-preflight-schema-summary` payload totals.

### 2026-02-08 - v0.1.35

- Scope: standalone preflight-summary schema validator command + JSON mode, with release checklist coverage for optional standalone validation.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 13:00 -> 2026-02-08 13:15.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.35`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#230`, fallback mode) on head `212a12f`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#231`) on head `212a12f`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798670140`, artifact id `5422571588`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798707594`, artifact id `5422580642`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21798707594/smoke-results.json`
  - Release smoke preflight summary artifact/link:
    - fallback mode: `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798670140`, artifact id `5422571560`)
    - URL-input mode (helper command): `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798707594`, artifact id `5422580553`)
    - Fallback summary snapshot: `status=skipped`, `mode=fallback-local-stack`, missing URL inputs.
    - URL-input summary snapshot: `status=pass`, `mode=url-input`, `attempts=2`, `durationMs=2396`, first success latency `648ms` for API/Web.
  - Retry schema gate summary artifact/link:
    - fallback mode: `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798670140`, artifact id `5422570334`)
    - URL-input mode (helper command): `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798707594`, artifact id `5422581109`)
    - Gate totals: `validatedPayloads=11` (base `7`, preview strict `4`).
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21798483552 21798707594`
    - JSON report: `artifacts/release/smoke-diff-21798483552-vs-21798707594.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6918.84ms -> 7086.70ms` (delta `+167.86ms`), no pass regressions.
  - Standalone preflight schema validator:
    - `npm run release:smoke:retry:schema:preflight:check` -> pass (`3 payloads`: fixtures `2`, runtime `1`).
    - `npm run release:smoke:retry:schema:preflight:check:json` -> pass.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - lint (local): pass (`npm run lint`).
  - CI workflow_dispatch corroboration (run `#230`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#231`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: include the standalone preflight schema validator as a dedicated CI summary step/artifact, not only as a local/manual command.

### 2026-02-08 - v0.1.34

- Scope: JSON schema contract + sample fixtures for release smoke preflight summary, integrated into retry schema sync/check gates.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 12:47 -> 2026-02-08 12:56.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.34`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#226`, fallback mode) on head `62e3f8a`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#227`) on head `62e3f8a`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798444965`, artifact id `5422506357`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798483552`, artifact id `5422514889`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21798483552/smoke-results.json`
  - Release smoke preflight summary artifact/link:
    - fallback mode: `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798444965`, artifact id `5422506295`)
    - URL-input mode (helper command): `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798483552`, artifact id `5422514849`)
    - Fallback summary snapshot: `status=skipped`, `mode=fallback-local-stack`, missing URL inputs.
    - URL-input summary snapshot: `status=pass`, `mode=url-input`, `attempts=2`, `durationMs=2086`, first success latency `685ms` for API/Web.
  - Retry schema gate summary artifact/link:
    - fallback mode: `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798444965`, artifact id `5422504712`)
    - URL-input mode (helper command): `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798483552`, artifact id `5422516170`)
    - Gate totals: `validatedPayloads=11` (base `7`, preview strict `4`).
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21798232042 21798483552`
    - JSON report: `artifacts/release/smoke-diff-21798232042-vs-21798483552.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7211.74ms -> 6918.84ms` (delta `-292.90ms`), no pass regressions.
  - Schema contract coverage:
    - New schema: `docs/ops/schemas/release-smoke-preflight-summary-output.schema.json`.
    - New sample fixtures:
      - `docs/ops/schemas/samples/release-smoke-preflight-summary-output-pass.sample.json`
      - `docs/ops/schemas/samples/release-smoke-preflight-summary-output-skipped.sample.json`
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`29 checks`).
    - Schema gate validation: `npm run release:smoke:retry:schema:check` -> pass (`11 payloads`).
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`7 files`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#226`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#227`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add a standalone validator command for `release-smoke-preflight-summary` schema (mirroring preview strict validator ergonomics).

### 2026-02-08 - v0.1.33

- Scope: CI `release_smoke_staging` preflight URL summary artifact (`release-smoke-preflight-summary`) with fallback/url-input mode reporting.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 12:29 -> 2026-02-08 12:37.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.33`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#222`, fallback mode) on head `043cc44`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#223`) on head `043cc44`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798193868`, artifact id `5422434807`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798232042`, artifact id `5422443026`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21798232042/smoke-results.json`
  - Release smoke preflight summary artifact/link:
    - fallback mode: `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798193868`, artifact id `5422434750`)
    - URL-input mode (helper command): `release-smoke-preflight-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798232042`, artifact id `5422442976`)
    - Fallback summary snapshot: `status=skipped`, `mode=fallback-local-stack`, missing URL inputs.
    - URL-input summary snapshot: `status=pass`, `attempts=2`, `durationMs=2297`, first success latency `846ms` for API/Web.
  - Retry schema gate summary artifact/link:
    - fallback mode: `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798193868`, artifact id `5422433265`)
    - URL-input mode (helper command): `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798232042`, artifact id `5422443800`)
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21798024999 21798232042`
    - JSON report: `artifacts/release/smoke-diff-21798024999-vs-21798232042.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6291.96ms -> 7211.74ms` (delta `+919.78ms`), no pass regressions.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#222`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#223`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add preflight summary schema contract in `docs/ops/schemas` and include it in schema sync/check gates.

### 2026-02-08 - v0.1.32

- Scope: Tunnel preflight metrics and JSON summary reporting for `release:smoke:dispatch:tunnel`.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 12:14 -> 2026-02-08 12:21.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.32`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#218`, fallback mode) on head `4c8c33c`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#219`) on head `4c8c33c`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797986086`, artifact id `5422373264`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798024999`, artifact id `5422383050`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21798024999/smoke-results.json`
  - Retry schema gate summary artifact/link:
    - fallback mode: `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797986086`, artifact id `5422371921`)
    - URL-input mode (helper command): `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21798024999`, artifact id `5422384210`)
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21797792497 21798024999`
    - JSON report: `artifacts/release/smoke-diff-21797792497-vs-21798024999.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6737.88ms -> 6291.96ms` (delta `-445.92ms`), no pass regressions.
  - Tunnel preflight metrics evidence:
    - Success log output includes attempts and first-success latency:
      - `Tunnel preflight passed (attempts: 2, duration: 2572ms, api first success: attempt 1 / 1049ms, web first success: attempt 1 / 1049ms).`
    - JSON summary saved to: `artifacts/release/tunnel-preflight-summary.json`.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#218`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#219`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: upload `tunnel-preflight-summary.json` as a dedicated artifact in CI URL-input smoke path.

### 2026-02-08 - v0.1.31

- Scope: Tunnel preflight health checks for `release:smoke:dispatch:tunnel` to validate public API/Web URLs before URL-input CI dispatch.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 11:56 -> 2026-02-08 12:04.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.31`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#214`, fallback mode) on head `1e960c7`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#215`) on head `1e960c7`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797755456`, artifact id `5422301937`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797792497`, artifact id `5422310215`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21797792497/smoke-results.json`
  - Retry schema gate summary artifact/link:
    - fallback mode: `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797755456`, artifact id `5422301083`)
    - URL-input mode (helper command): `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797792497`, artifact id `5422311249`)
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21797614271 21797792497`
    - JSON report: `artifacts/release/smoke-diff-21797614271-vs-21797792497.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7922.67ms -> 6737.88ms` (delta `-1184.79ms`), no pass regressions.
  - Tunnel preflight validation:
    - Preflight output confirmed before dispatch:
      - `Running tunnel preflight checks (...)`
      - `Tunnel preflight passed with success streak 2/2 (...)`
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#214`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#215`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: include preflight probe metrics (attempt count and first-success latency) in tunnel helper logs.

### 2026-02-08 - v0.1.30

- Scope: CI upload of machine-readable retry schema gate summary artifact (`retry-schema-gate-summary`) from the `test` job.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 11:34 -> 2026-02-08 11:50.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.30`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#208`, fallback mode) on head `7f3c890`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#211`) on head `7f3c890`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797487528`, artifact id `5422224639`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797614271`, artifact id `5422258308`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21797614271/smoke-results.json`
  - Retry schema gate summary artifact/link:
    - fallback mode: `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797487528`, artifact id `5422223711`)
    - URL-input mode (helper command): `retry-schema-gate-summary` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797614271`, artifact id `5422259221`)
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21797331035 21797614271`
    - JSON report: `artifacts/release/smoke-diff-21797331035-vs-21797614271.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7879.31ms -> 7922.67ms` (delta `+43.36ms`), no pass regressions.
  - Retry-schema gate validation:
    - Combined strict schema gate: `npm run release:smoke:retry:schema:check` -> pass (base `4` + strict preview `4`, total `8` payloads).
    - Combined strict schema gate (JSON): `npm run release:smoke:retry:schema:check:json` -> pass.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#208`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#211`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - URL-input smoke runs `#209` (`21797521910`) and `#210` (`21797555727`) failed in `release_smoke_staging` due transient `web.home` `503`; next retry run `#211` succeeded on the same head.
- Follow-ups:
  - Optional: add tunnel health preflight in `release:smoke:dispatch:tunnel` to reduce transient 5xx retries.

### 2026-02-08 - v0.1.29

- Scope: Combined machine-readable JSON summary for retry schema gate (`base` + strict `preview`) with dedicated orchestrator command.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 11:15 -> 2026-02-08 11:27.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.29`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#204`, fallback mode) on head `e77662c`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#205`) on head `e77662c`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797293912`, artifact id `5422172567`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797331035`, artifact id `5422180166`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21797331035/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21797125039 21797331035`
    - JSON report: `artifacts/release/smoke-diff-21797125039-vs-21797331035.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6976.09ms -> 7879.31ms` (delta `+903.22ms`), no pass regressions.
  - Retry-schema gate validation:
    - Base retry schema check: `npm run release:smoke:retry:schema:base:check` -> pass (`4 payloads`).
    - Preview-selection schema check: `npm run release:smoke:retry:schema:preview:check` -> pass (`3 payloads`).
    - Strict preview-selection check: `npm run release:smoke:retry:schema:preview:check:strict` -> pass (`4 payloads`).
    - Combined schema gate: `npm run release:smoke:retry:schema:check` -> pass (base `4` + strict preview `4`, total `8` payloads).
    - Combined schema gate (JSON summary): `npm run release:smoke:retry:schema:check:json` -> pass (`2 steps`, `8 payloads`).
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`21 checks`).
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`5 files`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#204`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#205`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: export the new `release:smoke:retry:schema:check:json` payload as a CI artifact for dashboard ingestion.

### 2026-02-08 - v0.1.28

- Scope: Dedicated preview-selection schema validator with explicit `--strict` mode, integrated into the primary retry schema gate.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 11:03 -> 2026-02-08 11:11.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.28`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#200`, fallback mode) on head `d66705b`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#201`) on head `d66705b`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797088205`, artifact id `5422112171`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21797125039`, artifact id `5422120721`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21797125039/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21796945766 21797125039`
    - JSON report: `artifacts/release/smoke-diff-21796945766-vs-21797125039.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6411.23ms -> 6976.09ms` (delta `+564.86ms`), no pass regressions.
  - Strict preview-schema gate validation:
    - Base retry schema check: `npm run release:smoke:retry:schema:base:check` -> pass (`4 payloads`).
    - Preview-selection schema check: `npm run release:smoke:retry:schema:preview:check` -> pass (`3 payloads`).
    - Strict preview-selection check: `npm run release:smoke:retry:schema:preview:check:strict` -> pass (`4 payloads`).
    - Combined schema gate: `npm run release:smoke:retry:schema:check` -> pass (base + strict preview checks).
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`21 checks`).
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`5 files`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#200`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#201`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: expose `--strict` for `release:smoke:retry:schema:check` as an explicit CLI flag path (instead of composing npm scripts) for easier external orchestration.

### 2026-02-08 - v0.1.27

- Scope: Runtime schema validation for non-zero preview-selection JSON output path (unknown filters) in retry schema gate.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 10:48 -> 2026-02-08 10:57.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.27`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#196`, fallback mode) on head `cb47017`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#197`) on head `cb47017`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21796910890`, artifact id `5422061589`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21796945766`, artifact id `5422069101`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21796945766/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21796631805 21796945766`
    - JSON report: `artifacts/release/smoke-diff-21796631805-vs-21796945766.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7284.25ms -> 6411.23ms` (delta `-873.02ms`), no pass regressions.
  - Unknown-filter preview JSON contract validation:
    - Runtime unknown-filter command: `npm run release:smoke:retry:schema:samples:generate -- --preview=missing-label --json` -> non-zero exit with schema-valid JSON payload.
    - Schema gate validation: `npm run release:smoke:retry:schema:check` -> pass (`8 payloads`).
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`21 checks`).
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`5 files`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#196`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#197`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: persist runtime unknown-filter preview JSON as a checked-in redacted fixture generated from command output for regression snapshots.

### 2026-02-08 - v0.1.26

- Scope: Formal JSON schema contract for retry preview-selection output, with fixture + runtime validation coverage in schema gates.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 10:20 -> 2026-02-08 10:31.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.26`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#192`, fallback mode) on head `f1db9f2`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#193`) on head `f1db9f2`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21796596811`, artifact id `5421969184`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21796631805`, artifact id `5421977886`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21796631805/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21796347973 21796631805`
    - JSON report: `artifacts/release/smoke-diff-21796347973-vs-21796631805.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7177.13ms -> 7284.25ms` (delta `+107.12ms`), no pass regressions.
  - Preview-selection schema contract validation:
    - New schema: `docs/ops/schemas/release-retry-preview-selection-output.schema.json`.
    - New sample fixtures:
      - `docs/ops/schemas/samples/release-retry-preview-selection-output.sample.json`
      - `docs/ops/schemas/samples/release-retry-preview-selection-output-unknown.sample.json`
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`5 files`).
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`21 checks`).
    - Schema shape validation: `npm run release:smoke:retry:schema:check` -> pass (`7 payloads`, including runtime preview JSON).
    - Preview JSON summary command: `npm run release:smoke:retry:schema:samples:preview:json` -> pass.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#192`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#193`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add dedicated schema validation for non-zero preview JSON outputs (unknown filters) in `release:smoke:retry:schema:check`.

### 2026-02-08 - v0.1.25

- Scope: Compact JSON selection summaries for retry schema fixture preview flows (`--json`) for CI/dashboard ingestion.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 10:00 -> 2026-02-08 10:08.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.25`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#188`, fallback mode) on head `83f9e3a`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#189`) on head `83f9e3a`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21796309664`, artifact id `5421879189`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21796347973`, artifact id `5421888027`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21796347973/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21796184416 21796347973`
    - JSON report: `artifacts/release/smoke-diff-21796184416-vs-21796347973.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `8059.92ms -> 7177.13ms` (delta `-882.79ms`), no pass regressions.
  - Preview-selection JSON validation:
    - All fixtures summary: `npm run release:smoke:retry:schema:samples:preview:json` -> pass.
    - Targeted mixed summary: `npm run release:smoke:retry:schema:samples:generate -- --preview=cleanup-sample --preview-file=release-retry-collect-output-success.sample.json --json` -> pass.
    - Unknown filter summary: `npm run release:smoke:retry:schema:samples:generate -- --preview-file=missing.sample.json --json` -> outputs JSON summary and exits non-zero (expected).
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`3 files`).
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`13 checks`).
    - Schema shape validation: `npm run release:smoke:retry:schema:check` -> pass (`4 payloads`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#188`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#189`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: formalize preview-selection JSON output with a dedicated schema contract file in `docs/ops/schemas`.

### 2026-02-08 - v0.1.24

- Scope: Add `--preview-file=<path>` retry schema fixture filtering (repeatable, and composable with label filters).
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 09:46 -> 2026-02-08 09:55.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.24`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#184`, fallback mode) on head `c9d4faa`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#185`) on head `c9d4faa`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21796149089`, artifact id `5421834045`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21796184416`, artifact id `5421842189`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21796184416/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21796026985 21796184416`
    - JSON report: `artifacts/release/smoke-diff-21796026985-vs-21796184416.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `6962.14ms -> 8059.92ms` (delta `+1097.78ms`), no pass regressions.
  - Preview-file + schema validation:
    - File-filter command: `npm run release:smoke:retry:schema:samples:generate -- --preview-file=docs/ops/schemas/samples/release-retry-cleanup-output.sample.json --preview-file=release-retry-collect-output-success.sample.json` -> pass (`2 fixtures`).
    - Mixed filter command: `npm run release:smoke:retry:schema:samples:generate -- --preview=collect-empty-sample --preview-file=release-retry-cleanup-output.sample.json` -> pass (`2 fixtures`).
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`3 files`).
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`13 checks`).
    - Schema shape validation: `npm run release:smoke:retry:schema:check` -> pass (`4 payloads`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#184`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#185`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: emit a compact fixture selection summary (`matched`, `deduped`, `unknown`) in JSON mode for CI dashboards.

### 2026-02-08 - v0.1.23

- Scope: Multi-filter retry schema sample preview support with repeatable `--preview=<label>` arguments.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 09:33 -> 2026-02-08 09:43.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.23`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#180`, fallback mode) on head `4f87aa7`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#181`) on head `4f87aa7`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795993819`, artifact id `5421786475`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21796026985`, artifact id `5421794208`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21796026985/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21795856536 21796026985`
    - JSON report: `artifacts/release/smoke-diff-21795856536-vs-21796026985.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `5972.66ms -> 6962.14ms` (delta `+989.48ms`), no pass regressions.
  - Multi-filter preview + schema validation:
    - Filtered preview command: `npm run release:smoke:retry:schema:samples:generate -- --preview=cleanup-sample --preview=collect-success-sample` -> pass (`2 fixtures`).
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`3 files`).
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`13 checks`).
    - Schema shape validation: `npm run release:smoke:retry:schema:check` -> pass (`4 payloads`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#180`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#181`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add `--preview-file=<path>` shorthand to target fixtures directly without label normalization rules.

### 2026-02-08 - v0.1.22

- Scope: Targeted retry schema sample preview filter via `--preview=<label>` for focused fixture inspection in release/debug workflows.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 09:18 -> 2026-02-08 09:30.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.22`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#176`, fallback mode) on head `caacacc`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#177`) on head `caacacc`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795819224`, artifact id `5421739389`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795856536`, artifact id `5421746509`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21795856536/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21795678345 21795856536`
    - JSON report: `artifacts/release/smoke-diff-21795678345-vs-21795856536.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7566.57ms -> 5972.66ms` (delta `-1593.91ms`), no pass regressions.
  - Targeted preview + schema validation:
    - Filtered preview command: `npm run release:smoke:retry:schema:samples:generate -- --preview=collect-success-sample` -> pass (`1 fixture`).
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`3 files`).
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`13 checks`).
    - Schema shape validation: `npm run release:smoke:retry:schema:check` -> pass (`4 payloads`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#176`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#177`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: support multiple `--preview=<label>` filters in one command for side-by-side targeted payload review.

### 2026-02-08 - v0.1.21

- Scope: Retry schema sample preview command for non-destructive payload review in release/debug workflows.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 09:08 -> 2026-02-08 09:16.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.21`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#172`, fallback mode) on head `142e346`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#173`) on head `142e346`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795635661`, artifact id `5421683136`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795678345`, artifact id `5421693849`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21795678345/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21795473488 21795678345`
    - JSON report: `artifacts/release/smoke-diff-21795473488-vs-21795678345.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `7416.91ms -> 7566.57ms` (delta `+149.66ms`), no pass regressions.
  - Preview + schema validation:
    - Preview command: `npm run release:smoke:retry:schema:samples:preview` (prints all generated sample payloads to stdout without file writes).
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`3 files`).
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`13 checks`).
    - Schema shape validation: `npm run release:smoke:retry:schema:check` -> pass (`4 payloads`).
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#172`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#173`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: add `--preview=<label>` filter for targeted fixture preview when only one payload is under review.

### 2026-02-08 - v0.1.20

- Scope: Canonical mock builders for retry diagnostics sample payloads, with fixtures derived from a single builder module.
- Release commander: Codex automation.
- Window (UTC): 2026-02-08 08:53 -> 2026-02-08 09:01.
- Release artifact:
  - GitHub Release: `https://github.com/Web-pixel-creator/SocialProject/releases/tag/v0.1.20`
- Dry-run:
  - Local rehearsal: pass (URL-input helper starts local API/Web and tunnels automatically).
  - Staging smoke: pass (`release_smoke_staging`, workflow run `#169`, fallback mode) on head `40807a8`.
  - Staging smoke (URL-input mode via helper command): pass (`release:smoke:dispatch:tunnel`, workflow run `#170`) on head `40807a8`.
  - Smoke report artifact/link:
    - fallback mode: `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795437838`, artifact id `5421625627`)
    - URL-input mode (helper command): `release-smoke-report` (run: `https://github.com/Web-pixel-creator/SocialProject/actions/runs/21795473488`, artifact id `5421634192`)
    - Local downloaded and extracted copy: `artifacts/release/ci-run-21795473488/smoke-results.json`
  - Smoke diff evidence:
    - Command: `npm run release:smoke:diff -- 21795342886 21795473488`
    - JSON report: `artifacts/release/smoke-diff-21795342886-vs-21795473488.json`
    - Result: pass -> pass, failed steps `0 -> 0`, total duration `8140.58ms -> 7416.91ms` (delta `-723.67ms`), no pass regressions.
  - Canonical fixture-builder validation:
    - Fixture drift check: `npm run release:smoke:retry:schema:samples:check` -> pass (`3 files`).
    - Schema sync check: `npm run release:smoke:retry:schema:sync:check` -> pass (`13 checks`).
    - Schema shape validation: `npm run release:smoke:retry:schema:check` -> pass (`4 payloads`).
    - Fixture payload source centralized in `scripts/release/retry-schema-mock-builders.mjs`.
- Gates:
  - ultracite (local): pass (`npm run ultracite:check`).
  - CI workflow_dispatch corroboration (run `#169`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
  - CI workflow_dispatch corroboration (run `#170`): `ultracite`, `test`, `security_hygiene`, `release_smoke_staging`, `performance_gate` all completed with `success` (PR-only gate `ultracite_pr` skipped by design).
- Rollout result: release prepared and tagged.
- Incidents:
  - none.
- Follow-ups:
  - Optional: expose a tiny preview command that prints current generated fixture payloads to stdout for quick diff/debug in reviews.

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
