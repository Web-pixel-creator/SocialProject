import { execFileSync, spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const PROTECTED_PATH_SEGMENTS = new Set(['.agents', '.codex', '.git']);
const NETWORK_PROXY_ENV_KEYS = [
  'ALL_PROXY',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'all_proxy',
  'https_proxy',
  'http_proxy',
  'no_proxy',
  'npm_config_https_proxy',
  'npm_config_proxy',
];

const RELEASE_COMMAND_POLICY_PROFILES = {
  no_network_workspace_write: {
    enforceWorkspaceCwd: true,
    networkAccess: 'best_effort_deny',
    shellCommands: ['npm', 'npm.cmd'],
  },
  system_process: {
    enforceWorkspaceCwd: false,
    networkAccess: 'best_effort_deny',
    shellCommands: [],
  },
  workspace_read_only: {
    enforceWorkspaceCwd: true,
    networkAccess: 'best_effort_deny',
    shellCommands: [],
  },
  workspace_write: {
    enforceWorkspaceCwd: true,
    networkAccess: 'inherit',
    shellCommands: ['npm', 'npm.cmd'],
  },
};

const createReleasePolicyError = (code, message, details = {}) => {
  const error = new Error(message);
  error.name = 'ReleaseCommandPolicyError';
  error.code = code;
  error.details = details;
  return error;
};

export const isReleaseCommandPolicyError = (error) =>
  Boolean(
    error &&
      typeof error === 'object' &&
      error.name === 'ReleaseCommandPolicyError' &&
      typeof error.code === 'string',
  );

export const toReleasePolicyErrorPayload = (error) => {
  if (!isReleaseCommandPolicyError(error)) {
    return null;
  }

  return {
    code: error.code,
    details:
      error.details && typeof error.details === 'object' ? error.details : {},
    message: error.message,
    name: error.name,
  };
};

const normalizeWorkspaceRoot = (workspaceRoot = process.cwd()) =>
  path.resolve(workspaceRoot);

const isPathInsideWorkspace = ({ targetPath, workspaceRoot }) => {
  const relative = path.relative(workspaceRoot, targetPath);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
};

const findProtectedSegment = ({ targetPath, workspaceRoot }) => {
  const relative = path.relative(workspaceRoot, targetPath);
  if (!relative || relative === '') {
    return null;
  }

  const segments = relative
    .split(/[\\/]+/u)
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  return segments.find((segment) => PROTECTED_PATH_SEGMENTS.has(segment)) ?? null;
};

const normalizeCommandName = (command) => {
  const basename = path.basename(String(command ?? '')).trim().toLowerCase();
  return basename.endsWith('.exe') ? basename.slice(0, -4) : basename;
};

export const resolveReleasePolicyProfile = (profileName = 'workspace_write') => {
  const normalizedName = String(profileName || 'workspace_write').trim();
  const profile = RELEASE_COMMAND_POLICY_PROFILES[normalizedName];
  if (!profile) {
    throw createReleasePolicyError(
      'RELEASE_POLICY_UNKNOWN_PROFILE',
      `Unknown release command policy profile '${normalizedName}'.`,
      {
        knownProfiles: Object.keys(RELEASE_COMMAND_POLICY_PROFILES),
        profileName: normalizedName,
      },
    );
  }

  return {
    ...profile,
    profileName: normalizedName,
  };
};

export const resolveWorkspaceSafePath = ({
  targetPath,
  workspaceRoot = process.cwd(),
  baseDir = process.cwd(),
  label = 'path',
}) => {
  const resolvedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const resolvedTargetPath = path.resolve(baseDir, targetPath);

  if (
    !isPathInsideWorkspace({
      targetPath: resolvedTargetPath,
      workspaceRoot: resolvedWorkspaceRoot,
    })
  ) {
    throw createReleasePolicyError(
      'RELEASE_POLICY_PATH_OUTSIDE_WORKSPACE',
      `${label} must stay within workspace root (${resolvedWorkspaceRoot}): ${resolvedTargetPath}`,
      {
        label,
        resolvedTargetPath,
        workspaceRoot: resolvedWorkspaceRoot,
      },
    );
  }

  const protectedSegment = findProtectedSegment({
    targetPath: resolvedTargetPath,
    workspaceRoot: resolvedWorkspaceRoot,
  });
  if (protectedSegment) {
    throw createReleasePolicyError(
      'RELEASE_POLICY_PROTECTED_PATH',
      `${label} must not target protected path segment '${protectedSegment}': ${resolvedTargetPath}`,
      {
        label,
        protectedSegment,
        resolvedTargetPath,
        workspaceRoot: resolvedWorkspaceRoot,
      },
    );
  }

  return resolvedTargetPath;
};

export const sanitizeCommandEnvForProfile = ({
  env,
  profileName = 'workspace_write',
}) => {
  const profile = resolveReleasePolicyProfile(profileName);
  const mergedEnv = { ...process.env, ...(env ?? {}) };

  if (profile.networkAccess === 'best_effort_deny') {
    for (const key of NETWORK_PROXY_ENV_KEYS) {
      delete mergedEnv[key];
    }
  }

  return mergedEnv;
};

export const resolveReleaseCommandOptions = ({
  command,
  cwd = process.cwd(),
  env,
  profileName = 'workspace_write',
  shell = false,
  workspaceRoot = process.cwd(),
}) => {
  const profile = resolveReleasePolicyProfile(profileName);
  const resolvedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const resolvedCwd = profile.enforceWorkspaceCwd
    ? resolveWorkspaceSafePath({
        baseDir: process.cwd(),
        label: 'command cwd',
        targetPath: cwd,
        workspaceRoot: resolvedWorkspaceRoot,
      })
    : path.resolve(cwd);
  const normalizedCommand = normalizeCommandName(command);

  if (shell && !profile.shellCommands.includes(normalizedCommand)) {
    throw createReleasePolicyError(
      'RELEASE_POLICY_SHELL_DISALLOWED',
      `Shell execution is not allowed for command '${normalizedCommand}' under profile '${profile.profileName}'.`,
      {
        command: normalizedCommand,
        profileName: profile.profileName,
        shellCommands: profile.shellCommands,
      },
    );
  }

  return {
    cwd: resolvedCwd,
    env: sanitizeCommandEnvForProfile({
      env,
      profileName: profile.profileName,
    }),
    profile,
    resolvedWorkspaceRoot,
    shell: Boolean(shell),
  };
};

export const spawnWithReleasePolicy = (command, args = [], options = {}) => {
  const resolvedOptions = resolveReleaseCommandOptions({
    command,
    cwd: options.cwd,
    env: options.env,
    profileName: options.profileName,
    shell: options.shell,
    workspaceRoot: options.workspaceRoot,
  });

  return spawn(command, args, {
    ...options,
    cwd: resolvedOptions.cwd,
    env: resolvedOptions.env,
    shell: resolvedOptions.shell,
  });
};

export const spawnSyncWithReleasePolicy = (
  command,
  args = [],
  options = {},
) => {
  const resolvedOptions = resolveReleaseCommandOptions({
    command,
    cwd: options.cwd,
    env: options.env,
    profileName: options.profileName,
    shell: options.shell,
    workspaceRoot: options.workspaceRoot,
  });

  return spawnSync(command, args, {
    ...options,
    cwd: resolvedOptions.cwd,
    env: resolvedOptions.env,
    shell: resolvedOptions.shell,
  });
};

export const execFileSyncWithReleasePolicy = (
  command,
  args = [],
  options = {},
) => {
  const resolvedOptions = resolveReleaseCommandOptions({
    command,
    cwd: options.cwd,
    env: options.env,
    profileName: options.profileName,
    shell: false,
    workspaceRoot: options.workspaceRoot,
  });

  return execFileSync(command, args, {
    ...options,
    cwd: resolvedOptions.cwd,
    env: resolvedOptions.env,
    shell: false,
  });
};
