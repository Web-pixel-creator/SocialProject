import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'dispatch-github-token-selection.mjs',
);

const runHelperScenario = (scriptBody: string) =>
  runInlineModuleScript<{
    calls?: number;
    error: string;
    ok: boolean;
    result: unknown;
    warnings?: string[];
  }>(`
    import {
      isGitHubAuthenticationError,
      selectDispatchTokenCandidate,
    } from ${JSON.stringify(helperModuleHref)};
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
        warnings,
        calls: null,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
  `);

describe('release dispatch github token selection helper', () => {
  test('detects known authentication error markers', () => {
    const result = runHelperScenario(`
      const value = [
        isGitHubAuthenticationError('request failed: 401 Bad credentials'),
        isGitHubAuthenticationError('request failed: Requires authentication'),
        isGitHubAuthenticationError('request failed: Resource not accessible by integration'),
        isGitHubAuthenticationError('request failed: 503 Service Unavailable'),
      ];
      emit({ ok: true, result: value, warnings, calls: 0, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual([true, true, true, false]);
  });

  test('throws clear error when token candidates list is empty', () => {
    const result = runHelperScenario(`
      await selectDispatchTokenCandidate({
        candidates: [],
        probeUrl: 'https://api.github.com/repos/acme/repo',
        probeAuth: async () => {},
      });
      emit({ ok: true, result: null, warnings, calls: 0, error: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain('Missing GitHub token');
  });

  test('selects first candidate when auth probe succeeds immediately', () => {
    const result = runHelperScenario(`
      let calls = 0;
      const selected = await selectDispatchTokenCandidate({
        candidates: [
          { source: 'cli-arg', token: 'token-1' },
          { source: 'env:GITHUB_TOKEN', token: 'token-2' },
        ],
        probeUrl: 'https://api.github.com/repos/acme/repo',
        probeAuth: async () => {
          calls += 1;
        },
        writeWarning: (message) => warnings.push(message),
      });
      emit({ ok: true, result: selected, warnings, calls, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.calls).toBe(1);
    expect(result.payload.result).toEqual({
      source: 'cli-arg',
      token: 'token-1',
    });
    expect(result.payload.warnings).toEqual([]);
  });

  test('falls back to next candidate after auth failure and emits warnings', () => {
    const result = runHelperScenario(`
      let calls = 0;
      const selected = await selectDispatchTokenCandidate({
        candidates: [
          { source: 'env:GITHUB_TOKEN', token: 'token-1' },
          { source: 'gh-auth', token: 'token-2' },
        ],
        probeUrl: 'https://api.github.com/repos/acme/repo',
        probeAuth: async ({ token }) => {
          calls += 1;
          if (token === 'token-1') {
            throw new Error('request failed: 401 Bad credentials');
          }
        },
        writeWarning: (message) => warnings.push(message),
      });
      emit({ ok: true, result: selected, warnings, calls, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.calls).toBe(2);
    expect(result.payload.result).toEqual({
      source: 'gh-auth',
      token: 'token-2',
    });
    expect(result.payload.warnings).toHaveLength(2);
    expect(result.payload.warnings?.[0]).toContain(
      'failed auth, trying next source',
    );
    expect(result.payload.warnings?.[1]).toContain(
      "using token source 'gh-auth'",
    );
  });

  test('rethrows non-authentication probe error without fallback', () => {
    const result = runHelperScenario(`
      let calls = 0;
      await selectDispatchTokenCandidate({
        candidates: [
          { source: 'env:GITHUB_TOKEN', token: 'token-1' },
          { source: 'gh-auth', token: 'token-2' },
        ],
        probeUrl: 'https://api.github.com/repos/acme/repo',
        probeAuth: async () => {
          calls += 1;
          throw new Error('request failed: 503 Service Unavailable');
        },
        writeWarning: (message) => warnings.push(message),
      });
      emit({ ok: true, result: null, warnings, calls, error: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain('503 Service Unavailable');
    expect(result.payload.warnings).toEqual([]);
  });
});
