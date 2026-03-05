import { resolveDispatchTokenCandidates } from './dispatch-production-launch-gate-token-resolution.mjs';
import { selectDispatchTokenCandidate } from './dispatch-github-token-selection.mjs';
import { readGitHubTokenFromGhAuth } from './github-gh-auth-token.mjs';
import {
  assertDispatchTokenNotPlaceholder,
  parseDispatchTokenCliArg,
} from './dispatch-token-arg-utils.mjs';
import { resolveRepoSlug } from './github-token-repo-resolution.mjs';
import { githubApiRequestWithTransientRetry } from './github-api-request-with-transient-retry.mjs';
import { sleep } from './release-runtime-utils.mjs';

const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_WORKFLOW_FILE = 'ci.yml';
const DEFAULT_WORKFLOW_REF = 'main';
const DEFAULT_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_WAIT_POLL_MS = 5000;
const RUN_DISCOVERY_GRACE_MS = 2 * 60 * 1000;
const USAGE = `Usage: npm run release:smoke:dispatch -- [--token <value>|-Token <value>|--token=<value>|-Token=<value>]

Token resolution order:
1) --token / -Token argument
2) GITHUB_TOKEN / GH_TOKEN
3) gh auth token
`;

const parseNumber = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  let tokenFromArg = '';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }

    const parsedTokenArg = parseDispatchTokenCliArg({
      arg,
      argv,
      index,
      usage: USAGE,
    });
    if (parsedTokenArg.matched) {
      tokenFromArg = parsedTokenArg.tokenFromArg;
      index = parsedTokenArg.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  assertDispatchTokenNotPlaceholder(tokenFromArg);

  return {
    tokenFromArg,
  };
};

const resolveTokenCandidates = ({ tokenFromArg }) =>
  resolveDispatchTokenCandidates({
    envGithubToken: process.env.GITHUB_TOKEN,
    envGhToken: process.env.GH_TOKEN,
    ghAuthToken: readGitHubTokenFromGhAuth(),
    tokenFromArg,
  });

const githubRequest = async ({ token, method, url, body }) => {
  return githubApiRequestWithTransientRetry({
    apiVersion: GITHUB_API_VERSION,
    body,
    method,
    retryLabel: `[release:smoke:dispatch] ${method} ${url}`,
    token,
    url,
  });
};

const main = async () => {
  const cli = parseCliArgs(process.argv.slice(2));
  const apiBaseUrl = (process.env.RELEASE_API_BASE_URL ?? '').trim();
  const webBaseUrl = (process.env.RELEASE_WEB_BASE_URL ?? '').trim();
  const csrfToken = (process.env.RELEASE_CSRF_TOKEN ?? '').trim();
  const workflowFile = (process.env.RELEASE_WORKFLOW_FILE ?? DEFAULT_WORKFLOW_FILE).trim();
  const workflowRef = (process.env.RELEASE_WORKFLOW_REF ?? DEFAULT_WORKFLOW_REF).trim();
  const waitForCompletion = parseBoolean(process.env.RELEASE_WAIT_FOR_COMPLETION, true);
  const waitTimeoutMs = parseNumber(process.env.RELEASE_WAIT_TIMEOUT_MS, DEFAULT_WAIT_TIMEOUT_MS);
  const waitPollMs = parseNumber(process.env.RELEASE_WAIT_POLL_MS, DEFAULT_WAIT_POLL_MS);

  const repoSlug = resolveRepoSlug();
  const baseApiUrl = `https://api.github.com/repos/${repoSlug}`;
  const selectedToken = await selectDispatchTokenCandidate({
    candidates: resolveTokenCandidates(cli),
    probeUrl: `${baseApiUrl}`,
    probeAuth: ({ token, url }) =>
      githubRequest({
        token,
        method: 'GET',
        url,
      }),
  });
  const token = selectedToken.token;
  const dispatchUrl = `${baseApiUrl}/actions/workflows/${encodeURIComponent(
    workflowFile,
  )}/dispatches`;

  const dispatchInputs = {};
  if (apiBaseUrl) {
    dispatchInputs.release_api_base_url = apiBaseUrl;
  }
  if (webBaseUrl) {
    dispatchInputs.release_web_base_url = webBaseUrl;
  }
  if (csrfToken) {
    dispatchInputs.release_csrf_token = csrfToken;
  }

  const dispatchStartedAtMs = Date.now();
  await githubRequest({
    token,
    method: 'POST',
    url: dispatchUrl,
    body: {
      ref: workflowRef,
      inputs: dispatchInputs,
    },
  });

  process.stdout.write(`Dispatched ${workflowFile} on ${workflowRef} for ${repoSlug}.\n`);
  if (!apiBaseUrl || !webBaseUrl) {
    process.stdout.write(
      'No staging URL inputs provided. Workflow will run local-stack fallback smoke dry-run.\n',
    );
  }

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
    if (run) {
      break;
    }
    await sleep(waitPollMs);
  }

  if (!run) {
    throw new Error(`Unable to discover dispatched workflow run within ${waitTimeoutMs}ms.`);
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
      throw new Error(`Run completed with conclusion '${conclusion}'. URL: ${current.html_url}`);
    }

    await sleep(waitPollMs);
  }

  throw new Error(`Timed out waiting for workflow completion after ${waitTimeoutMs}ms.`);
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
      'Target workflow ref does not include workflow_dispatch. Push updated .github/workflows/ci.yml and rerun, or set RELEASE_WORKFLOW_REF to a branch that already has it.\n',
    );
  }
  process.exit(1);
});
