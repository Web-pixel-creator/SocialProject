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

  test('fails fast when required-external-channels value is missing', () => {
    const result = runProductionLaunchGate(['--required-external-channels']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --required-external-channels',
    );
  });

  test('fails fast when inline required-external-channels value is empty', () => {
    const result = runProductionLaunchGate(['--required-external-channels=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --required-external-channels=',
    );
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

  test('fails fast on unsupported RELEASE_REQUIRED_EXTERNAL_CHANNELS env value', () => {
    const result = runProductionLaunchGate([], {
      RELEASE_REQUIRED_EXTERNAL_CHANNELS: 'telegram,teams',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('contains unsupported channels');
    expect(result.stderr).toContain('telegram, slack, discord');
  });
});
