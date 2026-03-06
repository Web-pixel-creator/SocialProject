import { parseReleaseBooleanEnv } from './release-env-parse-utils.mjs';
import { resolveProductionRawConfig } from './production-launch-gate-config-resolvers.mjs';

const SANDBOX_EGRESS_OPERATION_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/;
const SANDBOX_EGRESS_PROFILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SANDBOX_EGRESS_WILDCARD_KEY = '*';
const SANDBOX_LIMIT_PROFILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const SANDBOX_RUNTIME_PROBE_OPERATION = 'ai_runtime_dry_run';

const normalizeLower = (value) => value.trim().toLowerCase();

const mapToSortedObject = (map) =>
  Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );

const validateResolvedRawConfig = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const source =
    typeof value.source === 'string' && value.source.trim().length > 0
      ? value.source.trim()
      : 'unknown';
  if (typeof value.value !== 'string') {
    throw new Error(`${label}.value must be a string.`);
  }
  return {
    source,
    value: value.value.trim(),
  };
};

const validateResolvedBooleanConfig = (value, label, fallback = false) => {
  const config = validateResolvedRawConfig(value, label);
  return {
    source: config.source,
    value: parseReleaseBooleanEnv(config.value, fallback, config.source),
  };
};

const parseSandboxExecutionEgressProfiles = (rawValue, sourceLabel) => {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return new Map();
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${sourceLabel} has invalid JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must be a JSON object.`);
  }
  const map = new Map();
  for (const [operationRaw, profileRaw] of Object.entries(parsed)) {
    if (typeof profileRaw !== 'string') {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" must map to a string profile.`,
      );
    }
    const operation = normalizeLower(operationRaw);
    const profile = normalizeLower(profileRaw);
    if (
      operation !== SANDBOX_EGRESS_WILDCARD_KEY &&
      !SANDBOX_EGRESS_OPERATION_PATTERN.test(operation)
    ) {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" has invalid operation id.`,
      );
    }
    if (!SANDBOX_EGRESS_PROFILE_PATTERN.test(profile)) {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" has invalid profile id.`,
      );
    }
    map.set(operation, profile);
  }
  return map;
};

const resolveSandboxExecutionEgressProfile = (profiles, operation) => {
  const normalized = normalizeLower(operation);
  if (profiles.has(normalized)) {
    return profiles.get(normalized) || null;
  }
  if (profiles.has(SANDBOX_EGRESS_WILDCARD_KEY)) {
    return profiles.get(SANDBOX_EGRESS_WILDCARD_KEY) || null;
  }
  return null;
};

const parseSandboxExecutionOperationLimitProfiles = (rawValue, sourceLabel) => {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return new Map();
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${sourceLabel} has invalid JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must be a JSON object.`);
  }
  const map = new Map();
  for (const [operationRaw, profileRaw] of Object.entries(parsed)) {
    if (typeof profileRaw !== 'string') {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" must map to a string profile.`,
      );
    }
    const operation = normalizeLower(operationRaw);
    const profile = normalizeLower(profileRaw);
    if (
      operation !== SANDBOX_EGRESS_WILDCARD_KEY &&
      !SANDBOX_EGRESS_OPERATION_PATTERN.test(operation)
    ) {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" has invalid operation id.`,
      );
    }
    if (!SANDBOX_LIMIT_PROFILE_PATTERN.test(profile)) {
      throw new Error(
        `${sourceLabel} entry "${operationRaw}" has invalid profile id.`,
      );
    }
    map.set(operation, profile);
  }
  return map;
};

const resolveSandboxExecutionOperationLimitProfile = (profiles, operation) => {
  const normalized = normalizeLower(operation);
  if (profiles.has(normalized)) {
    return profiles.get(normalized) || null;
  }
  if (profiles.has(SANDBOX_EGRESS_WILDCARD_KEY)) {
    return profiles.get(SANDBOX_EGRESS_WILDCARD_KEY) || null;
  }
  return null;
};

const buildRawConfigCandidates = ({
  apiServiceVars,
  releaseEnvName,
  runtimeEnvName,
}) => [
  {
    raw: process.env[releaseEnvName],
    source: releaseEnvName,
  },
  {
    raw: process.env[runtimeEnvName],
    source: runtimeEnvName,
  },
  {
    raw:
      apiServiceVars && typeof apiServiceVars === 'object'
        ? apiServiceVars[runtimeEnvName]
        : '',
    source: `Railway api service variable ${runtimeEnvName}`,
  },
];

export const resolveProductionLaunchGateCriticalConfigCandidateSnapshot = (
  apiServiceVars,
) => ({
  sandboxExecutionEgressProfilesConfig: resolveProductionRawConfig({
    candidates: buildRawConfigCandidates({
      apiServiceVars,
      releaseEnvName: 'RELEASE_SANDBOX_EXECUTION_EGRESS_PROFILES',
      runtimeEnvName: 'SANDBOX_EXECUTION_EGRESS_PROFILES',
    }),
    fallback: '',
  }),
  sandboxExecutionEgressEnforceConfig: resolveProductionRawConfig({
    candidates: buildRawConfigCandidates({
      apiServiceVars,
      releaseEnvName: 'RELEASE_SANDBOX_EXECUTION_EGRESS_ENFORCE',
      runtimeEnvName: 'SANDBOX_EXECUTION_EGRESS_ENFORCE',
    }),
    fallback: '',
  }),
  sandboxExecutionOperationLimitProfilesConfig: resolveProductionRawConfig({
    candidates: buildRawConfigCandidates({
      apiServiceVars,
      releaseEnvName: 'RELEASE_SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES',
      runtimeEnvName: 'SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES',
    }),
    fallback: '',
  }),
  sandboxExecutionLimitsEnforceConfig: resolveProductionRawConfig({
    candidates: buildRawConfigCandidates({
      apiServiceVars,
      releaseEnvName: 'RELEASE_SANDBOX_EXECUTION_LIMITS_ENFORCE',
      runtimeEnvName: 'SANDBOX_EXECUTION_LIMITS_ENFORCE',
    }),
    fallback: '',
  }),
  sandboxExecutionEnabledConfig: resolveProductionRawConfig({
    candidates: buildRawConfigCandidates({
      apiServiceVars,
      releaseEnvName: 'RELEASE_SANDBOX_EXECUTION_ENABLED',
      runtimeEnvName: 'SANDBOX_EXECUTION_ENABLED',
    }),
    fallback: '',
  }),
});

export const validateProductionLaunchGateCriticalConfigSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error(
      'production launch gate critical config snapshot must be an object.',
    );
  }
  const sandboxExecutionEgressConfig = validateResolvedRawConfig(
    snapshot.sandboxExecutionEgressProfilesConfig,
    'sandboxExecutionEgressProfilesConfig',
  );
  const sandboxExecutionEgressEnforceConfig = validateResolvedBooleanConfig(
    snapshot.sandboxExecutionEgressEnforceConfig,
    'sandboxExecutionEgressEnforceConfig',
    false,
  );
  const sandboxExecutionOperationLimitProfilesConfig =
    validateResolvedRawConfig(
      snapshot.sandboxExecutionOperationLimitProfilesConfig,
      'sandboxExecutionOperationLimitProfilesConfig',
    );
  const sandboxExecutionLimitsEnforceConfig = validateResolvedBooleanConfig(
    snapshot.sandboxExecutionLimitsEnforceConfig,
    'sandboxExecutionLimitsEnforceConfig',
    false,
  );
  const sandboxExecutionEnabledConfig = validateResolvedBooleanConfig(
    snapshot.sandboxExecutionEnabledConfig,
    'sandboxExecutionEnabledConfig',
    false,
  );
  const sandboxExecutionEgressProfiles = parseSandboxExecutionEgressProfiles(
    sandboxExecutionEgressConfig.value,
    sandboxExecutionEgressConfig.source,
  );
  const sandboxExecutionOperationLimitProfiles =
    parseSandboxExecutionOperationLimitProfiles(
      sandboxExecutionOperationLimitProfilesConfig.value,
      sandboxExecutionOperationLimitProfilesConfig.source,
    );
  return {
    runtimeDryRunEgressProfile: resolveSandboxExecutionEgressProfile(
      sandboxExecutionEgressProfiles,
      SANDBOX_RUNTIME_PROBE_OPERATION,
    ),
    runtimeDryRunExpectedMode: sandboxExecutionEnabledConfig.value
      ? 'sandbox_enabled'
      : 'fallback_only',
    runtimeDryRunLimitProfile: resolveSandboxExecutionOperationLimitProfile(
      sandboxExecutionOperationLimitProfiles,
      SANDBOX_RUNTIME_PROBE_OPERATION,
    ),
    sandboxExecutionEgressConfig,
    sandboxExecutionEgressEnforceConfig,
    sandboxExecutionEgressProfiles: mapToSortedObject(
      sandboxExecutionEgressProfiles,
    ),
    sandboxExecutionEnabledConfig,
    sandboxExecutionLimitsEnforceConfig,
    sandboxExecutionOperationLimitProfiles: mapToSortedObject(
      sandboxExecutionOperationLimitProfiles,
    ),
    sandboxExecutionOperationLimitProfilesConfig,
  };
};
