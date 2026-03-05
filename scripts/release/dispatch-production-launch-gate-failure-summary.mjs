const FAILURE_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'startup_failure',
  'timed_out',
]);
const MAX_FAILED_JOB_DETAILS = 5;

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

export const buildDispatchRunFailureSummary = (jobs) => {
  const normalizedJobs = Array.isArray(jobs) ? jobs : [];
  const failedJobs = normalizedJobs.filter((job) => {
    const conclusion = toNormalizedText(job?.conclusion, '').toLowerCase();
    return FAILURE_CONCLUSIONS.has(conclusion);
  });
  if (failedJobs.length === 0) {
    return '';
  }

  const details = failedJobs.slice(0, MAX_FAILED_JOB_DETAILS).map((job) => {
    const name = toNormalizedText(job?.name, 'unnamed-job');
    const conclusion = toNormalizedText(job?.conclusion, 'unknown').toLowerCase();
    const failedStepName = pickFirstFailedStepName(job?.steps);
    const jobLogUrl = toNormalizedText(job?.html_url, '');
    if (failedStepName) {
      return jobLogUrl
        ? `${name} [${conclusion}] step: ${failedStepName} logs: ${jobLogUrl}`
        : `${name} [${conclusion}] step: ${failedStepName}`;
    }
    return jobLogUrl
      ? `${name} [${conclusion}] logs: ${jobLogUrl}`
      : `${name} [${conclusion}]`;
  });
  const remainingFailedJobsCount = failedJobs.length - details.length;
  const remainingFailedJobsHint =
    remainingFailedJobsCount > 0
      ? `; +${remainingFailedJobsCount} more failed job${
          remainingFailedJobsCount === 1 ? '' : 's'
        }`
      : '';
  return `Failed jobs: ${details.join('; ')}${remainingFailedJobsHint}`;
};
