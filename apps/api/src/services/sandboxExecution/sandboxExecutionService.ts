import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
interface LocalSandboxState {
  sandboxId: string;
  rootDir: string;
  createdAtMs: number;
  expiresAtMs: number | null;
  limits: SandboxExecutionLimits;
}

const parseBooleanFlag = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === 'true';
const PROVIDER_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const normalizeProviderIdentifier = (value: string) =>
  value.trim().toLowerCase();
const SANDBOX_ID_PATTERN = /^sbx_[a-f0-9]{32}$/;
const DEFAULT_SANDBOX_LIMITS = {
  maxArtifactBytes: 5_242_880,
  timeoutMs: 15_000,
  ttlSeconds: 900,
} as const;
const MAX_SANDBOX_PROCESS_OUTPUT_BYTES = 1_048_576;
const SANDBOX_SUPPORTED_CODE_LANGUAGES = new Set([
  'bash',
  'javascript',
  'js',
  'node',
  'python',
  'py',
  'sh',
]);
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

const createOperationInvalidError = () =>
  new ServiceError(
    'SANDBOX_EXECUTION_OPERATION_INVALID',
    'operation is required.',
    400,
  );
const createSandboxInputInvalidError = (message: string) =>
  new ServiceError('SANDBOX_EXECUTION_INVALID_INPUT', message, 400);
const createSandboxIdInvalidError = () =>
  createSandboxInputInvalidError(
    'sandboxId must use the expected sandbox identifier format.',
  );
const createSandboxNotFoundError = (sandboxId: string) =>
  new ServiceError(
    'SANDBOX_EXECUTION_SANDBOX_NOT_FOUND',
    `Sandbox "${sandboxId}" was not found.`,
    404,
  );
const createSandboxExpiredError = (sandboxId: string) =>
  new ServiceError(
    'SANDBOX_EXECUTION_SANDBOX_EXPIRED',
    `Sandbox "${sandboxId}" has expired.`,
    410,
  );
const createSandboxPathInvalidError = (pathValue: string) =>
  createSandboxInputInvalidError(
    `Sandbox path "${pathValue}" is invalid or escapes sandbox root.`,
  );
const createSandboxPathNotFoundError = (pathValue: string) =>
  new ServiceError(
    'SANDBOX_EXECUTION_PATH_NOT_FOUND',
    `Sandbox path "${pathValue}" does not exist.`,
    404,
  );
const createSandboxProcessFailedError = (
  operation: string,
  errorMessage: string,
) =>
  new ServiceError(
    'SANDBOX_EXECUTION_PROCESS_FAILED',
    `Sandbox process execution failed for ${operation}: ${errorMessage}.`,
    502,
  );
const createSandboxLanguageUnsupportedError = (language: string) =>
  createSandboxInputInvalidError(
    `Unsupported code language "${language}". Supported values: ${Array.from(
      SANDBOX_SUPPORTED_CODE_LANGUAGES,
    )
      .sort()
      .join(', ')}.`,
  );
const createSandboxArtifactTooLargeError = (
  pathValue: string,
  size: number,
  limit: number,
) =>
  createSandboxInputInvalidError(
    `Artifact "${pathValue}" size ${size} bytes exceeds limit ${limit} bytes.`,
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
  private readonly sandboxes = new Map<string, LocalSandboxState>();
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
    const startedAtTimestamp = Date.now();
    const startedAtUtc = new Date(startedAtTimestamp).toISOString();
    const executionSessionId = crypto.randomUUID();
    const audit = this.applyExecutionSessionId(
      this.normalizeAuditContext(policyContext?.audit),
      executionSessionId,
    );
    const policyError = egressPolicy.error ?? limitsPolicy.error;
    if (policyError) {
      const finishedAtUtc = new Date().toISOString();
      await this.recordTelemetry({
        operation: normalizedOperation,
        status: 'failed',
        durationMs: 0,
        executionSessionId,
        startedAtUtc,
        finishedAtUtc,
        errorCode: policyError.code,
        errorMessage: toSafeErrorMessage(policyError),
        egressPolicy,
        limitsPolicy,
        audit,
      });
      return Promise.reject(policyError);
    }

    // Phase A: keep existing in-process execution behavior while emitting telemetry.
    try {
      const result = await this.runWithExecutionTimeout(
        fallback(),
        normalizedOperation,
        limitsPolicy.effectiveTimeoutMs,
      );
      const finishedAtTimestamp = Date.now();
      const durationMs = finishedAtTimestamp - startedAtTimestamp;
      await this.recordTelemetry({
        operation: normalizedOperation,
        status: 'ok',
        durationMs,
        executionSessionId,
        startedAtUtc,
        finishedAtUtc: new Date(finishedAtTimestamp).toISOString(),
        egressPolicy,
        limitsPolicy,
        audit,
      });
      return result;
    } catch (error) {
      const finishedAtTimestamp = Date.now();
      const durationMs = finishedAtTimestamp - startedAtTimestamp;
      await this.recordTelemetry({
        operation: normalizedOperation,
        status: 'failed',
        durationMs,
        executionSessionId,
        startedAtUtc,
        finishedAtUtc: new Date(finishedAtTimestamp).toISOString(),
        errorCode: error instanceof ServiceError ? error.code : 'UNKNOWN',
        errorMessage: toSafeErrorMessage(error),
        egressPolicy,
        limitsPolicy,
        audit,
      });
      throw error;
    }
  }

  async createSandbox(input: SandboxCreateInput): Promise<SandboxHandle> {
    await this.purgeExpiredSandboxes();
    const normalizedLimits = this.normalizeRequestedLimits(input.limits);
    if (normalizedLimits.invalidReasons.length > 0) {
      throw createLimitInputInvalidError(normalizedLimits.invalidReasons);
    }
    const limits: SandboxExecutionLimits = {
      ...DEFAULT_SANDBOX_LIMITS,
      ...(normalizedLimits.limits ?? {}),
    };
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'sandbox-exec-'));
    const createdAtMs = Date.now();
    const ttlSeconds =
      typeof limits.ttlSeconds === 'number'
        ? limits.ttlSeconds
        : DEFAULT_SANDBOX_LIMITS.ttlSeconds;
    const expiresAtMs = createdAtMs + ttlSeconds * 1000;
    const sandboxId = `sbx_${crypto.randomUUID().replaceAll('-', '')}`;
    const state: LocalSandboxState = {
      createdAtMs,
      expiresAtMs,
      limits,
      rootDir,
      sandboxId,
    };
    this.sandboxes.set(sandboxId, state);
    return this.toSandboxHandle(state);
  }

  async runCommand(
    input: SandboxRunCommandInput,
  ): Promise<SandboxCommandResult> {
    const state = await this.requireSandboxState(input.sandboxId);
    if (
      !(typeof input.command === 'string' && input.command.trim().length > 0)
    ) {
      throw createSandboxInputInvalidError(
        'command must be a non-empty string.',
      );
    }
    const cwd = input.cwd
      ? await this.resolveSandboxPath(state, input.cwd, {
          requireDirectory: true,
          requireExisting: true,
        })
      : state.rootDir;
    const timeoutMs = this.resolveCommandTimeoutMs(state, input.timeoutMs);
    const shellProcess =
      process.platform === 'win32'
        ? {
            args: ['-NoProfile', '-NonInteractive', '-Command', input.command],
            file: 'powershell',
          }
        : { args: ['-lc', input.command], file: '/bin/sh' };
    return this.executeProcess({
      args: shellProcess.args,
      cwd,
      file: shellProcess.file,
      operation: 'runCommand',
      timeoutMs,
    });
  }

  async runCode(input: SandboxRunCodeInput): Promise<SandboxCodeResult> {
    const state = await this.requireSandboxState(input.sandboxId);
    const language = this.normalizeCodeLanguage(input.language);
    const code =
      typeof input.code === 'string' ? input.code : `${input.code ?? ''}`;
    if (code.trim().length < 1) {
      throw createSandboxInputInvalidError('code must be a non-empty string.');
    }
    const timeoutMs = this.resolveCommandTimeoutMs(state, input.timeoutMs);
    const scriptExtension = this.resolveScriptExtension(language);
    const scriptPath = path.join(
      state.rootDir,
      `inline-${crypto.randomUUID()}.${scriptExtension}`,
    );
    await writeFile(scriptPath, code, 'utf8');
    const processInput = this.resolveCodeProcess(language, scriptPath);
    const commandResult = await this.executeProcess({
      args: processInput.args,
      cwd: state.rootDir,
      file: processInput.file,
      operation: `runCode:${language}`,
      timeoutMs,
    });
    return {
      durationMs: commandResult.durationMs,
      error: commandResult.stderr.length > 0 ? commandResult.stderr : null,
      output: commandResult.stdout,
    };
  }

  async uploadFiles(
    input: SandboxUploadFilesInput,
  ): Promise<SandboxUploadFilesResult> {
    const state = await this.requireSandboxState(input.sandboxId);
    if (!Array.isArray(input.files)) {
      throw createSandboxInputInvalidError('files must be an array.');
    }
    let uploadedCount = 0;
    for (const file of input.files) {
      if (!(file && typeof file === 'object')) {
        throw createSandboxInputInvalidError('files items must be objects.');
      }
      if (!(typeof file.path === 'string' && file.path.trim().length > 0)) {
        throw createSandboxInputInvalidError(
          'files.path must be a non-empty string.',
        );
      }
      if (
        !(
          typeof file.contentBase64 === 'string' &&
          file.contentBase64.trim().length > 0
        )
      ) {
        throw createSandboxInputInvalidError(
          'files.contentBase64 must be a non-empty base64 string.',
        );
      }
      const destination = await this.resolveSandboxPath(state, file.path, {
        requireDirectory: false,
        requireExisting: false,
      });
      const content = Buffer.from(file.contentBase64, 'base64');
      if (
        typeof state.limits.maxArtifactBytes === 'number' &&
        content.byteLength > state.limits.maxArtifactBytes
      ) {
        throw createSandboxArtifactTooLargeError(
          file.path,
          content.byteLength,
          state.limits.maxArtifactBytes,
        );
      }
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
      uploadedCount += 1;
    }
    return { uploadedCount };
  }

  async downloadArtifacts(
    input: SandboxDownloadArtifactsInput,
  ): Promise<SandboxDownloadArtifactsResult> {
    const state = await this.requireSandboxState(input.sandboxId);
    if (!Array.isArray(input.paths)) {
      throw createSandboxInputInvalidError('paths must be an array.');
    }
    const artifacts: SandboxDownloadArtifactsResult['artifacts'] = [];
    for (const artifactPath of input.paths) {
      if (
        !(typeof artifactPath === 'string' && artifactPath.trim().length > 0)
      ) {
        throw createSandboxInputInvalidError(
          'paths must contain non-empty strings.',
        );
      }
      const resolvedPath = await this.resolveSandboxPath(state, artifactPath, {
        requireDirectory: false,
        requireExisting: true,
      });
      const fileStats = await stat(resolvedPath);
      if (!fileStats.isFile()) {
        throw createSandboxPathInvalidError(artifactPath);
      }
      if (
        typeof state.limits.maxArtifactBytes === 'number' &&
        fileStats.size > state.limits.maxArtifactBytes
      ) {
        throw createSandboxArtifactTooLargeError(
          artifactPath,
          fileStats.size,
          state.limits.maxArtifactBytes,
        );
      }
      const content = await readFile(resolvedPath);
      artifacts.push({
        contentBase64: content.toString('base64'),
        path: artifactPath,
      });
    }
    return { artifacts };
  }

  async destroySandbox(input: SandboxDestroySandboxInput): Promise<void> {
    const sandboxId = this.normalizeSandboxId(input.sandboxId);
    const state = this.sandboxes.get(sandboxId);
    if (!state) {
      return;
    }
    await this.disposeSandboxState(state);
  }

  private toSandboxHandle(state: LocalSandboxState): SandboxHandle {
    return {
      createdAt: new Date(state.createdAtMs).toISOString(),
      expiresAt:
        state.expiresAtMs === null
          ? null
          : new Date(state.expiresAtMs).toISOString(),
      mode: this.getMode(),
      sandboxId: state.sandboxId,
    };
  }

  private normalizeSandboxId(value: unknown): string {
    if (typeof value !== 'string') {
      throw createSandboxIdInvalidError();
    }
    const normalized = value.trim().toLowerCase();
    if (!SANDBOX_ID_PATTERN.test(normalized)) {
      throw createSandboxIdInvalidError();
    }
    return normalized;
  }

  private resolveCommandTimeoutMs(
    state: LocalSandboxState,
    requestedTimeoutMs: unknown,
  ): number {
    if (
      requestedTimeoutMs === undefined ||
      requestedTimeoutMs === null ||
      requestedTimeoutMs === ''
    ) {
      return state.limits.timeoutMs ?? DEFAULT_SANDBOX_LIMITS.timeoutMs;
    }
    const parsed = Number(requestedTimeoutMs);
    if (!(Number.isFinite(parsed) && parsed > 0)) {
      throw createSandboxInputInvalidError(
        'timeoutMs must be a positive integer.',
      );
    }
    return Math.floor(parsed);
  }

  private normalizeCodeLanguage(value: unknown): string {
    if (!(typeof value === 'string' && value.trim().length > 0)) {
      throw createSandboxInputInvalidError(
        'language must be a non-empty string.',
      );
    }
    const normalized = value.trim().toLowerCase();
    if (!SANDBOX_SUPPORTED_CODE_LANGUAGES.has(normalized)) {
      throw createSandboxLanguageUnsupportedError(normalized);
    }
    return normalized;
  }

  private resolveScriptExtension(language: string): string {
    if (language === 'javascript' || language === 'js' || language === 'node') {
      return 'js';
    }
    if (language === 'python' || language === 'py') {
      return 'py';
    }
    return 'sh';
  }

  private resolveCodeProcess(
    language: string,
    scriptPath: string,
  ): { file: string; args: string[] } {
    if (language === 'javascript' || language === 'js' || language === 'node') {
      return { args: [scriptPath], file: 'node' };
    }
    if (language === 'python' || language === 'py') {
      return { args: [scriptPath], file: 'python3' };
    }
    return { args: [scriptPath], file: 'sh' };
  }

  private async requireSandboxState(sandboxIdValue: unknown) {
    await this.purgeExpiredSandboxes();
    const sandboxId = this.normalizeSandboxId(sandboxIdValue);
    const state = this.sandboxes.get(sandboxId);
    if (!state) {
      throw createSandboxNotFoundError(sandboxId);
    }
    if (!(state.expiresAtMs === null || state.expiresAtMs > Date.now())) {
      await this.disposeSandboxState(state);
      throw createSandboxExpiredError(sandboxId);
    }
    return state;
  }

  private async disposeSandboxState(state: LocalSandboxState): Promise<void> {
    this.sandboxes.delete(state.sandboxId);
    await rm(state.rootDir, { force: true, recursive: true });
  }

  private async purgeExpiredSandboxes(): Promise<void> {
    const nowMs = Date.now();
    const expired = Array.from(this.sandboxes.values()).filter(
      (state) => !(state.expiresAtMs === null || state.expiresAtMs > nowMs),
    );
    for (const state of expired) {
      await this.disposeSandboxState(state);
    }
  }

  private async resolveSandboxPath(
    state: LocalSandboxState,
    sandboxPath: unknown,
    {
      requireDirectory,
      requireExisting,
    }: { requireExisting: boolean; requireDirectory: boolean },
  ): Promise<string> {
    if (!(typeof sandboxPath === 'string' && sandboxPath.trim().length > 0)) {
      throw createSandboxInputInvalidError(
        'sandbox path must be a non-empty string.',
      );
    }
    const resolvedPath = path.resolve(state.rootDir, sandboxPath.trim());
    const relativePath = path.relative(state.rootDir, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw createSandboxPathInvalidError(sandboxPath.trim());
    }
    if (!(requireExisting || requireDirectory)) {
      return resolvedPath;
    }
    try {
      const fileStats = await stat(resolvedPath);
      if (requireDirectory && !fileStats.isDirectory()) {
        throw createSandboxPathInvalidError(sandboxPath.trim());
      }
      return resolvedPath;
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      if (requireExisting) {
        throw createSandboxPathNotFoundError(sandboxPath.trim());
      }
      return resolvedPath;
    }
  }

  private executeProcess({
    args,
    cwd,
    file,
    operation,
    timeoutMs,
  }: {
    file: string;
    args: string[];
    cwd: string;
    timeoutMs: number;
    operation: string;
  }): Promise<SandboxCommandResult> {
    return new Promise<SandboxCommandResult>((resolve, reject) => {
      const startedAt = Date.now();
      let finished = false;
      let timeoutTriggered = false;
      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const appendChunk = (
        value: string,
        chunk: Buffer | string,
        totalBytes: number,
      ): { nextValue: string; nextBytes: number } => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const nextBytes = totalBytes + buffer.byteLength;
        if (totalBytes >= MAX_SANDBOX_PROCESS_OUTPUT_BYTES) {
          return { nextBytes, nextValue: value };
        }
        const remaining = MAX_SANDBOX_PROCESS_OUTPUT_BYTES - totalBytes;
        const appended = buffer.subarray(0, remaining).toString('utf8');
        return {
          nextBytes,
          nextValue: `${value}${appended}`,
        };
      };
      const child = spawn(file, args, {
        cwd,
        env: process.env,
        windowsHide: true,
      });
      const timer = setTimeout(() => {
        timeoutTriggered = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      child.stdout?.on('data', (chunk: Buffer | string) => {
        const next = appendChunk(stdout, chunk, stdoutBytes);
        stdout = next.nextValue;
        stdoutBytes = next.nextBytes;
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        const next = appendChunk(stderr, chunk, stderrBytes);
        stderr = next.nextValue;
        stderrBytes = next.nextBytes;
      });
      child.once('error', (error) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        reject(createSandboxProcessFailedError(operation, error.message));
      });
      child.once('close', (code) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        if (timeoutTriggered) {
          reject(createExecutionTimeoutError(operation, timeoutMs));
          return;
        }
        resolve({
          durationMs: Date.now() - startedAt,
          exitCode: typeof code === 'number' ? code : -1,
          stderr,
          stdout,
        });
      });
    });
  }

  private async recordTelemetry(input: {
    operation: string;
    status: 'ok' | 'failed';
    durationMs: number;
    executionSessionId: string;
    startedAtUtc: string;
    finishedAtUtc: string;
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
    executionSessionId: string;
    startedAtUtc: string;
    finishedAtUtc: string;
    errorCode?: string;
    errorMessage?: string | null;
    egressPolicy: EgressPolicyEvaluation;
    limitsPolicy: LimitsPolicyEvaluation;
    audit: SandboxExecutionTelemetryAuditMetadata | null;
  }): SandboxExecutionTelemetryMetadata {
    return {
      operation: input.operation,
      mode: this.getMode(),
      executionSessionId: input.executionSessionId,
      startedAtUtc: input.startedAtUtc,
      finishedAtUtc: input.finishedAtUtc,
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

  private applyExecutionSessionId(
    audit: SandboxExecutionTelemetryAuditMetadata | null,
    executionSessionId: string,
  ): SandboxExecutionTelemetryAuditMetadata | null {
    if (audit === null) {
      return null;
    }
    return {
      ...audit,
      sessionId: audit.sessionId ?? executionSessionId,
    };
  }
}

export const sandboxExecutionService = new SandboxExecutionServiceImpl();
