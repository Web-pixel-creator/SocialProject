import { execFileSync } from 'node:child_process';

const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_WORKFLOW_FILE = 'production-launch-gate.yml';
const DEFAULT_WORKFLOW_REF = 'main';
const DEFAULT_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_WAIT_POLL_MS = 5000;
const RUN_DISCOVERY_GRACE_MS = 2 * 60 * 1000;

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
  const token = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '').trim();
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

  if (!token) {
    throw new Error(
      'Missing GitHub token. Set GITHUB_TOKEN (or GH_TOKEN) with workflow permissions.',
    );
  }

  const repoSlug = resolveRepoSlug();
  const baseApiUrl = `https://api.github.com/repos/${repoSlug}`;
  const dispatchUrl = `${baseApiUrl}/actions/workflows/${encodeURIComponent(
    workflowFile,
  )}/dispatches`;

  const inputs = {};
  if (runtimeDraftId) {
    inputs.runtime_draft_id = runtimeDraftId;
  }
  if (requireSkillMarkers) {
    inputs.require_skill_markers = 'true';
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

  if (!waitForCompletion) {
    process.stdout.write('Dispatch-only mode enabled. Exiting without polling.\n');
    return;
  }

  const listRunsUrl = `${baseApiUrl}/actions/workflows/${encodeURIComponent(
    workflowFile,
  )}/runs?event=workflow_dispatch&branch=${encodeURIComponent(workflowRef)}&per_page=20`;

  const findRun = async () => {
    const data = await githubRequest({
      token,
      method: 'GET',
      url: listRunsUrl,
    });
    const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
    for (const run of runs) {
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
  if (message.includes("Workflow does not have 'workflow_dispatch' trigger")) {
    process.stderr.write(
      'Target workflow ref does not include workflow_dispatch. Push updated workflow file or set RELEASE_WORKFLOW_REF to a ref that already has it.\n',
    );
  }
  process.exit(1);
});
