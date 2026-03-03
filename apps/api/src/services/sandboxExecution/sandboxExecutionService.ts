import { env } from '../../config/env';
import { db } from '../../db/pool';
import { ServiceError } from '../common/errors';
import {
  isSandboxExecutionProviderAllowed,
  parseSandboxExecutionEgressProfileMap,
  parseSandboxExecutionEgressProviderAllowlistMap,
  resolveSandboxExecutionEgressProfile,
  resolveSandboxExecutionEgressProviderAllowlist,
  type SandboxExecutionEgressProfileMap,
  type SandboxExecutionEgressProviderAllowlistMap,
} from './egressProfile';
import {
  parseSandboxExecutionLimitProfileMap,
  parseSandboxExecutionOperationLimitProfileMap,
  resolveSandboxExecutionLimitProfile,
  resolveSandboxExecutionOperationLimitProfile,
  type SandboxExecutionLimitProfileMap,
  type SandboxExecutionOperationLimitProfileMap,
} from './limitsProfile';
import type {
  SandboxCodeResult,
  SandboxCommandResult,
  SandboxCreateInput,
  SandboxDestroySandboxInput,
  SandboxDownloadArtifactsInput,
  SandboxDownloadArtifactsResult,
  SandboxExecutionAuditContext,
  SandboxExecutionEgressDecision,
  SandboxExecutionLimitDecision,
  SandboxExecutionLimits,
  SandboxExecutionMode,
  SandboxExecutionPolicyContext,
  SandboxExecutionService,
  SandboxExecutionTelemetryAuditMetadata,
  SandboxExecutionTelemetryMetadata,
  SandboxHandle,
  SandboxRunCodeInput,
  SandboxRunCommandInput,
  SandboxUploadFilesInput,
  SandboxUploadFilesResult,
} from './types';

interface SandboxExecutionQueryable {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

const parseBooleanFlag = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === 'true';
const PROVIDER_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const normalizeProviderIdentifier = (value: string) =>
  value.trim().toLowerCase();
const LIMIT_FIELD_NAMES = [
  'cpuCores',
  'memoryMb',
  'timeoutMs',
  'ttlSeconds',
  'maxArtifactBytes',
] as const;
type LimitFieldName = (typeof LIMIT_FIELD_NAMES)[number];
const LIMIT_FIELD_LABELS: Record<LimitFieldName, string> = {
  cpuCores: 'cpuCores',
  maxArtifactBytes: 'maxArtifactBytes',
  memoryMb: 'memoryMb',
  timeoutMs: 'timeoutMs',
  ttlSeconds: 'ttlSeconds',
};
const MAX_AUDIT_FIELD_LENGTH = 160;

export const SANDBOX_EXECUTION_TELEMETRY_SOURCE = 'sandbox_execution';
export const SANDBOX_EXECUTION_TELEMETRY_EVENT_TYPE =
  'sandbox_execution_attempt';

const createNotImplementedError = (operation: string) =>
  new ServiceError(
    'SANDBOX_EXECUTION_NOT_IMPLEMENTED',
    `Sandbox execution operation '${operation}' is not implemented yet.`,
    503,
  );

const createOperationInvalidError = () =>
  new ServiceError(
    'SANDBOX_EXECUTION_OPERATION_INVALID',
    'operation is required.',
    400,
  );
const createEgressProfileRequiredError = (operation: string) =>
  new ServiceError(
    'SANDBOX_EXECUTION_EGRESS_PROFILE_REQUIRED',
    `No egress profile is configured for operation "${operation}".`,
    503,
  );
const createEgressProfileAllowlistMissingError = (profile: string) =>
  new ServiceError(
    'SANDBOX_EXECUTION_EGRESS_PROFILE_UNCONFIGURED',
    `No provider allowlist is configured for egress profile "${profile}".`,
    503,
  );
const createEgressProviderInvalidError = (providers: string[]) =>
  new ServiceError(
    'SANDBOX_EXECUTION_EGRESS_PROVIDER_INVALID',
    `Provider identifiers are invalid for egress policy enforcement: ${providers.join(', ')}.`,
    400,
  );
const createEgressPolicyDeniedError = (
  profile: string,
  providers: string[],
  allowlist: string[],
) =>
  new ServiceError(
    'SANDBOX_EXECUTION_EGRESS_POLICY_DENY',
    `Egress policy denied providers for profile "${profile}": ${providers.join(', ')}. Allowed providers: ${allowlist.join(', ')}.`,
    403,
  );
const createLimitProfileRequiredError = (operation: string) =>
  new ServiceError(
    'SANDBOX_EXECUTION_LIMIT_PROFILE_REQUIRED',
    `No execution-limit profile is configured for operation "${operation}".`,
    503,
  );
const createLimitProfileUnconfiguredError = (profile: string) =>
  new ServiceError(
    'SANDBOX_EXECUTION_LIMIT_PROFILE_UNCONFIGURED',
    `No execution limits are configured for profile "${profile}".`,
    503,
  );
const createLimitInputInvalidError = (reasons: string[]) =>
  new ServiceError(
    'SANDBOX_EXECUTION_LIMITS_INVALID_REQUEST',
    `Invalid execution limit request payload: ${reasons.join('; ')}.`,
    400,
  );
const createLimitExceededError = (
  profile: string,
  violations: string[],
  appliedLimits: SandboxExecutionLimits,
) =>
  new ServiceError(
    'SANDBOX_EXECUTION_LIMITS_EXCEEDED',
    `Execution limit profile "${profile}" denied requested limits: ${violations.join('; ')}. Applied limits: ${JSON.stringify(
      appliedLimits,
    )}.`,
    400,
  );
const createExecutionTimeoutError = (operation: string, timeoutMs: number) =>
  new ServiceError(
    'SANDBOX_EXECUTION_TIMEOUT',
    `Sandbox execution operation "${operation}" timed out after ${timeoutMs}ms.`,
    504,
  );

interface EgressPolicyEvaluation {
  egressProfile: string | null;
  egressEnforced: boolean;
  egressDecision: SandboxExecutionEgressDecision;
  egressReason: string | null;
  egressAllowedProviders: string[] | null;
  egressDeniedProviders: string[] | null;
  error: ServiceError | null;
}
interface LimitsPolicyEvaluation {
  limitsProfile: string | null;
  limitsEnforced: boolean;
  limitsDecision: SandboxExecutionLimitDecision;
  limitsReason: string | null;
  limitsApplied: SandboxExecutionLimits | null;
  limitsRequested: SandboxExecutionLimits | null;
  effectiveTimeoutMs: number | null;
  error: ServiceError | null;
}

const toJsonString = (value: unknown, fallback: '{}' | '[]' = '{}') => {
  try {
    return JSON.stringify(value ?? (fallback === '[]' ? [] : {}));
  } catch {
    return fallback;
  }
};

const toSafeErrorMessage = (error: unknown): string | null => {
  if (!(error instanceof Error)) {
    return null;
  }
  const normalized = error.message.trim();
  if (normalized.length < 1) {
    return null;
  }
  return normalized.length > 240
    ? `${normalized.slice(0, 237)}...`
    : normalized;
};

export class SandboxExecutionServiceImpl implements SandboxExecutionService {
  private readonly enabled: boolean;
  private readonly queryable: SandboxExecutionQueryable;
  private readonly egressProfiles: SandboxExecutionEgressProfileMap;
  private readonly egressProviderAllowlists: SandboxExecutionEgressProviderAllowlistMap;
  private readonly operationLimitProfiles: SandboxExecutionOperationLimitProfileMap;
  private readonly limitProfiles: SandboxExecutionLimitProfileMap;
  private readonly egressEnforced: boolean;
  private readonly limitsEnforced: boolean;

  constructor(
    enabled = parseBooleanFlag(
      process.env.SANDBOX_EXECUTION_ENABLED ?? env.SANDBOX_EXECUTION_ENABLED,
    ),
    queryable: SandboxExecutionQueryable = db,
    egressProfiles = parseSandboxExecutionEgressProfileMap(
      process.env.SANDBOX_EXECUTION_EGRESS_PROFILES ??
        env.SANDBOX_EXECUTION_EGRESS_PROFILES,
    ),
    egressProviderAllowlists = parseSandboxExecutionEgressProviderAllowlistMap(
      process.env.SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS ??
        env.SANDBOX_EXECUTION_EGRESS_PROVIDER_ALLOWLISTS,
    ),
    egressEnforced = parseBooleanFlag(
      process.env.SANDBOX_EXECUTION_EGRESS_ENFORCE ??
        env.SANDBOX_EXECUTION_EGRESS_ENFORCE,
    ),
    operationLimitProfiles = parseSandboxExecutionOperationLimitProfileMap(
      process.env.SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES ??
        env.SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES,
    ),
    limitProfiles = parseSandboxExecutionLimitProfileMap(
      process.env.SANDBOX_EXECUTION_LIMIT_PROFILES ??
        env.SANDBOX_EXECUTION_LIMIT_PROFILES,
    ),
    limitsEnforced = parseBooleanFlag(
      process.env.SANDBOX_EXECUTION_LIMITS_ENFORCE ??
        env.SANDBOX_EXECUTION_LIMITS_ENFORCE,
    ),
  ) {
    this.enabled = enabled;
    this.queryable = queryable;
    this.egressProfiles = egressProfiles;
    this.egressProviderAllowlists = egressProviderAllowlists;
    this.operationLimitProfiles = operationLimitProfiles;
    this.limitProfiles = limitProfiles;
    this.egressEnforced = egressEnforced;
    this.limitsEnforced = limitsEnforced;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getMode(): SandboxExecutionMode {
    return this.enabled ? 'sandbox_enabled' : 'fallback_only';
  }

  async executeWithFallback<T>(
    operation: string,
    fallback: () => Promise<T>,
    policyContext?: SandboxExecutionPolicyContext,
  ): Promise<T> {
    const normalizedOperation = operation.trim();
    if (normalizedOperation.length < 1) {
      return Promise.reject(createOperationInvalidError());
    }

    const egressPolicy = this.evaluateEgressPolicy(
      normalizedOperation,
      policyContext,
    );
    const limitsPolicy = this.evaluateLimitsPolicy(
      normalizedOperation,
      policyContext,
    );
    const audit = this.normalizeAuditContext(policyContext?.audit);
    const policyError = egressPolicy.error ?? limitsPolicy.error;
    if (policyError) {
      await this.recordTelemetry({
        operation: normalizedOperation,
        status: 'failed',
        durationMs: 0,
        errorCode: policyError.code,
        errorMessage: toSafeErrorMessage(policyError),
        egressPolicy,
        limitsPolicy,
        audit,
      });
      return Promise.reject(policyError);
    }

    // Phase A: keep existing in-process execution behavior while emitting telemetry.
    const startedAt = Date.now();
    try {
      const result = await this.runWithExecutionTimeout(
        fallback(),
        normalizedOperation,
        limitsPolicy.effectiveTimeoutMs,
      );
      const durationMs = Date.now() - startedAt;
      await this.recordTelemetry({
        operation: normalizedOperation,
        status: 'ok',
        durationMs,
        egressPolicy,
        limitsPolicy,
        audit,
      });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      await this.recordTelemetry({
        operation: normalizedOperation,
        status: 'failed',
        durationMs,
        errorCode: error instanceof ServiceError ? error.code : 'UNKNOWN',
        errorMessage: toSafeErrorMessage(error),
        egressPolicy,
        limitsPolicy,
        audit,
      });
      throw error;
    }
  }

  createSandbox(_input: SandboxCreateInput): Promise<SandboxHandle> {
    return Promise.reject(createNotImplementedError('createSandbox'));
  }

  runCommand(_input: SandboxRunCommandInput): Promise<SandboxCommandResult> {
    return Promise.reject(createNotImplementedError('runCommand'));
  }

  runCode(_input: SandboxRunCodeInput): Promise<SandboxCodeResult> {
    return Promise.reject(createNotImplementedError('runCode'));
  }

  uploadFiles(
    _input: SandboxUploadFilesInput,
  ): Promise<SandboxUploadFilesResult> {
    return Promise.reject(createNotImplementedError('uploadFiles'));
  }

  downloadArtifacts(
    _input: SandboxDownloadArtifactsInput,
  ): Promise<SandboxDownloadArtifactsResult> {
    return Promise.reject(createNotImplementedError('downloadArtifacts'));
  }

  destroySandbox(_input: SandboxDestroySandboxInput): Promise<void> {
    return Promise.reject(createNotImplementedError('destroySandbox'));
  }

  private async recordTelemetry(input: {
    operation: string;
    status: 'ok' | 'failed';
    durationMs: number;
    errorCode?: string;
    errorMessage?: string | null;
    egressPolicy: EgressPolicyEvaluation;
    limitsPolicy: LimitsPolicyEvaluation;
    audit: SandboxExecutionTelemetryAuditMetadata | null;
  }): Promise<void> {
    try {
      await this.queryable.query(
        `INSERT INTO ux_events (event_type, user_type, status, timing_ms, source, metadata)
         VALUES ($1, 'system', $2, $3, $4, $5)`,
        [
          SANDBOX_EXECUTION_TELEMETRY_EVENT_TYPE,
          input.status,
          input.durationMs,
          SANDBOX_EXECUTION_TELEMETRY_SOURCE,
          toJsonString(this.buildTelemetryMetadata(input), '{}'),
        ],
      );
    } catch (error) {
      console.error('sandbox execution telemetry write failed', error);
    }
  }

  private buildTelemetryMetadata(input: {
    operation: string;
    errorCode?: string;
    errorMessage?: string | null;
    egressPolicy: EgressPolicyEvaluation;
    limitsPolicy: LimitsPolicyEvaluation;
    audit: SandboxExecutionTelemetryAuditMetadata | null;
  }): SandboxExecutionTelemetryMetadata {
    return {
      operation: input.operation,
      mode: this.getMode(),
      egressProfile: input.egressPolicy.egressProfile,
      egressEnforced: input.egressPolicy.egressEnforced,
      egressDecision: input.egressPolicy.egressDecision,
      egressReason: input.egressPolicy.egressReason,
      egressAllowedProviders: input.egressPolicy.egressAllowedProviders,
      egressDeniedProviders: input.egressPolicy.egressDeniedProviders,
      limitsProfile: input.limitsPolicy.limitsProfile,
      limitsEnforced: input.limitsPolicy.limitsEnforced,
      limitsDecision: input.limitsPolicy.limitsDecision,
      limitsReason: input.limitsPolicy.limitsReason,
      limitsApplied: input.limitsPolicy.limitsApplied,
      limitsRequested: input.limitsPolicy.limitsRequested,
      audit: input.audit,
      sandboxExecutionEnabled: this.enabled,
      fallbackPathUsed: true,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    };
  }
  private runWithExecutionTimeout<T>(
    execution: Promise<T>,
    operation: string,
    timeoutMs: number | null,
  ): Promise<T> {
    if (!(typeof timeoutMs === 'number' && timeoutMs > 0)) {
      return execution;
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(createExecutionTimeoutError(operation, timeoutMs));
      }, timeoutMs);

      execution
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private evaluateEgressPolicy(
    operation: string,
    policyContext: SandboxExecutionPolicyContext | undefined,
  ): EgressPolicyEvaluation {
    const egressProfile = resolveSandboxExecutionEgressProfile(
      this.egressProfiles,
      operation,
    );
    const providers = Array.from(
      new Set(
        (policyContext?.providerIdentifiers ?? [])
          .map((provider) => normalizeProviderIdentifier(provider))
          .filter((provider) => provider.length > 0),
      ),
    );

    if (!this.egressEnforced) {
      return {
        egressProfile,
        egressEnforced: false,
        egressDecision: 'not_enforced',
        egressReason: 'Egress policy enforcement is disabled by feature flag.',
        egressAllowedProviders: null,
        egressDeniedProviders: null,
        error: null,
      };
    }
    if (providers.length < 1) {
      return {
        egressProfile,
        egressEnforced: true,
        egressDecision: 'not_enforced',
        egressReason:
          'No provider identifiers were supplied for egress policy evaluation.',
        egressAllowedProviders: null,
        egressDeniedProviders: null,
        error: null,
      };
    }

    const invalidProviders = providers.filter(
      (provider) => !PROVIDER_IDENTIFIER_PATTERN.test(provider),
    );
    if (invalidProviders.length > 0) {
      return {
        egressProfile,
        egressEnforced: true,
        egressDecision: 'deny',
        egressReason: 'One or more provider identifiers are invalid.',
        egressAllowedProviders: null,
        egressDeniedProviders: invalidProviders,
        error: createEgressProviderInvalidError(invalidProviders),
      };
    }

    if (!egressProfile) {
      return {
        egressProfile: null,
        egressEnforced: true,
        egressDecision: 'deny',
        egressReason: `No egress profile is mapped for operation "${operation}".`,
        egressAllowedProviders: null,
        egressDeniedProviders: [...providers],
        error: createEgressProfileRequiredError(operation),
      };
    }

    const allowlist = resolveSandboxExecutionEgressProviderAllowlist(
      this.egressProviderAllowlists,
      egressProfile,
    );
    if (!(allowlist && allowlist.length > 0)) {
      return {
        egressProfile,
        egressEnforced: true,
        egressDecision: 'deny',
        egressReason: `No provider allowlist is configured for profile "${egressProfile}".`,
        egressAllowedProviders: null,
        egressDeniedProviders: [...providers],
        error: createEgressProfileAllowlistMissingError(egressProfile),
      };
    }

    const deniedProviders = providers.filter(
      (provider) => !isSandboxExecutionProviderAllowed(allowlist, provider),
    );
    if (deniedProviders.length > 0) {
      return {
        egressProfile,
        egressEnforced: true,
        egressDecision: 'deny',
        egressReason: `Egress allowlist denied providers for profile "${egressProfile}".`,
        egressAllowedProviders: [...allowlist],
        egressDeniedProviders: deniedProviders,
        error: createEgressPolicyDeniedError(
          egressProfile,
          deniedProviders,
          allowlist,
        ),
      };
    }

    return {
      egressProfile,
      egressEnforced: true,
      egressDecision: 'allow',
      egressReason: null,
      egressAllowedProviders: [...allowlist],
      egressDeniedProviders: null,
      error: null,
    };
  }
  private evaluateLimitsPolicy(
    operation: string,
    policyContext: SandboxExecutionPolicyContext | undefined,
  ): LimitsPolicyEvaluation {
    const limitsProfile = resolveSandboxExecutionOperationLimitProfile(
      this.operationLimitProfiles,
      operation,
    );
    const requestedLimits = this.normalizeRequestedLimits(
      policyContext?.requestedLimits,
    );

    if (requestedLimits.invalidReasons.length > 0) {
      return {
        limitsProfile,
        limitsEnforced: this.limitsEnforced,
        limitsDecision: 'deny',
        limitsReason: 'Requested execution limits contain invalid values.',
        limitsApplied: null,
        limitsRequested: requestedLimits.limits,
        effectiveTimeoutMs: null,
        error: createLimitInputInvalidError(requestedLimits.invalidReasons),
      };
    }

    if (!this.limitsEnforced) {
      return {
        limitsProfile,
        limitsEnforced: false,
        limitsDecision: 'not_enforced',
        limitsReason: 'Execution-limit policy enforcement is disabled.',
        limitsApplied: null,
        limitsRequested: requestedLimits.limits,
        effectiveTimeoutMs:
          typeof requestedLimits.limits?.timeoutMs === 'number'
            ? requestedLimits.limits.timeoutMs
            : null,
        error: null,
      };
    }

    if (!limitsProfile) {
      return {
        limitsProfile: null,
        limitsEnforced: true,
        limitsDecision: 'deny',
        limitsReason: `No execution-limit profile is mapped for operation "${operation}".`,
        limitsApplied: null,
        limitsRequested: requestedLimits.limits,
        effectiveTimeoutMs: null,
        error: createLimitProfileRequiredError(operation),
      };
    }

    const appliedLimits = resolveSandboxExecutionLimitProfile(
      this.limitProfiles,
      limitsProfile,
    );
    if (!appliedLimits) {
      return {
        limitsProfile,
        limitsEnforced: true,
        limitsDecision: 'deny',
        limitsReason: `Execution limits are missing for profile "${limitsProfile}".`,
        limitsApplied: null,
        limitsRequested: requestedLimits.limits,
        effectiveTimeoutMs: null,
        error: createLimitProfileUnconfiguredError(limitsProfile),
      };
    }

    const violations: string[] = [];
    for (const field of LIMIT_FIELD_NAMES) {
      const requestedValue = requestedLimits.limits?.[field];
      const maxValue = appliedLimits[field];
      if (typeof requestedValue !== 'number' || typeof maxValue !== 'number') {
        continue;
      }
      if (requestedValue > maxValue) {
        violations.push(
          `${LIMIT_FIELD_LABELS[field]} requested=${requestedValue} exceeds profile_max=${maxValue}`,
        );
      }
    }
    if (violations.length > 0) {
      return {
        limitsProfile,
        limitsEnforced: true,
        limitsDecision: 'deny',
        limitsReason: `Requested execution limits exceed profile "${limitsProfile}".`,
        limitsApplied: appliedLimits,
        limitsRequested: requestedLimits.limits,
        effectiveTimeoutMs: null,
        error: createLimitExceededError(
          limitsProfile,
          violations,
          appliedLimits,
        ),
      };
    }

    const effectiveTimeoutMs = (() => {
      const requestedTimeout = requestedLimits.limits?.timeoutMs;
      const profileTimeout = appliedLimits.timeoutMs;
      if (
        typeof requestedTimeout === 'number' &&
        typeof profileTimeout === 'number'
      ) {
        return Math.min(requestedTimeout, profileTimeout);
      }
      if (typeof requestedTimeout === 'number') {
        return requestedTimeout;
      }
      if (typeof profileTimeout === 'number') {
        return profileTimeout;
      }
      return null;
    })();

    return {
      limitsProfile,
      limitsEnforced: true,
      limitsDecision: 'allow',
      limitsReason: null,
      limitsApplied: appliedLimits,
      limitsRequested: requestedLimits.limits,
      effectiveTimeoutMs,
      error: null,
    };
  }

  private normalizeRequestedLimits(input: SandboxExecutionLimits | undefined): {
    limits: SandboxExecutionLimits | null;
    invalidReasons: string[];
  } {
    if (!input || typeof input !== 'object') {
      return {
        limits: null,
        invalidReasons: [],
      };
    }

    const limits: SandboxExecutionLimits = {};
    const invalidReasons: string[] = [];
    for (const field of LIMIT_FIELD_NAMES) {
      const rawValue = input[field];
      if (rawValue === undefined) {
        continue;
      }
      if (
        !(
          typeof rawValue === 'number' &&
          Number.isFinite(rawValue) &&
          Number.isInteger(rawValue)
        ) ||
        rawValue <= 0
      ) {
        invalidReasons.push(
          `${LIMIT_FIELD_LABELS[field]} must be a positive integer`,
        );
        continue;
      }
      limits[field] = rawValue;
    }

    return {
      limits: Object.keys(limits).length > 0 ? limits : null,
      invalidReasons,
    };
  }

  private normalizeAuditValue(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length < 1) {
      return null;
    }
    return trimmed.length > MAX_AUDIT_FIELD_LENGTH
      ? trimmed.slice(0, MAX_AUDIT_FIELD_LENGTH)
      : trimmed;
  }

  private normalizeAuditContext(
    input: SandboxExecutionAuditContext | undefined,
  ): SandboxExecutionTelemetryAuditMetadata | null {
    if (!input || typeof input !== 'object') {
      return null;
    }
    const audit = {
      actorId: this.normalizeAuditValue(input.actorId),
      actorType: this.normalizeAuditValue(input.actorType),
      sessionId: this.normalizeAuditValue(input.sessionId),
      sourceRoute: this.normalizeAuditValue(input.sourceRoute),
      toolName: this.normalizeAuditValue(input.toolName),
    };
    return Object.values(audit).some((value) => value !== null) ? audit : null;
  }
}

export const sandboxExecutionService = new SandboxExecutionServiceImpl();
