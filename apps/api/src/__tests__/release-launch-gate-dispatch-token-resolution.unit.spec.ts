import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const tokenResolutionModuleHref = pathToFileURL(
  path.join(
    projectRoot,
    'scripts',
    'release',
    'dispatch-production-launch-gate-token-resolution.mjs',
  ),
).href;

interface ModuleActionResult<T> {
  error: string;
  ok: boolean;
  result: T;
}

const runResolveAction = (input: {
  envGithubToken?: string;
  envGhToken?: string;
  ghAuthToken?: string;
  tokenFromArg?: string;
}) => {
  const script = `
    import { resolveDispatchTokenCandidates } from ${JSON.stringify(tokenResolutionModuleHref)};
    const input = ${JSON.stringify(input)};
    try {
      const result = resolveDispatchTokenCandidates(input);
      process.stdout.write(JSON.stringify({ ok: true, result, error: '' }));
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
  const output = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );
  const payload = JSON.parse(output.stdout) as ModuleActionResult<
    Array<{ source: string; token: string }>
  >;
  return {
    output,
    payload,
  };
};

describe('launch-gate dispatch token candidate resolver', () => {
  test('keeps token-source priority order', () => {
    const result = runResolveAction({
      tokenFromArg: 'cli_token',
      envGithubToken: 'env_github_token',
      envGhToken: 'env_gh_token',
      ghAuthToken: 'gh_auth_token',
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result.map((entry) => entry.source)).toEqual([
      'cli-arg',
      'env:GITHUB_TOKEN',
      'env:GH_TOKEN',
      'gh-auth',
    ]);
  });

  test('deduplicates repeated token values across sources', () => {
    const result = runResolveAction({
      tokenFromArg: 'same-token',
      envGithubToken: 'same-token',
      envGhToken: ' same-token ',
      ghAuthToken: 'different-token',
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toEqual([
      { source: 'cli-arg', token: 'same-token' },
      { source: 'gh-auth', token: 'different-token' },
    ]);
  });

  test('returns empty list when all sources are missing', () => {
    const result = runResolveAction({});

    expect(result.output.status).toBe(0);
    expect(result.payload.result).toEqual([]);
  });

  test('rejects non-ascii token values', () => {
    const result = runResolveAction({
      envGhToken: 'токен',
    });

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain("Token from 'env:GH_TOKEN'");
  });
});
