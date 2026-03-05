import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

const runProductionLaunchGate = (args: string[]) =>
  spawnSync(
    process.execPath,
    ['scripts/release/production-launch-gate.mjs', ...args],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );

describe('production launch-gate help output', () => {
  test('matches golden snapshot for --help', () => {
    const result = runProductionLaunchGate(['--help']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      '--required-external-channels <telegram,slack,discord|all>',
    );
    expect(result.stdout).toContain(
      '--failure-detail-max-items <n> (default: 10)',
    );
    expect(result.stdout).toContain('--smoke-timeout-retries <n> (default: 1)');
    expect(result.stdout).toContain(
      '--smoke-timeout-retry-delay-ms <ms> (default: 5000)',
    );
    expect(result.stdout).toContain('--require-natural-cron-window');
    expect(result.stdout.replace(/\r\n/g, '\n')).toMatchInlineSnapshot(`
"Usage: node scripts/release/production-launch-gate.mjs [options]

Options:
  --strict --json
  --environment <name> --web-service <name> --api-service <name>
  --web-base-url <url> --api-base-url <url>
  --runtime-draft-id <uuid> --runtime-channel <name>
  --skip-railway-gate --skip-smoke --skip-runtime-probes --skip-ingest-probe
  --failure-detail-max-items <n> (default: 10)
  --smoke-timeout-retries <n> (default: 1)
  --smoke-timeout-retry-delay-ms <ms> (default: 5000)
  --required-external-channels <telegram,slack,discord|all>
  --require-skill-markers
  --require-natural-cron-window
"
`);
  });
});
