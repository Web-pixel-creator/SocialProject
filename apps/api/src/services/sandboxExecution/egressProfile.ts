export type SandboxExecutionEgressProfileMap = Map<string, string>;
export type SandboxExecutionEgressProviderAllowlistMap = Map<string, string[]>;

const OPERATION_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/;
const PROFILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const WILDCARD_KEY = '*';

const normalize = (value: string) => value.trim().toLowerCase();

export const parseSandboxExecutionEgressProfileMap = (
  rawConfig: string,
): SandboxExecutionEgressProfileMap => {
  const trimmed = rawConfig.trim();
  if (!trimmed) {
    return new Map();
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `Invalid SANDBOX_EXECUTION_EGRESS_PROFILES JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'Invalid SANDBOX_EXECUTION_EGRESS_PROFILES JSON: expected object.',
    );
  }

  const result: SandboxExecutionEgressProfileMap = new Map();
  const record = parsed as Record<string, unknown>;
  for (const [operationRaw, profileRaw] of Object.entries(record)) {
    if (typeof profileRaw !== 'string') {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_EGRESS_PROFILES JSON: "${operationRaw}" must map to a profile string.`,
      );
    }
    const operation = normalize(operationRaw);
    const profile = normalize(profileRaw);
    if (!(profile && PROFILE_PATTERN.test(profile))) {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_EGRESS_PROFILES JSON: "${operationRaw}" has invalid profile identifier.`,
      );
    }
    if (
      operation !== WILDCARD_KEY &&
      !(operation && OPERATION_PATTERN.test(operation))
    ) {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_EGRESS_PROFILES JSON: "${operationRaw}" has invalid operation identifier.`,
      );
    }

    result.set(operation, profile);
  }

  return result;
};

export const resolveSandboxExecutionEgressProfile = (
  profiles: SandboxExecutionEgressProfileMap,
  operation: string,
): string | null => {
  const normalized = normalize(operation);
  if (normalized && profiles.has(normalized)) {
    return profiles.get(normalized) ?? null;
  }
  if (profiles.has(WILDCARD_KEY)) {
    return profiles.get(WILDCARD_KEY) ?? null;
  }
  return null;
};

export const parseSandboxExecutionEgressProviderAllowlistMap = (
  rawConfig: string,
): SandboxExecutionEgressProviderAllowlistMap => {
  const trimmed = rawConfig.trim();
  if (!trimmed) {
    return new Map();
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `Invalid SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'Invalid SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS JSON: expected object.',
    );
  }

  const result: SandboxExecutionEgressProviderAllowlistMap = new Map();
  const record = parsed as Record<string, unknown>;
  for (const [profileRaw, providersRaw] of Object.entries(record)) {
    const profile = normalize(profileRaw);
    if (!(profile && PROFILE_PATTERN.test(profile))) {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS JSON: "${profileRaw}" has invalid profile identifier.`,
      );
    }

    const normalizedProviders: string[] = [];
    if (typeof providersRaw === 'string') {
      normalizedProviders.push(normalize(providersRaw));
    } else if (Array.isArray(providersRaw)) {
      for (const providerEntry of providersRaw) {
        if (typeof providerEntry !== 'string') {
          throw new Error(
            `Invalid SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS JSON: "${profileRaw}" must contain provider strings only.`,
          );
        }
        normalizedProviders.push(normalize(providerEntry));
      }
    } else {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS JSON: "${profileRaw}" must map to provider string or array.`,
      );
    }

    const dedupedProviders = Array.from(
      new Set(normalizedProviders.filter((provider) => provider.length > 0)),
    );
    if (dedupedProviders.length < 1) {
      throw new Error(
        `Invalid SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS JSON: "${profileRaw}" must include at least one provider or "*".`,
      );
    }
    for (const provider of dedupedProviders) {
      if (provider === WILDCARD_KEY) {
        continue;
      }
      if (!PROVIDER_PATTERN.test(provider)) {
        throw new Error(
          `Invalid SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS JSON: "${profileRaw}" contains invalid provider identifier "${provider}".`,
        );
      }
    }

    result.set(
      profile,
      dedupedProviders.includes(WILDCARD_KEY)
        ? [WILDCARD_KEY]
        : dedupedProviders,
    );
  }

  return result;
};

export const resolveSandboxExecutionEgressProviderAllowlist = (
  allowlists: SandboxExecutionEgressProviderAllowlistMap,
  profile: string | null,
): string[] | null => {
  if (typeof profile !== 'string') {
    return null;
  }
  const normalizedProfile = normalize(profile);
  if (!(normalizedProfile && allowlists.has(normalizedProfile))) {
    return null;
  }
  const allowlist = allowlists.get(normalizedProfile);
  return allowlist ? [...allowlist] : null;
};

export const isSandboxExecutionProviderAllowed = (
  allowlist: string[] | null,
  provider: string,
): boolean => {
  if (!(allowlist && allowlist.length > 0)) {
    return false;
  }
  const normalizedProvider = normalize(provider);
  return (
    allowlist.includes(WILDCARD_KEY) || allowlist.includes(normalizedProvider)
  );
};
