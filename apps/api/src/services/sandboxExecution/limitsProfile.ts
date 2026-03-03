import type { SandboxExecutionLimits } from './types';

export type SandboxExecutionOperationLimitProfileMap = Map<string, string>;
export type SandboxExecutionLimitProfileMap = Map<
  string,
  SandboxExecutionLimits
>;

const OPERATION_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/;
const PROFILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const WILDCARD_KEY = '*';
const LIMIT_FIELD_NAMES = [
  'cpuCores',
  'memoryMb',
  'timeoutMs',
  'ttlSeconds',
  'maxArtifactBytes',
] as const;
type LimitFieldName = (typeof LIMIT_FIELD_NAMES)[number];

const LIMIT_FIELD_CONSTRAINTS: Record<
  LimitFieldName,
  { max: number; min: number }
> = {
  cpuCores: { min: 1, max: 128 },
  memoryMb: { min: 64, max: 1_048_576 },
  timeoutMs: { min: 100, max: 600_000 },
  ttlSeconds: { min: 1, max: 604_800 },
  maxArtifactBytes: { min: 1024, max: 4_294_967_295 },
};

const normalize = (value: string) => value.trim().toLowerCase();

const parseBoundedLimitNumber = (
  profileRaw: string,
  field: LimitFieldName,
  rawValue: unknown,
): number => {
  if (typeof rawValue !== 'number') {
    throw new Error(
      `Invalid SANDBOX_EXECUTION_LIMIT_PROFILES JSON: "${profileRaw}.${field}" must be a number.`,
    );
  }
  if (!(Number.isFinite(rawValue) && Number.isInteger(rawValue))) {
    throw new Error(
      `Invalid SANDBOX_EXECUTION_LIMIT_PROFILES JSON: "${profileRaw}.${field}" must be an integer.`,
    );
  }
  const { min, max } = LIMIT_FIELD_CONSTRAINTS[field];
  if (rawValue < min || rawValue > max) {
    throw new Error(
      `Invalid SANDBOX_EXECUTION_LIMIT_PROFILES JSON: "${profileRaw}.${field}" must be between ${min} and ${max}.`,
    );
  }
  return rawValue;
};

export const parseSandboxExecutionOperationLimitProfileMap = (
  rawConfig: string,
): SandboxExecutionOperationLimitProfileMap => {
  const trimmed = rawConfig.trim();
  if (!trimmed) {
    return new Map();
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `Invalid SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'Invalid SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES JSON: expected object.',
    );
  }

  const result: SandboxExecutionOperationLimitProfileMap = new Map();
  const record = parsed as Record<string, unknown>;
  for (const [operationRaw, profileRaw] of Object.entries(record)) {
    if (typeof profileRaw !== 'string') {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES JSON: "${operationRaw}" must map to a profile string.`,
      );
    }
    const operation = normalize(operationRaw);
    const profile = normalize(profileRaw);
    if (!(profile && PROFILE_PATTERN.test(profile))) {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES JSON: "${operationRaw}" has invalid profile identifier.`,
      );
    }
    if (
      operation !== WILDCARD_KEY &&
      !(operation && OPERATION_PATTERN.test(operation))
    ) {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES JSON: "${operationRaw}" has invalid operation identifier.`,
      );
    }

    result.set(operation, profile);
  }

  return result;
};

export const resolveSandboxExecutionOperationLimitProfile = (
  operationProfiles: SandboxExecutionOperationLimitProfileMap,
  operation: string,
): string | null => {
  const normalized = normalize(operation);
  if (normalized && operationProfiles.has(normalized)) {
    return operationProfiles.get(normalized) ?? null;
  }
  if (operationProfiles.has(WILDCARD_KEY)) {
    return operationProfiles.get(WILDCARD_KEY) ?? null;
  }
  return null;
};

export const parseSandboxExecutionLimitProfileMap = (
  rawConfig: string,
): SandboxExecutionLimitProfileMap => {
  const trimmed = rawConfig.trim();
  if (!trimmed) {
    return new Map();
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `Invalid SANDBOX_EXECUTION_LIMIT_PROFILES JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'Invalid SANDBOX_EXECUTION_LIMIT_PROFILES JSON: expected object.',
    );
  }

  const result: SandboxExecutionLimitProfileMap = new Map();
  const record = parsed as Record<string, unknown>;
  for (const [profileRaw, limitObject] of Object.entries(record)) {
    const profile = normalize(profileRaw);
    if (!(profile && PROFILE_PATTERN.test(profile))) {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_LIMIT_PROFILES JSON: "${profileRaw}" has invalid profile identifier.`,
      );
    }
    if (
      !limitObject ||
      typeof limitObject !== 'object' ||
      Array.isArray(limitObject)
    ) {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_LIMIT_PROFILES JSON: "${profileRaw}" must map to an object with limit fields.`,
      );
    }

    const limitRecord = limitObject as Record<string, unknown>;
    const unknownFields = Object.keys(limitRecord).filter(
      (field) => !LIMIT_FIELD_NAMES.includes(field as LimitFieldName),
    );
    if (unknownFields.length > 0) {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_LIMIT_PROFILES JSON: "${profileRaw}" has unsupported fields: ${unknownFields.join(', ')}.`,
      );
    }

    const parsedLimits: SandboxExecutionLimits = {};
    for (const field of LIMIT_FIELD_NAMES) {
      if (limitRecord[field] === undefined) {
        continue;
      }
      parsedLimits[field] = parseBoundedLimitNumber(
        profileRaw,
        field,
        limitRecord[field],
      );
    }
    if (Object.keys(parsedLimits).length < 1) {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_LIMIT_PROFILES JSON: "${profileRaw}" must define at least one limit field.`,
      );
    }

    result.set(profile, parsedLimits);
  }

  return result;
};

export const resolveSandboxExecutionLimitProfile = (
  profiles: SandboxExecutionLimitProfileMap,
  profile: string | null,
): SandboxExecutionLimits | null => {
  if (typeof profile !== 'string') {
    return null;
  }
  const normalizedProfile = normalize(profile);
  if (!(normalizedProfile && profiles.has(normalizedProfile))) {
    return null;
  }
  const limits = profiles.get(normalizedProfile);
  return limits ? { ...limits } : null;
};
