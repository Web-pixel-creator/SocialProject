import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'github-token-repo-resolution.mjs',
);

const runResolverScenario = (scriptBody: string) =>
  runInlineModuleScript<string>(`
    import {
      parseRepoSlugFromRemote,
      resolveRepoSlug,
      resolveToken,
    } from ${JSON.stringify(helperModuleHref)};
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

describe('release github token/repo resolution helper', () => {
  test('parses https remote into owner/repo slug', () => {
    const result = runResolverScenario(`
      const value = parseRepoSlugFromRemote('https://github.com/acme/repo.git');
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toBe('acme/repo');
  });

  test('parses ssh remote into owner/repo slug', () => {
    const result = runResolverScenario(`
      const value = parseRepoSlugFromRemote('git@github.com:acme/repo.git');
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toBe('acme/repo');
  });

  test('rejects unsupported remote format', () => {
    const result = runResolverScenario(`
      const value = parseRepoSlugFromRemote('https://gitlab.com/acme/repo.git');
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain('Unsupported remote URL format');
  });

  test('resolveRepoSlug prefers explicit repository input', () => {
    const result = runResolverScenario(`
      const value = resolveRepoSlug({ githubRepository: ' acme/repo ' });
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toBe('acme/repo');
  });

  test('resolveToken prefers GITHUB_TOKEN over GH_TOKEN', () => {
    const result = runResolverScenario(`
      const value = resolveToken({
        envGhToken: 'gh_token',
        envGithubToken: ' github_token ',
      });
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toBe('github_token');
  });

  test('resolveToken falls back to GH_TOKEN when GITHUB_TOKEN is empty', () => {
    const result = runResolverScenario(`
      const value = resolveToken({
        envGhToken: ' gh_token ',
        envGithubToken: ' ',
      });
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toBe('gh_token');
  });
});
