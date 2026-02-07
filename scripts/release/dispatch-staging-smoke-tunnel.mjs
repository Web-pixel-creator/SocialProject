import { spawn } from 'node:child_process';

const DEFAULT_API_PORT = '4000';
const DEFAULT_WEB_PORT = '3000';
const DEFAULT_WEB_HOST = '127.0.0.1';
const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
const DEFAULT_WAIT_INTERVAL_MS = 750;
const DEFAULT_CSRF_TOKEN = 'release-smoke-tunnel-csrf-token-123456789';
const DEFAULT_JWT_SECRET = 'release-smoke-tunnel-jwt-secret-123456789';
const DEFAULT_ADMIN_TOKEN = 'release-smoke-tunnel-admin-token-123456789';

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
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
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

const readGithubTokenFromCredentialStore = () => {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['credential', 'fill'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    let output = '';
    let errors = '';

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      errors += chunk.toString();
    });

    child.on('error', (error) => {
      reject(
        new Error(
          `Failed to run git credential fill: ${error.message}. ${errors}`.trim(),
        ),
      );
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `git credential fill exited with code ${code ?? 'unknown'}. ${errors}`.trim(),
          ),
        );
        return;
      }

      const tokenLine = output
        .split(/\r?\n/u)
        .find((line) => line.startsWith('password='));
      if (!tokenLine) {
        reject(
          new Error(
            'Unable to resolve GitHub token from credential store. Set GITHUB_TOKEN or GH_TOKEN.',
          ),
        );
        return;
      }

      const token = tokenLine.slice('password='.length).trim();
      if (!token) {
        reject(
          new Error(
            'Git credential store returned an empty password. Set GITHUB_TOKEN or GH_TOKEN.',
          ),
        );
        return;
      }

      resolve(token);
    });

    child.stdin.write('protocol=https\nhost=github.com\n\n');
    child.stdin.end();
  });
};

const waitForTunnelUrl = ({ child, name, timeoutMs }) => {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error(`${name} did not provide a public URL in time.`));
    }, timeoutMs);

    const onClose = (code) => {
      cleanup();
      reject(new Error(`${name} exited before emitting URL (code ${code ?? 'unknown'}).`));
    };

    const onData = (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https?:\/\/[^\s]+/u);
      if (match) {
        cleanup();
        resolve(match[0]);
      }
    };

    const cleanup = () => {
      clearTimeout(deadline);
      child.off('close', onClose);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
    };

    child.on('close', onClose);
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
};

const startTunnel = ({ port, name }) => {
  const invocation = getNpmInvocation([
    'exec',
    '--yes',
    'localtunnel',
    '--',
    '--port',
    String(port),
    '--local-host',
    DEFAULT_WEB_HOST,
  ]);

  const child = spawn(invocation.command, invocation.args, {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: invocation.shell ?? false,
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk.toString()}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk.toString()}`);
  });

  return child;
};

const main = async () => {
  const apiPort = process.env.RELEASE_TUNNEL_API_PORT ?? DEFAULT_API_PORT;
  const webPort = process.env.RELEASE_TUNNEL_WEB_PORT ?? DEFAULT_WEB_PORT;
  const waitTimeoutMs = parseNumber(
    process.env.RELEASE_TUNNEL_WAIT_TIMEOUT_MS,
    DEFAULT_WAIT_TIMEOUT_MS,
  );
  const waitIntervalMs = parseNumber(
    process.env.RELEASE_TUNNEL_WAIT_INTERVAL_MS,
    DEFAULT_WAIT_INTERVAL_MS,
  );

  const csrfToken = process.env.RELEASE_CSRF_TOKEN ?? DEFAULT_CSRF_TOKEN;
  const githubToken =
    (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '').trim() ||
    (await readGithubTokenFromCredentialStore());

  await runCommand({
    command: 'docker',
    args: ['compose', 'up', '-d', 'postgres', 'redis'],
    name: 'docker compose up',
    shell: false,
  });

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
    DEFAULT_WEB_HOST,
    '--port',
    webPort,
  ]);
  const dispatchInvocation = getNpmInvocation(['run', 'release:smoke:dispatch']);

  let apiProcess = null;
  let webProcess = null;
  let apiTunnel = null;
  let webTunnel = null;

  try {
    apiProcess = startService({
      command: apiStartInvocation.command,
      args: apiStartInvocation.args,
      name: 'api',
      env: {
        NODE_ENV: 'production',
        PORT: apiPort,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgres://postgres:postgres@127.0.0.1:5432/finishit',
        REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
        FRONTEND_URL: `http://${DEFAULT_WEB_HOST}:${webPort}`,
        JWT_SECRET: process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
        CSRF_TOKEN: csrfToken,
        ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN ?? DEFAULT_ADMIN_TOKEN,
        JOBS_ENABLED: process.env.JOBS_ENABLED ?? 'false',
        EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER ?? 'hash',
        LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
      },
      shell: apiStartInvocation.shell,
    });

    webProcess = startService({
      command: webStartInvocation.command,
      args: webStartInvocation.args,
      name: 'web',
      env: {
        NODE_ENV: 'production',
      },
      shell: webStartInvocation.shell,
    });

    await waitForUrl(
      `http://${DEFAULT_WEB_HOST}:${apiPort}/health`,
      waitTimeoutMs,
      waitIntervalMs,
    );
    await waitForUrl(
      `http://${DEFAULT_WEB_HOST}:${webPort}/`,
      waitTimeoutMs,
      waitIntervalMs,
    );

    apiTunnel = startTunnel({ port: apiPort, name: 'api-tunnel' });
    webTunnel = startTunnel({ port: webPort, name: 'web-tunnel' });

    const [apiBaseUrl, webBaseUrl] = await Promise.all([
      waitForTunnelUrl({
        child: apiTunnel,
        name: 'api-tunnel',
        timeoutMs: waitTimeoutMs,
      }),
      waitForTunnelUrl({
        child: webTunnel,
        name: 'web-tunnel',
        timeoutMs: waitTimeoutMs,
      }),
    ]);

    process.stdout.write(`Using public API URL: ${apiBaseUrl}\n`);
    process.stdout.write(`Using public WEB URL: ${webBaseUrl}\n`);

    await runCommand({
      command: dispatchInvocation.command,
      args: dispatchInvocation.args,
      name: 'release:smoke:dispatch',
      env: {
        GITHUB_TOKEN: githubToken,
        RELEASE_API_BASE_URL: apiBaseUrl,
        RELEASE_WEB_BASE_URL: webBaseUrl,
        RELEASE_CSRF_TOKEN: csrfToken,
        RELEASE_WORKFLOW_REF: process.env.RELEASE_WORKFLOW_REF ?? 'main',
      },
      shell: dispatchInvocation.shell,
    });
  } finally {
    await stopProcess(apiTunnel);
    await stopProcess(webTunnel);
    await stopProcess(apiProcess);
    await stopProcess(webProcess);
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
