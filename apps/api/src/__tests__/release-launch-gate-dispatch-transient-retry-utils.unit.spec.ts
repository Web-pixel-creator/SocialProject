import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const moduleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'dispatch-production-launch-gate-transient-retry-utils.mjs',
);

const runTransientRetryDecision = (input: unknown) => {
  const script = `
    import {
      buildGitHubApiRetryDecision,
      computeGitHubApiRetryDelayMs,
      isTransientGitHubApiPollingErrorMessage,
      parseGitHubApiStatusCodeFromErrorMessage,
    } from ${JSON.stringify(moduleHref)};
    const input = ${JSON.stringify(input)};
    try {
      const statusCode = parseGitHubApiStatusCodeFromErrorMessage(input.errorMessage);
      const transient = isTransientGitHubApiPollingErrorMessage(input.errorMessage);
      const decision = buildGitHubApiRetryDecision(input.decisionInput);
      const retryDelayMs = computeGitHubApiRetryDelayMs(input.delayInput || {});
      process.stdout.write(
        JSON.stringify({
          ok: true,
          result: { decision, retryDelayMs, statusCode, transient },
          error: '',
        }),
      );
    } catch (error) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      process.exitCode = 1;
    }
  `;
  return runInlineModuleScript<{
    decision: {
      attemptsRemaining: number;
      shouldRetry: boolean;
      statusCode: number | null;
      transient: boolean;
    };
    retryDelayMs: number;
    statusCode: number | null;
    transient: boolean;
  }>(script);
};

describe('launch-gate dispatch transient retry utils', () => {
  test('marks GitHub 502 errors as transient and retryable while attempts remain', () => {
    const errorMessage =
      'GitHub API GET https://api.github.com/repos/example/actions/runs/1 failed: 502 Bad Gateway.';
    const result = runTransientRetryDecision({
      decisionInput: {
        attempt: 1,
        errorMessage,
        maxAttempts: 3,
      },
      delayInput: {
        attempt: 1,
        backoffFactor: 2,
        baseDelayMs: 2000,
        jitterPercent: 0,
        maxDelayMs: 10_000,
      },
      errorMessage,
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result.statusCode).toBe(502);
    expect(result.payload.result.transient).toBe(true);
    expect(result.payload.result.retryDelayMs).toBe(2000);
    expect(result.payload.result.decision).toEqual({
      attemptsRemaining: 2,
      shouldRetry: true,
      statusCode: 502,
      transient: true,
    });
  });

  test('marks network pre-response errors as transient', () => {
    const errorMessage =
      'GitHub API GET https://api.github.com/repos/example/actions/runs/1 request failed before response: connect ETIMEDOUT';
    const result = runTransientRetryDecision({
      decisionInput: {
        attempt: 1,
        errorMessage,
        maxAttempts: 2,
      },
      delayInput: {
        attempt: 2,
        backoffFactor: 2,
        baseDelayMs: 2000,
        jitterPercent: 0,
        maxDelayMs: 10_000,
      },
      errorMessage,
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result.statusCode).toBeNull();
    expect(result.payload.result.transient).toBe(true);
    expect(result.payload.result.retryDelayMs).toBe(4000);
    expect(result.payload.result.decision).toEqual({
      attemptsRemaining: 1,
      shouldRetry: true,
      statusCode: null,
      transient: true,
    });
  });

  test('does not retry non-transient client errors', () => {
    const errorMessage =
      'GitHub API GET https://api.github.com/repos/example/actions/runs/1 failed: 422 Unprocessable Entity.';
    const result = runTransientRetryDecision({
      decisionInput: {
        attempt: 1,
        errorMessage,
        maxAttempts: 3,
      },
      delayInput: {
        attempt: 2,
        backoffFactor: 3,
        baseDelayMs: 2000,
        jitterPercent: 0,
        maxDelayMs: 5000,
      },
      errorMessage,
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result.statusCode).toBe(422);
    expect(result.payload.result.transient).toBe(false);
    expect(result.payload.result.retryDelayMs).toBe(5000);
    expect(result.payload.result.decision).toEqual({
      attemptsRemaining: 2,
      shouldRetry: false,
      statusCode: 422,
      transient: false,
    });
  });

  test('stops retrying when max attempts are exhausted', () => {
    const errorMessage =
      'GitHub API GET https://api.github.com/repos/example/actions/runs/1 failed: 503 Service Unavailable.';
    const result = runTransientRetryDecision({
      decisionInput: {
        attempt: 3,
        errorMessage,
        maxAttempts: 3,
      },
      delayInput: {
        attempt: 3,
        backoffFactor: 2,
        baseDelayMs: 2000,
        jitterPercent: 25,
        maxDelayMs: 10_000,
        randomValue: 0,
      },
      errorMessage,
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result.decision).toEqual({
      attemptsRemaining: 0,
      shouldRetry: false,
      statusCode: 503,
      transient: true,
    });
    expect(result.payload.result.retryDelayMs).toBe(6000);
  });
});
