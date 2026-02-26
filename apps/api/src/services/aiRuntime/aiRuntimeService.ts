import { ServiceError } from '../common/errors';
import type {
  AIRuntimeAttempt,
  AIRuntimeExecutor,
  AIRuntimeHealthSnapshot,
  AIRuntimeProfile,
  AIRuntimeProviderState,
  AIRuntimeResult,
  AIRuntimeRole,
  AIRuntimeRunInput,
  AIRuntimeService,
} from './types';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_HTTP_TIMEOUT_MS = 20_000;

const roleProviders: Record<AIRuntimeRole, string[]> = {
  author: ['gpt-4.1', 'gemini-2'],
  critic: ['claude-4', 'gpt-4.1', 'gemini-2'],
  maker: ['sd3', 'dalle-3'],
  judge: ['gpt-4.1', 'claude-4'],
};

const providerEnvPrefixes: Record<string, string> = {
  'claude-4': 'CLAUDE_4',
  'dalle-3': 'DALLE_3',
  'gemini-2': 'GEMINI_2',
  'gpt-4.1': 'GPT_4_1',
  sd3: 'SD3',
};
const DEFAULT_AUTH_PROFILE = 'default';
const AUTH_PROFILE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const parseProviders = (
  rawValue: string | undefined,
  fallback: string[],
): string[] => {
  if (!rawValue) {
    return fallback;
  }
  const parsed = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return parsed.length > 0 ? parsed : fallback;
};

const parseAuthProfiles = (rawValue: string | undefined): string[] => {
  if (!rawValue) {
    return [DEFAULT_AUTH_PROFILE];
  }
  const parsed = rawValue
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(
      (value) =>
        value.length > 0 && AUTH_PROFILE_IDENTIFIER_PATTERN.test(value),
    );
  if (parsed.length < 1) {
    return [DEFAULT_AUTH_PROFILE];
  }
  return Array.from(new Set(parsed));
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ServiceError(
          'AI_PROVIDER_TIMEOUT',
          `Provider timed out after ${timeoutMs}ms.`,
          503,
        ),
      );
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const mapErrorMessage = (
  error: unknown,
): {
  errorCode: string;
  errorMessage: string;
} => {
  if (error instanceof ServiceError) {
    return {
      errorCode: error.code,
      errorMessage: error.message,
    };
  }
  if (error instanceof Error) {
    return {
      errorCode: 'AI_PROVIDER_ERROR',
      errorMessage: error.message,
    };
  }
  return {
    errorCode: 'AI_PROVIDER_ERROR',
    errorMessage: 'Unknown provider error.',
  };
};

const getOutputPrefix = (provider: string): string => {
  if (provider === 'claude-4') {
    return 'Critique';
  }
  if (provider === 'gpt-4.1') {
    return 'Reasoning';
  }
  if (provider === 'gemini-2') {
    return 'Multimodal';
  }
  if (provider === 'sd3' || provider === 'dalle-3') {
    return 'Generation';
  }
  return 'Response';
};

const extractTextOutput = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const body = payload as Record<string, unknown>;
  if (
    typeof body.output_text === 'string' &&
    body.output_text.trim().length > 0
  ) {
    return body.output_text.trim();
  }

  const choices = body.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (first && typeof first === 'object') {
      const message = (first as Record<string, unknown>).message;
      if (message && typeof message === 'object') {
        const content = (message as Record<string, unknown>).content;
        if (typeof content === 'string' && content.trim().length > 0) {
          return content.trim();
        }
        if (Array.isArray(content)) {
          const text = content
            .map((part) =>
              part && typeof part === 'object'
                ? ((part as Record<string, unknown>).text ?? '')
                : '',
            )
            .filter((part): part is string => typeof part === 'string')
            .join(' ')
            .trim();
          if (text.length > 0) {
            return text;
          }
        }
      }
    }
  }

  const candidates = body.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const firstCandidate = candidates[0];
    if (firstCandidate && typeof firstCandidate === 'object') {
      const content = (firstCandidate as Record<string, unknown>).content;
      if (content && typeof content === 'object') {
        const parts = (content as Record<string, unknown>).parts;
        if (Array.isArray(parts)) {
          const text = parts
            .map((part) =>
              part && typeof part === 'object'
                ? ((part as Record<string, unknown>).text ?? '')
                : '',
            )
            .filter((part): part is string => typeof part === 'string')
            .join(' ')
            .trim();
          if (text.length > 0) {
            return text;
          }
        }
      }
    }
  }

  const result = body.result;
  if (typeof result === 'string' && result.trim().length > 0) {
    return result.trim();
  }

  return null;
};

const toTrimmedString = (value: string | undefined) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toEnvProfileSuffix = (profile: string): string => {
  if (profile === DEFAULT_AUTH_PROFILE) {
    return '';
  }
  const token = profile
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return token.length > 0 ? `__${token}` : '';
};

const tryParseJson = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

export class AIRuntimeServiceImpl implements AIRuntimeService {
  private readonly cooldownMs: number;
  private readonly cooldownUntilByProviderProfile = new Map<string, number>();
  private readonly lastFailureCodeByProviderProfile = new Map<string, string>();
  private readonly roleProfiles: Record<AIRuntimeRole, string[]>;
  private readonly authProfilesByProvider: Record<string, string[]>;
  private readonly httpAdaptersEnabled: boolean;
  private readonly httpTimeoutMs: number;

  constructor() {
    this.cooldownMs = Number(
      process.env.AI_PROVIDER_COOLDOWN_MS ?? DEFAULT_COOLDOWN_MS,
    );
    this.httpAdaptersEnabled =
      process.env.AI_RUNTIME_USE_HTTP_ADAPTERS === 'true';
    this.httpTimeoutMs = Number(
      process.env.AI_RUNTIME_HTTP_TIMEOUT_MS ?? DEFAULT_HTTP_TIMEOUT_MS,
    );
    this.roleProfiles = {
      author: parseProviders(
        process.env.AI_AUTHOR_MODEL_CHAIN,
        roleProviders.author,
      ),
      critic: parseProviders(
        process.env.AI_CRITIC_MODEL_CHAIN,
        roleProviders.critic,
      ),
      maker: parseProviders(
        process.env.AI_MAKER_MODEL_CHAIN,
        roleProviders.maker,
      ),
      judge: parseProviders(
        process.env.AI_JUDGE_MODEL_CHAIN,
        roleProviders.judge,
      ),
    };
    this.authProfilesByProvider = Object.fromEntries(
      Object.keys(providerEnvPrefixes).map((provider) => {
        const envPrefix = providerEnvPrefixes[provider];
        return [
          provider,
          parseAuthProfiles(
            process.env[`AI_RUNTIME_${envPrefix}_AUTH_PROFILES`],
          ),
        ];
      }),
    );
  }

  getProfiles(): AIRuntimeProfile[] {
    return (Object.keys(this.roleProfiles) as AIRuntimeRole[]).map((role) => ({
      role,
      providers: [...this.roleProfiles[role]],
    }));
  }

  private getAllProviders(): string[] {
    const providers = new Set<string>();
    for (const profile of Object.values(this.roleProfiles)) {
      for (const provider of profile) {
        providers.add(provider);
      }
    }
    return [...providers].sort((left, right) => left.localeCompare(right));
  }

  private getProviderAuthProfiles(provider: string): string[] {
    const configured = this.authProfilesByProvider[provider];
    if (!configured || configured.length < 1) {
      return [DEFAULT_AUTH_PROFILE];
    }
    return configured;
  }

  private getProviderProfileKey(provider: string, authProfile: string): string {
    return `${provider}::${authProfile}`;
  }

  getProviderStates(): AIRuntimeProviderState[] {
    const now = Date.now();
    const providers = this.getAllProviders();
    return providers.map((provider) => {
      const profiles = this.getProviderAuthProfiles(provider).map((profile) => {
        const key = this.getProviderProfileKey(provider, profile);
        const cooldownUntilRaw = this.cooldownUntilByProviderProfile.get(key);
        const coolingDown = Boolean(cooldownUntilRaw && cooldownUntilRaw > now);
        return {
          profile,
          cooldownUntil:
            cooldownUntilRaw && cooldownUntilRaw > now
              ? new Date(cooldownUntilRaw).toISOString()
              : null,
          coolingDown,
          lastFailureCode:
            this.lastFailureCodeByProviderProfile.get(key) ?? null,
        };
      });
      const activeProfile =
        profiles.find((state) => !state.coolingDown)?.profile ??
        profiles[0]?.profile ??
        null;
      const coolingDown = profiles.every((state) => state.coolingDown);
      const cooldownCandidates = profiles
        .map((state) =>
          state.cooldownUntil ? new Date(state.cooldownUntil).getTime() : 0,
        )
        .filter((value) => Number.isFinite(value) && value > 0);
      const cooldownUntil =
        coolingDown && cooldownCandidates.length > 0
          ? new Date(Math.min(...cooldownCandidates)).toISOString()
          : null;
      const activeFailureCode =
        profiles.find((state) => state.lastFailureCode)?.lastFailureCode ??
        null;

      return {
        provider,
        cooldownUntil,
        coolingDown,
        activeProfile,
        lastFailureCode: activeFailureCode,
        profiles,
      };
    });
  }

  getHealthSnapshot(): AIRuntimeHealthSnapshot {
    const profiles = this.getProfiles();
    const providers = this.getProviderStates();
    const providerStateByName = new Map(
      providers.map((providerState) => [providerState.provider, providerState]),
    );

    const roleStates = profiles.map((profile) => {
      const availableProviders = profile.providers.filter((provider) => {
        const providerState = providerStateByName.get(provider);
        return providerState ? !providerState.coolingDown : true;
      });
      const blockedProviders = profile.providers.filter(
        (provider) => !availableProviders.includes(provider),
      );

      return {
        role: profile.role,
        providers: profile.providers,
        availableProviders,
        blockedProviders,
        hasAvailableProvider: availableProviders.length > 0,
      };
    });

    const providersCoolingDown = providers.filter(
      (providerState) => providerState.coolingDown,
    ).length;
    const rolesBlocked = roleStates.filter(
      (roleState) => !roleState.hasAvailableProvider,
    ).length;

    return {
      generatedAt: new Date().toISOString(),
      roleStates,
      providers,
      summary: {
        roleCount: roleStates.length,
        providerCount: providers.length,
        rolesBlocked,
        providersCoolingDown,
        providersReady: Math.max(0, providers.length - providersCoolingDown),
        health: rolesBlocked > 0 ? 'degraded' : 'ok',
      },
    };
  }

  resetProviderState(): void {
    this.cooldownUntilByProviderProfile.clear();
    this.lastFailureCodeByProviderProfile.clear();
  }

  async runWithFailover(input: AIRuntimeRunInput): Promise<AIRuntimeResult> {
    const prompt = input.prompt.trim();
    if (prompt.length === 0) {
      throw new ServiceError(
        'AI_RUNTIME_INVALID_PROMPT',
        'Prompt is required.',
        400,
      );
    }

    const roleProfile = this.roleProfiles[input.role];
    const providers =
      input.providersOverride && input.providersOverride.length > 0
        ? input.providersOverride
        : roleProfile;
    if (providers.length === 0) {
      throw new ServiceError(
        'AI_RUNTIME_NO_PROVIDERS',
        `No providers configured for role ${input.role}.`,
        500,
      );
    }

    const simulateFailures = new Set(input.simulateFailures ?? []);
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const mutateProviderState = input.mutateProviderState ?? true;
    const attempts: AIRuntimeAttempt[] = [];
    const now = Date.now();

    for (const provider of providers) {
      const authProfiles = this.getProviderAuthProfiles(provider);
      for (const authProfile of authProfiles) {
        const profileKey = this.getProviderProfileKey(provider, authProfile);
        const cooldownUntil =
          this.cooldownUntilByProviderProfile.get(profileKey);
        if (cooldownUntil && cooldownUntil > now) {
          attempts.push({
            provider,
            authProfile,
            status: 'skipped_cooldown',
            latencyMs: null,
            errorCode: null,
            errorMessage: null,
          });
          continue;
        }

        const attemptStartedAt = Date.now();
        try {
          const executor = this.getExecutor(
            provider,
            authProfile,
            simulateFailures,
          );
          const execution = await withTimeout(executor(prompt), timeoutMs);
          const latencyMs = Date.now() - attemptStartedAt;

          if (mutateProviderState) {
            this.cooldownUntilByProviderProfile.delete(profileKey);
            this.lastFailureCodeByProviderProfile.delete(profileKey);
          }
          attempts.push({
            provider,
            authProfile,
            status: 'success',
            latencyMs,
            errorCode: null,
            errorMessage: null,
          });
          return {
            role: input.role,
            selectedProvider: provider,
            selectedAuthProfile: authProfile,
            output: execution.output,
            failed: false,
            attempts,
          };
        } catch (error) {
          const latencyMs = Date.now() - attemptStartedAt;
          const mappedError = mapErrorMessage(error);
          if (mutateProviderState) {
            this.cooldownUntilByProviderProfile.set(
              profileKey,
              Date.now() + this.cooldownMs,
            );
            this.lastFailureCodeByProviderProfile.set(
              profileKey,
              mappedError.errorCode,
            );
          }
          attempts.push({
            provider,
            authProfile,
            status: 'failed',
            latencyMs,
            errorCode: mappedError.errorCode,
            errorMessage: mappedError.errorMessage,
          });
        }
      }
    }

    return {
      role: input.role,
      selectedProvider: null,
      selectedAuthProfile: null,
      output: null,
      failed: true,
      attempts,
    };
  }

  private getExecutor(
    provider: string,
    authProfile: string,
    simulateFailures: Set<string>,
  ): AIRuntimeExecutor {
    const httpExecutor = this.getHttpExecutor(provider, authProfile);
    const shouldFail =
      simulateFailures.has(provider) ||
      simulateFailures.has(`${provider}@${authProfile}`);
    if (httpExecutor) {
      return (prompt: string) => {
        if (shouldFail) {
          throw new ServiceError(
            'AI_PROVIDER_UNAVAILABLE',
            `Provider ${provider} (${authProfile}) is unavailable.`,
            503,
          );
        }
        return httpExecutor(prompt);
      };
    }

    return (prompt: string) => {
      if (shouldFail) {
        throw new ServiceError(
          'AI_PROVIDER_UNAVAILABLE',
          `Provider ${provider} (${authProfile}) is unavailable.`,
          503,
        );
      }

      const outputPrefix = getOutputPrefix(provider);
      const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim();
      const truncatedPrompt =
        normalizedPrompt.length > 240
          ? `${normalizedPrompt.slice(0, 237)}...`
          : normalizedPrompt;

      return Promise.resolve({
        output: `[${provider}@${authProfile}] ${outputPrefix}: ${truncatedPrompt}`,
      });
    };
  }

  private getHttpExecutor(
    provider: string,
    authProfile: string,
  ): AIRuntimeExecutor | null {
    if (!this.httpAdaptersEnabled) {
      return null;
    }

    const envPrefix = providerEnvPrefixes[provider];
    if (!envPrefix) {
      return null;
    }
    const profileSuffix = toEnvProfileSuffix(authProfile);
    const endpoint = toTrimmedString(
      process.env[`AI_RUNTIME_${envPrefix}_ENDPOINT${profileSuffix}`] ??
        process.env[`AI_RUNTIME_${envPrefix}_ENDPOINT`],
    );
    const apiKey = toTrimmedString(
      process.env[`AI_RUNTIME_${envPrefix}_API_KEY${profileSuffix}`] ??
        process.env[`AI_RUNTIME_${envPrefix}_API_KEY`],
    );
    const model =
      toTrimmedString(
        process.env[`AI_RUNTIME_${envPrefix}_MODEL${profileSuffix}`] ??
          process.env[`AI_RUNTIME_${envPrefix}_MODEL`],
      ) ?? provider;

    if (!(endpoint && apiKey)) {
      return null;
    }

    return async (prompt: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.httpTimeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            input: prompt,
            provider,
            authProfile,
          }),
          signal: controller.signal,
        });
        const responseText = await response.text();
        if (!response.ok) {
          throw new ServiceError(
            'AI_PROVIDER_HTTP_ERROR',
            `Provider ${provider} (${authProfile}) returned HTTP ${response.status}.`,
            503,
          );
        }
        const parsedBody = tryParseJson(responseText);
        const output = extractTextOutput(parsedBody);
        if (output) {
          return { output };
        }
        if (typeof parsedBody === 'string' && parsedBody.trim().length > 0) {
          return { output: parsedBody.trim() };
        }
        return {
          output: `[${provider}@${authProfile}] HTTP adapter produced empty payload.`,
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ServiceError(
            'AI_PROVIDER_TIMEOUT',
            `Provider ${provider} (${authProfile}) timed out after ${this.httpTimeoutMs}ms.`,
            503,
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    };
  }
}

export const aiRuntimeService = new AIRuntimeServiceImpl();
