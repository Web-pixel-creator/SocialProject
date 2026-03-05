import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type ModuleActionResult,
  resolveProjectModuleHref,
  resolveProjectPath,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'github-token-repo-resolution.mjs',
);
const projectRoot = resolveProjectPath();

const runResolverScenario = (scriptBody: string) =>
  runInlineModuleScript<string>(`
    import {
      parseRepoSlugFromRemote,
      readTokenFromGitCredentialStore,
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

const runResolverScenarioWithEnv = (
  scriptBody: string,
  {
    cwd = projectRoot,
    env = {},
  }: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
) => {
  const script = `
    import {
      parseRepoSlugFromRemote,
      readTokenFromGitCredentialStore,
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
  `;
  const output = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...env,
      },
    },
  );
  const payload = JSON.parse(output.stdout) as ModuleActionResult<string>;
  return {
    output,
    payload,
  };
};

const toGitConfigPath = (value: string) => value.replace(/\\/gu, '/');

const createCredentialFixture = (credentialEntry: string) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-git-cred-'));
  const storePath = path.join(tempDir, 'credentials.txt');
  const gitConfigPath = path.join(tempDir, 'gitconfig');

  writeFileSync(storePath, credentialEntry, 'utf8');
  writeFileSync(
    gitConfigPath,
    `[credential]\n\thelper = store --file=${toGitConfigPath(storePath)}\n`,
    'utf8',
  );

  return {
    env: {
      GIT_CONFIG_GLOBAL: gitConfigPath,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
    },
    tempDir,
  };
};

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

  test('reads token from isolated git credential store fixture', () => {
    const fixture = createCredentialFixture(
      'https://x-access-token:fixture-token@github.com',
    );
    try {
      const result = runResolverScenarioWithEnv(
        `
          const value = readTokenFromGitCredentialStore();
          emit({ ok: true, result: value, error: '' });
        `,
        { env: fixture.env },
      );

      expect(result.output.status).toBe(0);
      expect(result.payload.ok).toBe(true);
      expect(result.payload.result).toBe('fixture-token');
    } finally {
      rmSync(fixture.tempDir, {
        force: true,
        recursive: true,
      });
    }
  });

  test('returns empty token when allowMissing=true and credential password is empty', () => {
    const fixture = createCredentialFixture(
      'https://x-access-token:@github.com',
    );
    try {
      const result = runResolverScenarioWithEnv(
        `
          const value = readTokenFromGitCredentialStore({ allowMissing: true });
          emit({ ok: true, result: value, error: '' });
        `,
        { env: fixture.env },
      );

      expect(result.output.status).toBe(0);
      expect(result.payload.ok).toBe(true);
      expect(result.payload.result).toBe('');
    } finally {
      rmSync(fixture.tempDir, {
        force: true,
        recursive: true,
      });
    }
  });

  test('throws for empty credential password when allowMissing=false', () => {
    const fixture = createCredentialFixture(
      'https://x-access-token:@github.com',
    );
    try {
      const result = runResolverScenarioWithEnv(
        `
          const value = readTokenFromGitCredentialStore();
          emit({ ok: true, result: value, error: '' });
        `,
        { env: fixture.env },
      );

      expect(result.output.status).toBe(1);
      expect(result.payload.ok).toBe(false);
      expect(result.payload.error).toContain(
        'Git credential store returned empty password',
      );
    } finally {
      rmSync(fixture.tempDir, {
        force: true,
        recursive: true,
      });
    }
  });

  test('resolveRepoSlug falls back to git origin remote when explicit input is empty', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-git-repo-'));
    try {
      const initOutput = spawnSync('git', ['init'], {
        cwd: tempDir,
        encoding: 'utf8',
      });
      expect(initOutput.status).toBe(0);

      const addRemoteOutput = spawnSync(
        'git',
        ['remote', 'add', 'origin', 'git@github.com:acme/fallback-repo.git'],
        {
          cwd: tempDir,
          encoding: 'utf8',
        },
      );
      expect(addRemoteOutput.status).toBe(0);

      const result = runResolverScenarioWithEnv(
        `
          const value = resolveRepoSlug({ githubRepository: ' ' });
          emit({ ok: true, result: value, error: '' });
        `,
        {
          cwd: tempDir,
          env: {
            GITHUB_REPOSITORY: '',
          },
        },
      );

      expect(result.output.status).toBe(0);
      expect(result.payload.ok).toBe(true);
      expect(result.payload.result).toBe('acme/fallback-repo');
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true,
      });
    }
  });
});
