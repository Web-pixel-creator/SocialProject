import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'github-api-request-with-transient-retry.mjs',
);

const runHelperScenario = (scriptBody: string) =>
  runInlineModuleScript<{
    calls: number;
    error: string;
    ok: boolean;
    result: unknown;
    warnings?: string[];
  }>(`
    import {
      githubApiRequest,
      githubApiRequestWithTransientRetry,
      normalizeGitHubApiTransientRetryConfig,
    } from ${JSON.stringify(helperModuleHref)};
    const state = { calls: 0 };
    const warnings = [];
    const emit = (payload) => {
      process.stdout.write(JSON.stringify(payload));
    };
    try {
      ${scriptBody}
    } catch (error) {
      emit({
        ok: false,
        result: null,
        calls: state.calls,
        warnings,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
  `);

describe('release github api request with transient retry helper', () => {
  test('treats allowed status code as null response', () => {
    const result = runHelperScenario(`
      globalThis.fetch = async () => {
        state.calls += 1;
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => '{"message":"Not Found"}',
        };
      };
      const value = await githubApiRequest({
        allowStatusCodes: [404],
        method: 'GET',
        token: 'token',
        url: 'https://example.invalid/not-found',
      });
      emit({ ok: true, result: value, calls: state.calls, warnings, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.calls).toBe(1);
    expect(result.payload.result).toBeNull();
  });

  test('retries transient GET failures and succeeds', () => {
    const result = runHelperScenario(`
      globalThis.fetch = async () => {
        state.calls += 1;
        if (state.calls === 1) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            text: async () => '{"message":"temporary outage"}',
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => JSON.stringify({ ok: true, calls: state.calls }),
        };
      };
      const value = await githubApiRequestWithTransientRetry({
        method: 'GET',
        retryConfig: {
          backoffFactor: 1,
          delayMs: 1,
          jitterPercent: 0,
          maxAttempts: 2,
          maxDelayMs: 1,
        },
        token: 'token',
        url: 'https://example.invalid/transient',
        writeRetryWarning: (message) => warnings.push(message),
      });
      emit({ ok: true, result: value, calls: state.calls, warnings, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.calls).toBe(2);
    expect(result.payload.warnings).toHaveLength(1);
    expect(result.payload.result).toEqual({ ok: true, calls: 2 });
  });

  test('does not retry transient failures for non-GET methods', () => {
    const result = runHelperScenario(`
      globalThis.fetch = async () => {
        state.calls += 1;
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          text: async () => '{"message":"temporary outage"}',
        };
      };
      await githubApiRequestWithTransientRetry({
        body: { hello: 'world' },
        method: 'POST',
        retryConfig: {
          backoffFactor: 1,
          delayMs: 1,
          jitterPercent: 0,
          maxAttempts: 3,
          maxDelayMs: 1,
        },
        token: 'token',
        url: 'https://example.invalid/transient',
        writeRetryWarning: (message) => warnings.push(message),
      });
      emit({ ok: true, result: null, calls: state.calls, warnings, error: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.calls).toBe(1);
    expect(result.payload.warnings).toHaveLength(0);
    expect(result.payload.error).toContain('failed: 503');
  });

  test('normalizes retry config bounds safely', () => {
    const result = runHelperScenario(`
      const value = normalizeGitHubApiTransientRetryConfig({
        backoffFactor: 0,
        delayMs: 0,
        jitterPercent: 999,
        maxAttempts: 0,
        maxDelayMs: 0,
      });
      emit({ ok: true, result: value, calls: state.calls, warnings, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual({
      backoffFactor: 1,
      delayMs: 1,
      jitterPercent: 100,
      maxAttempts: 1,
      maxDelayMs: 1,
    });
  });
});
