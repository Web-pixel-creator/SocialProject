import { execFileSync } from 'node:child_process';
import {
  ALLOWED_ARTIFACT_LINK_NAMES,
  LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME,
  parseArtifactLinkNames,
  resolveDispatchArtifactLinkOptions,
} from './dispatch-production-launch-gate-link-options.mjs';
import { resolveDispatchTokenCandidates } from './dispatch-production-launch-gate-token-resolution.mjs';

const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_WORKFLOW_FILE = 'production-launch-gate.yml';
const DEFAULT_WORKFLOW_REF = 'main';
const DEFAULT_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_WAIT_POLL_MS = 5000;
const RUN_DISCOVERY_GRACE_MS = 2 * 60 * 1000;
const ARTIFACT_DISCOVERY_ATTEMPTS = 6;
const ARTIFACT_DISCOVERY_POLL_MS = 1000;
const EXTERNAL_CHANNELS = ['telegram', 'slack', 'discord'];
const USAGE = `Usage: npm run release:launch:gate:dispatch -- [options]

Options:
  --token|-Token <value>                 GitHub token override
  --runtime-draft-id <uuid>              workflow input runtime_draft_id
  --require-skill-markers                workflow input require_skill_markers=true
  --require-natural-cron-window          workflow input require_natural_cron_window=true
  --required-external-channels <csv|all> workflow input required_external_channels
  --require-inline-health-artifacts      workflow input require_inline_health_artifacts=true
  --allow-failure-drill                  workflow input allow_failure_drill=true
  --webhook-secret-override <value>      workflow input webhook_secret_override (requires allow_failure_drill)
  --print-artifact-links                 print links for additional high-signal artifacts after success
  --artifact-link-names <csv|all>        override artifact link set (allowed: ${ALLOWED_ARTIFACT_LINK_NAMES.join(', ')}, or all)
  --no-step-summary-link                 suppress default step-summary artifact link output
  --help|-h

Token resolution order:
1) --token / -Token argument
2) GITHUB_TOKEN / GH_TOKEN
3) gh auth token
`;

const parseNumber = (raw, fallback) => {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (raw, fallback) => {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
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

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const parseExternalChannels = (raw, sourceLabel) => {
  if (typeof raw !== 'string') return '';
  const normalized = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (normalized.length === 0) return '';
  if (normalized.includes('all')) return 'all';
  const invalid = normalized.filter((entry) => !EXTERNAL_CHANNELS.includes(entry));
  if (invalid.length > 0) {
    throw new Error(
      `${sourceLabel} contains unsupported channels: ${invalid.join(', ')}. Allowed: ${EXTERNAL_CHANNELS.join(', ')} or all.`,
    );
  }
  return [...new Set(normalized)].join(',');
};

const parseCliArgs = (argv) => {
  let tokenFromArg = '';
  let runtimeDraftId = '';
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
    if (arg.startsWith('--required-external-channels=')) {
      const value = arg.slice('--required-external-channels='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      requiredExternalChannels = parseExternalChannels(
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
      requiredExternalChannels = parseExternalChannels(
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
      await githubRequest({
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

const githubRequest = async ({ token, method, url, body }) => {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(
      `GitHub API ${method} ${url} request failed before response: ${toErrorMessage(
        error,
      )}`,
    );
  }

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
    const parsed = JSON.parse(errorText);
    details = parsed.message ? `${parsed.message}` : errorText;
  } catch {
    // keep raw response
  }
  throw new Error(
    `GitHub API ${method} ${url} failed: ${response.status} ${response.statusText}. ${details}`,
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toArtifactUiUrl = ({ repoSlug, runId, artifactId }) =>
  `https://github.com/${repoSlug}/actions/runs/${runId}/artifacts/${artifactId}`;

const listRunArtifacts = async ({ baseApiUrl, runId, token }) => {
  const artifactsResponse = await githubRequest({
    token,
    method: 'GET',
    url: `${baseApiUrl}/actions/runs/${runId}/artifacts?per_page=100`,
  });
  return Array.isArray(artifactsResponse?.artifacts)
    ? artifactsResponse.artifacts
    : [];
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
  requiredArtifactNames,
  runId,
  token,
}) => {
  for (let attempt = 1; attempt <= ARTIFACT_DISCOVERY_ATTEMPTS; attempt += 1) {
    const artifacts = await listRunArtifacts({
      baseApiUrl,
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
  const waitForCompletion = parseBoolean(
    process.env.RELEASE_WAIT_FOR_COMPLETION,
    true,
  );
  const waitTimeoutMs = parseNumber(
    process.env.RELEASE_WAIT_TIMEOUT_MS,
    DEFAULT_WAIT_TIMEOUT_MS,
  );
  const waitPollMs = parseNumber(
    process.env.RELEASE_WAIT_POLL_MS,
    DEFAULT_WAIT_POLL_MS,
  );
  const runtimeDraftId =
    cli.runtimeDraftId || (process.env.RELEASE_RUNTIME_DRAFT_ID ?? '').trim();
  const requireSkillMarkers =
    typeof cli.requireSkillMarkers === 'boolean'
      ? cli.requireSkillMarkers
      : parseBoolean(process.env.RELEASE_REQUIRE_SKILL_MARKERS, false);
  const requireNaturalCronWindow =
    typeof cli.requireNaturalCronWindow === 'boolean'
      ? cli.requireNaturalCronWindow
      : parseBoolean(process.env.RELEASE_REQUIRE_NATURAL_CRON_WINDOW, false);
  const requiredExternalChannels =
    cli.requiredExternalChannels ||
    parseExternalChannels(
      process.env.RELEASE_REQUIRED_EXTERNAL_CHANNELS ?? '',
      'RELEASE_REQUIRED_EXTERNAL_CHANNELS',
    );
  const requireInlineHealthArtifacts =
    typeof cli.requireInlineHealthArtifacts === 'boolean'
      ? cli.requireInlineHealthArtifacts
      : parseBoolean(process.env.RELEASE_REQUIRE_INLINE_HEALTH_ARTIFACTS, false);
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
    parseBoolean,
  });
  const allowFailureDrill =
    typeof cli.allowFailureDrill === 'boolean'
      ? cli.allowFailureDrill
      : parseBoolean(process.env.RELEASE_ALLOW_FAILURE_DRILL, false);
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
    const baseline = await githubRequest({
      token,
      method: 'GET',
      url: listRunsUrl,
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
  if (allowFailureDrill) {
    inputs.allow_failure_drill = 'true';
  }
  if (webhookSecretOverride) {
    inputs.webhook_secret_override = webhookSecretOverride;
  }

  const dispatchStartedAtMs = Date.now();
  await githubRequest({
    token,
    method: 'POST',
    url: dispatchUrl,
    body: {
      ref: workflowRef,
      inputs,
    },
  });

  process.stdout.write(`Dispatched ${workflowFile} on ${workflowRef} for ${repoSlug}.\n`);
  if (runtimeDraftId) {
    process.stdout.write(`Runtime draft id input: ${runtimeDraftId}\n`);
  }
  process.stdout.write(
    `Require skill markers input: ${requireSkillMarkers ? 'true' : 'false'}\n`,
  );
  process.stdout.write(
    `Require natural cron window input: ${
      requireNaturalCronWindow ? 'true' : 'false'
    }\n`,
  );
  process.stdout.write(
    `Required external channels input: ${
      requiredExternalChannels || 'none'
    }\n`,
  );
  process.stdout.write(
    `Require inline health artifacts input: ${
      requireInlineHealthArtifacts ? 'true' : 'false'
    }\n`,
  );
  process.stdout.write(
    `Allow failure drill input: ${allowFailureDrill ? 'true' : 'false'}\n`,
  );
  process.stdout.write(
    `Print artifact links option: ${printArtifactLinks ? 'true' : 'false'}\n`,
  );
  process.stdout.write(
    `Include step summary link: ${includeStepSummaryLink ? 'true' : 'false'}\n`,
  );
  if (printArtifactLinks) {
    process.stdout.write(
      `Artifact link names: ${
        selectedArtifactLinkNames.length > 0
          ? selectedArtifactLinkNames.join(',')
          : 'none'
      }\n`,
    );
  }
  if (webhookSecretOverride) {
    process.stdout.write('Webhook secret override input: [provided]\n');
  }

  if (!waitForCompletion) {
    process.stdout.write('Dispatch-only mode enabled. Exiting without polling.\n');
    return;
  }

  const findRun = async () => {
    const data = await githubRequest({
      token,
      method: 'GET',
      url: listRunsUrl,
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
    const current = await githubRequest({
      token,
      method: 'GET',
      url: runUrl,
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
          includeStepSummaryLink,
          printArtifactLinks,
          repoSlug,
          runId: Number(current.id),
          token,
        });
        return;
      }
      throw new Error(
        `Run completed with conclusion '${conclusion}'. URL: ${current.html_url}`,
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
