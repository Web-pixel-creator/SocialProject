import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  RELEASE_HEALTH_REPORT_JSON_SCHEMA_PATH,
  RELEASE_HEALTH_REPORT_JSON_SCHEMA_VERSION,
  RELEASE_HEALTH_REPORT_LABEL,
} from './release-health-schema-contracts.mjs';

const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_WORKFLOW_FILE = 'ci.yml';
const DEFAULT_OUTPUT_DIR = 'artifacts/release';
const EXTERNAL_CHANNEL_TRACE_ARTIFACT_NAME = 'production-external-channel-traces';
const EXTERNAL_CHANNEL_TRACE_FILE_NAME =
  'production-agent-gateway-external-channel-traces.json';
const EXTERNAL_CHANNEL_FAILURE_MODE_PASS_LABEL = 'pass_null';
const DEFAULT_EXTERNAL_CHANNEL_TREND_WINDOW = 3;
const DEFAULT_EXTERNAL_CHANNEL_TREND_MIN_RUNS = 1;
const DEFAULT_EXTERNAL_CHANNEL_ALERT_TIMEOUT_MS = 10000;
const DEFAULT_RELEASE_HEALTH_ALERT_RISK_WINDOW_HOURS = 24;
const DEFAULT_RELEASE_HEALTH_ALERT_RISK_ESCALATION_STREAK = 2;
const RELEASE_HEALTH_ALERT_RISK_THRESHOLDS = {
  alertedRuns: {
    criticalAbove: 2,
    watchAbove: 1,
  },
  firstAppearances: {
    criticalAbove: 3,
    watchAbove: 1,
  },
  totalAlerts: {
    criticalAbove: 3,
    watchAbove: 1,
  },
};
const WORKFLOW_PROFILES = {
  ci: {
    requiredArtifactNames: [
      'release-smoke-report',
      'release-smoke-preflight-summary',
      'release-env-preflight-summary',
      'retry-schema-gate-summary',
      'release-smoke-preflight-schema-summary',
    ],
    requiredJobNames: [
      'Ultracite Full Scope (blocking)',
      'test',
      'Security Hygiene Gate',
      'Release Smoke Dry-Run (staging/manual)',
      'Pre-release Performance Gate (staging/manual)',
    ],
    smokeArtifactName: 'release-smoke-report',
    smokeFetchMode: 'ci',
    workflowFile: 'ci.yml',
  },
  launch_gate: {
    requiredArtifactNames: [
      'production-launch-gate-summary',
      'production-launch-gate-health-summary',
      'production-smoke-postdeploy',
      'production-runtime-orchestration-probe',
      'production-adapter-matrix-probe',
      'production-ingest-probe',
      'production-gateway-telemetry',
      'production-gateway-adapters',
      'production-admin-health-summary',
      EXTERNAL_CHANNEL_TRACE_ARTIFACT_NAME,
    ],
    requiredJobNames: ['Production Launch Gate'],
    smokeArtifactName: 'production-smoke-postdeploy',
    smokeFetchMode: 'local-launch-gate',
    workflowFile: 'production-launch-gate.yml',
  },
};
const USAGE = `Usage: npm run release:health:report -- [run_id] [options]

Arguments:
  run_id   Optional GitHub Actions run id (workflow_dispatch). If omitted, the latest completed workflow_dispatch run is used.

Options:
  --workflow-file <name> Select workflow file for run discovery (defaults to profile default).
  --profile <name>       Health profile: ci | launch-gate.
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

const githubRequest = async ({ token, method, url, expectBinary = false }) => {
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
    if (expectBinary) {
      return Buffer.from(await response.arrayBuffer());
    }
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

const parsePositiveInteger = ({ raw, fallback, minimum, label }) => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(
      `${label} must be an integer greater than or equal to ${minimum}.`,
    );
  }
  return parsed;
};

const toFiniteNumber = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toNonNegativeInteger = (value, fallback = 0) => {
  const parsed = toFiniteNumber(value, null);
  if (parsed === null) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
};

const normalizeReleaseApiBaseUrl = (value) => value.replace(/\/+$/u, '');

const buildObserverEngagementEndpointUrl = ({ apiBaseUrl, windowHours }) => {
  const normalizedBase = normalizeReleaseApiBaseUrl(apiBaseUrl);
  const pathPrefix = normalizedBase.endsWith('/api') ? '' : '/api';
  return `${normalizedBase}${pathPrefix}/admin/ux/observer-engagement?hours=${String(windowHours)}`;
};

const deriveReleaseHealthAlertRiskLevel = ({
  alertEvents,
  alertedRuns,
  firstAppearances,
}) => {
  if (
    firstAppearances >= RELEASE_HEALTH_ALERT_RISK_THRESHOLDS.firstAppearances.criticalAbove ||
    alertEvents >= RELEASE_HEALTH_ALERT_RISK_THRESHOLDS.totalAlerts.criticalAbove ||
    alertedRuns >= RELEASE_HEALTH_ALERT_RISK_THRESHOLDS.alertedRuns.criticalAbove
  ) {
    return 'critical';
  }
  if (firstAppearances >= 1 || alertEvents >= 1 || alertedRuns >= 1) {
    return 'watch';
  }
  return 'healthy';
};

const countConsecutiveSuccessfulRunsFromCurrent = ({ currentRunId, runs }) => {
  if (!Array.isArray(runs) || runs.length === 0) {
    return 0;
  }
  const currentIndex = runs.findIndex(
    (entry) => Number(entry?.id) === Number(currentRunId),
  );
  if (currentIndex < 0) {
    return 0;
  }
  let streak = 0;
  for (let index = currentIndex; index < runs.length; index += 1) {
    if (runs[index]?.conclusion !== 'success') {
      break;
    }
    streak += 1;
  }
  return streak;
};

const fetchReleaseHealthAlertTelemetryCheck = async ({
  token,
  baseApiUrl,
  workflowFile,
  currentRunId,
}) => {
  const enabled = parseBoolean(process.env.RELEASE_HEALTH_ALERT_RISK_ENABLED, true);
  const strict = parseBoolean(process.env.RELEASE_HEALTH_ALERT_RISK_STRICT, false);
  const windowHours = parsePositiveInteger({
    raw: process.env.RELEASE_HEALTH_ALERT_RISK_WINDOW_HOURS,
    fallback: DEFAULT_RELEASE_HEALTH_ALERT_RISK_WINDOW_HOURS,
    minimum: 1,
    label: 'RELEASE_HEALTH_ALERT_RISK_WINDOW_HOURS',
  });
  const escalationStreak = parsePositiveInteger({
    raw: process.env.RELEASE_HEALTH_ALERT_RISK_ESCALATION_STREAK,
    fallback: DEFAULT_RELEASE_HEALTH_ALERT_RISK_ESCALATION_STREAK,
    minimum: 2,
    label: 'RELEASE_HEALTH_ALERT_RISK_ESCALATION_STREAK',
  });
  const apiBaseUrlRaw = String(process.env.RELEASE_API_BASE_URL ?? '').trim();
  const adminToken = String(
    process.env.RELEASE_ADMIN_API_TOKEN ??
      process.env.RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_WEBHOOK_ADMIN_TOKEN ??
      '',
  ).trim();

  const payloadBase = {
    enabled,
    strict,
    windowHours,
    escalationStreak,
    apiBaseUrl: apiBaseUrlRaw.length > 0 ? normalizeReleaseApiBaseUrl(apiBaseUrlRaw) : null,
    endpointUrl: null,
    status: enabled ? 'unavailable' : 'disabled',
    evaluated: false,
    fetchedAtUtc: null,
    fetchError: null,
    counts: {
      alertEvents: 0,
      firstAppearances: 0,
      alertedRuns: 0,
    },
    riskLevel: 'unknown',
    pass: true,
    consecutiveSuccessfulRunStreak: 0,
    escalationTriggered: false,
    reasons: [],
  };

  if (!enabled) {
    return payloadBase;
  }

  if (apiBaseUrlRaw.length === 0) {
    return {
      ...payloadBase,
      fetchError: 'RELEASE_API_BASE_URL is not configured.',
    };
  }

  if (adminToken.length === 0) {
    return {
      ...payloadBase,
      fetchError: 'RELEASE_ADMIN_API_TOKEN is not configured.',
    };
  }

  const endpointUrl = buildObserverEngagementEndpointUrl({
    apiBaseUrl: apiBaseUrlRaw,
    windowHours,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let observerEngagementPayload = null;
  try {
    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-admin-token': adminToken,
      },
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `observer-engagement request failed (${response.status} ${response.statusText})${responseText ? `: ${responseText.slice(0, 300)}` : ''}`,
      );
    }
    observerEngagementPayload = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    return {
      ...payloadBase,
      endpointUrl,
      fetchError: toErrorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }

  const releaseHealthAlerts =
    observerEngagementPayload?.releaseHealthAlerts &&
    typeof observerEngagementPayload.releaseHealthAlerts === 'object'
      ? observerEngagementPayload.releaseHealthAlerts
      : {};
  const kpis =
    observerEngagementPayload?.kpis && typeof observerEngagementPayload.kpis === 'object'
      ? observerEngagementPayload.kpis
      : {};

  const alertEvents = toNonNegativeInteger(
    toFiniteNumber(
      releaseHealthAlerts.totalAlerts,
      toFiniteNumber(kpis.releaseHealthAlertCount, 0),
    ),
    0,
  );
  const firstAppearances = toNonNegativeInteger(
    toFiniteNumber(
      releaseHealthAlerts.firstAppearanceCount,
      toFiniteNumber(kpis.releaseHealthFirstAppearanceCount, 0),
    ),
    0,
  );
  const alertedRuns = toNonNegativeInteger(
    toFiniteNumber(
      releaseHealthAlerts.uniqueRuns,
      toFiniteNumber(kpis.releaseHealthAlertedRunCount, 0),
    ),
    0,
  );
  const riskLevel = deriveReleaseHealthAlertRiskLevel({
    alertEvents,
    alertedRuns,
    firstAppearances,
  });

  let consecutiveSuccessfulRunStreak = 0;
  try {
    const recentRuns = await listWorkflowDispatchRuns({
      token,
      baseApiUrl,
      workflowFile,
      limit: Math.max(escalationStreak * 4, 20),
    });
    consecutiveSuccessfulRunStreak = countConsecutiveSuccessfulRunsFromCurrent({
      currentRunId,
      runs: recentRuns,
    });
  } catch {
    // Keep streak at 0 when run-history lookup fails; this check remains advisory.
  }

  const escalationTriggered =
    (riskLevel === 'watch' || riskLevel === 'critical') &&
    consecutiveSuccessfulRunStreak >= escalationStreak;

  const reasons = [];
  if (escalationTriggered) {
    reasons.push(
      `alert risk remained ${riskLevel} across ${String(consecutiveSuccessfulRunStreak)} consecutive successful workflow_dispatch runs`,
    );
  }

  return {
    ...payloadBase,
    endpointUrl,
    status: riskLevel,
    evaluated: true,
    fetchedAtUtc: new Date().toISOString(),
    fetchError: null,
    counts: {
      alertEvents,
      firstAppearances,
      alertedRuns,
    },
    riskLevel,
    pass: riskLevel === 'healthy',
    consecutiveSuccessfulRunStreak,
    escalationTriggered,
    reasons,
  };
};

const postJsonWithTimeout = async ({ url, payload, timeoutMs, headers = {} }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const mergedHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers,
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: mergedHeaders,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseBodyPreview: text.slice(0, 500),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const resolveExternalChannelAlertWebhookHeaders = () => {
  const headers = {};
  const adminToken = String(
    process.env.RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_WEBHOOK_ADMIN_TOKEN ??
      process.env.RELEASE_ADMIN_API_TOKEN ??
      '',
  ).trim();
  const csrfToken = String(
    process.env.RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_WEBHOOK_CSRF_TOKEN ??
      process.env.RELEASE_CSRF_TOKEN ??
      '',
  ).trim();
  const bearerToken = String(
    process.env.RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_WEBHOOK_BEARER_TOKEN ??
      '',
  ).trim();

  if (adminToken.length > 0) {
    headers['x-admin-token'] = adminToken;
  }
  if (csrfToken.length > 0) {
    headers['x-csrf-token'] = csrfToken;
  }
  if (bearerToken.length > 0) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  return headers;
};

const parseCliArgs = (argv) => {
  const args = argv.slice(2);
  const positionals = [];
  const options = {
    help: false,
    json: false,
    profile: '',
    strict: false,
    skipSmokeFetch: false,
    runId: null,
    workflowFile: '',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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
    if (arg === '--workflow-file') {
      const value = (args[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      options.workflowFile = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--workflow-file=')) {
      options.workflowFile = arg.slice('--workflow-file='.length).trim();
      continue;
    }
    if (arg === '--profile') {
      const value = (args[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      options.profile = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--profile=')) {
      options.profile = arg.slice('--profile='.length).trim();
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

const normalizeProfileKey = (value) => {
  return value.trim().toLowerCase().replace(/-/gu, '_');
};

const resolveWorkflowProfile = ({ profileArg, workflowFileArg }) => {
  const profileFromCliRaw = normalizeProfileKey(profileArg || '');
  if (profileFromCliRaw && !(profileFromCliRaw in WORKFLOW_PROFILES)) {
    const knownProfiles = Object.keys(WORKFLOW_PROFILES).join(', ');
    throw new Error(
      `Unknown release health profile '${profileFromCliRaw}'. Expected one of: ${knownProfiles}.`,
    );
  }
  const profileFromEnvRaw = normalizeProfileKey(
    process.env.RELEASE_HEALTH_REPORT_PROFILE || '',
  );
  if (profileFromEnvRaw && !(profileFromEnvRaw in WORKFLOW_PROFILES)) {
    const knownProfiles = Object.keys(WORKFLOW_PROFILES).join(', ');
    throw new Error(
      `Unknown release health profile from RELEASE_HEALTH_REPORT_PROFILE ('${profileFromEnvRaw}'). Expected one of: ${knownProfiles}.`,
    );
  }
  const profileFromCli = profileFromCliRaw;
  const profileFromEnv = profileFromEnvRaw;
  const normalizedWorkflowFileArg = String(workflowFileArg || '').trim();
  const normalizedWorkflowFileEnv = String(
    process.env.RELEASE_WORKFLOW_FILE || '',
  ).trim();
  const workflowFileFromInput =
    normalizedWorkflowFileArg || normalizedWorkflowFileEnv;

  if (
    !profileFromCli &&
    !profileFromEnv &&
    workflowFileFromInput.toLowerCase() === 'production-launch-gate.yml'
  ) {
    return {
      profileKey: 'launch_gate',
      ...WORKFLOW_PROFILES.launch_gate,
      workflowFile: workflowFileFromInput,
    };
  }

  const profileKey = profileFromCli || profileFromEnv || 'ci';
  const profile = WORKFLOW_PROFILES[profileKey];
  if (!profile) {
    const knownProfiles = Object.keys(WORKFLOW_PROFILES).join(', ');
    throw new Error(
      `Unknown release health profile '${profileKey}'. Expected one of: ${knownProfiles}.`,
    );
  }

  return {
    profileKey,
    ...profile,
    workflowFile: workflowFileFromInput || profile.workflowFile,
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

const escapePowerShellLiteral = (value) => `'${value.replace(/'/gu, "''")}'`;

const tryExtract = (command, args, extractDir) => {
  try {
    execFileSync(command, args, { stdio: 'pipe' });
    return { ok: true };
  } catch (error) {
    const message = toErrorMessage(error);
    return {
      ok: false,
      message: `${command} ${args.join(' ')} failed while extracting to ${extractDir}: ${message}`,
    };
  }
};

const extractArtifactArchive = async ({ zipPath, extractDir }) => {
  await mkdir(extractDir, { recursive: true });
  const attempts = [];

  if (process.platform === 'win32') {
    attempts.push(() =>
      tryExtract(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -Path ${escapePowerShellLiteral(
            zipPath,
          )} -DestinationPath ${escapePowerShellLiteral(extractDir)} -Force`,
        ],
        extractDir,
      ),
    );
  }

  attempts.push(() => tryExtract('tar', ['-xf', zipPath, '-C', extractDir], extractDir));
  attempts.push(() => tryExtract('unzip', ['-o', zipPath, '-d', extractDir], extractDir));

  const failures = [];
  for (const attempt of attempts) {
    const result = attempt();
    if (result.ok) {
      return;
    }
    failures.push(result.message);
  }

  throw new Error(
    `Unable to extract artifact archive ${zipPath}. Attempts:\n${failures.join('\n')}`,
  );
};

const findFileRecursive = async ({ directory, fileName }) => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidatePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileRecursive({
        directory: candidatePath,
        fileName,
      });
      if (nested) {
        return nested;
      }
      continue;
    }
    if (entry.isFile() && entry.name === fileName) {
      return candidatePath;
    }
  }
  return null;
};

const incrementCount = (mapObject, key) => {
  mapObject[key] = Number(mapObject[key] ?? 0) + 1;
};

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

const listWorkflowDispatchRuns = async ({
  token,
  baseApiUrl,
  workflowFile,
  limit,
}) => {
  const url = `${baseApiUrl}/actions/workflows/${encodeURIComponent(
    workflowFile,
  )}/runs?event=workflow_dispatch&status=completed&per_page=${String(limit)}`;
  const data = await githubRequest({
    token,
    method: 'GET',
    url,
  });
  return Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
};

const fetchRunArtifacts = async ({ token, baseApiUrl, runId }) => {
  const artifactsData = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}/artifacts?per_page=100`,
  });
  return Array.isArray(artifactsData?.artifacts) ? artifactsData.artifacts : [];
};

const findActiveArtifactByName = ({ artifacts, name }) =>
  artifacts.find((artifact) => artifact?.name === name && artifact?.expired === false);

const summarizeExternalChannelTracePayload = ({ tracePayload }) => {
  const checks = Array.isArray(tracePayload?.checks) ? tracePayload.checks : [];
  const failedChannels = Array.isArray(tracePayload?.failedChannels)
    ? tracePayload.failedChannels
    : [];
  const requiredFailedChannels = Array.isArray(tracePayload?.requiredFailedChannels)
    ? tracePayload.requiredFailedChannels
    : [];

  const modeDistribution = {};
  const channelModeDistribution = {};
  const nonPassChecks = [];
  for (const check of checks) {
    const channel =
      typeof check?.channel === 'string' && check.channel.length > 0
        ? check.channel
        : 'unknown';
    const failureMode =
      typeof check?.failureMode === 'string' && check.failureMode.length > 0
        ? check.failureMode
        : EXTERNAL_CHANNEL_FAILURE_MODE_PASS_LABEL;
    incrementCount(modeDistribution, failureMode);
    incrementCount(channelModeDistribution, `${channel}|${failureMode}`);
    if (failureMode !== EXTERNAL_CHANNEL_FAILURE_MODE_PASS_LABEL) {
      nonPassChecks.push({
        channel,
        connectorId:
          typeof check?.connectorId === 'string' && check.connectorId.length > 0
            ? check.connectorId
            : null,
        failureMode,
      });
    }
  }

  return {
    checkedAtUtc:
      typeof tracePayload?.checkedAtUtc === 'string' ? tracePayload.checkedAtUtc : null,
    checksTotal: checks.length,
    failedChannelsTotal: failedChannels.length,
    modeDistribution,
    nonPassChecks,
    channelModeDistribution,
    pass: tracePayload?.pass === true,
    requiredFailedChannelsTotal: requiredFailedChannels.length,
    requiredChannelsPass: tracePayload?.requiredChannelsPass === true,
    skipped: tracePayload?.skipped === true,
  };
};

const buildExternalChannelFirstAppearanceAlert = ({
  trend,
  currentRunId,
  currentRunNumber,
  currentRunUrl,
  repository,
  workflowFile,
  workflowProfile,
}) => {
  const currentRun = trend.analyzedRuns.find(
    (entry) => Number(entry.runId) === Number(currentRunId),
  );
  const currentNonPassChecks = Array.isArray(currentRun?.nonPassChecks)
    ? currentRun.nonPassChecks
    : [];
  const previousChannelModeKeys = new Set();
  for (const analyzedRun of trend.analyzedRuns) {
    if (Number(analyzedRun.runId) === Number(currentRunId)) {
      continue;
    }
    const checks = Array.isArray(analyzedRun.nonPassChecks)
      ? analyzedRun.nonPassChecks
      : [];
    for (const check of checks) {
      if (
        typeof check?.channel === 'string' &&
        check.channel.length > 0 &&
        typeof check?.failureMode === 'string' &&
        check.failureMode.length > 0
      ) {
        previousChannelModeKeys.add(`${check.channel}|${check.failureMode}`);
      }
    }
  }

  const dedupeKeys = new Set();
  const firstAppearances = [];
  for (const check of currentNonPassChecks) {
    if (
      typeof check?.channel !== 'string' ||
      check.channel.length === 0 ||
      typeof check?.failureMode !== 'string' ||
      check.failureMode.length === 0
    ) {
      continue;
    }
    const channelModeKey = `${check.channel}|${check.failureMode}`;
    if (previousChannelModeKeys.has(channelModeKey) || dedupeKeys.has(channelModeKey)) {
      continue;
    }
    dedupeKeys.add(channelModeKey);
    firstAppearances.push({
      channel: check.channel,
      connectorId:
        typeof check.connectorId === 'string' && check.connectorId.length > 0
          ? check.connectorId
          : null,
      failureMode: check.failureMode,
      runId: Number(currentRunId),
      runNumber:
        Number.isInteger(Number(currentRunNumber)) && Number(currentRunNumber) > 0
          ? Number(currentRunNumber)
          : null,
      runUrl: typeof currentRunUrl === 'string' ? currentRunUrl : null,
    });
  }

  return {
    enabled: false,
    triggered: firstAppearances.length > 0,
    webhookUrlConfigured: false,
    webhookAttempted: false,
    webhookDelivered: false,
    webhookStatusCode: null,
    webhookError: null,
    webhookDeliveredAtUtc: null,
    firstAppearances,
    payload: {
      label: 'external-channel-failure-mode-first-appearance',
      generatedAtUtc: new Date().toISOString(),
      repository,
      workflow: {
        file: workflowFile,
        profile: workflowProfile,
      },
      trendWindow: {
        windowSize: trend.windowSize,
        minimumRuns: trend.minimumRuns,
        analyzedRuns: trend.analyzedRuns.length,
      },
      run: {
        id: Number(currentRunId),
        number:
          Number.isInteger(Number(currentRunNumber)) && Number(currentRunNumber) > 0
            ? Number(currentRunNumber)
            : null,
        htmlUrl: typeof currentRunUrl === 'string' ? currentRunUrl : null,
      },
      firstAppearances,
    },
  };
};

const dispatchExternalChannelFirstAppearanceAlert = async ({
  alert,
  webhookUrl,
  webhookHeaders,
  timeoutMs,
}) => {
  const next = {
    ...alert,
    enabled: true,
    webhookUrlConfigured: webhookUrl.length > 0,
  };
  if (!next.triggered || !next.webhookUrlConfigured) {
    return next;
  }

  next.webhookAttempted = true;
  try {
    const response = await postJsonWithTimeout({
      url: webhookUrl,
      payload: next.payload,
      timeoutMs,
      headers: webhookHeaders,
    });
    next.webhookStatusCode = Number(response.status);
    next.webhookDelivered = response.ok === true;
    next.webhookDeliveredAtUtc = response.ok ? new Date().toISOString() : null;
    if (!response.ok) {
      next.webhookError = `webhook responded ${String(response.status)} ${response.statusText}${response.responseBodyPreview ? `: ${response.responseBodyPreview}` : ''}`;
    }
  } catch (error) {
    next.webhookDelivered = false;
    next.webhookError = toErrorMessage(error);
  }

  return next;
};

const analyzeExternalChannelFailureModeTrend = async ({
  token,
  baseApiUrl,
  workflowFile,
  currentRun,
  currentRunArtifacts,
  windowSize,
  minimumRuns,
}) => {
  const recentRuns = await listWorkflowDispatchRuns({
    token,
    baseApiUrl,
    workflowFile,
    limit: Math.max(windowSize * 4, 20),
  });

  const candidateRuns = [];
  const seenRunIds = new Set();
  const addCandidate = (entry) => {
    const id = Number(entry?.id);
    if (!Number.isInteger(id) || id <= 0 || seenRunIds.has(id)) {
      return;
    }
    seenRunIds.add(id);
    candidateRuns.push({
      id,
      runNumber:
        Number.isInteger(Number(entry?.run_number)) && Number(entry?.run_number) > 0
          ? Number(entry.run_number)
          : null,
      conclusion: typeof entry?.conclusion === 'string' ? entry.conclusion : null,
      htmlUrl: typeof entry?.html_url === 'string' ? entry.html_url : null,
    });
  };

  addCandidate({
    id: currentRun.id,
    run_number: currentRun.run_number,
    conclusion: currentRun.conclusion,
    html_url: currentRun.html_url,
  });
  for (const entry of recentRuns) {
    addCandidate(entry);
  }

  const trend = {
    artifactName: EXTERNAL_CHANNEL_TRACE_ARTIFACT_NAME,
    currentRunId: Number(currentRun.id),
    pass: true,
    reasons: [],
    windowSize,
    minimumRuns,
    analyzedRuns: [],
    modeDistribution: {},
    channelModeDistribution: {},
    nonPassModes: [],
    runsWithFailures: [],
    runsWithRequiredFailures: [],
    missingArtifactRunIds: [],
    analysisErrors: [],
    generatedAtUtc: new Date().toISOString(),
  };

  let tempRoot = '';
  try {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'release-health-external-channel-'));
    for (const candidate of candidateRuns) {
      if (trend.analyzedRuns.length >= windowSize) {
        break;
      }
      if (
        Number(candidate.id) !== Number(currentRun.id) &&
        candidate.conclusion !== 'success'
      ) {
        continue;
      }
      const runArtifacts =
        candidate.id === Number(currentRun.id)
          ? currentRunArtifacts
          : await fetchRunArtifacts({
              token,
              baseApiUrl,
              runId: candidate.id,
            });
      const traceArtifact = findActiveArtifactByName({
        artifacts: runArtifacts,
        name: EXTERNAL_CHANNEL_TRACE_ARTIFACT_NAME,
      });
      if (!traceArtifact) {
        trend.missingArtifactRunIds.push(candidate.id);
        continue;
      }

      try {
        const archiveBuffer = await githubRequest({
          token,
          method: 'GET',
          url: traceArtifact.archive_download_url,
          expectBinary: true,
        });
        const runDir = path.join(tempRoot, String(candidate.id));
        const zipPath = path.join(runDir, `${traceArtifact.id}.zip`);
        const extractDir = path.join(runDir, 'extract');
        await mkdir(runDir, { recursive: true });
        await writeFile(zipPath, archiveBuffer);
        await extractArtifactArchive({
          zipPath,
          extractDir,
        });

        const traceFilePath = await findFileRecursive({
          directory: extractDir,
          fileName: EXTERNAL_CHANNEL_TRACE_FILE_NAME,
        });
        if (!traceFilePath) {
          throw new Error(
            `Trace JSON file '${EXTERNAL_CHANNEL_TRACE_FILE_NAME}' not found in artifact archive.`,
          );
        }
        const parsed = JSON.parse(await readFile(traceFilePath, 'utf8'));
        const summary = summarizeExternalChannelTracePayload({
          tracePayload: parsed,
        });
        trend.analyzedRuns.push({
          artifactId: Number(traceArtifact.id),
          checkedAtUtc: summary.checkedAtUtc,
          checksTotal: summary.checksTotal,
          conclusion: candidate.conclusion,
          failedChannelsTotal: summary.failedChannelsTotal,
          htmlUrl: candidate.htmlUrl,
          modeDistribution: summary.modeDistribution,
          nonPassChecks: summary.nonPassChecks,
          pass: summary.pass,
          requiredChannelsPass: summary.requiredChannelsPass,
          requiredFailedChannelsTotal: summary.requiredFailedChannelsTotal,
          runId: candidate.id,
          runNumber: candidate.runNumber,
          skipped: summary.skipped,
        });
        for (const [mode, count] of Object.entries(summary.modeDistribution)) {
          trend.modeDistribution[mode] = Number(trend.modeDistribution[mode] ?? 0) + count;
        }
        for (const [modeKey, count] of Object.entries(summary.channelModeDistribution)) {
          trend.channelModeDistribution[modeKey] =
            Number(trend.channelModeDistribution[modeKey] ?? 0) + count;
        }
        if (summary.failedChannelsTotal > 0) {
          trend.runsWithFailures.push(candidate.id);
        }
        if (summary.requiredFailedChannelsTotal > 0) {
          trend.runsWithRequiredFailures.push(candidate.id);
        }
      } catch (error) {
        trend.analysisErrors.push({
          runId: candidate.id,
          message: toErrorMessage(error),
        });
      }
    }
  } finally {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  const analyzedRunIdSet = new Set(
    trend.analyzedRuns.map((entry) => Number(entry.runId)).filter(Number.isInteger),
  );
  const nonPassModes = Object.keys(trend.modeDistribution)
    .filter((mode) => mode !== EXTERNAL_CHANNEL_FAILURE_MODE_PASS_LABEL)
    .sort((left, right) => left.localeCompare(right));
  trend.nonPassModes = nonPassModes;

  const trendReasons = [];
  if (!analyzedRunIdSet.has(Number(currentRun.id))) {
    trendReasons.push(
      `missing ${EXTERNAL_CHANNEL_TRACE_ARTIFACT_NAME} for current run ${String(currentRun.id)}`,
    );
  }
  if (trend.analyzedRuns.length < minimumRuns) {
    trendReasons.push(
      `insufficient analyzed runs for external-channel trend (${trend.analyzedRuns.length}/${minimumRuns})`,
    );
  }
  if (nonPassModes.length > 0) {
    trendReasons.push(
      `non-pass external-channel failure modes detected: ${nonPassModes.join(', ')}`,
    );
  }
  if (trend.runsWithRequiredFailures.length > 0) {
    trendReasons.push(
      `required external channel failures detected in runs: ${trend.runsWithRequiredFailures.join(', ')}`,
    );
  }

  trend.reasons = trendReasons;
  trend.pass = trendReasons.length === 0;
  return trend;
};

const readLocalSmokeSummary = async ({ runId, smokeFetchMode }) => {
  const smokePath =
    smokeFetchMode === 'local-launch-gate'
      ? path.resolve('artifacts/release/smoke-results-production-postdeploy.json')
      : path.resolve(`artifacts/release/ci-run-${runId}/smoke-results.json`);
  try {
    const raw = await readFile(smokePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      source:
        smokeFetchMode === 'local-launch-gate'
          ? 'local-launch-gate'
          : 'local',
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

const buildJobSummary = ({ jobs, requiredJobNames }) => {
  const normalized = jobs.map((job) => ({
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    htmlUrl: job.html_url,
  }));

  const required = requiredJobNames.map((name) => {
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

const buildArtifactSummary = ({ artifacts, requiredArtifactNames }) => {
  const normalized = artifacts.map((artifact) => ({
    id: artifact.id,
    name: artifact.name,
    expired: artifact.expired,
  }));

  const required = requiredArtifactNames.map((name) => {
    const matches = normalized.filter((artifact) => artifact.name === name);
    const activeMatch = matches.find((artifact) => artifact.expired === false);
    return {
      name,
      present: Boolean(activeMatch),
      expired: matches.length > 0 && !activeMatch,
      artifactId: activeMatch?.id ?? null,
    };
  });

  const requiredMissing = required
    .filter((artifact) => !artifact.present)
    .map((artifact) => artifact.name);

  return {
    required,
    requiredMissing,
    total: normalized.length,
  };
};

const toJsonSummaryPayload = ({ report, outputPath, strict }) => ({
  label: RELEASE_HEALTH_REPORT_LABEL,
  status: report.summary.pass ? 'pass' : 'fail',
  strict,
  workflow: {
    file: report.workflow.file,
    profile: report.workflow.profile,
  },
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
    requiredArtifactsTotal: report.summary.requiredArtifactsTotal,
    requiredArtifactsPresent: report.summary.requiredArtifactsPresent,
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
  externalChannelFailureModes:
    report.externalChannelFailureModes && typeof report.externalChannelFailureModes === 'object'
      ? {
          pass: report.externalChannelFailureModes.pass,
          windowSize: report.externalChannelFailureModes.windowSize,
          minimumRuns: report.externalChannelFailureModes.minimumRuns,
          analyzedRuns: report.externalChannelFailureModes.analyzedRuns.length,
          nonPassModes: report.externalChannelFailureModes.nonPassModes,
          runsWithRequiredFailures:
            report.externalChannelFailureModes.runsWithRequiredFailures,
          reasons: report.externalChannelFailureModes.reasons,
          firstAppearanceAlert:
            report.externalChannelFailureModes.firstAppearanceAlert &&
            typeof report.externalChannelFailureModes.firstAppearanceAlert ===
              'object'
              ? {
                  triggered:
                    report.externalChannelFailureModes.firstAppearanceAlert
                      .triggered === true,
                  enabled:
                    report.externalChannelFailureModes.firstAppearanceAlert
                      .enabled === true,
                  webhookUrlConfigured:
                    report.externalChannelFailureModes.firstAppearanceAlert
                      .webhookUrlConfigured === true,
                  firstAppearances: Array.isArray(
                    report.externalChannelFailureModes.firstAppearanceAlert
                      .firstAppearances,
                  )
                    ? report.externalChannelFailureModes.firstAppearanceAlert
                        .firstAppearances
                    : [],
                  webhookAttempted:
                    report.externalChannelFailureModes.firstAppearanceAlert
                      .webhookAttempted === true,
                  webhookDelivered:
                    report.externalChannelFailureModes.firstAppearanceAlert
                      .webhookDelivered === true,
                  webhookStatusCode:
                    report.externalChannelFailureModes.firstAppearanceAlert
                      .webhookStatusCode ?? null,
                  webhookError:
                    typeof report.externalChannelFailureModes.firstAppearanceAlert
                      .webhookError === 'string'
                      ? report.externalChannelFailureModes.firstAppearanceAlert
                          .webhookError
                      : null,
                }
              : null,
        }
      : null,
  releaseHealthAlertTelemetry:
    report.releaseHealthAlertTelemetry &&
    typeof report.releaseHealthAlertTelemetry === 'object'
      ? {
          enabled: report.releaseHealthAlertTelemetry.enabled === true,
          strict: report.releaseHealthAlertTelemetry.strict === true,
          windowHours: report.releaseHealthAlertTelemetry.windowHours,
          escalationStreak: report.releaseHealthAlertTelemetry.escalationStreak,
          status:
            typeof report.releaseHealthAlertTelemetry.status === 'string'
              ? report.releaseHealthAlertTelemetry.status
              : 'unknown',
          evaluated: report.releaseHealthAlertTelemetry.evaluated === true,
          fetchedAtUtc:
            typeof report.releaseHealthAlertTelemetry.fetchedAtUtc === 'string'
              ? report.releaseHealthAlertTelemetry.fetchedAtUtc
              : null,
          fetchError:
            typeof report.releaseHealthAlertTelemetry.fetchError === 'string'
              ? report.releaseHealthAlertTelemetry.fetchError
              : null,
          counts: {
            alertEvents:
              report.releaseHealthAlertTelemetry.counts?.alertEvents ?? 0,
            firstAppearances:
              report.releaseHealthAlertTelemetry.counts?.firstAppearances ?? 0,
            alertedRuns:
              report.releaseHealthAlertTelemetry.counts?.alertedRuns ?? 0,
          },
          riskLevel:
            typeof report.releaseHealthAlertTelemetry.riskLevel === 'string'
              ? report.releaseHealthAlertTelemetry.riskLevel
              : 'unknown',
          pass: report.releaseHealthAlertTelemetry.pass === true,
          consecutiveSuccessfulRunStreak:
            report.releaseHealthAlertTelemetry.consecutiveSuccessfulRunStreak ?? 0,
          escalationTriggered:
            report.releaseHealthAlertTelemetry.escalationTriggered === true,
          reasons: Array.isArray(report.releaseHealthAlertTelemetry.reasons)
            ? report.releaseHealthAlertTelemetry.reasons
            : [],
        }
      : null,
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
  const workflowProfile = resolveWorkflowProfile({
    profileArg: cli.profile,
    workflowFileArg: cli.workflowFile,
  });
  const workflowFile = workflowProfile.workflowFile || DEFAULT_WORKFLOW_FILE;
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
  const jobSummary = buildJobSummary({
    jobs,
    requiredJobNames: workflowProfile.requiredJobNames,
  });
  const artifactSummary = buildArtifactSummary({
    artifacts,
    requiredArtifactNames: workflowProfile.requiredArtifactNames,
  });
  const externalChannelTrendWindow = parsePositiveInteger({
    raw: process.env.RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_WINDOW,
    fallback: DEFAULT_EXTERNAL_CHANNEL_TREND_WINDOW,
    minimum: 1,
    label: 'RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_WINDOW',
  });
  const externalChannelTrendMinimumRuns = parsePositiveInteger({
    raw: process.env.RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_MIN_RUNS,
    fallback: DEFAULT_EXTERNAL_CHANNEL_TREND_MIN_RUNS,
    minimum: 1,
    label: 'RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_MIN_RUNS',
  });
  const externalChannelAlertEnabled = parseBoolean(
    process.env.RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_ENABLED,
    true,
  );
  const externalChannelAlertWebhookUrl = String(
    process.env.RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_WEBHOOK_URL ??
      process.env.RELEASE_EXTERNAL_CHANNEL_ALERT_WEBHOOK_URL ??
      '',
  ).trim();
  const externalChannelAlertTimeoutMs = parsePositiveInteger({
    raw: process.env.RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_TIMEOUT_MS,
    fallback: DEFAULT_EXTERNAL_CHANNEL_ALERT_TIMEOUT_MS,
    minimum: 1000,
    label: 'RELEASE_EXTERNAL_CHANNEL_FAILURE_MODE_ALERT_TIMEOUT_MS',
  });
  const externalChannelAlertWebhookHeaders =
    resolveExternalChannelAlertWebhookHeaders();
  const externalChannelFailureModeTrendBase =
    workflowProfile.profileKey === 'launch_gate'
      ? await analyzeExternalChannelFailureModeTrend({
          token,
          baseApiUrl,
          workflowFile,
          currentRun: run,
          currentRunArtifacts: artifacts,
          windowSize: externalChannelTrendWindow,
          minimumRuns: externalChannelTrendMinimumRuns,
        })
      : null;
  const externalChannelFailureModeTrend =
    externalChannelFailureModeTrendBase &&
    typeof externalChannelFailureModeTrendBase === 'object'
      ? {
          ...externalChannelFailureModeTrendBase,
          firstAppearanceAlert: null,
        }
      : null;
  if (
    externalChannelFailureModeTrend &&
    workflowProfile.profileKey === 'launch_gate'
  ) {
    const firstAppearanceAlertBase = buildExternalChannelFirstAppearanceAlert({
      trend: externalChannelFailureModeTrend,
      currentRunId: run.id,
      currentRunNumber: run.run_number,
      currentRunUrl: run.html_url,
      repository: repoSlug,
      workflowFile,
      workflowProfile: workflowProfile.profileKey,
    });
    if (externalChannelAlertEnabled) {
      externalChannelFailureModeTrend.firstAppearanceAlert =
        await dispatchExternalChannelFirstAppearanceAlert({
          alert: firstAppearanceAlertBase,
          webhookUrl: externalChannelAlertWebhookUrl,
          webhookHeaders: externalChannelAlertWebhookHeaders,
          timeoutMs: externalChannelAlertTimeoutMs,
        });
    } else {
      externalChannelFailureModeTrend.firstAppearanceAlert = {
        ...firstAppearanceAlertBase,
        enabled: false,
      };
    }
  }
  const releaseHealthAlertTelemetry =
    workflowProfile.profileKey === 'launch_gate'
      ? await fetchReleaseHealthAlertTelemetryCheck({
          token,
          baseApiUrl,
          workflowFile,
          currentRunId: run.id,
        })
      : null;
  let smokeSummary = await readLocalSmokeSummary({
    runId,
    smokeFetchMode: workflowProfile.smokeFetchMode,
  });
  const shouldFetchSmokeFromEnv = parseBoolean(
    process.env.RELEASE_HEALTH_REPORT_FETCH_SMOKE,
    true,
  );
  const shouldFetchSmoke =
    cli.skipSmokeFetch === true ? false : shouldFetchSmokeFromEnv;
  const smokeArtifactPresent = artifacts.some(
    (artifact) =>
      artifact?.name === workflowProfile.smokeArtifactName && !artifact?.expired,
  );
  if (
    shouldFetchSmoke &&
    smokeSummary.source !== 'local' &&
    workflowProfile.smokeFetchMode === 'ci' &&
    smokeArtifactPresent
  ) {
    try {
      await runNpmCommand({
        args: ['run', 'release:smoke:artifact', '--', String(runId)],
        env: token ? { GITHUB_TOKEN: token } : undefined,
      });
      smokeSummary = await readLocalSmokeSummary({
        runId,
        smokeFetchMode: workflowProfile.smokeFetchMode,
      });
    } catch (error) {
      smokeSummary = {
        ...smokeSummary,
        fetchError: toErrorMessage(error),
      };
    }
  }

  const runConclusion = run?.conclusion ?? null;
  const releaseHealthAlertRiskStrictFailure =
    releaseHealthAlertTelemetry &&
    releaseHealthAlertTelemetry.enabled === true &&
    releaseHealthAlertTelemetry.strict === true &&
    releaseHealthAlertTelemetry.escalationTriggered === true;
  const pass =
    runConclusion === 'success' &&
    jobSummary.requiredMissing.length === 0 &&
    jobSummary.requiredFailed.length === 0 &&
    artifactSummary.requiredMissing.length === 0 &&
    (externalChannelFailureModeTrend?.pass ?? true) &&
    !releaseHealthAlertRiskStrictFailure;

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
  if (artifactSummary.requiredMissing.length > 0) {
    reasons.push(
      `required artifacts missing: ${artifactSummary.requiredMissing.join(', ')}`,
    );
  }
  if (
    externalChannelFailureModeTrend &&
    externalChannelFailureModeTrend.pass !== true
  ) {
    reasons.push(
      `external-channel failure-mode trend check failed: ${externalChannelFailureModeTrend.reasons.join(', ')}`,
    );
  }
  if (
    externalChannelFailureModeTrend &&
    externalChannelFailureModeTrend.firstAppearanceAlert &&
    externalChannelFailureModeTrend.firstAppearanceAlert.triggered === true &&
    externalChannelFailureModeTrend.firstAppearanceAlert.webhookAttempted === true &&
    externalChannelFailureModeTrend.firstAppearanceAlert.webhookDelivered !== true
  ) {
    reasons.push(
      `external-channel first-appearance alert webhook failed: ${
        externalChannelFailureModeTrend.firstAppearanceAlert.webhookError ??
        'delivery failed'
      }`,
    );
  }
  if (releaseHealthAlertRiskStrictFailure) {
    reasons.push(
      'release-health alert-risk escalation marked as strict failure (RELEASE_HEALTH_ALERT_RISK_STRICT=true)',
    );
  }

  const report = {
    schemaPath: RELEASE_HEALTH_REPORT_JSON_SCHEMA_PATH,
    schemaVersion: RELEASE_HEALTH_REPORT_JSON_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    repository: repoSlug,
    workflow: {
      file: workflowFile,
      profile: workflowProfile.profileKey,
    },
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
      requiredArtifactsTotal: artifactSummary.required.length,
      requiredArtifactsPresent: artifactSummary.required.filter(
        (artifact) => artifact.present,
      ).length,
      failedJobsTotal: jobSummary.failedJobs.length,
    },
    jobs: {
      required: jobSummary.required,
      failedJobs: jobSummary.failedJobs,
      totalJobs: jobSummary.total,
    },
    artifactChecks: {
      required: artifactSummary.required,
      missing: artifactSummary.requiredMissing,
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
    externalChannelFailureModes: externalChannelFailureModeTrend,
    releaseHealthAlertTelemetry,
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
      `Workflow: ${report.workflow.file} (profile ${report.workflow.profile})\n`,
    );
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
    process.stdout.write(
      `Required artifacts: ${report.summary.requiredArtifactsPresent}/${report.summary.requiredArtifactsTotal} present\n`,
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
    if (report.externalChannelFailureModes) {
      process.stdout.write(
        `External-channel failure-mode trend: pass=${String(
          report.externalChannelFailureModes.pass,
        )} analyzedRuns=${String(
          report.externalChannelFailureModes.analyzedRuns.length,
        )}/${String(report.externalChannelFailureModes.windowSize)} nonPassModes=${
          report.externalChannelFailureModes.nonPassModes.length > 0
            ? report.externalChannelFailureModes.nonPassModes.join(',')
            : 'none'
        }\n`,
      );
      const alert = report.externalChannelFailureModes.firstAppearanceAlert;
      if (alert && typeof alert === 'object') {
        process.stdout.write(
          `External-channel first-appearance alert: triggered=${String(
            alert.triggered === true,
          )} webhookDelivered=${String(alert.webhookDelivered === true)}\n`,
        );
      }
    }
    if (report.releaseHealthAlertTelemetry) {
      process.stdout.write(
        `Release-health alert telemetry: status=${String(
          report.releaseHealthAlertTelemetry.status,
        )} risk=${String(report.releaseHealthAlertTelemetry.riskLevel)} evaluated=${String(
          report.releaseHealthAlertTelemetry.evaluated === true,
        )} escalation=${String(
          report.releaseHealthAlertTelemetry.escalationTriggered === true,
        )}\n`,
      );
      if (
        report.releaseHealthAlertTelemetry.fetchError &&
        typeof report.releaseHealthAlertTelemetry.fetchError === 'string'
      ) {
        process.stdout.write(
          `Release-health alert telemetry fetch error: ${report.releaseHealthAlertTelemetry.fetchError}\n`,
        );
      }
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
