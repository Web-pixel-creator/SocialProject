export const LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME =
  'production-launch-gate-step-summary';
export const OPTIONAL_ARTIFACT_LINK_NAMES = [
  'production-launch-gate-summary',
  'post-release-health-inline-artifacts-schema-check',
  'post-release-health-inline-artifacts-summary',
];
export const ALLOWED_ARTIFACT_LINK_NAMES = [
  LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME,
  ...OPTIONAL_ARTIFACT_LINK_NAMES,
];

const parseBooleanDefault = (raw, fallback) => {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return fallback;
};

export const parseArtifactLinkNames = (raw, sourceLabel) => {
  if (typeof raw !== 'string') return [];
  const normalized = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (normalized.length === 0) return [];
  if (normalized.includes('all')) {
    return [...OPTIONAL_ARTIFACT_LINK_NAMES];
  }
  const invalid = normalized.filter(
    (entry) => !ALLOWED_ARTIFACT_LINK_NAMES.includes(entry),
  );
  if (invalid.length > 0) {
    throw new Error(
      `${sourceLabel} contains unsupported artifact names: ${invalid.join(', ')}. Allowed: ${ALLOWED_ARTIFACT_LINK_NAMES.join(', ')} or all.`,
    );
  }
  return [...new Set(normalized)].filter(
    (entry) => entry !== LAUNCH_GATE_STEP_SUMMARY_ARTIFACT_NAME,
  );
};

export const resolveDispatchArtifactLinkOptions = ({
  cliArtifactLinkNames,
  cliNoStepSummaryLink,
  cliPrintArtifactLinks,
  envArtifactLinkNamesRaw,
  envNoStepSummaryLinkRaw,
  envPrintArtifactLinksRaw,
  parseBoolean = parseBooleanDefault,
}) => {
  const normalizedCliArtifactLinkNames = Array.isArray(cliArtifactLinkNames)
    ? cliArtifactLinkNames
    : [];
  const envArtifactLinkNames = parseArtifactLinkNames(
    envArtifactLinkNamesRaw ?? '',
    'RELEASE_ARTIFACT_LINK_NAMES',
  );
  const artifactLinkNames =
    normalizedCliArtifactLinkNames.length > 0
      ? normalizedCliArtifactLinkNames
      : envArtifactLinkNames;
  const explicitPrintArtifactLinks =
    typeof cliPrintArtifactLinks === 'boolean'
      ? cliPrintArtifactLinks
      : parseBoolean(envPrintArtifactLinksRaw, false);
  const printArtifactLinks =
    explicitPrintArtifactLinks ||
    normalizedCliArtifactLinkNames.length > 0 ||
    envArtifactLinkNames.length > 0;
  const selectedArtifactLinkNames =
    artifactLinkNames.length > 0
      ? artifactLinkNames
      : printArtifactLinks
        ? OPTIONAL_ARTIFACT_LINK_NAMES
        : [];
  const includeStepSummaryLink =
    typeof cliNoStepSummaryLink === 'boolean'
      ? !cliNoStepSummaryLink
      : !parseBoolean(envNoStepSummaryLinkRaw, false);
  return {
    includeStepSummaryLink,
    printArtifactLinks,
    selectedArtifactLinkNames,
  };
};
