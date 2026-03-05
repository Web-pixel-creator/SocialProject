const TRANSIENT_GITHUB_API_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const GITHUB_STATUS_CODE_PATTERN = /\bfailed:\s*(\d{3})\b/i;

const normalizeErrorMessage = (value) => String(value || '').trim();

export const parseGitHubApiStatusCodeFromErrorMessage = (value) => {
  const message = normalizeErrorMessage(value);
  if (!message) {
    return null;
  }
  const match = message.match(GITHUB_STATUS_CODE_PATTERN);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isTransientGitHubApiPollingErrorMessage = (value) => {
  const message = normalizeErrorMessage(value).toLowerCase();
  if (!message) {
    return false;
  }
  if (message.includes('request failed before response')) {
    return true;
  }
  const statusCode = parseGitHubApiStatusCodeFromErrorMessage(message);
  return statusCode !== null && TRANSIENT_GITHUB_API_STATUS_CODES.has(statusCode);
};

export const buildGitHubApiRetryDecision = ({
  attempt,
  errorMessage,
  maxAttempts,
}) => {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const safeMaxAttempts = Number.isFinite(maxAttempts)
    ? Math.max(1, Math.floor(maxAttempts))
    : 1;
  const attemptsRemaining = Math.max(0, safeMaxAttempts - safeAttempt);
  const transient = isTransientGitHubApiPollingErrorMessage(errorMessage);
  return {
    attemptsRemaining,
    shouldRetry: transient && attemptsRemaining > 0,
    statusCode: parseGitHubApiStatusCodeFromErrorMessage(errorMessage),
    transient,
  };
};

export const computeGitHubApiRetryDelayMs = ({
  attempt,
  backoffFactor = 2,
  baseDelayMs,
  jitterPercent = 20,
  maxDelayMs,
  randomValue = Math.random(),
}) => {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const safeBackoffFactor = Number.isFinite(backoffFactor)
    ? Math.max(1, Math.floor(backoffFactor))
    : 1;
  const safeBaseDelayMs = Number.isFinite(baseDelayMs)
    ? Math.max(1, Math.floor(baseDelayMs))
    : 1;
  const safeMaxDelayMs = Number.isFinite(maxDelayMs)
    ? Math.max(safeBaseDelayMs, Math.floor(maxDelayMs))
    : safeBaseDelayMs;
  const safeJitterPercent = Number.isFinite(jitterPercent)
    ? Math.max(0, Math.min(100, Math.floor(jitterPercent)))
    : 0;
  const safeRandomValue = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(1, randomValue))
    : 0.5;

  const exponent = Math.max(0, safeAttempt - 1);
  const uncappedDelayMs = safeBaseDelayMs * safeBackoffFactor ** exponent;
  const cappedDelayMs = Math.min(safeMaxDelayMs, uncappedDelayMs);
  if (safeJitterPercent <= 0) {
    return Math.max(1, Math.round(cappedDelayMs));
  }

  const jitterRange = cappedDelayMs * (safeJitterPercent / 100);
  const jitterDelta = (safeRandomValue * 2 - 1) * jitterRange;
  const jitteredDelayMs = cappedDelayMs + jitterDelta;
  return Math.max(
    1,
    Math.min(safeMaxDelayMs, Math.round(jitteredDelayMs)),
  );
};
