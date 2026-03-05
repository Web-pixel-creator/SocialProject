const FAILURE_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'startup_failure',
  'timed_out',
]);

const toNormalizedText = (value, fallback) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;

const pickFirstFailedStepName = (steps) => {
  const normalizedSteps = Array.isArray(steps) ? steps : [];
  const failedStep = normalizedSteps.find((step) => {
    const conclusion = toNormalizedText(step?.conclusion, '').toLowerCase();
    return FAILURE_CONCLUSIONS.has(conclusion);
  });
  return toNormalizedText(failedStep?.name, '');
};

const pickFirstFailedJobLogUrl = (jobs) => {
  const normalizedJobs = Array.isArray(jobs) ? jobs : [];
  for (const job of normalizedJobs) {
    const conclusion = toNormalizedText(job?.conclusion, '').toLowerCase();
    if (!FAILURE_CONCLUSIONS.has(conclusion)) {
      continue;
    }
    const url = toNormalizedText(job?.html_url, '');
    if (url) {
      return url;
    }
  }
  return '';
};

export const buildDispatchRunFailureSummary = (jobs) => {
  const normalizedJobs = Array.isArray(jobs) ? jobs : [];
  const failedJobs = normalizedJobs.filter((job) => {
    const conclusion = toNormalizedText(job?.conclusion, '').toLowerCase();
    return FAILURE_CONCLUSIONS.has(conclusion);
  });
  if (failedJobs.length === 0) {
    return '';
  }

  const details = failedJobs.map((job) => {
    const name = toNormalizedText(job?.name, 'unnamed-job');
    const conclusion = toNormalizedText(job?.conclusion, 'unknown').toLowerCase();
    const failedStepName = pickFirstFailedStepName(job?.steps);
    if (failedStepName) {
      return `${name} [${conclusion}] step: ${failedStepName}`;
    }
    return `${name} [${conclusion}]`;
  });
  const failureLogUrl = pickFirstFailedJobLogUrl(failedJobs);
  const failureLogHint = failureLogUrl
    ? ` First failed job logs: ${failureLogUrl}`
    : '';
  return `Failed jobs: ${details.join('; ')}${failureLogHint}`;
};
