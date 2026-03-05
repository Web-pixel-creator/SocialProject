import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

describe('production launch-gate runbook snippet parity check script', () => {
  test('passes against current fixture/runbook pair', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/release/verify-production-launch-gate-runbook-example.mjs'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Runbook snippet parity check passed:');
  });
});
