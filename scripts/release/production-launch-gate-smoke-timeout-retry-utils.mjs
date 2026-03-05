const SMOKE_TIMEOUT_ERROR_PATTERNS = [
  'aborterror',
  'aborted',
  'timed out',
  'timeout',
  'etimedout',
  'econnaborted',
];

const normalizeErrorMessage = (value) => String(value ?? '').trim().toLowerCase();

export const isSmokeTimeoutErrorMessage = (value) => {
  const normalized = normalizeErrorMessage(value);
  if (!normalized) {
    return false;
  }
  return SMOKE_TIMEOUT_ERROR_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
};

const getFailedSmokeSteps = (smokeReport) => {
  const steps = Array.isArray(smokeReport?.steps) ? smokeReport.steps : [];
  return steps.filter(
    (step) =>
      step &&
      typeof step === 'object' &&
      step.pass === false &&
      typeof step.name === 'string' &&
      step.name.length > 0,
  );
};

export const isSmokeTimeoutOnlyFailureReport = (smokeReport) => {
  if (smokeReport?.summary?.pass === true) {
    return false;
  }
  const failedSteps = getFailedSmokeSteps(smokeReport);
  if (failedSteps.length === 0) {
    return false;
  }
  return failedSteps.every((step) => isSmokeTimeoutErrorMessage(step.error));
};

export const buildSmokeTimeoutRetryDecision = ({
  attempt,
  maxRetries,
  smokeReport,
}) => {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const safeMaxRetries = Number.isFinite(maxRetries)
    ? Math.max(0, Math.floor(maxRetries))
    : 0;
  const retriesUsedBeforeAttempt = Math.max(0, safeAttempt - 1);
  const retriesRemaining = Math.max(0, safeMaxRetries - retriesUsedBeforeAttempt);
  const timeoutOnly = isSmokeTimeoutOnlyFailureReport(smokeReport);
  return {
    retriesRemaining,
    shouldRetry: timeoutOnly && retriesRemaining > 0,
    timeoutOnly,
  };
};
