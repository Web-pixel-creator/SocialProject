import { execFileSync } from 'node:child_process';

const GITHUB_API_VERSION = '2022-11-28';
const TARGET_VARIABLES = [
  'RELEASE_API_BASE_URL',
  'RELEASE_WEB_BASE_URL',
  'RELEASE_CSRF_TOKEN',
];

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

const githubRequest = async ({ token, method, url, body, allow404 = false }) => {
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

  if (allow404 && response.status === 404) {
    return null;
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

const getVariable = async ({ token, baseApiUrl, name }) => {
  const url = `${baseApiUrl}/actions/variables/${encodeURIComponent(name)}`;
  return githubRequest({
    token,
    method: 'GET',
    url,
    allow404: true,
  });
};

const upsertVariable = async ({ token, baseApiUrl, name, value }) => {
  const existing = await getVariable({ token, baseApiUrl, name });
  if (!existing) {
    const createUrl = `${baseApiUrl}/actions/variables`;
    await githubRequest({
      token,
      method: 'POST',
      url: createUrl,
      body: { name, value },
    });
    return 'created';
  }

  const updateUrl = `${baseApiUrl}/actions/variables/${encodeURIComponent(name)}`;
  await githubRequest({
    token,
    method: 'PATCH',
    url: updateUrl,
    body: { name, value },
  });
  return 'updated';
};

const deleteVariableIfExists = async ({ token, baseApiUrl, name }) => {
  const existing = await getVariable({ token, baseApiUrl, name });
  if (!existing) {
    return 'skipped';
  }
  const url = `${baseApiUrl}/actions/variables/${encodeURIComponent(name)}`;
  await githubRequest({
    token,
    method: 'DELETE',
    url,
  });
  return 'deleted';
};

const showVariables = async ({ token, baseApiUrl }) => {
  const url = `${baseApiUrl}/actions/variables?per_page=100`;
  const data = await githubRequest({
    token,
    method: 'GET',
    url,
  });

  const list = Array.isArray(data?.variables) ? data.variables : [];
  const map = new Map(list.map((entry) => [entry.name, entry.value]));

  for (const name of TARGET_VARIABLES) {
    const value = map.get(name);
    if (typeof value === 'string' && value.length > 0) {
      process.stdout.write(`${name}=${value}\n`);
    } else {
      process.stdout.write(`${name}=<not-set>\n`);
    }
  }
};

const runSet = async ({ token, baseApiUrl }) => {
  const apiBaseUrl = (process.env.RELEASE_API_BASE_URL ?? '').trim();
  const webBaseUrl = (process.env.RELEASE_WEB_BASE_URL ?? '').trim();
  const csrfToken = (process.env.RELEASE_CSRF_TOKEN ?? '').trim();

  if (!apiBaseUrl || !webBaseUrl) {
    throw new Error(
      'Missing RELEASE_API_BASE_URL or RELEASE_WEB_BASE_URL for set mode.',
    );
  }

  const operations = [
    { name: 'RELEASE_API_BASE_URL', value: apiBaseUrl },
    { name: 'RELEASE_WEB_BASE_URL', value: webBaseUrl },
  ];
  if (csrfToken) {
    operations.push({ name: 'RELEASE_CSRF_TOKEN', value: csrfToken });
  }

  for (const { name, value } of operations) {
    const status = await upsertVariable({ token, baseApiUrl, name, value });
    process.stdout.write(`${name}: ${status}\n`);
  }

  if (!csrfToken) {
    process.stdout.write(
      'RELEASE_CSRF_TOKEN not provided; leaving existing variable as-is.\n',
    );
  }
};

const runClear = async ({ token, baseApiUrl }) => {
  for (const name of TARGET_VARIABLES) {
    const status = await deleteVariableIfExists({ token, baseApiUrl, name });
    process.stdout.write(`${name}: ${status}\n`);
  }
};

const main = async () => {
  const mode = (
    process.argv[2] ??
    process.env.RELEASE_STAGING_INPUTS_MODE ??
    'show'
  )
    .trim()
    .toLowerCase();

  if (!['show', 'set', 'clear'].includes(mode)) {
    throw new Error(`Unsupported mode '${mode}'. Use one of: show, set, clear.`);
  }

  const token = resolveToken();
  const repoSlug = resolveRepoSlug();
  const baseApiUrl = `https://api.github.com/repos/${repoSlug}`;

  process.stdout.write(`Repository: ${repoSlug}\n`);
  process.stdout.write(`Mode: ${mode}\n`);

  if (mode === 'show') {
    await showVariables({ token, baseApiUrl });
    return;
  }
  if (mode === 'set') {
    await runSet({ token, baseApiUrl });
    await showVariables({ token, baseApiUrl });
    return;
  }

  await runClear({ token, baseApiUrl });
  await showVariables({ token, baseApiUrl });
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
