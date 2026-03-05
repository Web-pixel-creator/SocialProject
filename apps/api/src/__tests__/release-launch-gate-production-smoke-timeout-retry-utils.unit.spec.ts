import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const moduleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'production-launch-gate-smoke-timeout-retry-utils.mjs',
);

const runSmokeRetryDecision = (input: unknown) => {
  const script = `
    import {
      buildSmokeTimeoutRetryDecision,
      isSmokeTimeoutErrorMessage,
      isSmokeTimeoutOnlyFailureReport,
    } from ${JSON.stringify(moduleHref)};
    const input = ${JSON.stringify(input)};
    try {
      const timeoutMessage = isSmokeTimeoutErrorMessage(input.message);
      const timeoutOnly = isSmokeTimeoutOnlyFailureReport(input.smokeReport);
      const decision = buildSmokeTimeoutRetryDecision(input.decisionInput);
      process.stdout.write(
        JSON.stringify({
          ok: true,
          result: { decision, timeoutMessage, timeoutOnly },
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
      retriesRemaining: number;
      shouldRetry: boolean;
      timeoutOnly: boolean;
    };
    timeoutMessage: boolean;
    timeoutOnly: boolean;
  }>(script);
};

describe('production launch-gate smoke timeout retry utils', () => {
  test('detects timeout-only smoke failure and allows bounded retry', () => {
    const smokeReport = {
      summary: {
        pass: false,
      },
      steps: [
        {
          error: 'This operation was aborted',
          name: 'api.health',
          pass: false,
          status: null,
        },
      ],
    };
    const result = runSmokeRetryDecision({
      decisionInput: {
        attempt: 1,
        maxRetries: 1,
        smokeReport,
      },
      message: 'The operation timed out.',
      smokeReport,
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result.timeoutMessage).toBe(true);
    expect(result.payload.result.timeoutOnly).toBe(true);
    expect(result.payload.result.decision).toEqual({
      retriesRemaining: 1,
      shouldRetry: true,
      timeoutOnly: true,
    });
  });

  test('does not retry when timeout retries are exhausted', () => {
    const smokeReport = {
      summary: {
        pass: false,
      },
      steps: [
        {
          error: 'AbortError: This operation was aborted',
          name: 'web.home',
          pass: false,
          status: null,
        },
      ],
    };
    const result = runSmokeRetryDecision({
      decisionInput: {
        attempt: 2,
        maxRetries: 1,
        smokeReport,
      },
      message: 'Validation returned false',
      smokeReport,
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result.timeoutMessage).toBe(false);
    expect(result.payload.result.decision).toEqual({
      retriesRemaining: 0,
      shouldRetry: false,
      timeoutOnly: true,
    });
  });

  test('rejects retry when smoke failures are mixed and not timeout-only', () => {
    const smokeReport = {
      summary: {
        pass: false,
      },
      steps: [
        {
          error: 'AbortError: This operation was aborted',
          name: 'api.health',
          pass: false,
          status: null,
        },
        {
          error: 'Validation returned false',
          name: 'web.home',
          pass: false,
          status: 503,
        },
      ],
    };
    const result = runSmokeRetryDecision({
      decisionInput: {
        attempt: 1,
        maxRetries: 3,
        smokeReport,
      },
      message: '',
      smokeReport,
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result.timeoutOnly).toBe(false);
    expect(result.payload.result.decision).toEqual({
      retriesRemaining: 3,
      shouldRetry: false,
      timeoutOnly: false,
    });
  });
});
