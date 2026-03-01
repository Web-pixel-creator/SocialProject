import { execFileSync } from 'node:child_process';

const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_WORKFLOW_FILE = 'production-launch-gate.yml';
const DEFAULT_WORKFLOW_REF = 'main';
const DEFAULT_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_WAIT_POLL_MS = 5000;
const RUN_DISCOVERY_GRACE_MS = 2 * 60 * 1000;
const USAGE = `Usage: npm run release:launch:gate:dispatch -- [--token <value>|-Token <value>|--token=<value>|-Token=<value>]

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

const parseCliArgs = (argv) => {
  let tokenFromArg = '';

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
    tokenFromArg,
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

const resolveTokenCandidates = ({ tokenFromArg }) => {
  const candidates = [];
  const isAsciiVisible = (value) => /^[\x21-\x7E]+$/u.test(value);
  const addCandidate = (token, source) => {
    const normalized = token?.trim();
    if (!normalized) {
      return;
    }
    if (!isAsciiVisible(normalized)) {
      throw new Error(
        `Token from '${source}' contains unsupported characters. Use the exact GitHub token value (ASCII only), without placeholders, spaces, or localized text.`,
      );
    }
    if (candidates.some((entry) => entry.token === normalized)) {
      return;
    }
    candidates.push({
      token: normalized,
      source,
    });
  };

  addCandidate(tokenFromArg, 'cli-arg');
  addCandidate(process.env.GITHUB_TOKEN, 'env:GITHUB_TOKEN');
  addCandidate(process.env.GH_TOKEN, 'env:GH_TOKEN');
  addCandidate(readTokenFromGhAuth(), 'gh-auth');

  return candidates;
};

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
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
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
  const runtimeDraftId = (process.env.RELEASE_RUNTIME_DRAFT_ID ?? '').trim();
  const requireSkillMarkers = parseBoolean(
    process.env.RELEASE_REQUIRE_SKILL_MARKERS,
    false,
  );
  const requireNaturalCronWindow = parseBoolean(
    process.env.RELEASE_REQUIRE_NATURAL_CRON_WINDOW,
    false,
  );
  if (requireSkillMarkers && !runtimeDraftId) {
    throw new Error(
      'RELEASE_REQUIRE_SKILL_MARKERS=true requires RELEASE_RUNTIME_DRAFT_ID to be set (draft with skill markers).',
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
