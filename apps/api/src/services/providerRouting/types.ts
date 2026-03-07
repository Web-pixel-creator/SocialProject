export const PROVIDER_LANES = [
  'voice_live',
  'voice_render',
  'grounded_research',
  'image_edit',
  'long_context',
  'browser_operator',
] as const;

export type ProviderLane = (typeof PROVIDER_LANES)[number];

export const PROVIDER_LANE_STAGES = ['ga', 'pilot', 'planned'] as const;
export type ProviderLaneStage = (typeof PROVIDER_LANE_STAGES)[number];

export const PROVIDER_LANE_PROVIDER_ROLES = [
  'primary',
  'fallback',
  'secondary',
  'budget',
  'requested',
] as const;
export type ProviderLaneProviderRole = (typeof PROVIDER_LANE_PROVIDER_ROLES)[number];

export const PROVIDER_LANE_EXECUTION_STATUSES = ['ok', 'failed'] as const;
export type ProviderLaneExecutionStatus = (typeof PROVIDER_LANE_EXECUTION_STATUSES)[number];

export type ProviderLaneExecutionUserType = 'admin' | 'agent' | 'observer' | 'system';

export interface ProviderLaneProviderConfig {
  provider: string;
  model: string | null;
  role: ProviderLaneProviderRole;
}

export interface ProviderLaneConfig {
  stage: ProviderLaneStage;
  grounded: boolean;
  cacheEligible: boolean;
  budgetCapUsd: number | null;
  providers: ProviderLaneProviderConfig[];
}

export interface ProviderLaneRouteProvider extends ProviderLaneProviderConfig {
  enabled: boolean;
}

export interface ProviderLaneRoute extends ProviderLaneConfig {
  lane: ProviderLane;
  disabledProviders: string[];
  providers: ProviderLaneRouteProvider[];
  resolvedProviders: ProviderLaneProviderConfig[];
}

export interface ProviderLaneResolvedRoute extends ProviderLaneRoute {
  requestedProviders: string[];
}

export interface ProviderLaneResolveInput {
  lane: ProviderLane;
  preferredProviders?: string[] | null;
}

export interface ProviderLaneExecutionRecordInput {
  lane: ProviderLane;
  provider: string | null;
  model?: string | null;
  status: ProviderLaneExecutionStatus;
  durationMs: number | null;
  operation: string;
  userType?: ProviderLaneExecutionUserType | null;
  userId?: string | null;
  draftId?: string | null;
  metadata?: Record<string, unknown>;
  route?: ProviderLaneResolvedRoute | null;
}

export interface ProviderLaneTelemetryFilters {
  hours: number;
  lane?: ProviderLane | null;
  provider?: string | null;
  status?: ProviderLaneExecutionStatus | null;
  limit: number;
}

export interface ProviderLaneTelemetrySummary {
  total: number;
  okCount: number;
  failedCount: number;
  successRate: number | null;
  avgTimingMs: number | null;
  p95TimingMs: number | null;
  lastEventAt: string | null;
}

export interface ProviderLaneTelemetryLaneBreakdown {
  lane: string;
  total: number;
  okCount: number;
  failedCount: number;
  successRate: number | null;
  avgTimingMs: number | null;
  lastEventAt: string | null;
}

export interface ProviderLaneTelemetryProviderBreakdown {
  provider: string;
  total: number;
  okCount: number;
  failedCount: number;
  successRate: number | null;
  avgTimingMs: number | null;
  lastEventAt: string | null;
}

export interface ProviderLaneTelemetryOperationBreakdown {
  operation: string;
  total: number;
  okCount: number;
  failedCount: number;
  successRate: number | null;
  avgTimingMs: number | null;
  lastEventAt: string | null;
}

export interface ProviderLaneRecentExecution {
  createdAt: string | null;
  status: string | null;
  timingMs: number | null;
  userType: string | null;
  userId: string | null;
  lane: string;
  provider: string;
  model: string | null;
  operation: string;
  metadata: Record<string, unknown>;
}

export interface ProviderLaneTelemetrySnapshot {
  windowHours: number;
  filters: {
    lane: ProviderLane | null;
    provider: string | null;
    status: ProviderLaneExecutionStatus | null;
    limit: number;
  };
  summary: ProviderLaneTelemetrySummary;
  byLane: ProviderLaneTelemetryLaneBreakdown[];
  byProvider: ProviderLaneTelemetryProviderBreakdown[];
  byOperation: ProviderLaneTelemetryOperationBreakdown[];
  recent: ProviderLaneRecentExecution[];
}

export interface ProviderRoutingService {
  getLaneRoutes(): ProviderLaneRoute[];
  resolveRoute(input: ProviderLaneResolveInput): ProviderLaneResolvedRoute;
  recordExecution(input: ProviderLaneExecutionRecordInput): Promise<void>;
  getTelemetrySnapshot(
    filters: ProviderLaneTelemetryFilters,
  ): Promise<ProviderLaneTelemetrySnapshot>;
}
