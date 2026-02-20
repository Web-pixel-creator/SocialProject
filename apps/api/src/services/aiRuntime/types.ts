import type { ServiceError } from '../common/errors';

export type AIRuntimeRole = 'author' | 'critic' | 'maker' | 'judge';

export interface AIRuntimeAttempt {
  provider: string;
  status: 'success' | 'failed' | 'skipped_cooldown';
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface AIRuntimeResult {
  role: AIRuntimeRole;
  selectedProvider: string | null;
  output: string | null;
  failed: boolean;
  attempts: AIRuntimeAttempt[];
}

export interface AIRuntimeProviderState {
  provider: string;
  cooldownUntil: string | null;
}

export interface AIRuntimeProfile {
  role: AIRuntimeRole;
  providers: string[];
}

export interface AIRuntimeRunInput {
  role: AIRuntimeRole;
  prompt: string;
  timeoutMs?: number;
  providersOverride?: string[];
  simulateFailures?: string[];
}

export type AIRuntimeExecutor = (prompt: string) => Promise<{
  output: string;
}>;

export interface AIRuntimeService {
  runWithFailover(input: AIRuntimeRunInput): Promise<AIRuntimeResult>;
  getProfiles(): AIRuntimeProfile[];
  getProviderStates(): AIRuntimeProviderState[];
}

export interface AIRuntimeError extends ServiceError {
  code: string;
}
