import { execFileSync } from 'node:child_process';
import {
  ALLOWED_ARTIFACT_LINK_NAMES,
  LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME,
  parseArtifactLinkNames,
  resolveDispatchArtifactLinkOptions,
} from './dispatch-production-launch-gate-link-options.mjs';
import { parseDispatchExternalChannels } from './dispatch-production-launch-gate-external-channels.mjs';
import { buildDispatchRunFailureSummary } from './dispatch-production-launch-gate-failure-summary.mjs';
import { buildDispatchInputSummaryLines } from './dispatch-production-launch-gate-output-format.mjs';
import { resolveDispatchTokenCandidates } from './dispatch-production-launch-gate-token-resolution.mjs';
import {
  parseReleaseBooleanEnv,
  parseReleasePositiveIntegerEnv,
} from './release-env-parse-utils.mjs';
import {
  DEFAULT_GITHUB_API_TRANSIENT_RETRY_BACKOFF_FACTOR,
  DEFAULT_GITHUB_API_TRANSIENT_RETRY_DELAY_MS,
  DEFAULT_GITHUB_API_TRANSIENT_RETRY_JITTER_PERCENT,
  DEFAULT_GITHUB_API_TRANSIENT_RETRY_MAX_ATTEMPTS,
  DEFAULT_GITHUB_API_TRANSIENT_RETRY_MAX_DELAY_MS,
  githubApiRequest,
  githubApiRequestWithTransientRetry,
} from './github-api-request-with-transient-retry.mjs';

const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_WORKFLOW_FILE = 'production-launch-gate.yml';
const DEFAULT_WORKFLOW_REF = 'main';
const DEFAULT_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_WAIT_POLL_MS = 5000;
const DEFAULT_FAILURE_SUMMARY_MAX_JOBS = 5;
const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9]\d*)$/;
const RUN_DISCOVERY_GRACE_MS = 2 * 60 * 1000;
const ARTIFACT_DISCOVERY_ATTEMPTS = 6;
const ARTIFACT_DISCOVERY_POLL_MS = 1000;
const USAGE = `Usage: npm run release:launch:gate:dispatch -- [options]

Options:
  --token|-Token <value>                 GitHub token override
  --runtime-draft-id <uuid>              workflow input runtime_draft_id
  --require-skill-markers                workflow input require_skill_markers=true
  --require-natural-cron-window          workflow input require_natural_cron_window=true
  --required-external-channels <csv|all> workflow input required_external_channels
  --require-inline-health-artifacts      workflow input require_inline_health_artifacts=true
  --smoke-timeout-retries <n>            workflow input smoke_timeout_retries (0 disables timeout-only retry)
  --smoke-timeout-retry-delay-ms <ms>    workflow input smoke_timeout_retry_delay_ms
  --allow-failure-drill                  workflow input allow_failure_drill=true
  --webhook-secret-override <value>      workflow input webhook_secret_override (requires allow_failure_drill)
  --failure-summary-max-jobs <n>         cap failed-job diagnostics entries (default: ${DEFAULT_FAILURE_SUMMARY_MAX_JOBS})
  --github-api-retry-max-attempts <n>    transient GitHub API polling retry attempts override
  --github-api-retry-delay-ms <ms>       transient GitHub API base retry delay override
  --github-api-retry-backoff-factor <n>  transient GitHub API retry backoff factor override
  --github-api-retry-max-delay-ms <ms>   transient GitHub API retry max delay override
  --github-api-retry-jitter-percent <n>  transient GitHub API retry jitter percent override (0-100)
  --print-artifact-links                 print links for additional high-signal artifacts after success
  --artifact-link-names <csv|all>        override artifact link set (allowed: ${ALLOWED_ARTIFACT_LINK_NAMES.join(', ')}, or all)
  --no-step-summary-link                 suppress default step-summary artifact link output
  --help|-h

Token resolution order:
1) --token / -Token argument
2) GITHUB_TOKEN / GH_TOKEN
3) gh auth token
`;

const parseReleaseNonNegativeIntegerEnv = (raw, fallback, sourceLabel) => {
  const value = String(raw || '').trim();
  if (!value) {
    return fallback;
  }
  if (!NON_NEGATIVE_INTEGER_PATTERN.test(value)) {
    throw new Error(`Invalid value for ${sourceLabel}: ${value}`);
  }
  return Number(value);
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

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const parseCliArgs = (argv) => {
  let tokenFromArg = '';
  let runtimeDraftId = '';
  let failureSummaryMaxJobsRaw = '';
  let smokeTimeoutRetriesRaw = '';
  let smokeTimeoutRetryDelayMsRaw = '';
  let githubApiRetryMaxAttemptsRaw = '';
  let githubApiRetryDelayMsRaw = '';
  let githubApiRetryBackoffFactorRaw = '';
  let githubApiRetryMaxDelayMsRaw = '';
  let githubApiRetryJitterPercentRaw = '';
  let requireSkillMarkers;
  let requireNaturalCronWindow;
  let requiredExternalChannels = '';
  let requireInlineHealthArtifacts;
  let allowFailureDrill;
  let printArtifactLinks;
  let artifactLinkNames = [];
  let noStepSummaryLink;
  let webhookSecretOverride = '';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }

    if (arg === '--token' || arg === '--Token' || arg === '-Token' || arg === '-token') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      tokenFromArg = value;
      index += 1;
      continue;
    }

    if (
      arg.startsWith('--token=') ||
      arg.startsWith('--Token=') ||
      arg.startsWith('-Token=') ||
      arg.startsWith('-token=')
    ) {
      const value = arg.slice(arg.indexOf('=') + 1).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      tokenFromArg = value;
      continue;
    }
    if (arg.startsWith('--runtime-draft-id=')) {
      const value = arg.slice('--runtime-draft-id='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      runtimeDraftId = value;
      continue;
    }
    if (arg.startsWith('--failure-summary-max-jobs=')) {
      const value = arg.slice('--failure-summary-max-jobs='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      failureSummaryMaxJobsRaw = value;
      continue;
    }
    if (arg.startsWith('--smoke-timeout-retries=')) {
      const value = arg.slice('--smoke-timeout-retries='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      smokeTimeoutRetriesRaw = value;
      continue;
    }
    if (arg.startsWith('--smoke-timeout-retry-delay-ms=')) {
      const value = arg.slice('--smoke-timeout-retry-delay-ms='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      smokeTimeoutRetryDelayMsRaw = value;
      continue;
    }
    if (arg.startsWith('--github-api-retry-max-attempts=')) {
      const value = arg.slice('--github-api-retry-max-attempts='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      githubApiRetryMaxAttemptsRaw = value;
      continue;
    }
    if (arg.startsWith('--github-api-retry-delay-ms=')) {
      const value = arg.slice('--github-api-retry-delay-ms='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      githubApiRetryDelayMsRaw = value;
      continue;
    }
    if (arg.startsWith('--github-api-retry-backoff-factor=')) {
      const value = arg
        .slice('--github-api-retry-backoff-factor='.length)
        .trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      githubApiRetryBackoffFactorRaw = value;
      continue;
    }
    if (arg.startsWith('--github-api-retry-max-delay-ms=')) {
      const value = arg.slice('--github-api-retry-max-delay-ms='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      githubApiRetryMaxDelayMsRaw = value;
      continue;
    }
    if (arg.startsWith('--github-api-retry-jitter-percent=')) {
      const value = arg.slice('--github-api-retry-jitter-percent='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      githubApiRetryJitterPercentRaw = value;
      continue;
    }
    if (arg.startsWith('--required-external-channels=')) {
      const value = arg.slice('--required-external-channels='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      requiredExternalChannels = parseDispatchExternalChannels(
        value,
        '--required-external-channels',
      );
      continue;
    }
    if (arg.startsWith('--webhook-secret-override=')) {
      const value = arg.slice('--webhook-secret-override='.length);
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      webhookSecretOverride = value;
      continue;
    }
    if (arg.startsWith('--artifact-link-names=')) {
      const value = arg.slice('--artifact-link-names='.length);
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      artifactLinkNames = parseArtifactLinkNames(value, '--artifact-link-names');
      continue;
    }
    if (arg === '--runtime-draft-id') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      runtimeDraftId = value;
      index += 1;
      continue;
    }
    if (arg === '--failure-summary-max-jobs') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      failureSummaryMaxJobsRaw = value;
      index += 1;
      continue;
    }
    if (arg === '--smoke-timeout-retries') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      smokeTimeoutRetriesRaw = value;
      index += 1;
      continue;
    }
    if (arg === '--smoke-timeout-retry-delay-ms') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      smokeTimeoutRetryDelayMsRaw = value;
      index += 1;
      continue;
    }
    if (arg === '--github-api-retry-max-attempts') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      githubApiRetryMaxAttemptsRaw = value;
      index += 1;
      continue;
    }
    if (arg === '--github-api-retry-delay-ms') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      githubApiRetryDelayMsRaw = value;
      index += 1;
      continue;
    }
    if (arg === '--github-api-retry-backoff-factor') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      githubApiRetryBackoffFactorRaw = value;
      index += 1;
      continue;
    }
    if (arg === '--github-api-retry-max-delay-ms') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      githubApiRetryMaxDelayMsRaw = value;
      index += 1;
      continue;
    }
    if (arg === '--github-api-retry-jitter-percent') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      githubApiRetryJitterPercentRaw = value;
      index += 1;
      continue;
    }
    if (arg === '--require-skill-markers') {
      requireSkillMarkers = true;
      continue;
    }
    if (arg === '--require-natural-cron-window') {
      requireNaturalCronWindow = true;
      continue;
    }
    if (arg === '--required-external-channels') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      requiredExternalChannels = parseDispatchExternalChannels(
        value,
        '--required-external-channels',
      );
      index += 1;
      continue;
    }
    if (arg === '--require-inline-health-artifacts') {
      requireInlineHealthArtifacts = true;
      continue;
    }
    if (arg === '--allow-failure-drill') {
      allowFailureDrill = true;
      continue;
    }
    if (arg === '--print-artifact-links') {
      printArtifactLinks = true;
      continue;
    }
    if (arg === '--no-step-summary-link') {
      noStepSummaryLink = true;
      continue;
    }
    if (arg === '--artifact-link-names') {
      const value = (argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      artifactLinkNames = parseArtifactLinkNames(value, '--artifact-link-names');
      index += 1;
      continue;
    }
    if (arg === '--webhook-secret-override') {
      const value = argv[index + 1] ?? '';
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      webhookSecretOverride = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  if (
    tokenFromArg &&
    (/^<[^>]+>$/u.test(tokenFromArg) || /NEW_GITHUB_PAT|YOUR_TOKEN|TOKEN_HERE/u.test(tokenFromArg))
  ) {
    throw new Error(
      `Token argument looks like a placeholder ('${tokenFromArg}'). Pass a real PAT value without angle brackets.`,
    );
  }

  return {
    allowFailureDrill,
    artifactLinkNames,
    noStepSummaryLink,
    requireInlineHealthArtifacts,
    requireNaturalCronWindow,
    requireSkillMarkers,
    printArtifactLinks,
    requiredExternalChannels,
    runtimeDraftId,
    failureSummaryMaxJobsRaw,
    githubApiRetryBackoffFactorRaw,
    githubApiRetryDelayMsRaw,
    githubApiRetryJitterPercentRaw,
    githubApiRetryMaxAttemptsRaw,
    githubApiRetryMaxDelayMsRaw,
    smokeTimeoutRetriesRaw,
    smokeTimeoutRetryDelayMsRaw,
    tokenFromArg,
    webhookSecretOverride,
  };
};

const readTokenFromGhAuth = () => {
  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const resolveTokenCandidates = ({ tokenFromArg }) =>
  resolveDispatchTokenCandidates({
    envGithubToken: process.env.GITHUB_TOKEN,
    envGhToken: process.env.GH_TOKEN,
    ghAuthToken: readTokenFromGhAuth(),
    tokenFromArg,
  });

const isAuthenticationError = (message) =>
  message.includes(' 401 ') ||
  message.includes('Bad credentials') ||
  message.includes('Requires authentication') ||
  message.includes('Resource not accessible by integration');

const selectToken = async ({ candidates, baseApiUrl }) => {
  if (candidates.length === 0) {
    throw new Error(
      'Missing GitHub token. Provide --token/-Token, or set GITHUB_TOKEN/GH_TOKEN, or run gh auth login.',
    );
  }

  const probeUrl = `${baseApiUrl}`;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      await githubApiRequest({
        apiVersion: GITHUB_API_VERSION,
        token: candidate.token,
        method: 'GET',
        url: probeUrl,
      });
      if (index > 0) {
        process.stderr.write(
          `GitHub auth fallback: using token source '${candidate.source}'.\n`,
        );
      }
      return candidate;
    } catch (error) {
      const message = toErrorMessage(error);
      const hasNextCandidate = index + 1 < candidates.length;
      if (!hasNextCandidate || !isAuthenticationError(message)) {
        throw error;
      }
      process.stderr.write(
        `GitHub token source '${candidate.source}' failed auth, trying next source.\n`,
      );
    }
  }

  throw new Error('Unable to resolve a working GitHub token.');
};

const toArtifactUiUrl = ({ repoSlug, runId, artifactId }) =>
  `https://github.com/${repoSlug}/actions/runs/${runId}/artifacts/${artifactId}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const listRunArtifacts = async ({
  baseApiUrl,
  githubApiRetryBackoffFactor,
  githubApiRetryDelayMs,
  githubApiRetryJitterPercent,
  githubApiRetryMaxDelayMs,
  githubApiRetryMaxAttempts,
  runId,
  token,
}) => {
  const artifactsResponse = await githubApiRequestWithTransientRetry({
    apiVersion: GITHUB_API_VERSION,
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}/artifacts?per_page=100`,
    retryLabel: `list run artifacts for run ${runId}`,
    retryConfig: {
      backoffFactor: githubApiRetryBackoffFactor,
      delayMs: githubApiRetryDelayMs,
      jitterPercent: githubApiRetryJitterPercent,
      maxAttempts: githubApiRetryMaxAttempts,
      maxDelayMs: githubApiRetryMaxDelayMs,
    },
  });
  return Array.isArray(artifactsResponse?.artifacts)
    ? artifactsResponse.artifacts
    : [];
};

const listRunJobs = async ({
  baseApiUrl,
  githubApiRetryBackoffFactor,
  githubApiRetryDelayMs,
  githubApiRetryJitterPercent,
  githubApiRetryMaxDelayMs,
  githubApiRetryMaxAttempts,
  runId,
  token,
}) => {
  const jobsResponse = await githubApiRequestWithTransientRetry({
    apiVersion: GITHUB_API_VERSION,
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}/jobs?per_page=100`,
    retryLabel: `list run jobs for run ${runId}`,
    retryConfig: {
      backoffFactor: githubApiRetryBackoffFactor,
      delayMs: githubApiRetryDelayMs,
      jitterPercent: githubApiRetryJitterPercent,
      maxAttempts: githubApiRetryMaxAttempts,
      maxDelayMs: githubApiRetryMaxDelayMs,
    },
  });
  return Array.isArray(jobsResponse?.jobs) ? jobsResponse.jobs : [];
};

const resolveRunFailureSummary = async ({
  baseApiUrl,
  githubApiRetryBackoffFactor,
  githubApiRetryDelayMs,
  githubApiRetryJitterPercent,
  githubApiRetryMaxDelayMs,
  githubApiRetryMaxAttempts,
  runId,
  token,
  failureSummaryMaxJobs,
}) => {
  try {
    const jobs = await listRunJobs({
      baseApiUrl,
      githubApiRetryBackoffFactor,
      githubApiRetryDelayMs,
      githubApiRetryJitterPercent,
      githubApiRetryMaxDelayMs,
      githubApiRetryMaxAttempts,
      runId,
      token,
    });
    return buildDispatchRunFailureSummary(jobs, {
      maxFailedJobDetails: failureSummaryMaxJobs,
    });
  } catch (error) {
    return `Failure details unavailable: ${toErrorMessage(error)}`;
  }
};

const pickLatestArtifactsByName = ({ artifactNames, artifacts }) => {
  const byName = new Map();
  for (const artifactName of artifactNames) {
    const matching = artifacts.filter(
      (artifact) =>
        artifact &&
        typeof artifact === 'object' &&
        artifact.name === artifactName &&
        artifact.expired !== true &&
        Number.isFinite(Number(artifact.id)),
    );
    if (matching.length === 0) {
      continue;
    }
    const [first] = matching.sort((left, right) => {
      const leftCreatedAt = Date.parse(String(left?.created_at ?? ''));
      const rightCreatedAt = Date.parse(String(right?.created_at ?? ''));
      if (Number.isNaN(leftCreatedAt) || Number.isNaN(rightCreatedAt)) {
        return 0;
      }
      return rightCreatedAt - leftCreatedAt;
    });
    byName.set(artifactName, first);
  }
  return byName;
};

const findRunArtifactsByNames = async ({
  artifactNames,
  baseApiUrl,
  githubApiRetryBackoffFactor,
  githubApiRetryDelayMs,
  githubApiRetryJitterPercent,
  githubApiRetryMaxDelayMs,
  githubApiRetryMaxAttempts,
  requiredArtifactNames,
  runId,
  token,
}) => {
  for (let attempt = 1; attempt <= ARTIFACT_DISCOVERY_ATTEMPTS; attempt += 1) {
    const artifacts = await listRunArtifacts({
      baseApiUrl,
      githubApiRetryBackoffFactor,
      githubApiRetryDelayMs,
      githubApiRetryJitterPercent,
      githubApiRetryMaxDelayMs,
      githubApiRetryMaxAttempts,
      runId,
      token,
    });
    const picked = pickLatestArtifactsByName({
      artifactNames,
      artifacts,
    });
    const requiredResolved = requiredArtifactNames.every((name) =>
      picked.has(name),
    );
    if (requiredResolved) {
      return picked;
    }
    if (attempt < ARTIFACT_DISCOVERY_ATTEMPTS) {
      await sleep(ARTIFACT_DISCOVERY_POLL_MS);
    }
  }
  return new Map();
};

const printLaunchGateArtifactLinks = async ({
  artifactLinkNames,
  baseApiUrl,
  githubApiRetryBackoffFactor,
  githubApiRetryDelayMs,
  githubApiRetryJitterPercent,
  githubApiRetryMaxDelayMs,
  githubApiRetryMaxAttempts,
  includeStepSummaryLink,
  printArtifactLinks,
  repoSlug,
  runId,
  token,
}) => {
  const requestedArtifactNames = printArtifactLinks
    ? artifactLinkNames
    : [];
  const artifactNames = includeStepSummaryLink
    ? [LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME, ...requestedArtifactNames]
    : [...requestedArtifactNames];
  if (artifactNames.length === 0) {
    return;
  }
  const requiredArtifactNames = includeStepSummaryLink
    ? [LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME]
    : [...requestedArtifactNames];

  try {
    const artifacts = await findRunArtifactsByNames({
      artifactNames,
      baseApiUrl,
      githubApiRetryBackoffFactor,
      githubApiRetryDelayMs,
      githubApiRetryJitterPercent,
      githubApiRetryMaxDelayMs,
      githubApiRetryMaxAttempts,
      requiredArtifactNames,
      runId,
      token,
    });
    if (includeStepSummaryLink) {
      const stepSummaryArtifact = artifacts.get(
        LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME,
      );
      if (!stepSummaryArtifact) {
        process.stderr.write(
          `Warning: artifact '${LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME}' not found for run ${runId} after ${ARTIFACT_DISCOVERY_ATTEMPTS} attempts.\n`,
        );
        return;
      }
      const stepSummaryArtifactId = Number(stepSummaryArtifact.id);
      const stepSummaryArtifactUrl = toArtifactUiUrl({
        repoSlug,
        runId,
        artifactId: stepSummaryArtifactId,
      });
      process.stdout.write(
        `Launch-gate step summary artifact: ${stepSummaryArtifactUrl} (id: ${stepSummaryArtifactId})\n`,
      );
    }

    if (!printArtifactLinks) {
      return;
    }
    for (const artifactName of requestedArtifactNames) {
      const artifact = artifacts.get(artifactName);
      if (!artifact) {
        process.stderr.write(
          `Warning: artifact '${artifactName}' not found for run ${runId}.\n`,
        );
        continue;
      }
      const artifactId = Number(artifact.id);
      const artifactUrl = toArtifactUiUrl({
        repoSlug,
        runId,
        artifactId,
      });
      process.stdout.write(
        `Launch-gate artifact (${artifactName}): ${artifactUrl} (id: ${artifactId})\n`,
      );
    }
  } catch (error) {
    process.stderr.write(
      `Warning: unable to resolve launch-gate artifact link(s): ${toErrorMessage(error)}\n`,
    );
  }
};

const main = async () => {
  const cli = parseCliArgs(process.argv.slice(2));
  const workflowFile = (
    process.env.RELEASE_WORKFLOW_FILE ?? DEFAULT_WORKFLOW_FILE
  ).trim();
  const workflowRef = (
    process.env.RELEASE_WORKFLOW_REF ?? DEFAULT_WORKFLOW_REF
  ).trim();
  const waitForCompletion = parseReleaseBooleanEnv(
    process.env.RELEASE_WAIT_FOR_COMPLETION,
    true,
    'RELEASE_WAIT_FOR_COMPLETION',
  );
  const waitTimeoutMs = parseReleasePositiveIntegerEnv(
    process.env.RELEASE_WAIT_TIMEOUT_MS,
    DEFAULT_WAIT_TIMEOUT_MS,
    'RELEASE_WAIT_TIMEOUT_MS',
  );
  const waitPollMs = parseReleasePositiveIntegerEnv(
    process.env.RELEASE_WAIT_POLL_MS,
    DEFAULT_WAIT_POLL_MS,
    'RELEASE_WAIT_POLL_MS',
  );
  const githubApiRetryMaxAttempts = parseReleasePositiveIntegerEnv(
    cli.githubApiRetryMaxAttemptsRaw ||
      process.env.RELEASE_GITHUB_API_TRANSIENT_RETRY_MAX_ATTEMPTS,
    DEFAULT_GITHUB_API_TRANSIENT_RETRY_MAX_ATTEMPTS,
    cli.githubApiRetryMaxAttemptsRaw
      ? '--github-api-retry-max-attempts'
      : 'RELEASE_GITHUB_API_TRANSIENT_RETRY_MAX_ATTEMPTS',
  );
  const githubApiRetryDelayMs = parseReleasePositiveIntegerEnv(
    cli.githubApiRetryDelayMsRaw ||
      process.env.RELEASE_GITHUB_API_TRANSIENT_RETRY_DELAY_MS,
    DEFAULT_GITHUB_API_TRANSIENT_RETRY_DELAY_MS,
    cli.githubApiRetryDelayMsRaw
      ? '--github-api-retry-delay-ms'
      : 'RELEASE_GITHUB_API_TRANSIENT_RETRY_DELAY_MS',
  );
  const githubApiRetryBackoffFactor = parseReleasePositiveIntegerEnv(
    cli.githubApiRetryBackoffFactorRaw ||
      process.env.RELEASE_GITHUB_API_TRANSIENT_RETRY_BACKOFF_FACTOR,
    DEFAULT_GITHUB_API_TRANSIENT_RETRY_BACKOFF_FACTOR,
    cli.githubApiRetryBackoffFactorRaw
      ? '--github-api-retry-backoff-factor'
      : 'RELEASE_GITHUB_API_TRANSIENT_RETRY_BACKOFF_FACTOR',
  );
  const githubApiRetryMaxDelayMs = parseReleasePositiveIntegerEnv(
    cli.githubApiRetryMaxDelayMsRaw ||
      process.env.RELEASE_GITHUB_API_TRANSIENT_RETRY_MAX_DELAY_MS,
    DEFAULT_GITHUB_API_TRANSIENT_RETRY_MAX_DELAY_MS,
    cli.githubApiRetryMaxDelayMsRaw
      ? '--github-api-retry-max-delay-ms'
      : 'RELEASE_GITHUB_API_TRANSIENT_RETRY_MAX_DELAY_MS',
  );
  const githubApiRetryJitterPercentSource = cli.githubApiRetryJitterPercentRaw
    ? '--github-api-retry-jitter-percent'
    : 'RELEASE_GITHUB_API_TRANSIENT_RETRY_JITTER_PERCENT';
  const githubApiRetryJitterPercent = parseReleaseNonNegativeIntegerEnv(
    cli.githubApiRetryJitterPercentRaw ||
      process.env.RELEASE_GITHUB_API_TRANSIENT_RETRY_JITTER_PERCENT,
    DEFAULT_GITHUB_API_TRANSIENT_RETRY_JITTER_PERCENT,
    githubApiRetryJitterPercentSource,
  );
  if (githubApiRetryJitterPercent > 100) {
    throw new Error(
      `Invalid value for ${githubApiRetryJitterPercentSource}: ${githubApiRetryJitterPercent}`,
    );
  }
  const failureSummaryMaxJobs = parseReleasePositiveIntegerEnv(
    cli.failureSummaryMaxJobsRaw || process.env.RELEASE_FAILURE_SUMMARY_MAX_JOBS,
    DEFAULT_FAILURE_SUMMARY_MAX_JOBS,
    cli.failureSummaryMaxJobsRaw
      ? '--failure-summary-max-jobs'
      : 'RELEASE_FAILURE_SUMMARY_MAX_JOBS',
  );
  const smokeTimeoutRetries = (() => {
    const rawValue = cli.smokeTimeoutRetriesRaw
      ? cli.smokeTimeoutRetriesRaw
      : String(process.env.RELEASE_SMOKE_TIMEOUT_RETRIES || '').trim();
    if (!rawValue) {
      return null;
    }
    return parseReleaseNonNegativeIntegerEnv(
      rawValue,
      0,
      cli.smokeTimeoutRetriesRaw
        ? '--smoke-timeout-retries'
        : 'RELEASE_SMOKE_TIMEOUT_RETRIES',
    );
  })();
  const smokeTimeoutRetryDelayMs = (() => {
    const rawValue = cli.smokeTimeoutRetryDelayMsRaw
      ? cli.smokeTimeoutRetryDelayMsRaw
      : String(process.env.RELEASE_SMOKE_TIMEOUT_RETRY_DELAY_MS || '').trim();
    if (!rawValue) {
      return null;
    }
    return parseReleasePositiveIntegerEnv(
      rawValue,
      0,
      cli.smokeTimeoutRetryDelayMsRaw
        ? '--smoke-timeout-retry-delay-ms'
        : 'RELEASE_SMOKE_TIMEOUT_RETRY_DELAY_MS',
    );
  })();
  const runtimeDraftId =
    cli.runtimeDraftId || (process.env.RELEASE_RUNTIME_DRAFT_ID ?? '').trim();
  const requireSkillMarkers =
    typeof cli.requireSkillMarkers === 'boolean'
      ? cli.requireSkillMarkers
      : parseReleaseBooleanEnv(
          process.env.RELEASE_REQUIRE_SKILL_MARKERS,
          false,
          'RELEASE_REQUIRE_SKILL_MARKERS',
        );
  const requireNaturalCronWindow =
    typeof cli.requireNaturalCronWindow === 'boolean'
      ? cli.requireNaturalCronWindow
      : parseReleaseBooleanEnv(
          process.env.RELEASE_REQUIRE_NATURAL_CRON_WINDOW,
          false,
          'RELEASE_REQUIRE_NATURAL_CRON_WINDOW',
        );
  const requiredExternalChannels =
    cli.requiredExternalChannels ||
    parseDispatchExternalChannels(
      process.env.RELEASE_REQUIRED_EXTERNAL_CHANNELS ?? '',
      'RELEASE_REQUIRED_EXTERNAL_CHANNELS',
    );
  const requireInlineHealthArtifacts =
    typeof cli.requireInlineHealthArtifacts === 'boolean'
      ? cli.requireInlineHealthArtifacts
      : parseReleaseBooleanEnv(
          process.env.RELEASE_REQUIRE_INLINE_HEALTH_ARTIFACTS,
          false,
          'RELEASE_REQUIRE_INLINE_HEALTH_ARTIFACTS',
        );
  const {
    includeStepSummaryLink,
    printArtifactLinks,
    selectedArtifactLinkNames,
  } = resolveDispatchArtifactLinkOptions({
    cliArtifactLinkNames: cli.artifactLinkNames,
    cliNoStepSummaryLink: cli.noStepSummaryLink,
    cliPrintArtifactLinks: cli.printArtifactLinks,
    envArtifactLinkNamesRaw: process.env.RELEASE_ARTIFACT_LINK_NAMES ?? '',
    envNoStepSummaryLinkRaw: process.env.RELEASE_NO_STEP_SUMMARY_LINK ?? '',
    envPrintArtifactLinksRaw: process.env.RELEASE_PRINT_ARTIFACT_LINKS ?? '',
  });
  const allowFailureDrill =
    typeof cli.allowFailureDrill === 'boolean'
      ? cli.allowFailureDrill
      : parseReleaseBooleanEnv(
          process.env.RELEASE_ALLOW_FAILURE_DRILL,
          false,
          'RELEASE_ALLOW_FAILURE_DRILL',
        );
  const webhookSecretOverride =
    cli.webhookSecretOverride ||
    String(process.env.RELEASE_WEBHOOK_SECRET_OVERRIDE ?? '');
  if (requireSkillMarkers && !runtimeDraftId) {
    throw new Error(
      'RELEASE_REQUIRE_SKILL_MARKERS=true requires RELEASE_RUNTIME_DRAFT_ID to be set (draft with skill markers).',
    );
  }
  if (webhookSecretOverride && !allowFailureDrill) {
    throw new Error(
      'RELEASE_WEBHOOK_SECRET_OVERRIDE/--webhook-secret-override requires RELEASE_ALLOW_FAILURE_DRILL=true or --allow-failure-drill.',
    );
  }

  const repoSlug = resolveRepoSlug();
  const baseApiUrl = `https://api.github.com/repos/${repoSlug}`;
  const selectedToken = await selectToken({
    candidates: resolveTokenCandidates(cli),
    baseApiUrl,
  });
  const token = selectedToken.token;
  const dispatchUrl = `${baseApiUrl}/actions/workflows/${encodeURIComponent(
    workflowFile,
  )}/dispatches`;
  const listRunsUrl = `${baseApiUrl}/actions/workflows/${encodeURIComponent(
    workflowFile,
  )}/runs?event=workflow_dispatch&branch=${encodeURIComponent(workflowRef)}&per_page=20`;

  let baselineRunIds = new Set();
  try {
    const baseline = await githubApiRequestWithTransientRetry({
      apiVersion: GITHUB_API_VERSION,
      token,
      method: 'GET',
      url: listRunsUrl,
      retryLabel: 'read baseline workflow runs',
      retryConfig: {
        backoffFactor: githubApiRetryBackoffFactor,
        delayMs: githubApiRetryDelayMs,
        jitterPercent: githubApiRetryJitterPercent,
        maxAttempts: githubApiRetryMaxAttempts,
        maxDelayMs: githubApiRetryMaxDelayMs,
      },
    });
    const baselineRuns = Array.isArray(baseline?.workflow_runs)
      ? baseline.workflow_runs
      : [];
    baselineRunIds = new Set(
      baselineRuns
        .map((run) => Number(run?.id))
        .filter((id) => Number.isFinite(id)),
    );
  } catch (error) {
    process.stderr.write(
      `Warning: unable to read baseline workflow runs before dispatch (${toErrorMessage(
        error,
      )}). Falling back to timestamp-based discovery.\n`,
    );
  }

  const inputs = {};
  if (runtimeDraftId) {
    inputs.runtime_draft_id = runtimeDraftId;
  }
  if (requireSkillMarkers) {
    inputs.require_skill_markers = 'true';
  }
  if (requireNaturalCronWindow) {
    inputs.require_natural_cron_window = 'true';
  }
  if (requiredExternalChannels) {
    inputs.required_external_channels = requiredExternalChannels;
  }
  if (requireInlineHealthArtifacts) {
    inputs.require_inline_health_artifacts = 'true';
  }
  if (smokeTimeoutRetries !== null) {
    inputs.smoke_timeout_retries = String(smokeTimeoutRetries);
  }
  if (smokeTimeoutRetryDelayMs !== null) {
    inputs.smoke_timeout_retry_delay_ms = String(smokeTimeoutRetryDelayMs);
  }
  if (allowFailureDrill) {
    inputs.allow_failure_drill = 'true';
  }
  if (webhookSecretOverride) {
    inputs.webhook_secret_override = webhookSecretOverride;
  }

  const dispatchStartedAtMs = Date.now();
  await githubApiRequest({
    apiVersion: GITHUB_API_VERSION,
    token,
    method: 'POST',
    url: dispatchUrl,
    body: {
      ref: workflowRef,
      inputs,
    },
  });

  process.stdout.write(`Dispatched ${workflowFile} on ${workflowRef} for ${repoSlug}.\n`);
  const summaryLines = buildDispatchInputSummaryLines({
    allowFailureDrill,
    githubApiRetryBackoffFactor,
    githubApiRetryDelayMs,
    githubApiRetryJitterPercent,
    githubApiRetryMaxAttempts,
    githubApiRetryMaxDelayMs,
    includeStepSummaryLink,
    printArtifactLinks,
    requiredExternalChannels,
    requireInlineHealthArtifacts,
    requireNaturalCronWindow,
    requireSkillMarkers,
    runtimeDraftId,
    selectedArtifactLinkNames,
    smokeTimeoutRetries,
    smokeTimeoutRetryDelayMs,
    failureSummaryMaxJobs,
    webhookSecretOverride,
  });
  for (const line of summaryLines) {
    process.stdout.write(`${line}\n`);
  }

  if (!waitForCompletion) {
    process.stdout.write('Dispatch-only mode enabled. Exiting without polling.\n');
    return;
  }

  const findRun = async () => {
    const data = await githubApiRequestWithTransientRetry({
      apiVersion: GITHUB_API_VERSION,
      token,
      method: 'GET',
      url: listRunsUrl,
      retryLabel: 'discover dispatched workflow run',
      retryConfig: {
        backoffFactor: githubApiRetryBackoffFactor,
        delayMs: githubApiRetryDelayMs,
        jitterPercent: githubApiRetryJitterPercent,
        maxAttempts: githubApiRetryMaxAttempts,
        maxDelayMs: githubApiRetryMaxDelayMs,
      },
    });
    const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
    for (const run of runs) {
      const runId = Number(run?.id);
      if (Number.isFinite(runId) && baselineRunIds.has(runId)) {
        continue;
      }
      const createdAtMs = Date.parse(run.created_at ?? '');
      if (Number.isNaN(createdAtMs)) {
        continue;
      }
      if (createdAtMs + RUN_DISCOVERY_GRACE_MS < dispatchStartedAtMs) {
        continue;
      }
      return run;
    }
    return null;
  };

  const waitDeadline = Date.now() + waitTimeoutMs;
  let run = null;
  while (Date.now() < waitDeadline) {
    run = await findRun();
    if (run) break;
    await sleep(waitPollMs);
  }

  if (!run) {
    throw new Error(
      `Unable to discover dispatched workflow run within ${waitTimeoutMs}ms.`,
    );
  }

  process.stdout.write(`Detected run #${run.run_number}: ${run.html_url}\n`);

  const runUrl = `${baseApiUrl}/actions/runs/${run.id}`;
  while (Date.now() < waitDeadline) {
    const current = await githubApiRequestWithTransientRetry({
      apiVersion: GITHUB_API_VERSION,
      token,
      method: 'GET',
      url: runUrl,
      retryLabel: `poll workflow run ${run.id} status`,
      retryConfig: {
        backoffFactor: githubApiRetryBackoffFactor,
        delayMs: githubApiRetryDelayMs,
        jitterPercent: githubApiRetryJitterPercent,
        maxAttempts: githubApiRetryMaxAttempts,
        maxDelayMs: githubApiRetryMaxDelayMs,
      },
    });
    const status = current?.status ?? 'unknown';
    const conclusion = current?.conclusion ?? 'none';
    process.stdout.write(`Run status: ${status}, conclusion: ${conclusion}\n`);

    if (status === 'completed') {
      if (conclusion === 'success') {
        process.stdout.write(`Run succeeded: ${current.html_url}\n`);
        await printLaunchGateArtifactLinks({
          artifactLinkNames: selectedArtifactLinkNames,
          baseApiUrl,
          githubApiRetryBackoffFactor,
          githubApiRetryDelayMs,
          githubApiRetryJitterPercent,
          githubApiRetryMaxAttempts,
          githubApiRetryMaxDelayMs,
          includeStepSummaryLink,
          printArtifactLinks,
          repoSlug,
          runId: Number(current.id),
          token,
        });
        return;
      }
      const failureSummary = await resolveRunFailureSummary({
        baseApiUrl,
        githubApiRetryBackoffFactor,
        githubApiRetryDelayMs,
        githubApiRetryJitterPercent,
        githubApiRetryMaxAttempts,
        githubApiRetryMaxDelayMs,
        failureSummaryMaxJobs,
        runId: Number(current.id),
        token,
      });
      throw new Error(
        `Run completed with conclusion '${conclusion}'. URL: ${current.html_url}${failureSummary ? ` ${failureSummary}` : ''}`,
      );
    }
    await sleep(waitPollMs);
  }

  throw new Error(
    `Timed out waiting for workflow completion after ${waitTimeoutMs}ms.`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  if (
    message.includes(' 401 ') ||
    message.includes('Bad credentials') ||
    message.includes('Requires authentication')
  ) {
    process.stderr.write(
      'Auth troubleshooting: use a real token value (not placeholders), or run gh auth login. Fine-grained PAT requires Actions: Read/Write and Contents: Read.\n',
    );
  }
  if (message.includes("Workflow does not have 'workflow_dispatch' trigger")) {
    process.stderr.write(
      'Target workflow ref does not include workflow_dispatch. Push updated workflow file or set RELEASE_WORKFLOW_REF to a ref that already has it.\n',
    );
  }
  process.exit(1);
});
