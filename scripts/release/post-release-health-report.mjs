import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_WORKFLOW_FILE = 'ci.yml';
const DEFAULT_OUTPUT_DIR = 'artifacts/release';
const OUTPUT_LABEL = 'release:health:report';
const REQUIRED_JOB_NAMES = [
  'Ultracite Full Scope (blocking)',
  'test',
  'Security Hygiene Gate',
  'Release Smoke Dry-Run (staging/manual)',
  'Pre-release Performance Gate (staging/manual)',
];
const USAGE = `Usage: npm run release:health:report -- [run_id] [options]

Arguments:
  run_id   Optional GitHub Actions run id (workflow_dispatch). If omitted, the latest completed workflow_dispatch run is used.

Options:
  --json             Print machine-readable summary JSON to stdout.
  --strict           Exit with non-zero status when overall health is not pass.
  --skip-smoke-fetch Skip automatic local smoke-artifact fetch when missing.
  --help, -h         Show help.
`;

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

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
      'Content-Type': 'application/json',
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

const parseRunId = (raw) => {
  if (!raw) {
    return null;
  }
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

const parseCliArgs = (argv) => {
  const args = argv.slice(2);
  const positionals = [];
  const options = {
    help: false,
    json: false,
    strict: false,
    skipSmokeFetch: false,
    runId: null,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--skip-smoke-fetch') {
      options.skipSmokeFetch = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
    positionals.push(arg);
  }

  if (positionals.length > 1) {
    throw new Error(`Unexpected arguments: ${positionals.join(' ')}\n\n${USAGE}`);
  }

  return {
    ...options,
    runId: parseRunId(positionals[0]),
  };
};

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

const runNpmCommand = ({ args, env }) =>
  new Promise((resolve, reject) => {
    const invocation = getNpmInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
      env: { ...process.env, ...(env ?? {}) },
      stdio: 'inherit',
      shell: invocation.shell,
    });

    child.on('error', (error) => {
      reject(
        new Error(
          `Command failed to start (${invocation.command} ${invocation.args.join(' ')}): ${error.message}`,
        ),
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Command failed (${invocation.command} ${invocation.args.join(' ')}) with exit code ${code ?? 'unknown'}`,
        ),
      );
    });
  });

const findLatestDispatchRunId = async ({ token, baseApiUrl, workflowFile }) => {
  const url = `${baseApiUrl}/actions/workflows/${encodeURIComponent(
    workflowFile,
  )}/runs?event=workflow_dispatch&status=completed&per_page=20`;
  const data = await githubRequest({
    token,
    method: 'GET',
    url,
  });
  const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
  const run = runs[0];
  if (!run?.id) {
    throw new Error(
      'Unable to discover a completed workflow_dispatch run. Provide run id explicitly.',
    );
  }

  return {
    id: run.id,
    runNumber: run.run_number,
    htmlUrl: run.html_url,
  };
};

const readLocalSmokeSummary = async (runId) => {
  const smokePath = path.resolve(
    `artifacts/release/ci-run-${runId}/smoke-results.json`,
  );
  try {
    const raw = await readFile(smokePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      source: 'local',
      path: smokePath,
      generatedAtUtc:
        typeof parsed?.generatedAtUtc === 'string'
          ? parsed.generatedAtUtc
          : null,
      summary:
        typeof parsed?.summary === 'object' && parsed.summary
          ? parsed.summary
          : null,
    };
  } catch {
    return {
      source: 'unavailable',
      path: smokePath,
      generatedAtUtc: null,
      summary: null,
    };
  }
};

const buildJobSummary = (jobs) => {
  const normalized = jobs.map((job) => ({
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    htmlUrl: job.html_url,
  }));

  const required = REQUIRED_JOB_NAMES.map((name) => {
    const matched = normalized.find((job) => job.name === name);
    return {
      name,
      present: Boolean(matched),
      pass: matched?.conclusion === 'success',
      status: matched?.status ?? null,
      conclusion: matched?.conclusion ?? null,
      htmlUrl: matched?.htmlUrl ?? null,
    };
  });

  const requiredMissing = required
    .filter((job) => !job.present)
    .map((job) => job.name);
  const requiredFailed = required
    .filter((job) => job.present && !job.pass)
    .map((job) => job.name);

  const failedJobs = normalized
    .filter((job) => job.conclusion === 'failure')
    .map((job) => job.name);

  return {
    required,
    requiredMissing,
    requiredFailed,
    failedJobs,
    total: normalized.length,
    raw: normalized,
  };
};

const toJsonSummaryPayload = ({ report, outputPath, strict }) => ({
  label: OUTPUT_LABEL,
  status: report.summary.pass ? 'pass' : 'fail',
  strict,
  run: {
    id: report.run.id,
    runNumber: report.run.runNumber,
    status: report.run.status,
    conclusion: report.run.conclusion,
    htmlUrl: report.run.htmlUrl,
  },
  totals: {
    requiredJobsTotal: report.summary.requiredJobsTotal,
    requiredJobsPassed: report.summary.requiredJobsPassed,
    failedJobsTotal: report.summary.failedJobsTotal,
    artifactsDiscovered: report.artifacts.length,
  },
  reasons: report.summary.reasons,
  smokeReport: {
    source: report.smokeReport.source,
    path: report.smokeReport.path,
    generatedAtUtc: report.smokeReport.generatedAtUtc,
    summary: report.smokeReport.summary,
    fetchError:
      typeof report.smokeReport.fetchError === 'string'
        ? report.smokeReport.fetchError
        : null,
  },
  outputPath,
});

const main = async () => {
  const cli = parseCliArgs(process.argv);
  if (cli.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const token = resolveToken();
  const repoSlug = resolveRepoSlug();
  const workflowFile =
    process.env.RELEASE_WORKFLOW_FILE?.trim() ?? DEFAULT_WORKFLOW_FILE;
  const outputDir =
    process.env.RELEASE_HEALTH_REPORT_OUTPUT_DIR?.trim() ?? DEFAULT_OUTPUT_DIR;
  const baseApiUrl = `https://api.github.com/repos/${repoSlug}`;

  const resolvedRun = cli.runId
    ? { id: cli.runId, runNumber: null, htmlUrl: null }
    : await findLatestDispatchRunId({ token, baseApiUrl, workflowFile });

  const runId = resolvedRun.id;
  const run = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}`,
  });
  const jobsData = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}/jobs?per_page=100`,
  });
  const artifactsData = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}/artifacts?per_page=100`,
  });

  const jobs = Array.isArray(jobsData?.jobs) ? jobsData.jobs : [];
  const artifacts = Array.isArray(artifactsData?.artifacts)
    ? artifactsData.artifacts
    : [];
  const jobSummary = buildJobSummary(jobs);
  let smokeSummary = await readLocalSmokeSummary(runId);
  const shouldFetchSmokeFromEnv = parseBoolean(
    process.env.RELEASE_HEALTH_REPORT_FETCH_SMOKE,
    true,
  );
  const shouldFetchSmoke =
    cli.skipSmokeFetch === true ? false : shouldFetchSmokeFromEnv;
  const smokeArtifactPresent = artifacts.some(
    (artifact) => artifact?.name === 'release-smoke-report' && !artifact?.expired,
  );
  if (shouldFetchSmoke && smokeSummary.source !== 'local' && smokeArtifactPresent) {
    try {
      await runNpmCommand({
        args: ['run', 'release:smoke:artifact', '--', String(runId)],
        env: token ? { GITHUB_TOKEN: token } : undefined,
      });
      smokeSummary = await readLocalSmokeSummary(runId);
    } catch (error) {
      smokeSummary = {
        ...smokeSummary,
        fetchError: toErrorMessage(error),
      };
    }
  }

  const runConclusion = run?.conclusion ?? null;
  const pass =
    runConclusion === 'success' &&
    jobSummary.requiredMissing.length === 0 &&
    jobSummary.requiredFailed.length === 0;

  const reasons = [];
  if (runConclusion !== 'success') {
    reasons.push(`run conclusion is '${runConclusion ?? 'unknown'}'`);
  }
  if (jobSummary.requiredMissing.length > 0) {
    reasons.push(
      `required jobs missing: ${jobSummary.requiredMissing.join(', ')}`,
    );
  }
  if (jobSummary.requiredFailed.length > 0) {
    reasons.push(
      `required jobs not successful: ${jobSummary.requiredFailed.join(', ')}`,
    );
  }

  const report = {
    schemaVersion: '1.0.0',
    generatedAtUtc: new Date().toISOString(),
    repository: repoSlug,
    run: {
      id: run.id,
      runNumber: run.run_number ?? resolvedRun.runNumber,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.html_url ?? resolvedRun.htmlUrl,
      headSha: run.head_sha,
      event: run.event,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
    },
    summary: {
      pass,
      reasons,
      requiredJobsTotal: jobSummary.required.length,
      requiredJobsPassed: jobSummary.required.filter((job) => job.pass).length,
      failedJobsTotal: jobSummary.failedJobs.length,
    },
    jobs: {
      required: jobSummary.required,
      failedJobs: jobSummary.failedJobs,
      totalJobs: jobSummary.total,
    },
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      expired: artifact.expired,
      sizeInBytes: artifact.size_in_bytes,
      createdAt: artifact.created_at,
      updatedAt: artifact.updated_at,
      archiveDownloadUrl: artifact.archive_download_url,
    })),
    smokeReport: smokeSummary,
  };

  await mkdir(outputDir, { recursive: true });
  const outputPath = path.resolve(
    path.join(outputDir, `post-release-health-run-${runId}.json`),
  );
  await writeFile(outputPath, JSON.stringify(report, null, 2));

  const strictMode =
    cli.strict ||
    parseBoolean(process.env.RELEASE_HEALTH_REPORT_STRICT, false);

  if (cli.json) {
    const payload = toJsonSummaryPayload({
      report,
      outputPath,
      strict: strictMode,
    });
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`Repository: ${repoSlug}\n`);
    process.stdout.write(
      `Run: #${report.run.runNumber ?? '<unknown>'} (id ${report.run.id})\n`,
    );
    process.stdout.write(`Run URL: ${report.run.htmlUrl ?? '<unknown>'}\n`);
    process.stdout.write(
      `Overall health: ${report.summary.pass ? 'pass' : 'fail'}\n`,
    );
    if (!report.summary.pass) {
      process.stdout.write(`Reasons: ${report.summary.reasons.join('; ')}\n`);
    }
    process.stdout.write(
      `Required jobs: ${report.summary.requiredJobsPassed}/${report.summary.requiredJobsTotal} passed\n`,
    );
    process.stdout.write(`Artifacts discovered: ${report.artifacts.length}\n`);
    if (report.smokeReport.source === 'local' && report.smokeReport.summary) {
      process.stdout.write(
        `Smoke summary: pass=${String(report.smokeReport.summary.pass)} totalSteps=${String(
          report.smokeReport.summary.totalSteps,
        )} failedSteps=${String(report.smokeReport.summary.failedSteps)}\n`,
      );
    } else {
      process.stdout.write('Smoke summary: unavailable\n');
    }
    process.stdout.write(`Report written: ${outputPath}\n`);
  }

  if (strictMode && !report.summary.pass) {
    process.exit(1);
  }
};

main().catch((error) => {
  process.stderr.write(`${toErrorMessage(error)}\n`);
  process.exit(1);
});
