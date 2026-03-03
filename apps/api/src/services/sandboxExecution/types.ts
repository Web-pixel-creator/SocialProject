export type SandboxExecutionMode = 'fallback_only' | 'sandbox_enabled';
export type SandboxExecutionTelemetryStatus = 'ok' | 'failed';
export type SandboxExecutionEgressDecision = 'allow' | 'deny' | 'not_enforced';
export type SandboxExecutionLimitDecision = 'allow' | 'deny' | 'not_enforced';

export interface SandboxExecutionLimits {
  cpuCores?: number;
  memoryMb?: number;
  timeoutMs?: number;
  ttlSeconds?: number;
  maxArtifactBytes?: number;
}

export interface SandboxExecutionAuditContext {
  actorId?: string;
  actorType?: string;
  sessionId?: string;
  sourceRoute?: string;
  toolName?: string;
}

export interface SandboxExecutionTelemetryAuditMetadata {
  actorId: string | null;
  actorType: string | null;
  sessionId: string | null;
  sourceRoute: string | null;
  toolName: string | null;
}

export interface SandboxExecutionPolicyContext {
  providerIdentifiers?: string[];
  requestedLimits?: SandboxExecutionLimits;
  audit?: SandboxExecutionAuditContext;
}

export interface SandboxExecutionTelemetryMetadata {
  operation: string;
  mode: SandboxExecutionMode;
  egressProfile: string | null;
  egressEnforced: boolean;
  egressDecision: SandboxExecutionEgressDecision;
  egressReason: string | null;
  egressAllowedProviders: string[] | null;
  egressDeniedProviders: string[] | null;
  limitsProfile: string | null;
  limitsEnforced: boolean;
  limitsDecision: SandboxExecutionLimitDecision;
  limitsReason: string | null;
  limitsApplied: SandboxExecutionLimits | null;
  limitsRequested: SandboxExecutionLimits | null;
  audit: SandboxExecutionTelemetryAuditMetadata | null;
  sandboxExecutionEnabled: boolean;
  fallbackPathUsed: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface SandboxCreateInput {
  image?: string;
  env?: Record<string, string>;
  metadata?: Record<string, string>;
  limits?: SandboxExecutionLimits;
}

export interface SandboxHandle {
  sandboxId: string;
  mode: SandboxExecutionMode;
  createdAt: string;
  expiresAt: string | null;
}

export interface SandboxRunCommandInput {
  sandboxId: string;
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface SandboxCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SandboxRunCodeInput {
  sandboxId: string;
  language: string;
  code: string;
  timeoutMs?: number;
}

export interface SandboxCodeResult {
  output: string;
  error: string | null;
  durationMs: number;
}

export interface SandboxUploadFile {
  path: string;
  contentBase64: string;
}

export interface SandboxUploadFilesInput {
  sandboxId: string;
  files: SandboxUploadFile[];
}

export interface SandboxUploadFilesResult {
  uploadedCount: number;
}

export interface SandboxDownloadArtifact {
  path: string;
  contentBase64: string;
}

export interface SandboxDownloadArtifactsInput {
  sandboxId: string;
  paths: string[];
}

export interface SandboxDownloadArtifactsResult {
  artifacts: SandboxDownloadArtifact[];
}

export interface SandboxDestroySandboxInput {
  sandboxId: string;
}

export interface SandboxExecutionService {
  isEnabled(): boolean;
  getMode(): SandboxExecutionMode;
  executeWithFallback<T>(
    operation: string,
    fallback: () => Promise<T>,
    policyContext?: SandboxExecutionPolicyContext,
  ): Promise<T>;
  createSandbox(input: SandboxCreateInput): Promise<SandboxHandle>;
  runCommand(input: SandboxRunCommandInput): Promise<SandboxCommandResult>;
  runCode(input: SandboxRunCodeInput): Promise<SandboxCodeResult>;
  uploadFiles(
    input: SandboxUploadFilesInput,
  ): Promise<SandboxUploadFilesResult>;
  downloadArtifacts(
    input: SandboxDownloadArtifactsInput,
  ): Promise<SandboxDownloadArtifactsResult>;
  destroySandbox(input: SandboxDestroySandboxInput): Promise<void>;
}
