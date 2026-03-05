import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

const runHelp = () =>
  spawnSync(
    process.execPath,
    ['scripts/release/dispatch-production-launch-gate.mjs', '--help'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );

const normalizeLineEndings = (value: string) => value.replace(/\r\n/gu, '\n');

describe('launch-gate dispatch helper help output', () => {
  test('matches golden usage snapshots by section', () => {
    const result = runHelp();

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const normalized = normalizeLineEndings(result.stdout).trimEnd();
    const sections = normalized.split('\n\n');

    expect(sections).toHaveLength(3);
    expect(sections[0]).toMatchInlineSnapshot(
      `"Usage: npm run release:launch:gate:dispatch -- [options]"`,
    );
    expect(sections[1]).toContain('--artifact-link-names <csv|all>');
    expect(sections[1]).toContain('--no-step-summary-link');
    expect(sections[1]).toMatchInlineSnapshot(`
"Options:
  --token|-Token <value>                 GitHub token override
  --runtime-draft-id <uuid>              workflow input runtime_draft_id
  --require-skill-markers                workflow input require_skill_markers=true
  --require-natural-cron-window          workflow input require_natural_cron_window=true
  --required-external-channels <csv|all> workflow input required_external_channels
  --require-inline-health-artifacts      workflow input require_inline_health_artifacts=true
  --smoke-timeout-retries <n>            workflow input smoke_timeout_retries (0 disables timeout-only retry)
  --smoke-timeout-retry-delay-ms <ms>    workflow input smoke_timeout_retry_delay_ms
  --allow-failure-drill                  workflow input allow_failure_drill=true
  --webhook-secret-override <value>      workflow input webhook_secret_override (requires allow_failure_drill)
  --failure-summary-max-jobs <n>         cap failed-job diagnostics entries (default: 5)
  --print-artifact-links                 print links for additional high-signal artifacts after success
  --artifact-link-names <csv|all>        override artifact link set (allowed: production-launch-gate-step-summary, production-launch-gate-summary, post-release-health-inline-artifacts-schema-check, post-release-health-inline-artifacts-summary, or all)
  --no-step-summary-link                 suppress default step-summary artifact link output
  --help|-h"
`);
    expect(sections[2]).toMatchInlineSnapshot(`
"Token resolution order:
1) --token / -Token argument
2) GITHUB_TOKEN / GH_TOKEN
3) gh auth token"
`);
  });
});
