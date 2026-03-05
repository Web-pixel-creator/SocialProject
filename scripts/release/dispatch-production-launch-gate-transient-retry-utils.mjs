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
