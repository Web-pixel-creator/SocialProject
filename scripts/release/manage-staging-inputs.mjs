import { githubApiRequestWithTransientRetry } from './github-api-request-with-transient-retry.mjs';
import {
  resolveRepoSlug,
  resolveToken,
} from './github-token-repo-resolution.mjs';

const GITHUB_API_VERSION = '2022-11-28';
const CORE_VARIABLES = [
  'RELEASE_API_BASE_URL',
  'RELEASE_WEB_BASE_URL',
];
const OPTIONAL_VARIABLES = [
  'RELEASE_CSRF_TOKEN',
  'RELEASE_NODE_ENV',
  'RELEASE_FRONTEND_URL',
  'RELEASE_S3_ENDPOINT',
  'RELEASE_S3_REGION',
  'RELEASE_S3_BUCKET',
  'RELEASE_EMBEDDING_PROVIDER',
  'RELEASE_NEXT_PUBLIC_API_BASE_URL',
  'RELEASE_NEXT_PUBLIC_WS_BASE_URL',
  'RELEASE_NEXT_PUBLIC_SEARCH_AB_ENABLED',
  'RELEASE_NEXT_PUBLIC_SEARCH_DEFAULT_PROFILE',
  'RELEASE_NEXT_PUBLIC_SEARCH_AB_WEIGHTS',
  'RELEASE_NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK',
];
const TARGET_VARIABLES = [...CORE_VARIABLES, ...OPTIONAL_VARIABLES];
const SECRET_HINTS = [
  'RELEASE_DATABASE_URL',
  'RELEASE_REDIS_URL',
  'RELEASE_JWT_SECRET',
  'RELEASE_ADMIN_API_TOKEN',
  'RELEASE_S3_ACCESS_KEY_ID',
  'RELEASE_S3_SECRET_ACCESS_KEY',
  'RELEASE_EMBEDDING_API_KEY',
];

const readEnv = (name) => (process.env[name] ?? '').trim();

const getVariable = async ({ token, baseApiUrl, name }) => {
  const url = `${baseApiUrl}/actions/variables/${encodeURIComponent(name)}`;
  return githubApiRequestWithTransientRetry({
    allowStatusCodes: [404],
    apiVersion: GITHUB_API_VERSION,
    token,
    method: 'GET',
    retryLabel: `[release:staging:inputs] GET ${url}`,
    url,
  });
};

const upsertVariable = async ({ token, baseApiUrl, name, value }) => {
  const existing = await getVariable({ token, baseApiUrl, name });
  if (!existing) {
    const createUrl = `${baseApiUrl}/actions/variables`;
    await githubApiRequestWithTransientRetry({
      apiVersion: GITHUB_API_VERSION,
      token,
      method: 'POST',
      retryLabel: `[release:staging:inputs] POST ${createUrl}`,
      url: createUrl,
      body: { name, value },
    });
    return 'created';
  }

  const updateUrl = `${baseApiUrl}/actions/variables/${encodeURIComponent(name)}`;
  await githubApiRequestWithTransientRetry({
    apiVersion: GITHUB_API_VERSION,
    token,
    method: 'PATCH',
    retryLabel: `[release:staging:inputs] PATCH ${updateUrl}`,
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
  await githubApiRequestWithTransientRetry({
    apiVersion: GITHUB_API_VERSION,
    token,
    method: 'DELETE',
    retryLabel: `[release:staging:inputs] DELETE ${url}`,
    url,
  });
  return 'deleted';
};

const showVariables = async ({ token, baseApiUrl }) => {
  const url = `${baseApiUrl}/actions/variables?per_page=100`;
  const data = await githubApiRequestWithTransientRetry({
    apiVersion: GITHUB_API_VERSION,
    token,
    method: 'GET',
    retryLabel: `[release:staging:inputs] GET ${url}`,
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

  process.stdout.write(
    `\nSecrets are not managed by this command: ${SECRET_HINTS.join(', ')}\n`,
  );
};

const runSet = async ({ token, baseApiUrl }) => {
  const apiBaseUrl = readEnv('RELEASE_API_BASE_URL');
  const webBaseUrl = readEnv('RELEASE_WEB_BASE_URL');

  if (!apiBaseUrl || !webBaseUrl) {
    throw new Error(
      'Missing RELEASE_API_BASE_URL or RELEASE_WEB_BASE_URL for set mode.',
    );
  }

  const operations = [
    { name: 'RELEASE_API_BASE_URL', value: apiBaseUrl },
    { name: 'RELEASE_WEB_BASE_URL', value: webBaseUrl },
  ];
  const optionalSetVariables = [];

  for (const name of OPTIONAL_VARIABLES) {
    const value = readEnv(name);
    if (value) {
      operations.push({ name, value });
      optionalSetVariables.push(name);
    }
  }

  for (const { name, value } of operations) {
    const status = await upsertVariable({ token, baseApiUrl, name, value });
    process.stdout.write(`${name}: ${status}\n`);
  }

  if (optionalSetVariables.length === 0) {
    process.stdout.write('No optional RELEASE_* variables provided in environment.\n');
  } else {
    process.stdout.write(
      `Optional variables updated: ${optionalSetVariables.join(', ')}\n`,
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
