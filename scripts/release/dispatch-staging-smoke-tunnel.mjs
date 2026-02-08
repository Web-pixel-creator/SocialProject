import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  cleanupRetryFailureLogs,
  formatRetryLogsCleanupSummary,
  resolveRetryLogsCleanupConfig,
  resolveRetryLogsDir,
} from './retry-failure-logs-utils.mjs';

const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_API_PORT = '4000';
const DEFAULT_WEB_PORT = '3000';
const DEFAULT_WEB_HOST = '127.0.0.1';
const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
const DEFAULT_WAIT_INTERVAL_MS = 750;
const DEFAULT_RETRY_MAX = 1;
const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_CAPTURE_RETRY_LOGS = true;
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

const parseInteger = (raw, fallback, allowZero = false) => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  if (allowZero && parsed === 0) {
    return 0;
  }
  return parsed > 0 ? parsed : fallback;
};

const parseBoolean = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return fallback;
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

const runCommand = ({ command, args, name, env, shell, captureOutput = false }) => {
  return new Promise((resolve, reject) => {
    let child;
    let stdoutText = '';
    let stderrText = '';
    try {
      child = spawn(command, args, {
        env: { ...process.env, ...(env ?? {}) },
        stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
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

    if (captureOutput) {
      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdoutText += text;
        process.stdout.write(text);
      });
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderrText += text;
        process.stderr.write(text);
      });
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
        resolve({
          stdout: stdoutText,
          stderr: stderrText,
          combinedOutput: `${stdoutText}\n${stderrText}`.trim(),
        });
        return;
      }
      const commandError = new Error(
        `${name} failed with exit code ${code ?? 'unknown'}`,
      );
      Object.assign(commandError, {
        stdout: stdoutText,
        stderr: stderrText,
        combinedOutput: `${stdoutText}\n${stderrText}`.trim(),
      });
      reject(commandError);
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

const githubRequest = async ({ token, method, url, body }) => {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.ok) {
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  const errorText = await response.text();
  let details = errorText;
  try {
    const json = JSON.parse(errorText);
    details = json.message ? `${json.message}` : errorText;
  } catch {
    // keep raw response text
  }

  throw new Error(
    `GitHub API ${method} ${url} failed: ${response.status} ${response.statusText}. ${details}`,
  );
};

const githubRequestText = async ({ token, url }) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: '*/*',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
  });

  if (response.ok) {
    return await response.text();
  }

  const errorText = await response.text();
  throw new Error(
    `GitHub API GET ${url} failed: ${response.status} ${response.statusText}. ${errorText}`,
  );
};

const getLatestRunContextFromOutput = (output) => {
  const matches = [
    ...output.matchAll(
      /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/actions\/runs\/(\d+)/gu,
    ),
  ];
  const latest = matches.at(-1);
  if (!latest) {
    return null;
  }
  return {
    repoSlug: `${latest[1]}/${latest[2]}`,
    runId: Number(latest[3]),
    runUrl: latest[0],
  };
};

const inspectRetryableFailure = async ({ token, repoSlug, runId }) => {
  const baseApiUrl = `https://api.github.com/repos/${repoSlug}`;
  const run = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}`,
  });

  if (run?.conclusion !== 'failure') {
    return {
      retryable: false,
      reason: `Run conclusion is '${run?.conclusion ?? 'unknown'}' (expected failure).`,
    };
  }

  const jobsResponse = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}/jobs?per_page=100`,
  });
  const jobs = Array.isArray(jobsResponse?.jobs) ? jobsResponse.jobs : [];
  if (jobs.length === 0) {
    return {
      retryable: false,
      reason: 'No jobs found for failed run.',
    };
  }

  const isReleaseSmokeJob = (job) =>
    String(job?.name ?? '').toLowerCase().includes('release smoke dry-run');

  const failedJobs = jobs.filter((job) => job?.conclusion === 'failure');
  if (failedJobs.length === 0) {
    return {
      retryable: false,
      reason: 'Run failed but no failed jobs were reported.',
    };
  }

  if (!failedJobs.every(isReleaseSmokeJob)) {
    return {
      retryable: false,
      reason: `Failed jobs are not limited to release smoke: ${failedJobs
        .map((job) => String(job?.name ?? '<unknown>'))
        .join(', ')}`,
    };
  }

  const nonSmokeJobs = jobs.filter((job) => !isReleaseSmokeJob(job));
  const nonPassingJobs = nonSmokeJobs.filter(
    (job) => !['success', 'skipped'].includes(String(job?.conclusion ?? '')),
  );
  if (nonPassingJobs.length > 0) {
    return {
      retryable: false,
      reason: `Non-smoke jobs did not pass/skipped: ${nonPassingJobs
        .map((job) => `${job?.name ?? '<unknown>'}(${job?.conclusion ?? 'unknown'})`)
        .join(', ')}`,
    };
  }

  const failedReleaseSmokeJobs = failedJobs.map((job) => ({
    id: Number(job?.id),
    name: String(job?.name ?? 'release_smoke_job'),
    htmlUrl: String(job?.html_url ?? ''),
    startedAt: String(job?.started_at ?? ''),
    completedAt: String(job?.completed_at ?? ''),
  }));

  return {
    retryable: true,
    reason: `Only release smoke job failed for run #${run?.run_number ?? runId}.`,
    runNumber: Number(run?.run_number ?? 0) || null,
    runUrl: String(run?.html_url ?? ''),
    failedReleaseSmokeJobs,
  };
};

const extractErrorOutput = (error) => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const structured = error;
  return [
    String(structured.message ?? ''),
    String(structured.stdout ?? ''),
    String(structured.stderr ?? ''),
    String(structured.combinedOutput ?? ''),
  ]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n');
};

const sanitizeFilePart = (value) => {
  return value
    .replace(/[^a-zA-Z0-9._-]/gu, '_')
    .replace(/_+/gu, '_')
    .slice(0, 80);
};

const captureRetryFailureLogs = async ({
  token,
  repoSlug,
  runId,
  runNumber,
  failedReleaseSmokeJobs,
  outputDir,
}) => {
  if (!Array.isArray(failedReleaseSmokeJobs) || failedReleaseSmokeJobs.length === 0) {
    return;
  }

  await mkdir(outputDir, { recursive: true });
  const runTag = runNumber ?? runId;
  const metadata = {
    generatedAtUtc: new Date().toISOString(),
    repoSlug,
    runId,
    runNumber,
    jobs: [],
  };

  for (const job of failedReleaseSmokeJobs) {
    const jobId = Number(job.id);
    const jobName = String(job.name ?? `job-${jobId}`);
    const safeJobName = sanitizeFilePart(jobName);
    const logFilePath = path.join(
      outputDir,
      `run-${runTag}-runid-${runId}-job-${jobId}-${safeJobName}.log`,
    );
    const logUrl = `https://api.github.com/repos/${repoSlug}/actions/jobs/${jobId}/logs`;

    try {
      const logText = await githubRequestText({
        token,
        url: logUrl,
      });
      await writeFile(logFilePath, logText, 'utf8');
      metadata.jobs.push({
        ...job,
        logFilePath,
        logCaptured: true,
      });
      process.stderr.write(`Captured retry diagnostics: ${logFilePath}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      metadata.jobs.push({
        ...job,
        logFilePath,
        logCaptured: false,
        error: message,
      });
      process.stderr.write(
        `Failed to capture retry diagnostics for job ${jobId}: ${message}\n`,
      );
    }
  }

  const metadataPath = path.join(
    outputDir,
    `run-${runTag}-runid-${runId}-retry-metadata.json`,
  );
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  process.stderr.write(`Retry diagnostics metadata: ${metadataPath}\n`);
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
  const retryMax = parseInteger(
    process.env.RELEASE_TUNNEL_DISPATCH_RETRY_MAX,
    DEFAULT_RETRY_MAX,
    true,
  );
  const retryDelayMs = parseNumber(
    process.env.RELEASE_TUNNEL_DISPATCH_RETRY_DELAY_MS,
    DEFAULT_RETRY_DELAY_MS,
  );
  const captureRetryLogs = parseBoolean(
    process.env.RELEASE_TUNNEL_CAPTURE_RETRY_LOGS,
    DEFAULT_CAPTURE_RETRY_LOGS,
  );
  const retryLogsDir = resolveRetryLogsDir(process.env);
  const retryLogsCleanupConfig = resolveRetryLogsCleanupConfig(process.env);

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

    const totalAttempts = retryMax + 1;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      process.stdout.write(
        `Dispatch attempt ${attempt}/${totalAttempts} (URL-input smoke)\n`,
      );
      try {
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
          captureOutput: true,
        });
        break;
      } catch (error) {
        if (attempt >= totalAttempts) {
          throw error;
        }

        const output = extractErrorOutput(error);
        const runContext = getLatestRunContextFromOutput(output);
        if (!runContext) {
          process.stderr.write(
            `Retry skipped: unable to determine failed run id from dispatch output.\n`,
          );
          throw error;
        }

        let inspection;
        try {
          inspection = await inspectRetryableFailure({
            token: githubToken,
            repoSlug: runContext.repoSlug,
            runId: runContext.runId,
          });
        } catch (inspectionError) {
          process.stderr.write(
            `Retry skipped: unable to inspect run ${runContext.runId}. ${String(inspectionError)}\n`,
          );
          throw error;
        }

        if (!inspection.retryable) {
          process.stderr.write(`Retry skipped: ${inspection.reason}\n`);
          throw error;
        }

        if (captureRetryLogs) {
          try {
            const cleanupSummary = await cleanupRetryFailureLogs({
              outputDir: retryLogsDir,
              ...retryLogsCleanupConfig,
            });
            process.stderr.write(
              `${formatRetryLogsCleanupSummary({
                summary: cleanupSummary,
                label: 'dispatch:tunnel',
              })}\n`,
            );
          } catch (cleanupError) {
            process.stderr.write(
              `Retry diagnostics cleanup failed: ${String(cleanupError)}\n`,
            );
          }

          try {
            await captureRetryFailureLogs({
              token: githubToken,
              repoSlug: runContext.repoSlug,
              runId: runContext.runId,
              runNumber: inspection.runNumber,
              failedReleaseSmokeJobs: inspection.failedReleaseSmokeJobs,
              outputDir: retryLogsDir,
            });
          } catch (captureError) {
            process.stderr.write(
              `Retry diagnostics capture failed: ${String(captureError)}\n`,
            );
          }
        }

        process.stderr.write(
          `Retrying after transient release smoke failure (${inspection.runUrl || runContext.runUrl}). ${inspection.reason}\n`,
        );
        await sleep(retryDelayMs);
      }
    }
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
