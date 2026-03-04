const AI_RUNTIME_ROLES = ['author', 'critic', 'maker', 'judge'] as const;
type AIRuntimeRoleOption = (typeof AI_RUNTIME_ROLES)[number];

interface AIRuntimeProviderStateItem {
  provider?: unknown;
  cooldownUntil?: unknown;
  coolingDown?: unknown;
}

interface AIRuntimeHealthRoleStateItem {
  role?: unknown;
  providers?: unknown;
  availableProviders?: unknown;
  blockedProviders?: unknown;
  hasAvailableProvider?: unknown;
}

interface AIRuntimeHealthSummary {
  roleCount?: unknown;
  providerCount?: unknown;
  rolesBlocked?: unknown;
  providersCoolingDown?: unknown;
  providersReady?: unknown;
  health?: unknown;
}

interface AIRuntimeHealthResponse {
  generatedAt?: unknown;
  roleStates?: AIRuntimeHealthRoleStateItem[];
  providers?: AIRuntimeProviderStateItem[];
  summary?: AIRuntimeHealthSummary;
}

interface AIRuntimeDryRunAttemptItem {
  provider?: unknown;
  status?: unknown;
  latencyMs?: unknown;
  errorCode?: unknown;
  errorMessage?: unknown;
}

interface AIRuntimeDryRunResponse {
  result?: {
    role?: unknown;
    selectedProvider?: unknown;
    output?: unknown;
    failed?: unknown;
    attempts?: AIRuntimeDryRunAttemptItem[];
  };
  providers?: AIRuntimeProviderStateItem[];
}

type SearchParamsLike = Record<string, unknown> | null | undefined;

export interface AIRuntimeProviderViewState {
  provider: string;
  cooldownUntil: string | null;
  coolingDown: boolean;
}

export interface AIRuntimeRoleStateViewState {
  role: string;
  providers: string[];
  availableProviders: string[];
  blockedProviders: string[];
  hasAvailableProvider: boolean;
}

export interface AIRuntimeSummaryViewState {
  roleCount: number;
  providerCount: number;
  rolesBlocked: number;
  providersCoolingDown: number;
  providersReady: number;
  health: string;
}

export interface AIRuntimeDryRunResultViewState {
  role: string;
  selectedProvider: string | null;
  output: string | null;
  failed: boolean;
  attempts: Array<{
    provider: string;
    status: string;
    latencyMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
}

const parseCsvQuery = (value: unknown): string[] => {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const isTruthyQueryFlag = (value: unknown): boolean =>
  value === '1' || value === 'true' || value === 'yes';

export const resolveAiRuntimeQueryState = (
  resolvedSearchParams: SearchParamsLike,
) => {
  const rawAiRole = resolvedSearchParams?.aiRole;
  const aiRole = AI_RUNTIME_ROLES.includes(rawAiRole as AIRuntimeRoleOption)
    ? (rawAiRole as AIRuntimeRoleOption)
    : 'critic';

  const rawAiPrompt = resolvedSearchParams?.aiPrompt;
  const aiPrompt =
    typeof rawAiPrompt === 'string' && rawAiPrompt.trim().length > 0
      ? rawAiPrompt.trim()
      : 'Summarize runtime health for current failover chain.';

  const rawAiProviders = resolvedSearchParams?.aiProviders;
  const aiProvidersCsv =
    typeof rawAiProviders === 'string' ? rawAiProviders.trim() : '';
  const aiProvidersOverride = parseCsvQuery(rawAiProviders);

  const rawAiFailures = resolvedSearchParams?.aiFailures;
  const aiFailuresCsv =
    typeof rawAiFailures === 'string' ? rawAiFailures.trim() : '';
  const aiSimulateFailures = parseCsvQuery(rawAiFailures);

  const rawAiTimeoutMs = resolvedSearchParams?.aiTimeoutMs;
  const aiTimeoutParsed =
    typeof rawAiTimeoutMs === 'string'
      ? Number.parseInt(rawAiTimeoutMs, 10)
      : Number.NaN;
  const aiTimeoutMs =
    Number.isFinite(aiTimeoutParsed) && aiTimeoutParsed > 0
      ? Math.min(Math.max(aiTimeoutParsed, 250), 120_000)
      : undefined;
  const aiDryRunRequested = isTruthyQueryFlag(resolvedSearchParams?.aiDryRun);

  return {
    aiRole,
    aiPrompt,
    aiProvidersCsv,
    aiProvidersOverride,
    aiFailuresCsv,
    aiSimulateFailures,
    aiTimeoutMs,
    aiDryRunRequested,
  };
};

const resolveUnknownSummary = (): AIRuntimeSummaryViewState => ({
  roleCount: 0,
  providerCount: 0,
  rolesBlocked: 0,
  providersCoolingDown: 0,
  providersReady: 0,
  health: 'unknown',
});

export const fetchAiRuntimeHealth = async ({
  adminToken,
  apiBaseUrl,
  toNumber,
  toStringValue,
}: {
  adminToken: () => string | null;
  apiBaseUrl: () => string;
  toNumber: (value: unknown, fallback?: number) => number;
  toStringValue: (value: unknown, fallback?: string) => string;
}): Promise<{
  generatedAt: string | null;
  roleStates: AIRuntimeRoleStateViewState[];
  providers: AIRuntimeProviderViewState[];
  summary: AIRuntimeSummaryViewState;
  error: string | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      generatedAt: null,
      roleStates: [],
      providers: [],
      summary: resolveUnknownSummary(),
      error:
        'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.',
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl()}/admin/ai-runtime/health`, {
      cache: 'no-store',
      headers: {
        'x-admin-token': token,
      },
    });
    if (!response.ok) {
      return {
        generatedAt: null,
        roleStates: [],
        providers: [],
        summary: resolveUnknownSummary(),
        error: `AI runtime health request failed with ${response.status}.`,
      };
    }

    const payload = (await response.json()) as AIRuntimeHealthResponse;
    const roleStatesRaw = Array.isArray(payload.roleStates)
      ? payload.roleStates
      : [];
    const roleStates = roleStatesRaw.map((roleState, index) => {
      const providersRaw = Array.isArray(roleState.providers)
        ? roleState.providers
        : [];
      const providers = providersRaw
        .filter((provider): provider is string => typeof provider === 'string')
        .map((provider) => provider.trim())
        .filter((provider) => provider.length > 0);
      const availableProvidersRaw = Array.isArray(roleState.availableProviders)
        ? roleState.availableProviders
        : [];
      const availableProviders = availableProvidersRaw
        .filter((provider): provider is string => typeof provider === 'string')
        .map((provider) => provider.trim())
        .filter((provider) => provider.length > 0);
      const blockedProvidersRaw = Array.isArray(roleState.blockedProviders)
        ? roleState.blockedProviders
        : [];
      const blockedProviders = blockedProvidersRaw
        .filter((provider): provider is string => typeof provider === 'string')
        .map((provider) => provider.trim())
        .filter((provider) => provider.length > 0);
      return {
        role: toStringValue(roleState.role, `role-${index + 1}`),
        providers,
        availableProviders,
        blockedProviders,
        hasAvailableProvider: roleState.hasAvailableProvider === true,
      };
    });

    const providersRaw = Array.isArray(payload.providers)
      ? payload.providers
      : [];
    const providers = providersRaw.map((provider, index) => ({
      provider: toStringValue(provider.provider, `provider-${index + 1}`),
      cooldownUntil:
        typeof provider.cooldownUntil === 'string'
          ? provider.cooldownUntil
          : null,
      coolingDown:
        provider.coolingDown === true ||
        (typeof provider.cooldownUntil === 'string' &&
          provider.cooldownUntil.length > 0),
    }));
    const summaryRaw =
      payload.summary && typeof payload.summary === 'object'
        ? payload.summary
        : {};
    const summary = {
      roleCount: toNumber(summaryRaw.roleCount, roleStates.length),
      providerCount: toNumber(summaryRaw.providerCount, providers.length),
      rolesBlocked: toNumber(summaryRaw.rolesBlocked),
      providersCoolingDown: toNumber(summaryRaw.providersCoolingDown),
      providersReady: toNumber(
        summaryRaw.providersReady,
        Math.max(
          0,
          providers.length - toNumber(summaryRaw.providersCoolingDown),
        ),
      ),
      health: toStringValue(summaryRaw.health, 'unknown'),
    };

    return {
      generatedAt:
        typeof payload.generatedAt === 'string' ? payload.generatedAt : null,
      roleStates,
      providers,
      summary,
      error: null,
    };
  } catch {
    return {
      generatedAt: null,
      roleStates: [],
      providers: [],
      summary: resolveUnknownSummary(),
      error: 'Unable to load AI runtime health from admin API.',
    };
  }
};

export const recomputeAiRuntimeSummary = (input: {
  roleStates: Array<{
    role: string;
    providers: string[];
    hasAvailableProvider: boolean;
  }>;
  providers: Array<{
    provider: string;
    coolingDown: boolean;
  }>;
}): AIRuntimeSummaryViewState => {
  const providerStateByName = new Map(
    input.providers.map((providerState) => [
      providerState.provider,
      providerState.coolingDown,
    ]),
  );
  const providersCoolingDown = input.providers.filter(
    (providerState) => providerState.coolingDown,
  ).length;
  const rolesBlocked = input.roleStates.filter((roleState) => {
    if (roleState.providers.length === 0) {
      return !roleState.hasAvailableProvider;
    }
    return roleState.providers.every(
      (provider) => providerStateByName.get(provider) === true,
    );
  }).length;

  return {
    roleCount: input.roleStates.length,
    providerCount: input.providers.length,
    rolesBlocked,
    providersCoolingDown,
    providersReady: Math.max(0, input.providers.length - providersCoolingDown),
    health: rolesBlocked > 0 ? 'degraded' : 'ok',
  };
};

const runAiRuntimeDryRun = async ({
  adminToken,
  apiBaseUrl,
  toStringValue,
  role,
  prompt,
  providersOverride,
  simulateFailures,
  timeoutMs,
}: {
  adminToken: () => string | null;
  apiBaseUrl: () => string;
  toStringValue: (value: unknown, fallback?: string) => string;
  role: AIRuntimeRoleOption;
  prompt: string;
  providersOverride: string[];
  simulateFailures: string[];
  timeoutMs?: number;
}): Promise<{
  result: AIRuntimeDryRunResultViewState | null;
  providers: Array<{
    provider: string;
    cooldownUntil: string | null;
  }>;
  error: string | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      result: null,
      providers: [],
      error:
        'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.',
    };
  }

  const body: Record<string, unknown> = {
    role,
    prompt,
  };
  if (providersOverride.length > 0) {
    body.providersOverride = providersOverride;
  }
  if (simulateFailures.length > 0) {
    body.simulateFailures = simulateFailures;
  }
  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)) {
    body.timeoutMs = Math.max(250, Math.floor(timeoutMs));
  }

  try {
    const response = await fetch(`${apiBaseUrl()}/admin/ai-runtime/dry-run`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': token,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return {
        result: null,
        providers: [],
        error: `AI runtime dry-run failed with ${response.status}.`,
      };
    }

    const payload = (await response.json()) as AIRuntimeDryRunResponse;
    const resultRaw = payload.result;
    const attemptsRaw = Array.isArray(resultRaw?.attempts)
      ? resultRaw.attempts
      : [];
    const attempts = attemptsRaw.map((attempt, index) => ({
      provider: toStringValue(attempt.provider, `provider-${index + 1}`),
      status: toStringValue(attempt.status),
      latencyMs:
        typeof attempt.latencyMs === 'number' &&
        Number.isFinite(attempt.latencyMs)
          ? attempt.latencyMs
          : null,
      errorCode: toStringValue(attempt.errorCode, ''),
      errorMessage: toStringValue(attempt.errorMessage, ''),
    }));
    const result = resultRaw
      ? {
          role: toStringValue(resultRaw.role),
          selectedProvider:
            typeof resultRaw.selectedProvider === 'string'
              ? resultRaw.selectedProvider
              : null,
          output:
            typeof resultRaw.output === 'string' ? resultRaw.output : null,
          failed: resultRaw.failed === true,
          attempts,
        }
      : null;

    const providersRaw = Array.isArray(payload.providers)
      ? payload.providers
      : [];
    const providers = providersRaw.map((provider, index) => ({
      provider: toStringValue(provider.provider, `provider-${index + 1}`),
      cooldownUntil:
        typeof provider.cooldownUntil === 'string'
          ? provider.cooldownUntil
          : null,
    }));

    return {
      result,
      providers,
      error: null,
    };
  } catch {
    return {
      result: null,
      providers: [],
      error: 'Unable to run AI runtime dry-run via admin API.',
    };
  }
};

export const resolveAiRuntimeDryRunState = async ({
  adminToken,
  apiBaseUrl,
  toStringValue,
  requested,
  role,
  prompt,
  providersOverride,
  simulateFailures,
  timeoutMs,
  providersBase,
}: {
  adminToken: () => string | null;
  apiBaseUrl: () => string;
  toStringValue: (value: unknown, fallback?: string) => string;
  requested: boolean;
  role: AIRuntimeRoleOption;
  prompt: string;
  providersOverride: string[];
  simulateFailures: string[];
  timeoutMs?: number;
  providersBase: AIRuntimeProviderViewState[];
}): Promise<{
  providers: AIRuntimeProviderViewState[];
  infoMessage: string | null;
  errorMessage: string | null;
  result: AIRuntimeDryRunResultViewState | null;
}> => {
  if (!requested) {
    return {
      providers: providersBase,
      infoMessage: null,
      errorMessage: null,
      result: null,
    };
  }

  const dryRun = await runAiRuntimeDryRun({
    adminToken,
    apiBaseUrl,
    toStringValue,
    role,
    prompt,
    providersOverride,
    simulateFailures,
    timeoutMs,
  });

  const providers =
    dryRun.providers.length > 0
      ? dryRun.providers.map((providerState) => ({
          provider: providerState.provider,
          cooldownUntil: providerState.cooldownUntil,
          coolingDown:
            typeof providerState.cooldownUntil === 'string' &&
            providerState.cooldownUntil.length > 0,
        }))
      : providersBase;

  let infoMessage: string | null = null;
  if (!dryRun.error && dryRun.result) {
    if (dryRun.result.failed) {
      infoMessage = 'Dry-run failed for all providers in chain.';
    } else {
      infoMessage = `Dry-run completed via ${dryRun.result.selectedProvider ?? 'n/a'}.`;
    }
  }

  return {
    providers,
    infoMessage,
    errorMessage: dryRun.error,
    result: dryRun.result,
  };
};

export { AI_RUNTIME_ROLES };
