import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

const runDispatchScript = (
  args: string[],
  envOverrides: Record<string, string> = {},
) =>
  spawnSync(
    process.execPath,
    ['scripts/release/dispatch-staging-smoke.mjs', ...args],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        RELEASE_WAIT_FOR_COMPLETION: 'false',
        ...envOverrides,
      },
    },
  );

describe('staging smoke dispatch helper cli argument validation', () => {
  test('prints usage on --help and exits zero', () => {
    const result = runDispatchScript(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: npm run release:smoke:dispatch');
    expect(result.stderr).toBe('');
  });

  test('prints usage on -h and exits zero', () => {
    const result = runDispatchScript(['-h']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: npm run release:smoke:dispatch');
    expect(result.stderr).toBe('');
  });

  test('fails fast on unknown argument', () => {
    const result = runDispatchScript(['--unknown-flag']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown argument: --unknown-flag');
    expect(result.stderr).toContain('Usage: npm run release:smoke:dispatch');
  });

  test('rejects placeholder token values across aliases', () => {
    const variants = [
      ['--token', '<YOUR_TOKEN>'],
      ['--Token', '<YOUR_TOKEN>'],
      ['-Token', '<YOUR_TOKEN>'],
      ['--token=<YOUR_TOKEN>'],
      ['--Token=<YOUR_TOKEN>'],
      ['-token=<YOUR_TOKEN>'],
      ['-Token=<YOUR_TOKEN>'],
    ];
    for (const variant of variants) {
      const result = runDispatchScript(variant);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'Token argument looks like a placeholder',
      );
    }
  });

  test('fails fast when inline token alias value is empty', () => {
    const variants = ['--token=', '--Token=', '-token=', '-Token='];
    for (const variant of variants) {
      const result = runDispatchScript([variant]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Missing value for ${variant}`);
      expect(result.stderr).toContain('Usage: npm run release:smoke:dispatch');
    }
  });

  test('fails fast when env token contains non-ascii characters', () => {
    const result = runDispatchScript([], {
      GH_TOKEN: 'С‚РѕРєРµРЅ',
      GITHUB_TOKEN: '',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Token from 'env:GH_TOKEN'");
  });
});
