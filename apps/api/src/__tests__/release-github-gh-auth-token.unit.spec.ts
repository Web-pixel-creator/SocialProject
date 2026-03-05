import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'github-gh-auth-token.mjs',
);

const runHelperScenario = (scriptBody: string) =>
  runInlineModuleScript<string>(`
    import { readGitHubTokenFromGhAuth } from ${JSON.stringify(helperModuleHref)};
    const emit = (payload) => {
      process.stdout.write(JSON.stringify(payload));
    };
    try {
      ${scriptBody}
    } catch (error) {
      emit({
        ok: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
  `);

describe('release gh auth token helper', () => {
  test('returns trimmed token from gh auth reader', () => {
    const result = runHelperScenario(`
      const value = readGitHubTokenFromGhAuth({
        readToken: () => '  token-from-gh-auth  ',
      });
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toBe('token-from-gh-auth');
  });

  test('returns empty string when gh auth reader throws', () => {
    const result = runHelperScenario(`
      const value = readGitHubTokenFromGhAuth({
        readToken: () => {
          throw new Error('gh not installed');
        },
      });
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toBe('');
  });

  test('returns empty string when gh auth reader returns undefined', () => {
    const result = runHelperScenario(`
      const value = readGitHubTokenFromGhAuth({
        readToken: () => undefined,
      });
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toBe('');
  });
});
