import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

const runDispatchScript = (args: string[]) =>
  spawnSync(
    process.execPath,
    ['scripts/release/dispatch-production-launch-gate.mjs', ...args],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        RELEASE_WAIT_FOR_COMPLETION: 'false',
      },
    },
  );

describe('launch-gate dispatch helper cli argument validation', () => {
  test('prints usage on --help and exits zero', () => {
    const result = runDispatchScript(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
    expect(result.stderr).toBe('');
  });

  test('prints usage on -h and exits zero', () => {
    const result = runDispatchScript(['-h']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
    expect(result.stderr).toBe('');
  });

  test('fails fast when artifact-link-names value is missing', () => {
    const result = runDispatchScript(['--artifact-link-names']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing value for --artifact-link-names');
    expect(result.stderr).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
  });

  test('fails fast on unknown argument', () => {
    const result = runDispatchScript(['--unknown-flag']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown argument: --unknown-flag');
  });

  test('rejects placeholder token values', () => {
    const result = runDispatchScript(['--token', '<YOUR_TOKEN>']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Token argument looks like a placeholder');
  });

  test('rejects placeholder token across token flag aliases', () => {
    const variants = [
      ['--Token', '<YOUR_TOKEN>'],
      ['-Token', '<YOUR_TOKEN>'],
      ['--Token=<YOUR_TOKEN>'],
      ['--token=<YOUR_TOKEN>'],
      ['-token=<YOUR_TOKEN>'],
    ];
    for (const variant of variants) {
      const result = runDispatchScript(variant);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'Token argument looks like a placeholder',
      );
    }
  });

  test('requires allow-failure-drill when webhook override is provided', () => {
    const result = runDispatchScript([
      '--webhook-secret-override',
      'dummy-secret',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'requires RELEASE_ALLOW_FAILURE_DRILL=true or --allow-failure-drill',
    );
  });

  test('fails fast on invalid artifact-link names subset', () => {
    const result = runDispatchScript([
      '--artifact-link-names',
      'production-launch-gate-summary,not-supported',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('contains unsupported artifact names');
  });
});
