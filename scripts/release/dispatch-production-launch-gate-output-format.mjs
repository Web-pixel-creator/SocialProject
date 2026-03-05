const toBooleanText = (value) => (value ? 'true' : 'false');

export const buildDispatchInputSummaryLines = ({
  allowFailureDrill,
  includeStepSummaryLink,
  printArtifactLinks,
  requiredExternalChannels,
  requireInlineHealthArtifacts,
  requireNaturalCronWindow,
  requireSkillMarkers,
  runtimeDraftId,
  smokeTimeoutRetries,
  smokeTimeoutRetryDelayMs,
  failureSummaryMaxJobs,
  selectedArtifactLinkNames,
  webhookSecretOverride,
}) => {
  const lines = [];
  if (runtimeDraftId) {
    lines.push(`Runtime draft id input: ${runtimeDraftId}`);
  }
  lines.push(
    `Require skill markers input: ${toBooleanText(requireSkillMarkers)}`,
    `Require natural cron window input: ${toBooleanText(requireNaturalCronWindow)}`,
    `Required external channels input: ${requiredExternalChannels || 'none'}`,
    `Require inline health artifacts input: ${toBooleanText(requireInlineHealthArtifacts)}`,
    `Smoke timeout retries input: ${
      smokeTimeoutRetries === null ? 'default' : smokeTimeoutRetries
    }`,
    `Smoke timeout retry delay ms input: ${
      smokeTimeoutRetryDelayMs === null ? 'default' : smokeTimeoutRetryDelayMs
    }`,
    `Failure summary max jobs: ${failureSummaryMaxJobs}`,
    `Allow failure drill input: ${toBooleanText(allowFailureDrill)}`,
    `Print artifact links option: ${toBooleanText(printArtifactLinks)}`,
    `Include step summary link: ${toBooleanText(includeStepSummaryLink)}`,
  );
  if (printArtifactLinks) {
    lines.push(
      `Artifact link names: ${
        selectedArtifactLinkNames.length > 0
          ? selectedArtifactLinkNames.join(',')
          : 'none'
      }`,
    );
  }
  if (webhookSecretOverride) {
    lines.push('Webhook secret override input: [provided]');
  }
  return lines;
};
