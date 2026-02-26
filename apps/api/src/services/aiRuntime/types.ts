import type { ServiceError } from '../common/errors';

export type AIRuntimeRole = 'author' | 'critic' | 'maker' | 'judge';

export interface AIRuntimeAttempt {
  provider: string;
  authProfile: string;
  status: 'success' | 'failed' | 'skipped_cooldown';
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface AIRuntimeResult {
  role: AIRuntimeRole;
  selectedProvider: string | null;
  selectedAuthProfile: string | null;
  output: string | null;
  failed: boolean;
  attempts: AIRuntimeAttempt[];
}

export interface AIRuntimeAuthProfileState {
  profile: string;
  cooldownUntil: string | null;
  coolingDown: boolean;
  lastFailureCode: string | null;
}

export interface AIRuntimeProviderState {
  provider: string;
  cooldownUntil: string | null;
  coolingDown: boolean;
  activeProfile: string | null;
  lastFailureCode: string | null;
  profiles: AIRuntimeAuthProfileState[];
}

export interface AIRuntimeProfile {
  role: AIRuntimeRole;
  providers: string[];
}

export interface AIRuntimeProviderHealthState {
  provider: string;
  cooldownUntil: string | null;
  coolingDown: boolean;
  activeProfile: string | null;
  lastFailureCode: string | null;
  profiles: AIRuntimeAuthProfileState[];
}

export interface AIRuntimeRoleHealthState {
  role: AIRuntimeRole;
  providers: string[];
  availableProviders: string[];
  blockedProviders: string[];
  hasAvailableProvider: boolean;
}

export interface AIRuntimeHealthSnapshot {
  generatedAt: string;
  roleStates: AIRuntimeRoleHealthState[];
  providers: AIRuntimeProviderHealthState[];
  summary: {
    roleCount: number;
    providerCount: number;
    rolesBlocked: number;
    providersCoolingDown: number;
    providersReady: number;
    health: 'degraded' | 'ok';
  };
}

export interface AIRuntimeRunInput {
  role: AIRuntimeRole;
  prompt: string;
  timeoutMs?: number;
  providersOverride?: string[];
  simulateFailures?: string[];
  mutateProviderState?: boolean;
}

export type AIRuntimeExecutor = (prompt: string) => Promise<{
  output: string;
}>;

export interface AIRuntimeService {
  runWithFailover(input: AIRuntimeRunInput): Promise<AIRuntimeResult>;
  getProfiles(): AIRuntimeProfile[];
  getProviderStates(): AIRuntimeProviderState[];
  getHealthSnapshot(): AIRuntimeHealthSnapshot;
  resetProviderState(): void;
}

export interface AIRuntimeError extends ServiceError {
  code: string;
}
