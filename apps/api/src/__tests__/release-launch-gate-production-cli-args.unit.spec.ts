import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

const runProductionLaunchGate = (
  args: string[],
  envOverrides: Record<string, string> = {},
) =>
  spawnSync(
    process.execPath,
    ['scripts/release/production-launch-gate.mjs', ...args],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...envOverrides,
      },
    },
  );

describe('production launch-gate cli argument validation', () => {
  test('prints usage on --help and exits zero', () => {
    const result = runProductionLaunchGate(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Usage: node scripts/release/production-launch-gate.mjs',
    );
    expect(result.stderr).toBe('');
  });

  test('prints usage on -h and exits zero', () => {
    const result = runProductionLaunchGate(['-h']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Usage: node scripts/release/production-launch-gate.mjs',
    );
    expect(result.stderr).toBe('');
  });

  test('fails fast on unknown argument', () => {
    const result = runProductionLaunchGate(['--unknown-flag']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown argument: --unknown-flag');
  });

  test('fails fast when --environment value is missing', () => {
    const result = runProductionLaunchGate(['--environment']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing value for --environment');
  });

  test('accepts inline value flags in help mode', () => {
    const result = runProductionLaunchGate([
      '--environment=production',
      '--gate-wait-ms=120000',
      '--help',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'Usage: node scripts/release/production-launch-gate.mjs',
    );
  });

  test('fails fast when required-external-channels value is missing', () => {
    const result = runProductionLaunchGate(['--required-external-channels']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --required-external-channels',
    );
  });

  test('fails fast when failure-detail-max-items value is missing', () => {
    const result = runProductionLaunchGate(['--failure-detail-max-items']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --failure-detail-max-items',
    );
  });

  test('fails fast when smoke-timeout-retries value is missing', () => {
    const result = runProductionLaunchGate(['--smoke-timeout-retries']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --smoke-timeout-retries',
    );
  });

  test('fails fast when smoke-timeout-retry-delay-ms value is missing', () => {
    const result = runProductionLaunchGate(['--smoke-timeout-retry-delay-ms']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --smoke-timeout-retry-delay-ms',
    );
  });

  test('fails fast when inline required-external-channels value is empty', () => {
    const result = runProductionLaunchGate(['--required-external-channels=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --required-external-channels=',
    );
  });

  test('fails fast when inline failure-detail-max-items value is empty', () => {
    const result = runProductionLaunchGate(['--failure-detail-max-items=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --failure-detail-max-items=',
    );
  });

  test('fails fast when inline smoke-timeout-retries value is empty', () => {
    const result = runProductionLaunchGate(['--smoke-timeout-retries=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --smoke-timeout-retries=',
    );
  });

  test('fails fast when inline --environment value is empty', () => {
    const result = runProductionLaunchGate(['--environment=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing value for --environment=');
  });

  test('fails fast on unsupported required-external-channels values', () => {
    const result = runProductionLaunchGate([
      '--required-external-channels',
      'telegram,teams',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('contains unsupported channels');
    expect(result.stderr).toContain('telegram, slack, discord');
  });

  test('fails fast when --gate-wait-ms is not a positive integer', () => {
    const result = runProductionLaunchGate(['--gate-wait-ms', 'abc']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid value for --gate-wait-ms: abc');
  });

  test('fails fast when --gate-wait-ms contains non-numeric suffix', () => {
    const result = runProductionLaunchGate(['--gate-wait-ms', '12abc']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid value for --gate-wait-ms: 12abc');
  });

  test('fails fast when inline --gate-wait-ms is not a positive integer', () => {
    const result = runProductionLaunchGate(['--gate-wait-ms=abc']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid value for --gate-wait-ms=: abc');
  });

  test('fails fast when inline --gate-poll-interval-ms contains decimal', () => {
    const result = runProductionLaunchGate(['--gate-poll-interval-ms=3.5']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for --gate-poll-interval-ms=: 3.5',
    );
  });

  test('fails fast when --gate-poll-interval-ms is zero', () => {
    const result = runProductionLaunchGate(['--gate-poll-interval-ms', '0']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for --gate-poll-interval-ms: 0',
    );
  });

  test('fails fast when --failure-detail-max-items is zero', () => {
    const result = runProductionLaunchGate(['--failure-detail-max-items', '0']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for --failure-detail-max-items: 0',
    );
  });

  test('accepts zero smoke-timeout-retries in help mode', () => {
    const result = runProductionLaunchGate([
      '--smoke-timeout-retries=0',
      '--help',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'Usage: node scripts/release/production-launch-gate.mjs',
    );
  });

  test('fails fast when --smoke-timeout-retries is not a non-negative integer', () => {
    const result = runProductionLaunchGate(['--smoke-timeout-retries', '-1']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for --smoke-timeout-retries: -1',
    );
  });

  test('fails fast on unsupported RELEASE_REQUIRED_EXTERNAL_CHANNELS env value', () => {
    const result = runProductionLaunchGate([], {
      RELEASE_REQUIRED_EXTERNAL_CHANNELS: 'telegram,teams',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('contains unsupported channels');
    expect(result.stderr).toContain('telegram, slack, discord');
  });

  test('fails fast on invalid RELEASE_REQUIRE_NATURAL_CRON_WINDOW env value', () => {
    const result = runProductionLaunchGate([], {
      RELEASE_REQUIRE_NATURAL_CRON_WINDOW: 'maybe',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_REQUIRE_NATURAL_CRON_WINDOW: maybe',
    );
  });

  test('fails fast on invalid RELEASE_FAILURE_DETAIL_MAX_ITEMS env value', () => {
    const result = runProductionLaunchGate([], {
      RELEASE_FAILURE_DETAIL_MAX_ITEMS: 'abc',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_FAILURE_DETAIL_MAX_ITEMS: abc',
    );
  });

  test('fails fast on invalid RELEASE_SMOKE_TIMEOUT_RETRIES env value', () => {
    const result = runProductionLaunchGate([], {
      RELEASE_SMOKE_TIMEOUT_RETRIES: '1.5',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_SMOKE_TIMEOUT_RETRIES: 1.5',
    );
  });

  test('fails fast on invalid RELEASE_SMOKE_TIMEOUT_RETRY_DELAY_MS env value', () => {
    const result = runProductionLaunchGate([], {
      RELEASE_SMOKE_TIMEOUT_RETRY_DELAY_MS: '0',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_SMOKE_TIMEOUT_RETRY_DELAY_MS: 0',
    );
  });
});
