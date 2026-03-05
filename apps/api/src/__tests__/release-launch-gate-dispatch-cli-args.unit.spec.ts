import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

const runDispatchScript = (
  args: string[],
  envOverrides: Record<string, string> = {},
) =>
  spawnSync(
    process.execPath,
    ['scripts/release/dispatch-production-launch-gate.mjs', ...args],
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

  test('fails fast when failure-summary-max-jobs value is missing', () => {
    const result = runDispatchScript(['--failure-summary-max-jobs']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --failure-summary-max-jobs',
    );
    expect(result.stderr).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
  });

  test('fails fast when smoke-timeout-retries value is missing', () => {
    const result = runDispatchScript(['--smoke-timeout-retries']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --smoke-timeout-retries',
    );
    expect(result.stderr).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
  });

  test('fails fast when smoke-timeout-retry-delay-ms value is missing', () => {
    const result = runDispatchScript(['--smoke-timeout-retry-delay-ms']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --smoke-timeout-retry-delay-ms',
    );
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

  test('fails fast when inline token alias value is empty', () => {
    const variants = ['--token=', '--Token=', '-token=', '-Token='];
    for (const variant of variants) {
      const result = runDispatchScript([variant]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Missing value for ${variant}`);
      expect(result.stderr).toContain(
        'Usage: npm run release:launch:gate:dispatch',
      );
    }
  });

  test('fails fast when inline required-external-channels value is empty', () => {
    const result = runDispatchScript(['--required-external-channels=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --required-external-channels=',
    );
    expect(result.stderr).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
  });

  test('fails fast when inline failure-summary-max-jobs value is empty', () => {
    const result = runDispatchScript(['--failure-summary-max-jobs=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --failure-summary-max-jobs=',
    );
    expect(result.stderr).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
  });

  test('fails fast when inline smoke-timeout-retries value is empty', () => {
    const result = runDispatchScript(['--smoke-timeout-retries=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --smoke-timeout-retries=',
    );
    expect(result.stderr).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
  });

  test('fails fast when inline smoke-timeout-retry-delay-ms value is empty', () => {
    const result = runDispatchScript(['--smoke-timeout-retry-delay-ms=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --smoke-timeout-retry-delay-ms=',
    );
    expect(result.stderr).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
  });

  test('fails fast when required-external-channels value is missing', () => {
    const result = runDispatchScript(['--required-external-channels']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --required-external-channels',
    );
    expect(result.stderr).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
  });

  test('fails fast on unsupported required-external-channels values', () => {
    const result = runDispatchScript([
      '--required-external-channels',
      'telegram,teams',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('contains unsupported channels');
    expect(result.stderr).toContain('telegram, slack, discord');
  });

  test('fails fast when inline runtime-draft-id value is empty', () => {
    const result = runDispatchScript(['--runtime-draft-id=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing value for --runtime-draft-id=');
    expect(result.stderr).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
  });

  test('fails fast when inline webhook-secret-override value is empty', () => {
    const result = runDispatchScript(['--webhook-secret-override=']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing value for --webhook-secret-override=',
    );
    expect(result.stderr).toContain(
      'Usage: npm run release:launch:gate:dispatch',
    );
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

  test('fails fast on invalid RELEASE_WAIT_TIMEOUT_MS env value', () => {
    const result = runDispatchScript([], {
      RELEASE_WAIT_TIMEOUT_MS: 'abc',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_WAIT_TIMEOUT_MS: abc',
    );
  });

  test('fails fast on invalid RELEASE_WAIT_POLL_MS env value', () => {
    const result = runDispatchScript([], {
      RELEASE_WAIT_POLL_MS: '0',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_WAIT_POLL_MS: 0',
    );
  });

  test('fails fast on invalid RELEASE_GITHUB_API_TRANSIENT_RETRY_MAX_ATTEMPTS env value', () => {
    const result = runDispatchScript([], {
      RELEASE_GITHUB_API_TRANSIENT_RETRY_MAX_ATTEMPTS: 'abc',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_GITHUB_API_TRANSIENT_RETRY_MAX_ATTEMPTS: abc',
    );
  });

  test('fails fast on invalid RELEASE_GITHUB_API_TRANSIENT_RETRY_DELAY_MS env value', () => {
    const result = runDispatchScript([], {
      RELEASE_GITHUB_API_TRANSIENT_RETRY_DELAY_MS: '0',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_GITHUB_API_TRANSIENT_RETRY_DELAY_MS: 0',
    );
  });

  test('fails fast on invalid RELEASE_GITHUB_API_TRANSIENT_RETRY_BACKOFF_FACTOR env value', () => {
    const result = runDispatchScript([], {
      RELEASE_GITHUB_API_TRANSIENT_RETRY_BACKOFF_FACTOR: '0',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_GITHUB_API_TRANSIENT_RETRY_BACKOFF_FACTOR: 0',
    );
  });

  test('fails fast on invalid RELEASE_GITHUB_API_TRANSIENT_RETRY_MAX_DELAY_MS env value', () => {
    const result = runDispatchScript([], {
      RELEASE_GITHUB_API_TRANSIENT_RETRY_MAX_DELAY_MS: 'abc',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_GITHUB_API_TRANSIENT_RETRY_MAX_DELAY_MS: abc',
    );
  });

  test('fails fast on invalid RELEASE_GITHUB_API_TRANSIENT_RETRY_JITTER_PERCENT env value', () => {
    const result = runDispatchScript([], {
      RELEASE_GITHUB_API_TRANSIENT_RETRY_JITTER_PERCENT: '101',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_GITHUB_API_TRANSIENT_RETRY_JITTER_PERCENT: 101',
    );
  });

  test('fails fast on invalid RELEASE_FAILURE_SUMMARY_MAX_JOBS env value', () => {
    const result = runDispatchScript([], {
      RELEASE_FAILURE_SUMMARY_MAX_JOBS: 'abc',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_FAILURE_SUMMARY_MAX_JOBS: abc',
    );
  });

  test('fails fast on invalid RELEASE_SMOKE_TIMEOUT_RETRIES env value', () => {
    const result = runDispatchScript([], {
      RELEASE_SMOKE_TIMEOUT_RETRIES: '1.5',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_SMOKE_TIMEOUT_RETRIES: 1.5',
    );
  });

  test('fails fast on invalid RELEASE_SMOKE_TIMEOUT_RETRY_DELAY_MS env value', () => {
    const result = runDispatchScript([], {
      RELEASE_SMOKE_TIMEOUT_RETRY_DELAY_MS: '0',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_SMOKE_TIMEOUT_RETRY_DELAY_MS: 0',
    );
  });

  test('fails fast on invalid --failure-summary-max-jobs cli value', () => {
    const result = runDispatchScript(['--failure-summary-max-jobs', '0']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for --failure-summary-max-jobs: 0',
    );
  });

  test('fails fast on invalid --smoke-timeout-retries cli value', () => {
    const result = runDispatchScript(['--smoke-timeout-retries', '-1']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for --smoke-timeout-retries: -1',
    );
  });

  test('fails fast on invalid --smoke-timeout-retry-delay-ms cli value', () => {
    const result = runDispatchScript(['--smoke-timeout-retry-delay-ms', '0']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for --smoke-timeout-retry-delay-ms: 0',
    );
  });

  test('fails fast on invalid RELEASE_WAIT_FOR_COMPLETION env value', () => {
    const result = runDispatchScript([], {
      RELEASE_WAIT_FOR_COMPLETION: 'maybe',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Invalid value for RELEASE_WAIT_FOR_COMPLETION: maybe',
    );
  });

  test('fails fast on invalid dispatch boolean env toggles', () => {
    const invalidToggleEnvs = [
      'RELEASE_REQUIRE_SKILL_MARKERS',
      'RELEASE_REQUIRE_NATURAL_CRON_WINDOW',
      'RELEASE_REQUIRE_INLINE_HEALTH_ARTIFACTS',
      'RELEASE_ALLOW_FAILURE_DRILL',
    ];

    for (const envName of invalidToggleEnvs) {
      const result = runDispatchScript([], {
        [envName]: 'maybe',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Invalid value for ${envName}: maybe`);
    }
  });

  test('fails fast on invalid dispatch artifact-link boolean env toggles', () => {
    const invalidArtifactToggleEnvs = [
      'RELEASE_PRINT_ARTIFACT_LINKS',
      'RELEASE_NO_STEP_SUMMARY_LINK',
    ];

    for (const envName of invalidArtifactToggleEnvs) {
      const result = runDispatchScript([], {
        [envName]: 'maybe',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Invalid value for ${envName}: maybe`);
    }
  });
});
