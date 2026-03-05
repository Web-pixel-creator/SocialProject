import {
  buildGitHubApiRetryDecision,
  computeGitHubApiRetryDelayMs,
} from './dispatch-production-launch-gate-transient-retry-utils.mjs';

export const DEFAULT_GITHUB_API_TRANSIENT_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_GITHUB_API_TRANSIENT_RETRY_DELAY_MS = 2000;
export const DEFAULT_GITHUB_API_TRANSIENT_RETRY_BACKOFF_FACTOR = 2;
export const DEFAULT_GITHUB_API_TRANSIENT_RETRY_MAX_DELAY_MS = 10000;
export const DEFAULT_GITHUB_API_TRANSIENT_RETRY_JITTER_PERCENT = 20;

const DEFAULT_GITHUB_API_VERSION = '2022-11-28';

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const githubApiRequest = async ({
  allowStatusCodes = [],
  apiVersion = DEFAULT_GITHUB_API_VERSION,
  body,
  expectBinary = false,
  method,
  token,
  url,
}) => {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': apiVersion,
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
    if (expectBinary) {
      return Buffer.from(await response.arrayBuffer());
    }
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  if (
    Array.isArray(allowStatusCodes) &&
    allowStatusCodes.some((statusCode) => statusCode === response.status)
  ) {
    return null;
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

export const normalizeGitHubApiTransientRetryConfig = (retryConfig = {}) => ({
  backoffFactor: Number.isFinite(retryConfig.backoffFactor)
    ? Math.max(1, Math.floor(retryConfig.backoffFactor))
    : DEFAULT_GITHUB_API_TRANSIENT_RETRY_BACKOFF_FACTOR,
  delayMs: Number.isFinite(retryConfig.delayMs)
    ? Math.max(1, Math.floor(retryConfig.delayMs))
    : DEFAULT_GITHUB_API_TRANSIENT_RETRY_DELAY_MS,
  jitterPercent: Number.isFinite(retryConfig.jitterPercent)
    ? Math.max(0, Math.min(100, Math.floor(retryConfig.jitterPercent)))
    : DEFAULT_GITHUB_API_TRANSIENT_RETRY_JITTER_PERCENT,
  maxAttempts: Number.isFinite(retryConfig.maxAttempts)
    ? Math.max(1, Math.floor(retryConfig.maxAttempts))
    : DEFAULT_GITHUB_API_TRANSIENT_RETRY_MAX_ATTEMPTS,
  maxDelayMs: Number.isFinite(retryConfig.maxDelayMs)
    ? Math.max(1, Math.floor(retryConfig.maxDelayMs))
    : DEFAULT_GITHUB_API_TRANSIENT_RETRY_MAX_DELAY_MS,
});

export const githubApiRequestWithTransientRetry = async ({
  allowStatusCodes,
  apiVersion = DEFAULT_GITHUB_API_VERSION,
  body,
  expectBinary = false,
  method,
  retryConfig,
  retryLabel,
  token,
  url,
  writeRetryWarning = (message) => process.stderr.write(message),
}) => {
  const safeRetryConfig = normalizeGitHubApiTransientRetryConfig(retryConfig);

  for (let attempt = 1; attempt <= safeRetryConfig.maxAttempts; attempt += 1) {
    try {
      return await githubApiRequest({
        allowStatusCodes,
        apiVersion,
        body,
        expectBinary,
        method,
        token,
        url,
      });
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      const retryDecision = buildGitHubApiRetryDecision({
        attempt,
        errorMessage,
        maxAttempts: safeRetryConfig.maxAttempts,
      });
      if (method !== 'GET' || !retryDecision.shouldRetry) {
        throw error;
      }
      const retryDelayForAttemptMs = computeGitHubApiRetryDelayMs({
        attempt,
        backoffFactor: safeRetryConfig.backoffFactor,
        baseDelayMs: safeRetryConfig.delayMs,
        jitterPercent: safeRetryConfig.jitterPercent,
        maxDelayMs: safeRetryConfig.maxDelayMs,
      });
      const label = retryLabel || `${method} ${url}`;
      writeRetryWarning(
        `Warning: transient GitHub API error on ${label}; retrying in ${retryDelayForAttemptMs}ms (${attempt}/${safeRetryConfig.maxAttempts}).\n`,
      );
      await sleep(retryDelayForAttemptMs);
    }
  }

  return null;
};
