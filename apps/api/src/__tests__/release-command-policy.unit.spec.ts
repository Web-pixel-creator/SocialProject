import {
  resolveProjectModuleHref,
  resolveProjectPath,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'release-command-policy.mjs',
);
const projectRoot = resolveProjectPath();
const releaseArtifactPath = resolveProjectPath(
  'artifacts',
  'release',
  'policy-test.json',
);
const protectedGitPath = resolveProjectPath('.git', 'config');
const outsideWorkspacePath = resolveProjectPath('..', 'policy-outside.txt');

const runHelperScenario = (scriptBody: string) =>
  runInlineModuleScript<{
    code: string;
    error: string;
    ok: boolean;
    result: unknown;
  }>(`
    import {
      resolveReleaseCommandOptions,
      resolveWorkspaceSafePath,
      sanitizeCommandEnvForProfile,
      spawnSyncWithReleasePolicy,
      toReleasePolicyErrorPayload,
    } from ${JSON.stringify(helperModuleHref)};
    const emit = (payload) => {
      process.stdout.write(JSON.stringify(payload));
    };
    try {
      ${scriptBody}
    } catch (error) {
      const policyError = toReleasePolicyErrorPayload(error);
      emit({
        ok: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
        code: policyError?.code ?? '',
      });
      process.exitCode = 1;
    }
  `);

describe('release command policy', () => {
  test('allows workspace artifact paths', () => {
    const result = runHelperScenario(`
      const value = resolveWorkspaceSafePath({
        label: 'artifact path',
        targetPath: ${JSON.stringify(releaseArtifactPath)},
        workspaceRoot: ${JSON.stringify(projectRoot)},
      });
      emit({ ok: true, result: value, error: '', code: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toBe(releaseArtifactPath);
  });

  test('rejects paths outside the workspace root', () => {
    const result = runHelperScenario(`
      resolveWorkspaceSafePath({
        label: 'artifact path',
        targetPath: ${JSON.stringify(outsideWorkspacePath)},
        workspaceRoot: ${JSON.stringify(projectRoot)},
      });
      emit({ ok: true, result: null, error: '', code: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.code).toBe('RELEASE_POLICY_PATH_OUTSIDE_WORKSPACE');
  });

  test('rejects protected path segments', () => {
    const result = runHelperScenario(`
      resolveWorkspaceSafePath({
        label: 'artifact path',
        targetPath: ${JSON.stringify(protectedGitPath)},
        workspaceRoot: ${JSON.stringify(projectRoot)},
      });
      emit({ ok: true, result: null, error: '', code: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.code).toBe('RELEASE_POLICY_PROTECTED_PATH');
  });

  test('allows shell execution only for approved commands in workspace profiles', () => {
    const result = runHelperScenario(`
      const value = resolveReleaseCommandOptions({
        command: 'npm.cmd',
        cwd: ${JSON.stringify(projectRoot)},
        profileName: 'workspace_write',
        shell: true,
        workspaceRoot: ${JSON.stringify(projectRoot)},
      });
      emit({
        ok: true,
        result: {
          cwd: value.cwd,
          profileName: value.profile.profileName,
          shell: value.shell,
        },
        error: '',
        code: '',
      });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual({
      cwd: projectRoot,
      profileName: 'workspace_write',
      shell: true,
    });
  });

  test('rejects shell execution for commands outside the allowlist', () => {
    const result = runHelperScenario(`
      resolveReleaseCommandOptions({
        command: 'powershell.exe',
        cwd: ${JSON.stringify(projectRoot)},
        profileName: 'workspace_write',
        shell: true,
        workspaceRoot: ${JSON.stringify(projectRoot)},
      });
      emit({ ok: true, result: null, error: '', code: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.code).toBe('RELEASE_POLICY_SHELL_DISALLOWED');
  });

  test('removes proxy variables for no-network profiles', () => {
    const result = runHelperScenario(`
      const value = sanitizeCommandEnvForProfile({
        profileName: 'no_network_workspace_write',
        env: {
          CUSTOM_FLAG: 'kept',
          HTTP_PROXY: 'http://proxy.local',
          HTTPS_PROXY: 'https://proxy.local',
        },
      });
      emit({
        ok: true,
        result: {
          customFlag: value.CUSTOM_FLAG ?? null,
          hasHttpProxy: Object.prototype.hasOwnProperty.call(value, 'HTTP_PROXY'),
          hasHttpsProxy: Object.prototype.hasOwnProperty.call(value, 'HTTPS_PROXY'),
        },
        error: '',
        code: '',
      });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual({
      customFlag: 'kept',
      hasHttpProxy: false,
      hasHttpsProxy: false,
    });
  });

  test('spawns sync commands inside the resolved workspace cwd', () => {
    const result = runHelperScenario(`
      const output = spawnSyncWithReleasePolicy(
        process.execPath,
        ['-e', 'process.stdout.write(process.cwd())'],
        {
          cwd: ${JSON.stringify(projectRoot)},
          encoding: 'utf8',
          profileName: 'workspace_read_only',
          workspaceRoot: ${JSON.stringify(projectRoot)},
        },
      );
      emit({
        ok: true,
        result: {
          status: output.status,
          stdout: output.stdout,
        },
        error: '',
        code: '',
      });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual({
      status: 0,
      stdout: projectRoot,
    });
  });
});
