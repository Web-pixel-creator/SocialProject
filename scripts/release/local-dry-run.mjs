import { spawn } from 'node:child_process';

const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4000';
const DEFAULT_WEB_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
const DEFAULT_WAIT_INTERVAL_MS = 750;
const DEFAULT_CSRF_TOKEN = 'release-smoke-csrf-token-123456789';
const DEFAULT_JWT_SECRET = 'release-smoke-jwt-secret-123456789';
const DEFAULT_ADMIN_TOKEN = 'release-smoke-admin-token-123456789';

const parseNumber = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getNpmInvocation = (args) => {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
      shell: false,
    };
  }
  return {
    command: NPM_BIN,
    args,
    shell: process.platform === 'win32',
  };
};

const runCommand = ({ command, args, name, env, shell }) => {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        env: { ...process.env, ...(env ?? {}) },
        stdio: 'inherit',
        shell: shell ?? false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reject(
        new Error(
          `${name} failed to spawn (${command} ${args.join(' ')}): ${message}`,
        ),
      );
      return;
    }

    child.on('error', (error) => {
      reject(
        new Error(
          `${name} failed to start (${command} ${args.join(' ')}): ${error.message}`,
        ),
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${name} failed with exit code ${code ?? 'unknown'}`));
    });
  });
};

const checkCommand = ({ command, args, env, shell }) => {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        env: { ...process.env, ...(env ?? {}) },
        stdio: 'ignore',
        shell: shell ?? false,
      });
    } catch {
      resolve(false);
      return;
    }

    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
};

const waitForInfraReady = async ({
  timeoutMs,
  intervalMs,
  checkShell = false,
}) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const postgresReady = await checkCommand({
      command: 'docker',
      args: [
        'compose',
        'exec',
        '-T',
        'postgres',
        'pg_isready',
        '-U',
        'postgres',
      ],
      shell: checkShell,
    });
    const redisReady = await checkCommand({
      command: 'docker',
      args: ['compose', 'exec', '-T', 'redis', 'redis-cli', 'ping'],
      shell: checkShell,
    });

    if (postgresReady && redisReady) {
      return;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timeout waiting for infrastructure readiness (postgres/redis) after ${timeoutMs}ms.`,
  );
};

const waitForUrl = async (url, timeoutMs, intervalMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timeout waiting for ${url}`);
};

const taskKill = (pid) => {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: false,
    });
    killer.on('close', () => resolve());
    killer.on('error', () => resolve());
  });
};

const stopProcess = async (child) => {
  if (!child?.pid) {
    return;
  }

  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    await taskKill(child.pid);
    return;
  }

  child.kill('SIGTERM');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return;
    }
    await sleep(150);
  }
  child.kill('SIGKILL');
};

const startService = ({ command, args, name, env, shell }) => {
  let child;
  try {
    child = spawn(command, args, {
      env: { ...process.env, ...(env ?? {}) },
      stdio: 'inherit',
      shell: shell ?? false,
    });
  } catch (error) {
    process.stderr.write(
      `${name} failed to spawn (${command} ${args.join(' ')}): ${String(error)}\n`,
    );
    throw error;
  }

  child.on('error', (error) => {
    process.stderr.write(
      `${name} start error (${command} ${args.join(' ')}): ${String(error)}\n`,
    );
  });

  return child;
};

const main = async () => {
  const apiBaseUrl = process.env.RELEASE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const webBaseUrl = process.env.RELEASE_WEB_BASE_URL ?? DEFAULT_WEB_BASE_URL;
  const timeoutMs = parseNumber(
    process.env.RELEASE_LOCAL_WAIT_TIMEOUT_MS,
    DEFAULT_WAIT_TIMEOUT_MS,
  );
  const intervalMs = parseNumber(
    process.env.RELEASE_LOCAL_WAIT_INTERVAL_MS,
    DEFAULT_WAIT_INTERVAL_MS,
  );

  const apiUrl = new URL(apiBaseUrl);
  const webUrl = new URL(webBaseUrl);
  const apiPort = apiUrl.port || '4000';
  const webPort = webUrl.port || '3000';
  const webHost = webUrl.hostname || '127.0.0.1';

  const csrfToken = process.env.RELEASE_CSRF_TOKEN ?? DEFAULT_CSRF_TOKEN;

  const shouldPrepareInfra =
    (process.env.RELEASE_LOCAL_SKIP_PREPARE ?? 'false').toLowerCase() !==
    'true';

  if (shouldPrepareInfra) {
    await runCommand({
      command: 'docker',
      args: ['compose', 'up', '-d', 'postgres', 'redis'],
      name: 'docker compose up',
      shell: false,
    });

    await waitForInfraReady({
      timeoutMs,
      intervalMs,
      checkShell: false,
    });

    const migrateInvocation = getNpmInvocation([
      '--workspace',
      'apps/api',
      'run',
      'migrate:up',
    ]);
    await runCommand({
      command: migrateInvocation.command,
      args: migrateInvocation.args,
      name: 'api migrate:up',
      shell: migrateInvocation.shell,
    });

    const apiBuildInvocation = getNpmInvocation([
      '--workspace',
      'apps/api',
      'run',
      'build',
    ]);
    await runCommand({
      command: apiBuildInvocation.command,
      args: apiBuildInvocation.args,
      name: 'api build',
      shell: apiBuildInvocation.shell,
    });

    const webBuildInvocation = getNpmInvocation([
      '--workspace',
      'apps/web',
      'run',
      'build',
    ]);
    await runCommand({
      command: webBuildInvocation.command,
      args: webBuildInvocation.args,
      name: 'web build',
      shell: webBuildInvocation.shell,
    });
  }

  const apiEnv = {
    NODE_ENV: 'production',
    PORT: apiPort,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      'postgres://postgres:postgres@127.0.0.1:5432/finishit',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    FRONTEND_URL: webBaseUrl,
    JWT_SECRET: process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
    CSRF_TOKEN: csrfToken,
    ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN ?? DEFAULT_ADMIN_TOKEN,
    JOBS_ENABLED: process.env.JOBS_ENABLED ?? 'false',
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER ?? 'hash',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
  };

  const webEnv = {
    NODE_ENV: 'production',
  };

  const apiStartInvocation = getNpmInvocation([
    '--workspace',
    'apps/api',
    'run',
    'start',
  ]);
  const webStartInvocation = getNpmInvocation([
    '--workspace',
    'apps/web',
    'run',
    'start',
    '--',
    '--hostname',
    webHost,
    '--port',
    webPort,
  ]);
  const smokeInvocation = getNpmInvocation(['run', 'release:smoke']);

  let apiProcess = null;
  let webProcess = null;

  try {
    apiProcess = startService({
      command: apiStartInvocation.command,
      args: apiStartInvocation.args,
      name: 'api',
      env: apiEnv,
      shell: apiStartInvocation.shell,
    });
    webProcess = startService({
      command: webStartInvocation.command,
      args: webStartInvocation.args,
      name: 'web',
      env: webEnv,
      shell: webStartInvocation.shell,
    });

    await waitForUrl(buildUrl(apiBaseUrl, '/health'), timeoutMs, intervalMs);
    await waitForUrl(buildUrl(webBaseUrl, '/'), timeoutMs, intervalMs);

    await runCommand({
      command: smokeInvocation.command,
      args: smokeInvocation.args,
      name: 'release:smoke',
      env: {
        RELEASE_API_BASE_URL: apiBaseUrl,
        RELEASE_WEB_BASE_URL: webBaseUrl,
        RELEASE_CSRF_TOKEN: csrfToken,
      },
      shell: smokeInvocation.shell,
    });
  } finally {
    await stopProcess(apiProcess);
    await stopProcess(webProcess);
  }
};

const buildUrl = (baseUrl, route) => {
  const normalized = route.startsWith('/') ? route : `/${route}`;
  return new URL(normalized, baseUrl).toString();
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
