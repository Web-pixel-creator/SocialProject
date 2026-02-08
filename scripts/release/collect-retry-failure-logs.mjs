import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  cleanupRetryFailureLogs,
  formatRetryLogsCleanupSummary,
  resolveRetryLogsCleanupConfig,
  resolveRetryLogsDir,
} from './retry-failure-logs-utils.mjs';

const GITHUB_API_VERSION = '2022-11-28';

const parseInteger = (raw) => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid run id '${raw}'. Use a positive integer.`);
  }
  return parsed;
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

const readOriginRemote = () => {
  const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
    encoding: 'utf8',
  }).trim();
  if (!remote) {
    throw new Error('Git remote origin is not configured.');
  }
  return remote;
};

const parseRepoSlugFromRemote = (remote) => {
  const httpsMatch = remote.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u,
  );
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = remote.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/u);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  throw new Error(
    `Unsupported remote URL format: ${remote}. Expected GitHub https/ssh remote.`,
  );
};

const resolveRepoSlug = () => {
  const fromEnv = process.env.GITHUB_REPOSITORY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return parseRepoSlugFromRemote(readOriginRemote());
};

const readTokenFromGitCredentialStore = () => {
  const output = execFileSync('git', ['credential', 'fill'], {
    encoding: 'utf8',
    input: 'protocol=https\nhost=github.com\n\n',
  });

  const tokenLine = output
    .split(/\r?\n/u)
    .find((line) => line.startsWith('password='));
  if (!tokenLine) {
    throw new Error(
      'Unable to resolve GitHub token from credential store. Set GITHUB_TOKEN or GH_TOKEN.',
    );
  }

  const token = tokenLine.slice('password='.length).trim();
  if (!token) {
    throw new Error(
      'Git credential store returned empty password. Set GITHUB_TOKEN or GH_TOKEN.',
    );
  }

  return token;
};

const resolveToken = () => {
  const fromEnv = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  return readTokenFromGitCredentialStore();
};

const githubRequest = async ({ token, method, url }) => {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
  });

  if (response.ok) {
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  const errorText = await response.text();
  throw new Error(
    `GitHub API ${method} ${url} failed: ${response.status} ${response.statusText}. ${errorText}`,
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

const sanitizeFilePart = (value) => {
  return value
    .replace(/[^a-zA-Z0-9._-]/gu, '_')
    .replace(/_+/gu, '_')
    .slice(0, 80);
};

const isReleaseSmokeJob = (job) =>
  String(job?.name ?? '').toLowerCase().includes('release smoke dry-run');

const collectLogs = async ({
  token,
  repoSlug,
  runId,
  runNumber,
  jobs,
  outputDir,
}) => {
  await mkdir(outputDir, { recursive: true });
  const runTag = runNumber ?? runId;
  const metadata = {
    generatedAtUtc: new Date().toISOString(),
    repoSlug,
    runId,
    runNumber,
    jobs: [],
  };

  for (const job of jobs) {
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
        id: jobId,
        name: jobName,
        htmlUrl: String(job.html_url ?? ''),
        startedAt: String(job.started_at ?? ''),
        completedAt: String(job.completed_at ?? ''),
        logFilePath,
        logCaptured: true,
      });
      process.stdout.write(`Captured: ${logFilePath}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      metadata.jobs.push({
        id: jobId,
        name: jobName,
        htmlUrl: String(job.html_url ?? ''),
        startedAt: String(job.started_at ?? ''),
        completedAt: String(job.completed_at ?? ''),
        logFilePath,
        logCaptured: false,
        error: message,
      });
      process.stderr.write(`Failed to capture job ${jobId}: ${message}\n`);
    }
  }

  const metadataPath = path.join(
    outputDir,
    `run-${runTag}-runid-${runId}-retry-metadata.json`,
  );
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  process.stdout.write(`Metadata: ${metadataPath}\n`);
  return metadataPath;
};

const main = async () => {
  const runIdArg = (process.argv[2] ?? process.env.RELEASE_RETRY_LOGS_RUN_ID ?? '').trim();
  if (!runIdArg) {
    throw new Error('Usage: npm run release:smoke:retry:collect -- <run_id>');
  }

  const includeNonFailed = parseBoolean(
    process.env.RELEASE_RETRY_LOGS_INCLUDE_NON_FAILED,
    false,
  );
  const outputDir = resolveRetryLogsDir(process.env);
  const retryLogsCleanupConfig = resolveRetryLogsCleanupConfig(process.env);

  const runId = parseInteger(runIdArg);
  const token = resolveToken();
  const repoSlug = resolveRepoSlug();
  const baseApiUrl = `https://api.github.com/repos/${repoSlug}`;

  const run = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}`,
  });
  const jobsResponse = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}/jobs?per_page=100`,
  });
  const jobs = Array.isArray(jobsResponse?.jobs) ? jobsResponse.jobs : [];

  const selectedJobs = jobs.filter((job) => {
    if (!isReleaseSmokeJob(job)) {
      return false;
    }
    if (includeNonFailed) {
      return true;
    }
    return String(job?.conclusion ?? '') === 'failure';
  });

  process.stdout.write(`Repository: ${repoSlug}\n`);
  process.stdout.write(
    `Run: #${run?.run_number ?? '<unknown>'} (id ${runId}) - ${run?.html_url ?? '<unknown>'}\n`,
  );
  process.stdout.write(`Run conclusion: ${run?.conclusion ?? 'unknown'}\n`);

  if (selectedJobs.length === 0) {
    process.stdout.write(
      'No matching Release Smoke Dry-Run jobs selected for log collection.\n',
    );
    return;
  }

  const cleanupSummary = await cleanupRetryFailureLogs({
    outputDir,
    ...retryLogsCleanupConfig,
  });
  process.stdout.write(
    `${formatRetryLogsCleanupSummary({
      summary: cleanupSummary,
      label: 'retry:collect',
    })}\n`,
  );

  await collectLogs({
    token,
    repoSlug,
    runId,
    runNumber: Number(run?.run_number ?? 0) || null,
    jobs: selectedJobs,
    outputDir,
  });
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
