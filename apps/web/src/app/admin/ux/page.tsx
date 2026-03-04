import { AdminUxPanelChrome } from './components/admin-ux-panel-chrome';
import {
  buildEngagementHealthSignals,
  buildPanelTabsView,
  buildStickyKpisView,
  buildTopSegmentsView,
} from './components/admin-ux-view-models';
import { DebugDiagnosticsSection } from './components/debug-diagnostics-section';
import {
  EngagementHealthSection,
  EngagementOverviewSection,
  FeedInteractionCountersSection,
  FeedPreferenceKpisSection,
  TopSegmentsSection,
} from './components/engagement-sections';
import {
  GatewayPanels,
  RuntimePanel,
} from './components/gateway-runtime-panels';
import { MultimodalTelemetrySection } from './components/multimodal-telemetry-section';
import { PredictionMarketSection } from './components/prediction-market-section';
import { ReleaseHealthSection } from './components/release-health-section';
import {
  StyleFusionMetricsSection,
  type StyleFusionMetricsView,
} from './components/style-fusion-metrics-section';
import {
  BreakdownListCard,
  GatewayCompactionHourlyTrendCard,
  GatewayTelemetryThresholdsCard,
  HourlyTrendCard,
  PredictionHourlyTrendCard,
  ReleaseHealthAlertHourlyTrendCard,
} from './components/telemetry-shared-cards';

interface ObserverEngagementResponse {
  windowHours: number;
  kpis?: {
    observerSessionTimeSec?: number | null;
    sessionCount?: number | null;
    followRate?: number | null;
    digestOpenRate?: number | null;
    return24h?: number | null;
    return7d?: number | null;
    viewModeObserverRate?: number | null;
    viewModeFocusRate?: number | null;
    densityComfortRate?: number | null;
    densityCompactRate?: number | null;
    hintDismissRate?: number | null;
    predictionParticipationRate?: number | null;
    predictionAccuracyRate?: number | null;
    predictionSettlementRate?: number | null;
    predictionFilterSwitchShare?: number | null;
    predictionSortSwitchShare?: number | null;
    predictionNonDefaultSortRate?: number | null;
    predictionPoolPoints?: number | null;
    payoutToStakeRatio?: number | null;
    multimodalCoverageRate?: number | null;
    multimodalErrorRate?: number | null;
    releaseHealthAlertCount?: number | null;
    releaseHealthFirstAppearanceCount?: number | null;
    releaseHealthAlertedRunCount?: number | null;
  };
  releaseHealthAlerts?: {
    totalAlerts?: number;
    uniqueRuns?: number;
    firstAppearanceCount?: number;
    byChannel?: Array<{
      channel?: string;
      count?: number;
      rate?: number | null;
    }>;
    byFailureMode?: Array<{
      failureMode?: string;
      count?: number;
      rate?: number | null;
    }>;
    hourlyTrend?: Array<{
      hour?: string;
      alerts?: number;
      firstAppearances?: number;
    }>;
    latest?: {
      receivedAtUtc?: string | null;
      runId?: number | null;
      runNumber?: number | null;
      runUrl?: string | null;
    } | null;
  };
  predictionMarket?: {
    totals?: {
      predictions?: number;
      predictors?: number;
      markets?: number;
      stakePoints?: number;
      payoutPoints?: number;
      averageStakePoints?: number | null;
      resolvedPredictions?: number;
      correctPredictions?: number;
    };
    outcomes?: Array<{
      predictedOutcome?: string;
      predictions?: number;
      stakePoints?: number;
    }>;
    cohorts?: {
      byOutcome?: Array<{
        predictedOutcome?: string;
        predictions?: number;
        resolvedPredictions?: number;
        correctPredictions?: number;
        settlementRate?: number | null;
        accuracyRate?: number | null;
        netPoints?: number;
      }>;
      byStakeBand?: Array<{
        stakeBand?: string;
        predictions?: number;
        resolvedPredictions?: number;
        correctPredictions?: number;
        settlementRate?: number | null;
        accuracyRate?: number | null;
        netPoints?: number;
      }>;
    };
    hourlyTrend?: Array<{
      hour?: string;
      predictions?: number;
      predictors?: number;
      markets?: number;
      stakePoints?: number;
      payoutPoints?: number;
      avgStakePoints?: number | null;
      resolvedPredictions?: number;
      correctPredictions?: number;
      accuracyRate?: number | null;
      payoutToStakeRatio?: number | null;
    }>;
    resolutionWindows?: {
      d7?: {
        days?: number;
        predictors?: number;
        resolvedPredictions?: number;
        correctPredictions?: number;
        accuracyRate?: number | null;
        netPoints?: number;
        riskLevel?: string | null;
      };
      d30?: {
        days?: number;
        predictors?: number;
        resolvedPredictions?: number;
        correctPredictions?: number;
        accuracyRate?: number | null;
        netPoints?: number;
        riskLevel?: string | null;
      };
    };
    thresholds?: {
      resolutionWindows?: {
        accuracyRate?: {
          criticalBelow?: number;
          watchBelow?: number;
        };
        minResolvedPredictions?: number;
      };
      cohorts?: {
        settlementRate?: {
          criticalBelow?: number;
          watchBelow?: number;
        };
        accuracyRate?: {
          criticalBelow?: number;
          watchBelow?: number;
        };
        minResolvedPredictions?: number;
      };
    };
  };
  predictionFilterTelemetry?: {
    totalSwitches?: number;
    byScope?: Array<{
      scope?: string;
      count?: number;
      rate?: number | null;
    }>;
    byFilter?: Array<{
      filter?: string;
      count?: number;
      rate?: number | null;
    }>;
    byScopeAndFilter?: Array<{
      scope?: string;
      filter?: string;
      count?: number;
    }>;
  };
  predictionSortTelemetry?: {
    totalSwitches?: number;
    byScope?: Array<{
      scope?: string;
      count?: number;
      rate?: number | null;
    }>;
    bySort?: Array<{
      sort?: string;
      count?: number;
      rate?: number | null;
    }>;
    byScopeAndSort?: Array<{
      scope?: string;
      sort?: string;
      count?: number;
    }>;
  };
  predictionHistoryStateTelemetry?: {
    byScope?: Array<{
      scope?: string;
      activeFilter?: string | null;
      activeSort?: string | null;
      filterChangedAt?: string | null;
      sortChangedAt?: string | null;
      lastChangedAt?: string | null;
    }>;
  };
  multimodal?: {
    views?: number;
    emptyStates?: number;
    errors?: number;
    attempts?: number;
    totalEvents?: number;
    coverageRate?: number | null;
    errorRate?: number | null;
    providerBreakdown?: Array<{
      provider?: string;
      count?: number;
    }>;
    emptyReasonBreakdown?: Array<{
      reason?: string;
      count?: number;
    }>;
    errorReasonBreakdown?: Array<{
      reason?: string;
      count?: number;
    }>;
    guardrails?: {
      invalidQueryErrors?: number;
      invalidQueryRate?: number | null;
    };
    hourlyTrend?: Array<{
      hour?: string;
      views?: number;
      emptyStates?: number;
      errors?: number;
      attempts?: number;
      totalEvents?: number;
      coverageRate?: number | null;
      errorRate?: number | null;
    }>;
  };
  feedPreferences?: {
    viewMode?: {
      observer?: number;
      focus?: number;
      unknown?: number;
      total?: number;
      observerRate?: number | null;
      focusRate?: number | null;
      unknownRate?: number | null;
    };
    density?: {
      comfort?: number;
      compact?: number;
      unknown?: number;
      total?: number;
      comfortRate?: number | null;
      compactRate?: number | null;
      unknownRate?: number | null;
    };
    hint?: {
      dismissCount?: number;
      switchCount?: number;
      totalInteractions?: number;
      dismissRate?: number | null;
    };
  };
  segments?: Array<{
    mode?: string;
    draftStatus?: string;
    eventType?: string;
    count?: number;
  }>;
}

interface SimilarSearchMetricsResponse {
  windowHours: number;
  styleFusion?: {
    total?: number;
    success?: number;
    errors?: number;
    successRate?: number | null;
    avgSampleCount?: number | null;
    errorBreakdown?: Array<{
      errorCode?: string;
      count?: number;
    }>;
  };
  styleFusionCopy?: {
    total?: number;
    success?: number;
    errors?: number;
    successRate?: number | null;
    errorBreakdown?: Array<{
      errorCode?: string;
      count?: number;
    }>;
  };
}

interface AgentGatewaySessionListItem {
  id?: unknown;
  channel?: unknown;
  draftId?: unknown;
  draft_id?: unknown;
  status?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
}

interface AgentGatewaySessionListResponse {
  source?: unknown;
  filters?: {
    channel?: unknown;
    provider?: unknown;
    status?: unknown;
  };
  sessions?: AgentGatewaySessionListItem[];
}

interface AgentGatewayTelemetryResponse {
  windowHours?: unknown;
  sampleLimit?: unknown;
  generatedAt?: unknown;
  filters?: {
    channel?: unknown;
    provider?: unknown;
  };
  sessions?: {
    total?: unknown;
    active?: unknown;
    closed?: unknown;
    attention?: unknown;
    compacted?: unknown;
    autoCompacted?: unknown;
    attentionRate?: unknown;
    compactionRate?: unknown;
    autoCompactedRate?: unknown;
  };
  events?: {
    total?: unknown;
    draftCycleStepEvents?: unknown;
    failedStepEvents?: unknown;
    compactionEvents?: unknown;
    autoCompactionEvents?: unknown;
    manualCompactionEvents?: unknown;
    autoCompactionShare?: unknown;
    autoCompactionRiskLevel?: unknown;
    prunedEventCount?: unknown;
    compactionHourlyTrend?: unknown;
    failedStepRate?: unknown;
  };
  attempts?: {
    total?: unknown;
    success?: unknown;
    failed?: unknown;
    skippedCooldown?: unknown;
    successRate?: unknown;
    failureRate?: unknown;
    skippedRate?: unknown;
  };
  health?: {
    level?: unknown;
    failedStepLevel?: unknown;
    runtimeSuccessLevel?: unknown;
    cooldownSkipLevel?: unknown;
    autoCompactionLevel?: unknown;
  };
  thresholds?: {
    autoCompactionShare?: unknown;
    failedStepRate?: unknown;
    runtimeSuccessRate?: unknown;
    cooldownSkipRate?: unknown;
  };
  providerUsage?: Array<{
    provider?: unknown;
    count?: unknown;
  }>;
  channelUsage?: Array<{
    channel?: unknown;
    count?: unknown;
  }>;
}

interface AgentGatewayCompactResponse {
  source?: unknown;
  result?: {
    session?: {
      id?: unknown;
      draftId?: unknown;
      status?: unknown;
    };
    keepRecent?: unknown;
    prunedCount?: unknown;
    totalBefore?: unknown;
    totalAfter?: unknown;
  };
}

interface AgentGatewayCloseResponse {
  source?: unknown;
  session?: {
    id?: unknown;
    draftId?: unknown;
    status?: unknown;
  };
}

interface AgentGatewaySummaryResponse {
  source?: unknown;
  summary?: {
    session?: {
      id?: unknown;
      channel?: unknown;
      draftId?: unknown;
      status?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
    };
    totals?: {
      eventCount?: unknown;
      failedStepCount?: unknown;
      cycleCompletedCount?: unknown;
      cycleFailedCount?: unknown;
      durationMs?: unknown;
    };
    providerUsage?: Record<string, unknown>;
    compaction?: {
      compactCount?: unknown;
      prunedCountTotal?: unknown;
      lastCompactedAt?: unknown;
    };
    lastEvent?: {
      type?: unknown;
      createdAt?: unknown;
    };
  };
}

interface AgentGatewayEventsResponse {
  source?: unknown;
  events?: Array<{
    id?: unknown;
    sessionId?: unknown;
    fromRole?: unknown;
    toRole?: unknown;
    type?: unknown;
    payload?: unknown;
    createdAt?: unknown;
  }>;
}

interface AgentGatewayStatusResponse {
  source?: unknown;
  status?: {
    sessionId?: unknown;
    status?: unknown;
    health?: unknown;
    needsAttention?: unknown;
    eventCount?: unknown;
    lastEventType?: unknown;
  };
}

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

interface AgentGatewayOverview {
  source: string;
  session: {
    id: string;
    channel: string;
    draftId: string;
    status: string;
    updatedAt: string | null;
  };
  summary: {
    totals: {
      eventCount: number;
      failedStepCount: number;
      cycleCompletedCount: number;
      cycleFailedCount: number;
      durationMs: number | null;
    };
    providerUsage: Record<string, number>;
    compaction: {
      compactCount: number;
      prunedCountTotal: number;
      lastCompactedAt: string | null;
    };
    lastEventType: string | null;
  };
  status: {
    health: string;
    needsAttention: boolean;
  };
}

interface AgentGatewayRecentEvent {
  id: string;
  fromRole: string;
  toRole: string;
  type: string;
  createdAt: string;
}

type HealthLevel = 'critical' | 'healthy' | 'unknown' | 'watch';
interface GatewayRiskAboveThresholds {
  criticalAbove: number;
  watchAbove: number;
}
interface GatewayRiskBelowThresholds {
  criticalBelow: number;
  watchBelow: number;
}
interface GatewayTelemetryThresholds {
  autoCompactionShare: GatewayRiskAboveThresholds;
  failedStepRate: GatewayRiskAboveThresholds;
  runtimeSuccessRate: GatewayRiskBelowThresholds;
  cooldownSkipRate: GatewayRiskAboveThresholds;
}
interface MultimodalHourlyTrendItem {
  attempts: number;
  coverageRate: number | null;
  emptyStates: number;
  errorRate: number | null;
  errors: number;
  hour: string;
  totalEvents: number;
  views: number;
}
interface PredictionHourlyTrendItem {
  accuracyRate: number | null;
  avgStakePoints: number;
  correctPredictions: number;
  hour: string;
  markets: number;
  payoutPoints: number;
  payoutToStakeRatio: number | null;
  predictions: number;
  predictors: number;
  resolvedPredictions: number;
  stakePoints: number;
}
interface PredictionResolutionWindowItem {
  accuracyRate: number | null;
  correctPredictions: number;
  days: number;
  netPoints: number;
  predictors: number;
  resolvedPredictions: number;
  riskLevel: HealthLevel | null;
}
interface PredictionResolutionWindowThresholds {
  accuracyRate: {
    criticalBelow: number;
    watchBelow: number;
  };
  minResolvedPredictions: number;
}
interface PredictionCohortRiskThresholds {
  accuracyRate: {
    criticalBelow: number;
    watchBelow: number;
  };
  minResolvedPredictions: number;
  settlementRate: {
    criticalBelow: number;
    watchBelow: number;
  };
}
interface PredictionFilterScopeFilterItem {
  count: number;
  filter: string;
  scope: string;
}
interface PredictionSortScopeSortItem {
  count: number;
  scope: string;
  sort: string;
}
interface PredictionHistoryScopeStateItem {
  activeFilter: string | null;
  activeSort: string | null;
  filterChangedAt: string | null;
  lastChangedAt: string | null;
  scope: string;
  sortChangedAt: string | null;
}
interface PredictionCohortByOutcomeItem {
  accuracyRate: number | null;
  correctPredictions: number;
  netPoints: number;
  predictedOutcome: string;
  predictions: number;
  resolvedPredictions: number;
  settlementRate: number | null;
}
interface PredictionCohortByStakeBandItem {
  accuracyRate: number | null;
  correctPredictions: number;
  netPoints: number;
  predictions: number;
  resolvedPredictions: number;
  settlementRate: number | null;
  stakeBand: string;
}
interface GatewayCompactionHourlyTrendItem {
  autoCompactionShare: number | null;
  autoCompactionRiskLevel: HealthLevel;
  autoCompactions: number;
  compactions: number;
  hour: string;
  manualCompactions: number;
  prunedEventCount: number;
}
interface ReleaseHealthAlertHourlyTrendItem {
  alerts: number;
  firstAppearances: number;
  hour: string;
}

const DEFAULT_API_BASE = 'http://localhost:4000/api';
const TRAILING_SLASH_REGEX = /\/$/;
const PREDICTION_OUTCOME_LABEL_SEGMENT_PATTERN = /[_\s-]+/;
const GATEWAY_CHANNEL_QUERY_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,63}$/;
const GATEWAY_PROVIDER_QUERY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const GATEWAY_SOURCE_QUERY_PATTERN = /^[a-z]+$/;
const GATEWAY_SESSION_STATUS_QUERY_PATTERN = /^[a-z]+$/;
const GATEWAY_EVENT_TYPE_QUERY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const GATEWAY_SOURCE_VALUES = new Set(['db', 'memory']);
const GATEWAY_SESSION_STATUS_VALUES = new Set(['active', 'closed']);
const AI_RUNTIME_ROLES = ['author', 'critic', 'maker', 'judge'] as const;
type AIRuntimeRoleOption = (typeof AI_RUNTIME_ROLES)[number];
const ADMIN_UX_PANELS = [
  'all',
  'gateway',
  'runtime',
  'engagement',
  'prediction',
  'release',
  'style',
  'debug',
] as const;
type AdminUxPanel = (typeof ADMIN_UX_PANELS)[number];
const ADMIN_UX_PANEL_VALUES = new Set<string>(ADMIN_UX_PANELS);
const DEFAULT_GATEWAY_TELEMETRY_THRESHOLDS: GatewayTelemetryThresholds = {
  autoCompactionShare: {
    criticalAbove: 0.8,
    watchAbove: 0.5,
  },
  failedStepRate: {
    criticalAbove: 0.5,
    watchAbove: 0.25,
  },
  runtimeSuccessRate: {
    criticalBelow: 0.5,
    watchBelow: 0.75,
  },
  cooldownSkipRate: {
    criticalAbove: 0.4,
    watchAbove: 0.2,
  },
};
const DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS: PredictionResolutionWindowThresholds =
  {
    accuracyRate: {
      criticalBelow: 0.45,
      watchBelow: 0.6,
    },
    minResolvedPredictions: 3,
  };
const DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS: PredictionCohortRiskThresholds =
  {
    accuracyRate: {
      criticalBelow: 0.45,
      watchBelow: 0.6,
    },
    minResolvedPredictions: 1,
    settlementRate: {
      criticalBelow: 0.4,
      watchBelow: 0.6,
    },
  };

const toNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toStringValue = (value: unknown, fallback = 'n/a'): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

const toRateText = (value: unknown): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
};

const toHealthLevelValue = (value: unknown): HealthLevel | null => {
  if (
    value === 'healthy' ||
    value === 'watch' ||
    value === 'critical' ||
    value === 'unknown'
  ) {
    return value;
  }
  return null;
};

const toFixedText = (value: unknown, digits = 2): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return value.toFixed(digits);
};

const pickFirstFiniteRate = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};
const toNullableIsoTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
};

const normalizeAboveThresholds = (
  value: unknown,
  fallback: GatewayRiskAboveThresholds,
): GatewayRiskAboveThresholds => {
  const row = value && typeof value === 'object' ? value : {};
  const criticalAbove = pickFirstFiniteRate(
    (row as Record<string, unknown>).criticalAbove,
    fallback.criticalAbove,
  );
  const watchAbove = pickFirstFiniteRate(
    (row as Record<string, unknown>).watchAbove,
    fallback.watchAbove,
  );
  return {
    criticalAbove: criticalAbove ?? fallback.criticalAbove,
    watchAbove: watchAbove ?? fallback.watchAbove,
  };
};

const normalizeBelowThresholds = (
  value: unknown,
  fallback: GatewayRiskBelowThresholds,
): GatewayRiskBelowThresholds => {
  const row = value && typeof value === 'object' ? value : {};
  const criticalBelow = pickFirstFiniteRate(
    (row as Record<string, unknown>).criticalBelow,
    fallback.criticalBelow,
  );
  const watchBelow = pickFirstFiniteRate(
    (row as Record<string, unknown>).watchBelow,
    fallback.watchBelow,
  );
  return {
    criticalBelow: criticalBelow ?? fallback.criticalBelow,
    watchBelow: watchBelow ?? fallback.watchBelow,
  };
};

const normalizeGatewayTelemetryThresholds = (
  value: unknown,
): GatewayTelemetryThresholds => {
  const row = value && typeof value === 'object' ? value : {};
  return {
    autoCompactionShare: normalizeAboveThresholds(
      (row as Record<string, unknown>).autoCompactionShare,
      DEFAULT_GATEWAY_TELEMETRY_THRESHOLDS.autoCompactionShare,
    ),
    failedStepRate: normalizeAboveThresholds(
      (row as Record<string, unknown>).failedStepRate,
      DEFAULT_GATEWAY_TELEMETRY_THRESHOLDS.failedStepRate,
    ),
    runtimeSuccessRate: normalizeBelowThresholds(
      (row as Record<string, unknown>).runtimeSuccessRate,
      DEFAULT_GATEWAY_TELEMETRY_THRESHOLDS.runtimeSuccessRate,
    ),
    cooldownSkipRate: normalizeAboveThresholds(
      (row as Record<string, unknown>).cooldownSkipRate,
      DEFAULT_GATEWAY_TELEMETRY_THRESHOLDS.cooldownSkipRate,
    ),
  };
};

const normalizeGatewayTelemetryFilters = (
  value: unknown,
): { channel: string | null; provider: string | null } => {
  const row = value && typeof value === 'object' ? value : {};
  return {
    channel: parseOptionalFilteredQueryString(
      (row as Record<string, unknown>).channel,
      {
        maxLength: 64,
        pattern: GATEWAY_CHANNEL_QUERY_PATTERN,
      },
    ),
    provider: parseOptionalFilteredQueryString(
      (row as Record<string, unknown>).provider,
      {
        maxLength: 64,
        pattern: GATEWAY_PROVIDER_QUERY_PATTERN,
      },
    ),
  };
};

const normalizeGatewaySessionFilters = (
  value: unknown,
): {
  channel: string | null;
  provider: string | null;
  status: string | null;
} => {
  const row = value && typeof value === 'object' ? value : {};
  const status = parseOptionalFilteredQueryString(
    (row as Record<string, unknown>).status,
    {
      maxLength: 16,
      pattern: GATEWAY_SESSION_STATUS_QUERY_PATTERN,
    },
  );
  return {
    channel: parseOptionalFilteredQueryString(
      (row as Record<string, unknown>).channel,
      {
        maxLength: 64,
        pattern: GATEWAY_CHANNEL_QUERY_PATTERN,
      },
    ),
    provider: parseOptionalFilteredQueryString(
      (row as Record<string, unknown>).provider,
      {
        maxLength: 64,
        pattern: GATEWAY_PROVIDER_QUERY_PATTERN,
      },
    ),
    status: status && GATEWAY_SESSION_STATUS_VALUES.has(status) ? status : null,
  };
};

const normalizeBreakdownItems = ({
  items,
  countName,
  keyName,
}: {
  countName?: string;
  items: unknown;
  keyName: string;
}): Array<{ count: number; key: string }> => {
  if (!Array.isArray(items)) {
    return [];
  }
  const resolvedCountName = countName ?? 'count';
  return items.map((item, index) => {
    const row = item && typeof item === 'object' ? item : {};
    const key = toStringValue(
      (row as Record<string, unknown>)[keyName],
      `unknown-${index + 1}`,
    );
    const count = toNumber((row as Record<string, unknown>)[resolvedCountName]);
    return { key, count };
  });
};

const formatPredictionOutcomeMetricLabel = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'merge') {
    return 'Merge';
  }
  if (normalized === 'reject') {
    return 'Reject';
  }
  if (normalized.length === 0) {
    return 'Unknown';
  }
  return normalized
    .split(PREDICTION_OUTCOME_LABEL_SEGMENT_PATTERN)
    .filter((segment) => segment.length > 0)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ');
};

const normalizeHourlyTrendItems = (
  items: unknown,
): MultimodalHourlyTrendItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const row = item && typeof item === 'object' ? item : {};
      return {
        hour: toStringValue(
          (row as Record<string, unknown>).hour,
          'unknown-hour',
        ),
        views: toNumber((row as Record<string, unknown>).views),
        emptyStates: toNumber((row as Record<string, unknown>).emptyStates),
        errors: toNumber((row as Record<string, unknown>).errors),
        attempts: toNumber((row as Record<string, unknown>).attempts),
        totalEvents: toNumber((row as Record<string, unknown>).totalEvents),
        coverageRate: pickFirstFiniteRate(
          (row as Record<string, unknown>).coverageRate,
        ),
        errorRate: pickFirstFiniteRate(
          (row as Record<string, unknown>).errorRate,
        ),
      };
    })
    .sort((left, right) => left.hour.localeCompare(right.hour));
};

const normalizeReleaseHealthAlertHourlyTrendItems = (
  items: unknown,
): ReleaseHealthAlertHourlyTrendItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const row = item && typeof item === 'object' ? item : {};
      return {
        hour: toStringValue(
          (row as Record<string, unknown>).hour,
          'unknown-hour',
        ),
        alerts: toNumber((row as Record<string, unknown>).alerts),
        firstAppearances: toNumber(
          (row as Record<string, unknown>).firstAppearances,
        ),
      };
    })
    .sort((left, right) => left.hour.localeCompare(right.hour));
};

const normalizePredictionHourlyTrendItems = (
  items: unknown,
): PredictionHourlyTrendItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const row = item && typeof item === 'object' ? item : {};
      return {
        hour: toStringValue(
          (row as Record<string, unknown>).hour,
          'unknown-hour',
        ),
        predictions: toNumber((row as Record<string, unknown>).predictions),
        predictors: toNumber((row as Record<string, unknown>).predictors),
        markets: toNumber((row as Record<string, unknown>).markets),
        stakePoints: toNumber((row as Record<string, unknown>).stakePoints),
        payoutPoints: toNumber((row as Record<string, unknown>).payoutPoints),
        avgStakePoints: toNumber(
          (row as Record<string, unknown>).avgStakePoints,
        ),
        resolvedPredictions: toNumber(
          (row as Record<string, unknown>).resolvedPredictions,
        ),
        correctPredictions: toNumber(
          (row as Record<string, unknown>).correctPredictions,
        ),
        accuracyRate: pickFirstFiniteRate(
          (row as Record<string, unknown>).accuracyRate,
        ),
        payoutToStakeRatio: pickFirstFiniteRate(
          (row as Record<string, unknown>).payoutToStakeRatio,
        ),
      };
    })
    .sort((left, right) => left.hour.localeCompare(right.hour));
};

const normalizePredictionResolutionWindow = (
  value: unknown,
  fallbackDays: number,
): PredictionResolutionWindowItem => {
  const row = value && typeof value === 'object' ? value : {};
  return {
    days: toNumber((row as Record<string, unknown>).days, fallbackDays),
    predictors: toNumber((row as Record<string, unknown>).predictors),
    resolvedPredictions: toNumber(
      (row as Record<string, unknown>).resolvedPredictions,
    ),
    correctPredictions: toNumber(
      (row as Record<string, unknown>).correctPredictions,
    ),
    accuracyRate: pickFirstFiniteRate(
      (row as Record<string, unknown>).accuracyRate,
    ),
    netPoints: toNumber((row as Record<string, unknown>).netPoints),
    riskLevel: toHealthLevelValue((row as Record<string, unknown>).riskLevel),
  };
};

const normalizePredictionResolutionWindowThresholds = (
  value: unknown,
): PredictionResolutionWindowThresholds => {
  const row = value && typeof value === 'object' ? value : {};
  const accuracyRate =
    (row as Record<string, unknown>).accuracyRate &&
    typeof (row as Record<string, unknown>).accuracyRate === 'object'
      ? ((row as Record<string, unknown>).accuracyRate as Record<
          string,
          unknown
        >)
      : {};
  const criticalBelow = pickFirstFiniteRate(
    accuracyRate.criticalBelow,
    DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.accuracyRate.criticalBelow,
  );
  const watchBelow = pickFirstFiniteRate(
    accuracyRate.watchBelow,
    DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.accuracyRate.watchBelow,
  );
  const minResolvedPredictions = toNumber(
    (row as Record<string, unknown>).minResolvedPredictions,
    DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.minResolvedPredictions,
  );
  return {
    accuracyRate: {
      criticalBelow:
        criticalBelow ??
        DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.accuracyRate
          .criticalBelow,
      watchBelow:
        watchBelow ??
        DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.accuracyRate.watchBelow,
    },
    minResolvedPredictions,
  };
};

const normalizePredictionCohortRiskThresholds = (
  value: unknown,
): PredictionCohortRiskThresholds => {
  const row = value && typeof value === 'object' ? value : {};
  const settlementRateSource =
    (row as Record<string, unknown>).settlementRate &&
    typeof (row as Record<string, unknown>).settlementRate === 'object'
      ? ((row as Record<string, unknown>).settlementRate as Record<
          string,
          unknown
        >)
      : {};
  const accuracyRateSource =
    (row as Record<string, unknown>).accuracyRate &&
    typeof (row as Record<string, unknown>).accuracyRate === 'object'
      ? ((row as Record<string, unknown>).accuracyRate as Record<
          string,
          unknown
        >)
      : {};
  const settlementCriticalBelow = pickFirstFiniteRate(
    settlementRateSource.criticalBelow,
    DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS.settlementRate.criticalBelow,
  );
  const settlementWatchBelow = pickFirstFiniteRate(
    settlementRateSource.watchBelow,
    DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS.settlementRate.watchBelow,
  );
  const accuracyCriticalBelow = pickFirstFiniteRate(
    accuracyRateSource.criticalBelow,
    DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS.accuracyRate.criticalBelow,
  );
  const accuracyWatchBelow = pickFirstFiniteRate(
    accuracyRateSource.watchBelow,
    DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS.accuracyRate.watchBelow,
  );
  const minResolvedPredictions = toNumber(
    (row as Record<string, unknown>).minResolvedPredictions,
    DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS.minResolvedPredictions,
  );
  return {
    settlementRate: {
      criticalBelow:
        settlementCriticalBelow ??
        DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS.settlementRate.criticalBelow,
      watchBelow:
        settlementWatchBelow ??
        DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS.settlementRate.watchBelow,
    },
    accuracyRate: {
      criticalBelow:
        accuracyCriticalBelow ??
        DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS.accuracyRate.criticalBelow,
      watchBelow:
        accuracyWatchBelow ??
        DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS.accuracyRate.watchBelow,
    },
    minResolvedPredictions,
  };
};

const normalizePredictionFilterScopeFilterItems = (
  items: unknown,
): PredictionFilterScopeFilterItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const row = item && typeof item === 'object' ? item : {};
      return {
        scope: toStringValue(
          (row as Record<string, unknown>).scope,
          'unknown-scope',
        ),
        filter: toStringValue(
          (row as Record<string, unknown>).filter,
          'unknown-filter',
        ),
        count: toNumber((row as Record<string, unknown>).count),
      };
    })
    .sort(
      (left, right) =>
        left.scope.localeCompare(right.scope) ||
        left.filter.localeCompare(right.filter),
    );
};

const normalizePredictionSortScopeSortItems = (
  items: unknown,
): PredictionSortScopeSortItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const row = item && typeof item === 'object' ? item : {};
      return {
        scope: toStringValue(
          (row as Record<string, unknown>).scope,
          'unknown-scope',
        ),
        sort: toStringValue(
          (row as Record<string, unknown>).sort,
          'unknown-sort',
        ),
        count: toNumber((row as Record<string, unknown>).count),
      };
    })
    .sort(
      (left, right) =>
        left.scope.localeCompare(right.scope) ||
        left.sort.localeCompare(right.sort),
    );
};

const normalizePredictionHistoryScopeStateItems = (
  items: unknown,
): PredictionHistoryScopeStateItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const row = item && typeof item === 'object' ? item : {};
      const activeFilterValue = (row as Record<string, unknown>).activeFilter;
      const activeSortValue = (row as Record<string, unknown>).activeSort;
      return {
        scope: toStringValue(
          (row as Record<string, unknown>).scope,
          'unknown-scope',
        ),
        activeFilter:
          typeof activeFilterValue === 'string' ? activeFilterValue : null,
        activeSort:
          typeof activeSortValue === 'string' ? activeSortValue : null,
        filterChangedAt: toNullableIsoTimestamp(
          (row as Record<string, unknown>).filterChangedAt,
        ),
        sortChangedAt: toNullableIsoTimestamp(
          (row as Record<string, unknown>).sortChangedAt,
        ),
        lastChangedAt: toNullableIsoTimestamp(
          (row as Record<string, unknown>).lastChangedAt,
        ),
      };
    })
    .sort((left, right) => left.scope.localeCompare(right.scope));
};

const normalizePredictionCohortByOutcomeItems = (
  items: unknown,
): PredictionCohortByOutcomeItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const row = item && typeof item === 'object' ? item : {};
      return {
        predictedOutcome: toStringValue(
          (row as Record<string, unknown>).predictedOutcome,
          'unknown-outcome',
        ),
        predictions: toNumber((row as Record<string, unknown>).predictions),
        resolvedPredictions: toNumber(
          (row as Record<string, unknown>).resolvedPredictions,
        ),
        correctPredictions: toNumber(
          (row as Record<string, unknown>).correctPredictions,
        ),
        settlementRate: pickFirstFiniteRate(
          (row as Record<string, unknown>).settlementRate,
        ),
        accuracyRate: pickFirstFiniteRate(
          (row as Record<string, unknown>).accuracyRate,
        ),
        netPoints: toNumber((row as Record<string, unknown>).netPoints),
      };
    })
    .sort((left, right) =>
      left.predictedOutcome.localeCompare(right.predictedOutcome),
    );
};

const normalizePredictionCohortByStakeBandItems = (
  items: unknown,
): PredictionCohortByStakeBandItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const row = item && typeof item === 'object' ? item : {};
      return {
        stakeBand: toStringValue(
          (row as Record<string, unknown>).stakeBand,
          'unknown-band',
        ),
        predictions: toNumber((row as Record<string, unknown>).predictions),
        resolvedPredictions: toNumber(
          (row as Record<string, unknown>).resolvedPredictions,
        ),
        correctPredictions: toNumber(
          (row as Record<string, unknown>).correctPredictions,
        ),
        settlementRate: pickFirstFiniteRate(
          (row as Record<string, unknown>).settlementRate,
        ),
        accuracyRate: pickFirstFiniteRate(
          (row as Record<string, unknown>).accuracyRate,
        ),
        netPoints: toNumber((row as Record<string, unknown>).netPoints),
      };
    })
    .sort((left, right) => left.stakeBand.localeCompare(right.stakeBand));
};

const normalizeGatewayCompactionHourlyTrendItems = (
  items: unknown,
  thresholds: GatewayRiskAboveThresholds,
): GatewayCompactionHourlyTrendItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const row = item && typeof item === 'object' ? item : {};
      const autoCompactionShare = pickFirstFiniteRate(
        (row as Record<string, unknown>).autoCompactionShare,
      );
      const autoCompactionRiskLevel =
        toHealthLevelValue(
          (row as Record<string, unknown>).autoCompactionRiskLevel,
        ) ?? resolveRiskHealthLevel(autoCompactionShare, thresholds);
      return {
        hour: toStringValue(
          (row as Record<string, unknown>).hour,
          'unknown-hour',
        ),
        compactions: toNumber((row as Record<string, unknown>).compactions),
        autoCompactions: toNumber(
          (row as Record<string, unknown>).autoCompactions,
        ),
        manualCompactions: toNumber(
          (row as Record<string, unknown>).manualCompactions,
        ),
        prunedEventCount: toNumber(
          (row as Record<string, unknown>).prunedEventCount,
        ),
        autoCompactionShare,
        autoCompactionRiskLevel,
      };
    })
    .sort((left, right) => left.hour.localeCompare(right.hour));
};

const toDurationText = (value: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 'n/a';
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  return `${(value / 1000).toFixed(1)}s`;
};

const parseCsvQuery = (value: unknown): string[] => {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const parseOptionalFilteredQueryString = (
  value: unknown,
  {
    maxLength,
    pattern,
  }: {
    maxLength: number;
    pattern: RegExp;
  },
): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > maxLength) {
    return null;
  }
  return pattern.test(normalized) ? normalized : null;
};

const parseOptionalGatewayStatusScope = (value: unknown): string | null => {
  const parsed = parseOptionalFilteredQueryString(value, {
    maxLength: 16,
    pattern: GATEWAY_SESSION_STATUS_QUERY_PATTERN,
  });
  if (!(parsed && GATEWAY_SESSION_STATUS_VALUES.has(parsed))) {
    return null;
  }
  return parsed;
};

const parseOptionalGatewaySourceScope = (value: unknown): string | null => {
  const parsed = parseOptionalFilteredQueryString(value, {
    maxLength: 16,
    pattern: GATEWAY_SOURCE_QUERY_PATTERN,
  });
  if (!(parsed && GATEWAY_SOURCE_VALUES.has(parsed))) {
    return null;
  }
  return parsed;
};

const formatGatewayScopeLabel = ({
  channel,
  provider,
  status,
}: {
  channel: string | null;
  provider: string | null;
  status: string | null;
}): string | null => {
  const parts = [
    channel ? `channel ${channel}` : null,
    provider ? `provider ${provider}` : null,
    status ? `status ${status}` : null,
  ].filter((item): item is string => item !== null);
  if (parts.length === 0) {
    return null;
  }
  return parts.join(' | ');
};

const resolveGatewaySessionScope = ({
  queryChannel,
  queryProvider,
  queryStatus,
  sessionFilters,
}: {
  queryChannel: string | null;
  queryProvider: string | null;
  queryStatus: string | null;
  sessionFilters: {
    channel: string | null;
    provider: string | null;
    status: string | null;
  };
}): {
  channel: string | null;
  provider: string | null;
  status: string | null;
  statusInputValue: string;
  statusLabel: string;
  label: string;
} => {
  const channel = sessionFilters.channel ?? queryChannel;
  const provider = sessionFilters.provider ?? queryProvider;
  const status = sessionFilters.status ?? queryStatus;
  return {
    channel,
    provider,
    status,
    statusInputValue: status ?? '',
    statusLabel: status ?? 'all',
    label: formatGatewayScopeLabel({ channel, provider, status }) ?? 'all',
  };
};

const resolveGatewayEventsRequestFilters = ({
  eventType,
  sessionFilters,
  queryProvider,
}: {
  eventType: string;
  sessionFilters: {
    provider: string | null;
  };
  queryProvider: string | null;
}): {
  eventType: string | null;
  provider: string | null;
} => ({
  eventType: eventType === 'all' ? null : eventType,
  provider: sessionFilters.provider ?? queryProvider,
});

const resolveAdminUxPanel = (value: unknown): AdminUxPanel => {
  if (typeof value !== 'string') {
    return 'gateway';
  }
  const normalized = value.trim().toLowerCase();
  if (!ADMIN_UX_PANEL_VALUES.has(normalized)) {
    return 'gateway';
  }
  return normalized as AdminUxPanel;
};

type AdminUxPageSearchParams =
  | Record<string, string | string[] | undefined>
  | undefined;

const resolveGatewayQueryState = (
  resolvedSearchParams: AdminUxPageSearchParams,
) => {
  const gatewayChannelFilter = parseOptionalFilteredQueryString(
    resolvedSearchParams?.gatewayChannel,
    {
      maxLength: 64,
      pattern: GATEWAY_CHANNEL_QUERY_PATTERN,
    },
  );
  const gatewayProviderFilter = parseOptionalFilteredQueryString(
    resolvedSearchParams?.gatewayProvider,
    {
      maxLength: 64,
      pattern: GATEWAY_PROVIDER_QUERY_PATTERN,
    },
  );
  const gatewaySourceFilter = parseOptionalGatewaySourceScope(
    resolvedSearchParams?.gatewaySource,
  );
  const gatewayStatusFilter = parseOptionalGatewayStatusScope(
    resolvedSearchParams?.gatewayStatus,
  );

  const rawSessionId = resolvedSearchParams?.session;
  const sessionIdFromQuery =
    typeof rawSessionId === 'string' && rawSessionId.trim().length > 0
      ? rawSessionId.trim()
      : null;
  const compactRequested = isTruthyQueryFlag(resolvedSearchParams?.compact);
  const closeRequested = isTruthyQueryFlag(resolvedSearchParams?.close);

  const rawKeepRecent = resolvedSearchParams?.keepRecent;
  const keepRecentFromQuery =
    typeof rawKeepRecent === 'string'
      ? Number.parseInt(rawKeepRecent, 10)
      : Number.NaN;
  const keepRecent =
    Number.isFinite(keepRecentFromQuery) && keepRecentFromQuery > 0
      ? Math.min(Math.max(keepRecentFromQuery, 5), 500)
      : undefined;

  const rawEventsLimit = resolvedSearchParams?.eventsLimit;
  const eventsLimitFromQuery =
    typeof rawEventsLimit === 'string'
      ? Number.parseInt(rawEventsLimit, 10)
      : Number.NaN;
  const eventsLimit =
    Number.isFinite(eventsLimitFromQuery) &&
    [8, 20, 50].includes(eventsLimitFromQuery)
      ? eventsLimitFromQuery
      : 8;

  const rawEventType = resolvedSearchParams?.eventType;
  const eventTypeFilter =
    parseOptionalFilteredQueryString(rawEventType, {
      maxLength: 120,
      pattern: GATEWAY_EVENT_TYPE_QUERY_PATTERN,
    }) ?? 'all';
  const rawEventQuery = resolvedSearchParams?.eventQuery;
  const eventQuery =
    typeof rawEventQuery === 'string' ? rawEventQuery.trim() : '';

  return {
    gatewayChannelFilter,
    gatewayProviderFilter,
    gatewaySourceFilter,
    gatewayStatusFilter,
    sessionIdFromQuery,
    compactRequested,
    closeRequested,
    keepRecent,
    eventsLimit,
    eventTypeFilter,
    eventQuery,
  };
};

const resolveAiRuntimeQueryState = (
  resolvedSearchParams: AdminUxPageSearchParams,
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

const isTruthyQueryFlag = (value: unknown): boolean =>
  value === '1' || value === 'true' || value === 'yes';

const toCsvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const buildEventsCsv = (events: AgentGatewayRecentEvent[]): string => {
  const header = ['id', 'type', 'fromRole', 'toRole', 'createdAt'].join(',');
  const rows = events.map((event) =>
    [
      toCsvCell(event.id),
      toCsvCell(event.type),
      toCsvCell(event.fromRole),
      toCsvCell(event.toRole),
      toCsvCell(event.createdAt),
    ].join(','),
  );
  return [header, ...rows].join('\n');
};

const resolveHealthLevel = (
  value: unknown,
  thresholds: {
    criticalBelow: number;
    watchBelow: number;
  },
): HealthLevel => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'unknown';
  }
  if (value < thresholds.criticalBelow) {
    return 'critical';
  }
  if (value < thresholds.watchBelow) {
    return 'watch';
  }
  return 'healthy';
};

const resolveRiskHealthLevel = (
  value: unknown,
  thresholds: {
    criticalAbove: number;
    watchAbove: number;
  },
): HealthLevel => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'unknown';
  }
  if (value >= thresholds.criticalAbove) {
    return 'critical';
  }
  if (value >= thresholds.watchAbove) {
    return 'watch';
  }
  return 'healthy';
};

const resolveGatewayTelemetryHealthLevel = ({
  autoCompactionRiskLevel,
  failedStepRate,
  runtimeSuccessRate,
  skippedRate,
  thresholds,
}: {
  autoCompactionRiskLevel: HealthLevel;
  failedStepRate: unknown;
  runtimeSuccessRate: unknown;
  skippedRate: unknown;
  thresholds: GatewayTelemetryThresholds;
}): HealthLevel => {
  const failedStepRisk = resolveRiskHealthLevel(
    failedStepRate,
    thresholds.failedStepRate,
  );
  const runtimeSuccessHealth = resolveHealthLevel(
    runtimeSuccessRate,
    thresholds.runtimeSuccessRate,
  );
  const cooldownSkipRisk = resolveRiskHealthLevel(
    skippedRate,
    thresholds.cooldownSkipRate,
  );
  const levels: HealthLevel[] = [
    autoCompactionRiskLevel,
    failedStepRisk,
    runtimeSuccessHealth,
    cooldownSkipRisk,
  ];
  if (levels.includes('critical')) {
    return 'critical';
  }
  if (levels.includes('watch')) {
    return 'watch';
  }
  if (levels.includes('healthy')) {
    return 'healthy';
  }
  return 'unknown';
};

const resolvePredictionResolutionWindowHealthLevel = (
  window: PredictionResolutionWindowItem,
  thresholds: PredictionResolutionWindowThresholds,
): HealthLevel => {
  if (window.riskLevel) {
    return window.riskLevel;
  }
  if (window.resolvedPredictions < thresholds.minResolvedPredictions) {
    return 'unknown';
  }
  return resolveHealthLevel(window.accuracyRate, thresholds.accuracyRate);
};

const resolvePredictionCohortHealthLevel = ({
  accuracyRate,
  resolvedPredictions,
  settlementRate,
  thresholds,
}: {
  accuracyRate: number | null;
  resolvedPredictions: number;
  settlementRate: number | null;
  thresholds: PredictionCohortRiskThresholds;
}): HealthLevel => {
  if (resolvedPredictions < thresholds.minResolvedPredictions) {
    return 'unknown';
  }
  const settlementHealth = resolveHealthLevel(
    settlementRate,
    thresholds.settlementRate,
  );
  const accuracyHealth = resolveHealthLevel(
    accuracyRate,
    thresholds.accuracyRate,
  );
  if (settlementHealth === 'critical' || accuracyHealth === 'critical') {
    return 'critical';
  }
  if (settlementHealth === 'watch' || accuracyHealth === 'watch') {
    return 'watch';
  }
  if (settlementHealth === 'healthy' || accuracyHealth === 'healthy') {
    return 'healthy';
  }
  return 'unknown';
};

const healthLabel = (level: HealthLevel): string => {
  if (level === 'healthy') {
    return 'Healthy';
  }
  if (level === 'watch') {
    return 'Watch';
  }
  if (level === 'critical') {
    return 'Critical';
  }
  return 'n/a';
};

const healthBadgeClass = (level: HealthLevel): string => {
  if (level === 'healthy') {
    return 'tag-success';
  }
  if (level === 'watch') {
    return 'tag-hot';
  }
  if (level === 'critical') {
    return 'tag-alert';
  }
  return 'pill';
};

const deriveAiRuntimeHealthLevel = (
  summary: ReturnType<typeof recomputeAiRuntimeSummary>,
): HealthLevel => {
  if (summary.roleCount === 0 && summary.providerCount === 0) {
    return 'unknown';
  }
  if (summary.rolesBlocked > 0) {
    return 'critical';
  }
  if (summary.providersCoolingDown > 0) {
    return 'watch';
  }
  return summary.health === 'ok' ? 'healthy' : 'watch';
};

const deriveGatewayHealthLevel = (
  overview: AgentGatewayOverview | null,
): HealthLevel => {
  if (!overview) {
    return 'unknown';
  }
  return overview.status.needsAttention ? 'watch' : 'healthy';
};

const RELEASE_HEALTH_ALERT_RISK_THRESHOLDS = {
  alertedRuns: {
    criticalAbove: 2,
    watchAbove: 1,
  },
  firstAppearances: {
    criticalAbove: 3,
    watchAbove: 1,
  },
  totalAlerts: {
    criticalAbove: 3,
    watchAbove: 1,
  },
} as const;

const deriveReleaseHealthAlertRiskLevel = ({
  alertedRuns,
  firstAppearances,
  totalAlerts,
}: {
  alertedRuns: number;
  firstAppearances: number;
  totalAlerts: number;
}): HealthLevel => {
  const levels: HealthLevel[] = [
    resolveRiskHealthLevel(
      firstAppearances,
      RELEASE_HEALTH_ALERT_RISK_THRESHOLDS.firstAppearances,
    ),
    resolveRiskHealthLevel(
      totalAlerts,
      RELEASE_HEALTH_ALERT_RISK_THRESHOLDS.totalAlerts,
    ),
    resolveRiskHealthLevel(
      alertedRuns,
      RELEASE_HEALTH_ALERT_RISK_THRESHOLDS.alertedRuns,
    ),
  ];
  if (levels.includes('critical')) {
    return 'critical';
  }
  if (levels.includes('watch')) {
    return 'watch';
  }
  return 'healthy';
};

const resolveGatewaySessionMutations = async ({
  closeRequested,
  compactRequested,
  selectedSessionClosed,
  selectedSessionId,
  keepRecent,
}: {
  closeRequested: boolean;
  compactRequested: boolean;
  selectedSessionClosed: boolean;
  selectedSessionId: string | null;
  keepRecent?: number;
}) => {
  let compactInfoMessage: string | null = null;
  let compactErrorMessage: string | null = null;
  let closeInfoMessage: string | null = null;
  let closeErrorMessage: string | null = null;

  if (closeRequested && selectedSessionId && selectedSessionClosed) {
    closeInfoMessage = 'Session already closed.';
  } else if (closeRequested && selectedSessionId) {
    const closeResult = await closeAgentGatewaySession(selectedSessionId);
    closeInfoMessage = closeResult.message;
    closeErrorMessage = closeResult.error;
  }

  if (compactRequested && selectedSessionId && selectedSessionClosed) {
    compactErrorMessage = 'Compaction is disabled for closed sessions.';
  } else if (compactRequested && selectedSessionId && !closeRequested) {
    const compactResult = await compactAgentGatewaySession(
      selectedSessionId,
      keepRecent,
    );
    compactInfoMessage = compactResult.message;
    compactErrorMessage = compactResult.error;
  }

  return {
    compactInfoMessage,
    compactErrorMessage,
    closeInfoMessage,
    closeErrorMessage,
  };
};

const apiBaseUrl = (): string =>
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE).replace(
    TRAILING_SLASH_REGEX,
    '',
  );

const adminToken = (): string =>
  process.env.ADMIN_API_TOKEN ??
  process.env.NEXT_ADMIN_API_TOKEN ??
  process.env.FINISHIT_ADMIN_API_TOKEN ??
  '';

const fetchObserverEngagement = async (
  hours: number,
): Promise<{
  data: ObserverEngagementResponse | null;
  error: string | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      data: null,
      error:
        'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.',
    };
  }

  const endpoint = `${apiBaseUrl()}/admin/ux/observer-engagement?hours=${hours}`;

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        'x-admin-token': token,
      },
    });

    if (!response.ok) {
      return {
        data: null,
        error: `Admin API responded with ${response.status}. Check token and api availability.`,
      };
    }

    const payload = (await response.json()) as ObserverEngagementResponse;
    return { data: payload, error: null };
  } catch {
    return {
      data: null,
      error:
        'Unable to reach admin API. Verify NEXT_PUBLIC_API_BASE_URL and api service status.',
    };
  }
};

const fetchSimilarSearchMetrics = async (
  hours: number,
): Promise<{
  data: SimilarSearchMetricsResponse | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      data: null,
    };
  }

  const endpoint = `${apiBaseUrl()}/admin/ux/similar-search?hours=${hours}`;

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        'x-admin-token': token,
      },
    });

    if (!response.ok) {
      return {
        data: null,
      };
    }

    const payload = (await response.json()) as SimilarSearchMetricsResponse;
    return { data: payload };
  } catch {
    return {
      data: null,
    };
  }
};

const fetchAgentGatewaySessions = async (
  limit: number,
  {
    source,
    channel,
    provider,
    status,
  }: {
    source: string | null;
    channel: string | null;
    provider: string | null;
    status: string | null;
  },
): Promise<{
  data: AgentGatewaySessionListItem[];
  error: string | null;
  filters: {
    channel: string | null;
    provider: string | null;
    status: string | null;
  };
  source: string;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      data: [],
      error:
        'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.',
      filters: {
        channel: null,
        provider: null,
        status: null,
      },
      source: 'db',
    };
  }

  const base = apiBaseUrl();
  const requestInit = {
    cache: 'no-store' as const,
    headers: {
      'x-admin-token': token,
    },
  };

  try {
    const queryParams = new URLSearchParams({
      limit: `${Math.max(1, Math.floor(limit))}`,
    });
    if (source) {
      queryParams.set('source', source);
    }
    if (channel) {
      queryParams.set('channel', channel);
    }
    if (provider) {
      queryParams.set('provider', provider);
    }
    if (status) {
      queryParams.set('status', status);
    }
    const sessionsResponse = await fetch(
      `${base}/admin/agent-gateway/sessions?${queryParams.toString()}`,
      requestInit,
    );
    if (!sessionsResponse.ok) {
      return {
        data: [],
        error: `Agent gateway sessions request failed with ${sessionsResponse.status}.`,
        filters: {
          channel: null,
          provider: null,
          status: null,
        },
        source: 'db',
      };
    }
    const sessionsPayload =
      (await sessionsResponse.json()) as AgentGatewaySessionListResponse;
    const sessions = Array.isArray(sessionsPayload.sessions)
      ? sessionsPayload.sessions
      : [];
    return {
      data: sessions,
      error: null,
      filters: normalizeGatewaySessionFilters(sessionsPayload.filters),
      source: toStringValue(sessionsPayload.source, 'db'),
    };
  } catch {
    return {
      data: [],
      error: 'Unable to load agent gateway sessions from admin API.',
      filters: {
        channel: null,
        provider: null,
        status: null,
      },
      source: 'db',
    };
  }
};

const fetchAgentGatewayTelemetry = async (
  hours: number,
  {
    channel,
    provider,
  }: {
    channel: string | null;
    provider: string | null;
  },
): Promise<{
  data: AgentGatewayTelemetryResponse | null;
  error: string | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      data: null,
      error:
        'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.',
    };
  }

  try {
    const queryParams = new URLSearchParams({
      hours: `${Math.max(1, Math.floor(hours))}`,
      limit: '200',
    });
    if (channel) {
      queryParams.set('channel', channel);
    }
    if (provider) {
      queryParams.set('provider', provider);
    }
    const response = await fetch(
      `${apiBaseUrl()}/admin/agent-gateway/telemetry?${queryParams.toString()}`,
      {
        cache: 'no-store',
        headers: {
          'x-admin-token': token,
        },
      },
    );
    if (!response.ok) {
      return {
        data: null,
        error: `Agent gateway telemetry request failed with ${response.status}.`,
      };
    }
    const payload = (await response.json()) as AgentGatewayTelemetryResponse;
    return {
      data: payload,
      error: null,
    };
  } catch {
    return {
      data: null,
      error: 'Unable to load agent gateway telemetry from admin API.',
    };
  }
};

const compactAgentGatewaySession = async (
  sessionId: string,
  keepRecent?: number,
): Promise<{
  message: string | null;
  error: string | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      message: null,
      error:
        'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.',
    };
  }

  const body: Record<string, number> = {};
  if (typeof keepRecent === 'number' && Number.isFinite(keepRecent)) {
    body.keepRecent = Math.max(1, Math.floor(keepRecent));
  }

  try {
    const response = await fetch(
      `${apiBaseUrl()}/admin/agent-gateway/sessions/${encodeURIComponent(sessionId)}/compact`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      return {
        message: null,
        error: `Agent gateway compaction failed with ${response.status}.`,
      };
    }
    const payload = (await response.json()) as AgentGatewayCompactResponse;
    const result = payload.result;
    if (!result) {
      return {
        message: 'Session compacted.',
        error: null,
      };
    }
    const pruned = toNumber(result.prunedCount);
    const before = toNumber(result.totalBefore);
    const after = toNumber(result.totalAfter);
    return {
      message: `Session compacted: pruned ${pruned} (events ${before} -> ${after}).`,
      error: null,
    };
  } catch {
    return {
      message: null,
      error: 'Unable to compact agent gateway session via admin API.',
    };
  }
};

const closeAgentGatewaySession = async (
  sessionId: string,
): Promise<{
  message: string | null;
  error: string | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      message: null,
      error:
        'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.',
    };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl()}/admin/agent-gateway/sessions/${encodeURIComponent(sessionId)}/close`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'x-admin-token': token,
        },
      },
    );
    if (!response.ok) {
      return {
        message: null,
        error: `Agent gateway close request failed with ${response.status}.`,
      };
    }
    const payload = (await response.json()) as AgentGatewayCloseResponse;
    const status = toStringValue(payload.session?.status, 'closed');
    return {
      message: `Session closed (status: ${status}).`,
      error: null,
    };
  } catch {
    return {
      message: null,
      error: 'Unable to close agent gateway session via admin API.',
    };
  }
};

const fetchAgentGatewayRecentEvents = async (
  sessionId: string,
  limit: number,
  {
    source,
    eventType,
    eventQuery,
    provider,
  }: {
    source: string | null;
    eventType: string | null;
    eventQuery: string | null;
    provider: string | null;
  },
): Promise<{
  data: AgentGatewayRecentEvent[] | null;
  error: string | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      data: null,
      error:
        'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.',
    };
  }

  try {
    const params = new URLSearchParams({
      limit: `${Math.max(1, Math.floor(limit))}`,
    });
    if (eventType && eventType !== 'all') {
      params.set('eventType', eventType);
    }
    if (eventQuery) {
      params.set('eventQuery', eventQuery);
    }
    if (provider) {
      params.set('provider', provider);
    }
    if (source) {
      params.set('source', source);
    }
    const response = await fetch(
      `${apiBaseUrl()}/admin/agent-gateway/sessions/${encodeURIComponent(sessionId)}/events?${params.toString()}`,
      {
        cache: 'no-store',
        headers: {
          'x-admin-token': token,
        },
      },
    );
    if (!response.ok) {
      return {
        data: null,
        error: `Agent gateway events request failed with ${response.status}.`,
      };
    }

    const payload = (await response.json()) as AgentGatewayEventsResponse;
    const eventsRaw = Array.isArray(payload.events) ? payload.events : [];
    const events = eventsRaw
      .filter((item): item is NonNullable<(typeof eventsRaw)[number]> =>
        Boolean(item),
      )
      .map((item, index) => ({
        id: toStringValue(item.id, `event-${index + 1}`),
        fromRole: toStringValue(item.fromRole),
        toRole: toStringValue(item.toRole),
        type: toStringValue(item.type),
        createdAt: toStringValue(item.createdAt),
      }));

    return { data: events, error: null };
  } catch {
    return {
      data: null,
      error: 'Unable to load agent gateway events from admin API.',
    };
  }
};

const fetchAgentGatewayOverview = async (
  sessionId: string,
  source: string | null,
): Promise<{
  data: AgentGatewayOverview | null;
  error: string | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      data: null,
      error:
        'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.',
    };
  }

  const base = apiBaseUrl();
  const requestInit = {
    cache: 'no-store' as const,
    headers: {
      'x-admin-token': token,
    },
  };

  try {
    const encodedSessionId = encodeURIComponent(sessionId);
    const queryParams = new URLSearchParams();
    if (source) {
      queryParams.set('source', source);
    }
    const querySuffix =
      queryParams.size > 0 ? `?${queryParams.toString()}` : '';
    const summaryResponse = await fetch(
      `${base}/admin/agent-gateway/sessions/${encodedSessionId}/summary${querySuffix}`,
      requestInit,
    );
    if (!summaryResponse.ok) {
      return {
        data: null,
        error: `Agent gateway summary request failed with ${summaryResponse.status}.`,
      };
    }
    const summaryPayload =
      (await summaryResponse.json()) as AgentGatewaySummaryResponse;

    const statusResponse = await fetch(
      `${base}/admin/agent-gateway/sessions/${encodedSessionId}/status${querySuffix}`,
      requestInit,
    );
    if (!statusResponse.ok) {
      return {
        data: null,
        error: `Agent gateway status request failed with ${statusResponse.status}.`,
      };
    }
    const statusPayload =
      (await statusResponse.json()) as AgentGatewayStatusResponse;

    const providerUsageRaw = summaryPayload.summary?.providerUsage ?? {};
    const providerUsage: Record<string, number> = {};
    for (const [provider, value] of Object.entries(providerUsageRaw)) {
      providerUsage[provider] = toNumber(value, 0);
    }

    return {
      data: {
        source: toStringValue(
          statusPayload.source ?? summaryPayload.source,
          'db',
        ),
        session: {
          id: toStringValue(summaryPayload.summary?.session?.id),
          channel: toStringValue(summaryPayload.summary?.session?.channel),
          draftId: toStringValue(summaryPayload.summary?.session?.draftId),
          status: toStringValue(summaryPayload.summary?.session?.status),
          updatedAt:
            typeof summaryPayload.summary?.session?.updatedAt === 'string'
              ? summaryPayload.summary.session.updatedAt
              : null,
        },
        summary: {
          totals: {
            eventCount: toNumber(summaryPayload.summary?.totals?.eventCount),
            failedStepCount: toNumber(
              summaryPayload.summary?.totals?.failedStepCount,
            ),
            cycleCompletedCount: toNumber(
              summaryPayload.summary?.totals?.cycleCompletedCount,
            ),
            cycleFailedCount: toNumber(
              summaryPayload.summary?.totals?.cycleFailedCount,
            ),
            durationMs:
              typeof summaryPayload.summary?.totals?.durationMs === 'number'
                ? summaryPayload.summary.totals.durationMs
                : null,
          },
          providerUsage,
          compaction: {
            compactCount: toNumber(
              summaryPayload.summary?.compaction?.compactCount,
            ),
            prunedCountTotal: toNumber(
              summaryPayload.summary?.compaction?.prunedCountTotal,
            ),
            lastCompactedAt:
              typeof summaryPayload.summary?.compaction?.lastCompactedAt ===
              'string'
                ? summaryPayload.summary.compaction.lastCompactedAt
                : null,
          },
          lastEventType:
            typeof summaryPayload.summary?.lastEvent?.type === 'string'
              ? summaryPayload.summary.lastEvent.type
              : null,
        },
        status: {
          health: toStringValue(statusPayload.status?.health),
          needsAttention: statusPayload.status?.needsAttention === true,
        },
      },
      error: null,
    };
  } catch {
    return {
      data: null,
      error: 'Unable to load agent gateway overview from admin API.',
    };
  }
};

const fetchAiRuntimeHealth = async (): Promise<{
  generatedAt: string | null;
  roleStates: Array<{
    role: string;
    providers: string[];
    availableProviders: string[];
    blockedProviders: string[];
    hasAvailableProvider: boolean;
  }>;
  providers: Array<{
    provider: string;
    cooldownUntil: string | null;
    coolingDown: boolean;
  }>;
  summary: {
    roleCount: number;
    providerCount: number;
    rolesBlocked: number;
    providersCoolingDown: number;
    providersReady: number;
    health: string;
  };
  error: string | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      generatedAt: null,
      roleStates: [],
      providers: [],
      summary: {
        roleCount: 0,
        providerCount: 0,
        rolesBlocked: 0,
        providersCoolingDown: 0,
        providersReady: 0,
        health: 'unknown',
      },
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
        summary: {
          roleCount: 0,
          providerCount: 0,
          rolesBlocked: 0,
          providersCoolingDown: 0,
          providersReady: 0,
          health: 'unknown',
        },
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
      summary: {
        roleCount: 0,
        providerCount: 0,
        rolesBlocked: 0,
        providersCoolingDown: 0,
        providersReady: 0,
        health: 'unknown',
      },
      error: 'Unable to load AI runtime health from admin API.',
    };
  }
};

const recomputeAiRuntimeSummary = (input: {
  roleStates: Array<{
    role: string;
    providers: string[];
    hasAvailableProvider: boolean;
  }>;
  providers: Array<{
    provider: string;
    coolingDown: boolean;
  }>;
}) => {
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

const runAiRuntimeDryRun = async (input: {
  role: AIRuntimeRoleOption;
  prompt: string;
  providersOverride: string[];
  simulateFailures: string[];
  timeoutMs?: number;
}): Promise<{
  result: {
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
  } | null;
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
    role: input.role,
    prompt: input.prompt,
  };
  if (input.providersOverride.length > 0) {
    body.providersOverride = input.providersOverride;
  }
  if (input.simulateFailures.length > 0) {
    body.simulateFailures = input.simulateFailures;
  }
  if (typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs)) {
    body.timeoutMs = Math.max(250, Math.floor(input.timeoutMs));
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

interface AIRuntimeProviderViewState {
  provider: string;
  cooldownUntil: string | null;
  coolingDown: boolean;
}

const resolveAiRuntimeDryRunState = async (input: {
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
  result: Awaited<ReturnType<typeof runAiRuntimeDryRun>>['result'];
}> => {
  if (!input.requested) {
    return {
      providers: input.providersBase,
      infoMessage: null,
      errorMessage: null,
      result: null,
    };
  }

  const dryRun = await runAiRuntimeDryRun({
    role: input.role,
    prompt: input.prompt,
    providersOverride: input.providersOverride,
    simulateFailures: input.simulateFailures,
    timeoutMs: input.timeoutMs,
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
      : input.providersBase;

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

const normalizeStyleFusionErrorBreakdown = (
  items: unknown,
): Array<{ count: number; errorCode: string }> => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((entry, index) => {
    const row = entry && typeof entry === 'object' ? entry : {};
    return {
      errorCode: toStringValue(
        (row as Record<string, unknown>).errorCode,
        `unknown-${index + 1}`,
      ),
      count: toNumber((row as Record<string, unknown>).count),
    };
  });
};

const normalizeStyleFusionMetrics = (
  payload: SimilarSearchMetricsResponse | null,
): StyleFusionMetricsView => {
  const styleFusion = payload?.styleFusion ?? {};
  const styleFusionCopy = payload?.styleFusionCopy ?? {};
  return {
    total: toNumber(styleFusion.total),
    success: toNumber(styleFusion.success),
    errors: toNumber(styleFusion.errors),
    successRate:
      typeof styleFusion.successRate === 'number' &&
      Number.isFinite(styleFusion.successRate)
        ? styleFusion.successRate
        : null,
    avgSampleCount:
      typeof styleFusion.avgSampleCount === 'number' &&
      Number.isFinite(styleFusion.avgSampleCount)
        ? styleFusion.avgSampleCount
        : null,
    errorBreakdown: normalizeStyleFusionErrorBreakdown(
      styleFusion.errorBreakdown,
    ),
    copy: {
      total: toNumber(styleFusionCopy.total),
      success: toNumber(styleFusionCopy.success),
      errors: toNumber(styleFusionCopy.errors),
      successRate:
        typeof styleFusionCopy.successRate === 'number' &&
        Number.isFinite(styleFusionCopy.successRate)
          ? styleFusionCopy.successRate
          : null,
      errorBreakdown: normalizeStyleFusionErrorBreakdown(
        styleFusionCopy.errorBreakdown,
      ),
    },
  };
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The page intentionally aggregates multiple admin datasets in one SSR entrypoint.
export default async function AdminUxObserverEngagementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawHours = resolvedSearchParams?.hours;
  const parsedHours =
    typeof rawHours === 'string' ? Number.parseInt(rawHours, 10) : 24;
  const hours = Number.isFinite(parsedHours)
    ? Math.min(Math.max(parsedHours, 1), 720)
    : 24;
  const activePanel = resolveAdminUxPanel(resolvedSearchParams?.panel);
  const {
    gatewayChannelFilter,
    gatewayProviderFilter,
    gatewaySourceFilter,
    gatewayStatusFilter,
    sessionIdFromQuery,
    compactRequested,
    closeRequested,
    keepRecent,
    eventsLimit,
    eventTypeFilter,
    eventQuery,
  } = resolveGatewayQueryState(resolvedSearchParams);
  const {
    aiRole,
    aiPrompt,
    aiProvidersCsv,
    aiProvidersOverride,
    aiFailuresCsv,
    aiSimulateFailures,
    aiTimeoutMs,
    aiDryRunRequested,
  } = resolveAiRuntimeQueryState(resolvedSearchParams);

  const { data, error } = await fetchObserverEngagement(hours);
  const { data: similarSearchMetrics } = await fetchSimilarSearchMetrics(hours);

  if (error) {
    return (
      <main className="grid gap-4" id="main-content">
        <header className="card p-4 sm:p-5">
          <h1 className="font-semibold text-foreground text-xl sm:text-2xl">
            Admin UX Metrics
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">{error}</p>
        </header>
      </main>
    );
  }

  const {
    data: gatewaySessions,
    error: gatewaySessionsError,
    filters: gatewaySessionFilters,
    source: gatewaySessionsSource,
  } = await fetchAgentGatewaySessions(25, {
    source: gatewaySourceFilter,
    channel: gatewayChannelFilter,
    provider: gatewayProviderFilter,
    status: gatewayStatusFilter,
  });
  const { data: gatewayTelemetry, error: gatewayTelemetryError } =
    await fetchAgentGatewayTelemetry(hours, {
      channel: gatewayChannelFilter,
      provider: gatewayProviderFilter,
    });
  const {
    generatedAt: aiRuntimeHealthGeneratedAt,
    roleStates: aiRuntimeRoleStatesBase,
    providers: aiRuntimeProvidersBase,
    error: aiRuntimeHealthError,
  } = await fetchAiRuntimeHealth();
  const selectedSession =
    (sessionIdFromQuery
      ? gatewaySessions.find(
          (session) =>
            typeof session.id === 'string' && session.id === sessionIdFromQuery,
        )
      : null) ??
    gatewaySessions[0] ??
    null;
  const selectedSessionId =
    selectedSession && typeof selectedSession.id === 'string'
      ? selectedSession.id
      : null;
  const selectedSessionStatus = toStringValue(selectedSession?.status, '')
    .toLowerCase()
    .trim();
  const selectedSessionClosed = selectedSessionStatus === 'closed';
  const keepRecentValue = keepRecent ?? 40;
  const gatewaySessionSource =
    gatewaySessionsSource === 'memory' ? 'memory' : 'db';
  const gatewayEventsRequestFilters = resolveGatewayEventsRequestFilters({
    eventType: eventTypeFilter,
    sessionFilters: gatewaySessionFilters,
    queryProvider: gatewayProviderFilter,
  });

  const {
    compactInfoMessage,
    compactErrorMessage,
    closeInfoMessage,
    closeErrorMessage,
  } = await resolveGatewaySessionMutations({
    closeRequested,
    compactRequested,
    selectedSessionClosed,
    selectedSessionId,
    keepRecent,
  });

  const { data: gatewayOverview, error: gatewayOverviewError } =
    selectedSessionId !== null
      ? await fetchAgentGatewayOverview(selectedSessionId, gatewaySessionSource)
      : { data: null, error: null };
  const { data: gatewayRecentEvents, error: gatewayEventsError } =
    selectedSessionId !== null
      ? await fetchAgentGatewayRecentEvents(selectedSessionId, eventsLimit, {
          source: gatewaySessionSource,
          eventType: gatewayEventsRequestFilters.eventType,
          eventQuery: eventQuery.length > 0 ? eventQuery : null,
          provider: gatewayEventsRequestFilters.provider,
        })
      : { data: null, error: null };
  const gatewayError =
    closeErrorMessage ??
    compactErrorMessage ??
    gatewaySessionsError ??
    gatewayEventsError ??
    gatewayOverviewError;

  const kpis = data?.kpis ?? {};
  const predictionMarket = data?.predictionMarket ?? {};
  const predictionTotals = predictionMarket.totals ?? {};
  const predictionOutcomesBreakdown = normalizeBreakdownItems({
    countName: 'predictions',
    items: predictionMarket.outcomes,
    keyName: 'predictedOutcome',
  }).map((entry) => ({
    ...entry,
    key: formatPredictionOutcomeMetricLabel(entry.key),
  }));
  const predictionCohorts =
    (predictionMarket as Record<string, unknown>).cohorts ?? {};
  const predictionCohortsByOutcome = normalizePredictionCohortByOutcomeItems(
    (predictionCohorts as Record<string, unknown>).byOutcome,
  );
  const predictionCohortsByStakeBand =
    normalizePredictionCohortByStakeBandItems(
      (predictionCohorts as Record<string, unknown>).byStakeBand,
    );
  const predictionHourlyTrend = normalizePredictionHourlyTrendItems(
    predictionMarket.hourlyTrend,
  );
  const predictionResolutionWindows = predictionMarket.resolutionWindows ?? {};
  const predictionMarketThresholds =
    (predictionMarket as Record<string, unknown>).thresholds &&
    typeof (predictionMarket as Record<string, unknown>).thresholds === 'object'
      ? ((predictionMarket as Record<string, unknown>).thresholds as Record<
          string,
          unknown
        >)
      : {};
  const predictionResolutionWindowThresholds =
    normalizePredictionResolutionWindowThresholds(
      predictionMarketThresholds.resolutionWindows,
    );
  const predictionCohortRiskThresholds =
    normalizePredictionCohortRiskThresholds(predictionMarketThresholds.cohorts);
  const predictionCohortThresholdSummary = `settlement watch < ${toRateText(predictionCohortRiskThresholds.settlementRate.watchBelow)} | settlement critical < ${toRateText(predictionCohortRiskThresholds.settlementRate.criticalBelow)} | accuracy watch < ${toRateText(predictionCohortRiskThresholds.accuracyRate.watchBelow)} | accuracy critical < ${toRateText(predictionCohortRiskThresholds.accuracyRate.criticalBelow)} | min sample: ${predictionCohortRiskThresholds.minResolvedPredictions}`;
  const predictionCohortsByOutcomeWithRisk = predictionCohortsByOutcome.map(
    (entry) => ({
      ...entry,
      riskLevel: resolvePredictionCohortHealthLevel({
        accuracyRate: entry.accuracyRate,
        resolvedPredictions: entry.resolvedPredictions,
        settlementRate: entry.settlementRate,
        thresholds: predictionCohortRiskThresholds,
      }),
    }),
  );
  const predictionCohortsByStakeBandWithRisk = predictionCohortsByStakeBand.map(
    (entry) => ({
      ...entry,
      riskLevel: resolvePredictionCohortHealthLevel({
        accuracyRate: entry.accuracyRate,
        resolvedPredictions: entry.resolvedPredictions,
        settlementRate: entry.settlementRate,
        thresholds: predictionCohortRiskThresholds,
      }),
    }),
  );
  const predictionWindow7d = normalizePredictionResolutionWindow(
    (predictionResolutionWindows as Record<string, unknown>).d7,
    7,
  );
  const predictionWindow30d = normalizePredictionResolutionWindow(
    (predictionResolutionWindows as Record<string, unknown>).d30,
    30,
  );
  const predictionWindow7dRiskLevel =
    resolvePredictionResolutionWindowHealthLevel(
      predictionWindow7d,
      predictionResolutionWindowThresholds,
    );
  const predictionWindow30dRiskLevel =
    resolvePredictionResolutionWindowHealthLevel(
      predictionWindow30d,
      predictionResolutionWindowThresholds,
    );
  const predictionFilterTelemetry = data?.predictionFilterTelemetry ?? {};
  const predictionFilterByScopeBreakdown = normalizeBreakdownItems({
    items: predictionFilterTelemetry.byScope,
    keyName: 'scope',
  });
  const predictionFilterByFilterBreakdown = normalizeBreakdownItems({
    items: predictionFilterTelemetry.byFilter,
    keyName: 'filter',
  });
  const predictionFilterByScopeAndFilter =
    normalizePredictionFilterScopeFilterItems(
      predictionFilterTelemetry.byScopeAndFilter,
    );
  const predictionSortTelemetry = data?.predictionSortTelemetry ?? {};
  const predictionSortByScopeBreakdown = normalizeBreakdownItems({
    items: predictionSortTelemetry.byScope,
    keyName: 'scope',
  });
  const predictionSortBySortBreakdown = normalizeBreakdownItems({
    items: predictionSortTelemetry.bySort,
    keyName: 'sort',
  });
  const predictionSortByScopeAndSort = normalizePredictionSortScopeSortItems(
    predictionSortTelemetry.byScopeAndSort,
  );
  const predictionHistoryStateTelemetry =
    data?.predictionHistoryStateTelemetry ?? {};
  const predictionHistoryScopeStates =
    normalizePredictionHistoryScopeStateItems(
      predictionHistoryStateTelemetry.byScope,
    );
  const multimodal = data?.multimodal ?? {};
  const multimodalCoverageRate = pickFirstFiniteRate(
    multimodal.coverageRate,
    kpis.multimodalCoverageRate,
  );
  const multimodalErrorRate = pickFirstFiniteRate(
    multimodal.errorRate,
    kpis.multimodalErrorRate,
  );
  const multimodalCoverageLevel = resolveHealthLevel(multimodalCoverageRate, {
    criticalBelow: 0.45,
    watchBelow: 0.65,
  });
  const multimodalErrorLevel = resolveRiskHealthLevel(multimodalErrorRate, {
    criticalAbove: 0.2,
    watchAbove: 0.1,
  });
  let multimodalOverallLevel: HealthLevel = 'healthy';
  if (
    multimodalCoverageLevel === 'critical' ||
    multimodalErrorLevel === 'critical'
  ) {
    multimodalOverallLevel = 'critical';
  } else if (
    multimodalCoverageLevel === 'watch' ||
    multimodalErrorLevel === 'watch'
  ) {
    multimodalOverallLevel = 'watch';
  } else if (
    multimodalCoverageLevel === 'unknown' &&
    multimodalErrorLevel === 'unknown'
  ) {
    multimodalOverallLevel = 'unknown';
  }
  const multimodalProviderBreakdown = normalizeBreakdownItems({
    items: multimodal.providerBreakdown,
    keyName: 'provider',
  });
  const multimodalEmptyReasonBreakdown = normalizeBreakdownItems({
    items: multimodal.emptyReasonBreakdown,
    keyName: 'reason',
  });
  const multimodalErrorReasonBreakdown = normalizeBreakdownItems({
    items: multimodal.errorReasonBreakdown,
    keyName: 'reason',
  });
  const multimodalGuardrails = multimodal.guardrails ?? {};
  const multimodalHourlyTrend = normalizeHourlyTrendItems(
    multimodal.hourlyTrend,
  );
  const releaseHealthAlerts = data?.releaseHealthAlerts ?? {};
  const releaseHealthAlertByChannel = normalizeBreakdownItems({
    items: releaseHealthAlerts.byChannel,
    keyName: 'channel',
  });
  const releaseHealthAlertByFailureMode = normalizeBreakdownItems({
    items: releaseHealthAlerts.byFailureMode,
    keyName: 'failureMode',
  });
  const releaseHealthAlertHourlyTrend =
    normalizeReleaseHealthAlertHourlyTrendItems(
      releaseHealthAlerts.hourlyTrend,
    );
  const releaseHealthAlertCount = toNumber(
    releaseHealthAlerts.totalAlerts,
    toNumber(kpis.releaseHealthAlertCount),
  );
  const releaseHealthAlertFirstAppearanceCount = toNumber(
    releaseHealthAlerts.firstAppearanceCount,
    toNumber(kpis.releaseHealthFirstAppearanceCount),
  );
  const releaseHealthAlertedRunCount = toNumber(
    releaseHealthAlerts.uniqueRuns,
    toNumber(kpis.releaseHealthAlertedRunCount),
  );
  const releaseHealthAlertRiskLevel = deriveReleaseHealthAlertRiskLevel({
    alertedRuns: releaseHealthAlertedRunCount,
    firstAppearances: releaseHealthAlertFirstAppearanceCount,
    totalAlerts: releaseHealthAlertCount,
  });
  const releaseHealthAlertLatest =
    releaseHealthAlerts.latest && typeof releaseHealthAlerts.latest === 'object'
      ? (releaseHealthAlerts.latest as {
          receivedAtUtc?: string | null;
          runId?: number | null;
          runNumber?: number | null;
          runUrl?: string | null;
        })
      : null;
  const releaseHealthAlertLatestReceivedAt = toNullableIsoTimestamp(
    releaseHealthAlertLatest?.receivedAtUtc,
  );
  const releaseHealthAlertLatestRunNumber =
    typeof releaseHealthAlertLatest?.runNumber === 'number' &&
    Number.isInteger(releaseHealthAlertLatest.runNumber) &&
    releaseHealthAlertLatest.runNumber > 0
      ? releaseHealthAlertLatest.runNumber
      : null;
  const releaseHealthAlertLatestRunId =
    typeof releaseHealthAlertLatest?.runId === 'number' &&
    Number.isInteger(releaseHealthAlertLatest.runId) &&
    releaseHealthAlertLatest.runId > 0
      ? releaseHealthAlertLatest.runId
      : null;
  let releaseHealthAlertLatestRunLabel = 'n/a';
  if (releaseHealthAlertLatestRunNumber !== null) {
    releaseHealthAlertLatestRunLabel = `#${releaseHealthAlertLatestRunNumber}`;
  } else if (releaseHealthAlertLatestRunId !== null) {
    releaseHealthAlertLatestRunLabel = String(releaseHealthAlertLatestRunId);
  }
  const feedPreferences = data?.feedPreferences ?? {};
  const viewMode = feedPreferences.viewMode ?? {};
  const density = feedPreferences.density ?? {};
  const hint = feedPreferences.hint ?? {};
  const engagementSessionCount = toNumber(kpis.sessionCount);
  const engagementAvgSessionSeconds = toNumber(kpis.observerSessionTimeSec);
  const hasEngagementRateSample = [
    kpis.followRate,
    kpis.digestOpenRate,
    kpis.return24h,
  ].some((rate) => typeof rate === 'number' && Number.isFinite(rate));
  const shouldCompactEngagementOverview =
    engagementSessionCount === 0 &&
    engagementAvgSessionSeconds === 0 &&
    !hasEngagementRateSample;
  const viewModeTotal = toNumber(viewMode.total);
  const densityTotal = toNumber(density.total);
  const hintInteractionTotal = toNumber(hint.totalInteractions);
  const feedPreferenceInteractionTotal =
    viewModeTotal + densityTotal + hintInteractionTotal;
  const hasFeedPreferenceRateSample = [
    kpis.viewModeObserverRate,
    kpis.viewModeFocusRate,
    kpis.densityComfortRate,
    kpis.densityCompactRate,
    kpis.hintDismissRate,
  ].some((rate) => typeof rate === 'number' && Number.isFinite(rate));
  const shouldCompactFeedPreferenceKpis =
    feedPreferenceInteractionTotal === 0 && !hasFeedPreferenceRateSample;
  const shouldCompactFeedPreferenceEvents =
    feedPreferenceInteractionTotal === 0;
  const segments = Array.isArray(data?.segments) ? data?.segments : [];
  const styleFusionMetrics = normalizeStyleFusionMetrics(similarSearchMetrics);
  const styleFusionRiskLevel = resolveHealthLevel(
    styleFusionMetrics.successRate,
    {
      criticalBelow: 0.5,
      watchBelow: 0.7,
    },
  );
  const styleFusionCopyRiskLevel = resolveHealthLevel(
    styleFusionMetrics.copy.successRate,
    {
      criticalBelow: 0.6,
      watchBelow: 0.8,
    },
  );
  const topSegmentsView = buildTopSegmentsView({ segments, toNumber });
  const gatewayProviders = gatewayOverview
    ? Object.entries(gatewayOverview.summary.providerUsage).sort(
        (left, right) => right[1] - left[1],
      )
    : [];
  const gatewayTelemetrySessions = gatewayTelemetry?.sessions ?? {};
  const gatewayTelemetryEvents = gatewayTelemetry?.events ?? {};
  const gatewayTelemetryAttempts = gatewayTelemetry?.attempts ?? {};
  const gatewayTelemetryHealth = gatewayTelemetry?.health ?? {};
  const gatewayTelemetryThresholds = normalizeGatewayTelemetryThresholds(
    gatewayTelemetry?.thresholds,
  );
  const gatewayTelemetryFilters = normalizeGatewayTelemetryFilters(
    gatewayTelemetry?.filters,
  );
  const appliedGatewayChannelFilter =
    gatewayTelemetryFilters.channel ?? gatewayChannelFilter;
  const appliedGatewayProviderFilter =
    gatewayTelemetryFilters.provider ?? gatewayProviderFilter;
  const {
    channel: appliedGatewaySessionChannelFilter,
    provider: appliedGatewaySessionProviderFilter,
    statusInputValue: appliedGatewaySessionStatusInputValue,
    statusLabel: appliedGatewaySessionStatusLabel,
    label: gatewaySessionScopeLabel,
  } = resolveGatewaySessionScope({
    queryChannel: gatewayChannelFilter,
    queryProvider: gatewayProviderFilter,
    queryStatus: gatewayStatusFilter,
    sessionFilters: gatewaySessionFilters,
  });
  const gatewayCompactionHourlyTrend =
    normalizeGatewayCompactionHourlyTrendItems(
      gatewayTelemetryEvents.compactionHourlyTrend,
      gatewayTelemetryThresholds.autoCompactionShare,
    );
  const gatewayTelemetryProviderUsage = normalizeBreakdownItems({
    items: gatewayTelemetry?.providerUsage,
    keyName: 'provider',
  });
  const gatewayTelemetryChannelUsage = normalizeBreakdownItems({
    items: gatewayTelemetry?.channelUsage,
    keyName: 'channel',
  });
  const aiRuntimeDryRunState = await resolveAiRuntimeDryRunState({
    requested: aiDryRunRequested,
    role: aiRole,
    prompt: aiPrompt,
    providersOverride: aiProvidersOverride,
    simulateFailures: aiSimulateFailures,
    timeoutMs: aiTimeoutMs,
    providersBase: aiRuntimeProvidersBase,
  });
  const aiRuntimeProviders = aiRuntimeDryRunState.providers;
  const aiRuntimeDryRunInfoMessage = aiRuntimeDryRunState.infoMessage;
  const aiRuntimeDryRunErrorMessage = aiRuntimeDryRunState.errorMessage;
  const aiRuntimeDryRunResult = aiRuntimeDryRunState.result;
  const aiRuntimeSummary = recomputeAiRuntimeSummary({
    roleStates: aiRuntimeRoleStatesBase,
    providers: aiRuntimeProviders,
  });
  const aiRuntimeHealthLevel = deriveAiRuntimeHealthLevel(aiRuntimeSummary);
  const topGatewayProvider = gatewayProviders[0] ?? null;
  const gatewayHealthLevel = deriveGatewayHealthLevel(gatewayOverview);
  const gatewayAutoCompactionShareLevel =
    toHealthLevelValue(gatewayTelemetryEvents.autoCompactionRiskLevel) ??
    resolveRiskHealthLevel(
      gatewayTelemetryEvents.autoCompactionShare,
      gatewayTelemetryThresholds.autoCompactionShare,
    );
  const gatewayFailedStepLevel =
    toHealthLevelValue(gatewayTelemetryHealth.failedStepLevel) ??
    resolveRiskHealthLevel(
      gatewayTelemetryEvents.failedStepRate,
      gatewayTelemetryThresholds.failedStepRate,
    );
  const gatewayRuntimeSuccessLevel =
    toHealthLevelValue(gatewayTelemetryHealth.runtimeSuccessLevel) ??
    resolveHealthLevel(
      gatewayTelemetryAttempts.successRate,
      gatewayTelemetryThresholds.runtimeSuccessRate,
    );
  const gatewayCooldownSkipLevel =
    toHealthLevelValue(gatewayTelemetryHealth.cooldownSkipLevel) ??
    resolveRiskHealthLevel(
      gatewayTelemetryAttempts.skippedRate,
      gatewayTelemetryThresholds.cooldownSkipRate,
    );
  const gatewayTelemetryHealthLevel = resolveGatewayTelemetryHealthLevel({
    autoCompactionRiskLevel:
      toHealthLevelValue(gatewayTelemetryHealth.autoCompactionLevel) ??
      gatewayAutoCompactionShareLevel,
    failedStepRate: gatewayTelemetryEvents.failedStepRate,
    runtimeSuccessRate: gatewayTelemetryAttempts.successRate,
    skippedRate: gatewayTelemetryAttempts.skippedRate,
    thresholds: gatewayTelemetryThresholds,
  });
  const gatewayTelemetryHealthLevelFromApi = toHealthLevelValue(
    gatewayTelemetryHealth.level,
  );
  const resolvedGatewayTelemetryHealthLevel =
    gatewayTelemetryHealthLevelFromApi ?? gatewayTelemetryHealthLevel;
  const engagementHealthSignals = buildEngagementHealthSignals({
    healthBadgeClass,
    healthLabel,
    kpis,
    resolveHealthLevel,
    toRateText,
  });
  const panelTabs: Array<{
    id: AdminUxPanel;
    label: string;
  }> = [
    { id: 'gateway', label: 'Gateway' },
    { id: 'runtime', label: 'Runtime' },
    { id: 'engagement', label: 'Engagement' },
    { id: 'prediction', label: 'Prediction' },
    { id: 'release', label: 'Release' },
    { id: 'style', label: 'Style' },
    { id: 'debug', label: 'Debug' },
    { id: 'all', label: 'All metrics' },
  ];
  const buildPanelHref = (panel: AdminUxPanel) =>
    `/admin/ux?hours=${hours}&panel=${panel}`;
  const isPanelVisible = (panel: Exclude<AdminUxPanel, 'all'>) =>
    activePanel === 'all' || activePanel === panel;
  const isDebugPanelVisible = activePanel === 'debug';
  const panelTabsView = buildPanelTabsView({
    activePanel,
    buildPanelHref,
    panelTabs,
  });
  const stickyKpisView = buildStickyKpisView({
    healthBadgeClass,
    healthLabel,
    kpis,
    resolveHealthLevel,
    toRateText,
  });
  const releaseBreakdownRows = [
    ...releaseHealthAlertByChannel.map((entry) => ({
      category: 'channel',
      key: entry.key,
      count: entry.count,
    })),
    ...releaseHealthAlertByFailureMode.map((entry) => ({
      category: 'failure mode',
      key: entry.key,
      count: entry.count,
    })),
  ];
  const multimodalBreakdownRows = [
    ...multimodalProviderBreakdown.map((entry) => ({
      category: 'provider',
      key: entry.key,
      count: entry.count,
    })),
    ...multimodalEmptyReasonBreakdown.map((entry) => ({
      category: 'empty reason',
      key: entry.key,
      count: entry.count,
    })),
    ...multimodalErrorReasonBreakdown.map((entry) => ({
      category: 'error reason',
      key: entry.key,
      count: entry.count,
    })),
  ];
  const multimodalStatCards = [
    {
      hint: 'draft detail panels with multimodal score loaded',
      label: 'Views',
      value: `${toNumber(multimodal.views)}`,
    },
    {
      hint: 'draft detail panels where multimodal score is unavailable',
      label: 'Empty states',
      value: `${toNumber(multimodal.emptyStates)}`,
    },
    {
      hint: 'draft detail multimodal load errors',
      label: 'Errors',
      value: `${toNumber(multimodal.errors)}`,
    },
    {
      hint: 'view / (view + empty)',
      label: 'Coverage rate',
      value: toRateText(multimodalCoverageRate),
    },
    {
      hint: 'error / (view + empty + error)',
      label: 'Error rate',
      value: toRateText(multimodalErrorRate),
    },
  ];
  const debugPayload = {
    activePanel,
    filters: {
      gatewayChannelFilter,
      gatewayProviderFilter,
      gatewaySourceFilter,
      gatewayStatusFilter,
    },
    gateway: {
      overview: gatewayOverview,
      telemetry: gatewayTelemetry,
      eventsSample: (gatewayRecentEvents ?? []).slice(0, 10),
    },
    runtime: {
      summary: aiRuntimeSummary,
      providers: aiRuntimeProviders,
      dryRun: aiRuntimeDryRunResult,
    },
    release: {
      latest: releaseHealthAlertLatest,
      counts: {
        releaseHealthAlertCount,
        releaseHealthAlertFirstAppearanceCount,
        releaseHealthAlertedRunCount,
      },
    },
  };
  const debugPayloadText = JSON.stringify(debugPayload, null, 2);
  const debugContextRows: Array<{ label: string; value: string }> = [
    { label: 'Panel', value: activePanel },
    { label: 'Hours', value: `${hours}` },
    {
      label: 'Gateway source',
      value: toStringValue(gatewaySessionsSource, 'n/a'),
    },
    { label: 'Session id', value: selectedSessionId ?? 'n/a' },
    { label: 'Session scope', value: gatewaySessionScopeLabel },
    {
      label: 'Gateway status',
      value: toStringValue(
        gatewayOverview?.session.status ?? selectedSession?.status,
        appliedGatewaySessionStatusLabel,
      ),
    },
    {
      label: 'Runtime health',
      value: toStringValue(aiRuntimeSummary.health, 'n/a'),
    },
    { label: 'Release risk', value: healthLabel(releaseHealthAlertRiskLevel) },
  ];
  const gatewayRiskSignals = [
    {
      id: 'gateway-auto-compaction',
      label: 'Auto compaction risk',
      level: gatewayAutoCompactionShareLevel,
    },
    {
      id: 'gateway-failed-step',
      label: 'Failed-step risk',
      level: gatewayFailedStepLevel,
    },
    {
      id: 'gateway-runtime-success',
      label: 'Runtime success',
      level: gatewayRuntimeSuccessLevel,
    },
    {
      id: 'gateway-cooldown-skip',
      label: 'Cooldown skip risk',
      level: gatewayCooldownSkipLevel,
    },
  ];
  const gatewayRiskSignalsView = gatewayRiskSignals.map((signal) => ({
    badgeClassName: healthBadgeClass(signal.level),
    badgeLabel: healthLabel(signal.level),
    id: signal.id,
    label: signal.label,
  }));
  const gatewayScopeOverridesApplied =
    (gatewaySourceFilter ?? '').length > 0 ||
    (appliedGatewayChannelFilter ?? '').length > 0 ||
    (appliedGatewayProviderFilter ?? '').length > 0 ||
    (appliedGatewaySessionStatusInputValue ?? '').length > 0;
  const gatewayScopeRows: Array<{ key: string; value: string }> = [
    {
      key: 'Source',
      value: gatewaySourceFilter === 'memory' ? 'memory' : 'db',
    },
    {
      key: 'Channel',
      value: appliedGatewayChannelFilter ?? 'all',
    },
    {
      key: 'Provider',
      value: appliedGatewayProviderFilter ?? 'all',
    },
    {
      key: 'Status',
      value: appliedGatewaySessionStatusLabel,
    },
  ];
  const gatewayTelemetryStatCards = [
    {
      hint: 'sessions sampled in current window',
      label: 'Sessions',
      value: `${toNumber(gatewayTelemetrySessions.total)}`,
    },
    {
      hint: 'sessions with failed steps or failed cycles',
      label: 'Attention sessions',
      value: `${toNumber(gatewayTelemetrySessions.attention)}`,
    },
    {
      hint: 'sessions with at least one compaction event',
      label: 'Compacted sessions',
      value: `${toNumber(gatewayTelemetrySessions.compacted)}`,
    },
    {
      hint: 'sessions compacted by auto buffer guardrail',
      label: 'Auto compacted sessions',
      value: `${toNumber(gatewayTelemetrySessions.autoCompacted)}`,
    },
    {
      hint: 'auto compactions / total compactions',
      label: 'Auto compaction share',
      value: toRateText(gatewayTelemetryEvents.autoCompactionShare),
    },
    {
      hint: 'failed steps / cycle step events',
      label: 'Failed step rate',
      value: toRateText(gatewayTelemetryEvents.failedStepRate),
    },
    {
      hint: 'successful provider attempts / total attempts',
      label: 'Runtime success rate',
      value: toRateText(gatewayTelemetryAttempts.successRate),
    },
    {
      hint: 'cooldown-skipped attempts / total attempts',
      label: 'Cooldown skip rate',
      value: toRateText(gatewayTelemetryAttempts.skippedRate),
    },
  ];
  const gatewayEventCounters: Array<{ key: string; value: string }> = [
    {
      key: 'Total events',
      value: `${toNumber(gatewayTelemetryEvents.total)}`,
    },
    {
      key: 'Cycle steps',
      value: `${toNumber(gatewayTelemetryEvents.draftCycleStepEvents)}`,
    },
    {
      key: 'Failed steps',
      value: `${toNumber(gatewayTelemetryEvents.failedStepEvents)}`,
    },
    {
      key: 'Compactions',
      value: `${toNumber(gatewayTelemetryEvents.compactionEvents)}`,
    },
    {
      key: 'Auto compactions',
      value: `${toNumber(gatewayTelemetryEvents.autoCompactionEvents)}`,
    },
    {
      key: 'Manual compactions',
      value: `${toNumber(gatewayTelemetryEvents.manualCompactionEvents)}`,
    },
    {
      key: 'Pruned events',
      value: `${toNumber(gatewayTelemetryEvents.prunedEventCount)}`,
    },
  ];
  const predictionAccuracyLevel = resolveHealthLevel(
    kpis.predictionAccuracyRate,
    {
      criticalBelow: 0.45,
      watchBelow: 0.6,
    },
  );
  const predictionStatCards = [
    {
      hint: 'submitted predictions in current window',
      label: 'Predictions',
      value: `${toNumber(predictionTotals.predictions)}`,
    },
    {
      hint: 'unique observers placing predictions',
      label: 'Predictors',
      value: `${toNumber(predictionTotals.predictors)}`,
    },
    {
      hint: 'unique PR markets with predictions',
      label: 'Markets',
      value: `${toNumber(predictionTotals.markets)}`,
    },
    {
      hint: 'total FIN points staked',
      label: 'Stake pool',
      value: `${toNumber(predictionTotals.stakePoints)}`,
    },
    {
      hint: 'correct / resolved predictions',
      label: 'Accuracy rate',
      value: toRateText(kpis.predictionAccuracyRate),
    },
    {
      hint: 'payout points / stake points',
      label: 'Payout ratio',
      value: toRateText(kpis.payoutToStakeRatio),
    },
    {
      hint: 'resolved prediction settlements / submitted predictions',
      label: 'Settlement rate',
      value: toRateText(kpis.predictionSettlementRate),
    },
  ];
  const predictionWindow7dView = {
    accuracyText: toRateText(predictionWindow7d.accuracyRate),
    correctPredictions: predictionWindow7d.correctPredictions,
    days: predictionWindow7d.days,
    netPoints: predictionWindow7d.netPoints,
    predictors: predictionWindow7d.predictors,
    resolvedPredictions: predictionWindow7d.resolvedPredictions,
    riskBadgeClassName: healthBadgeClass(predictionWindow7dRiskLevel),
    riskLabel: healthLabel(predictionWindow7dRiskLevel),
  };
  const predictionWindow30dView = {
    accuracyText: toRateText(predictionWindow30d.accuracyRate),
    correctPredictions: predictionWindow30d.correctPredictions,
    days: predictionWindow30d.days,
    netPoints: predictionWindow30d.netPoints,
    predictors: predictionWindow30d.predictors,
    resolvedPredictions: predictionWindow30d.resolvedPredictions,
    riskBadgeClassName: healthBadgeClass(predictionWindow30dRiskLevel),
    riskLabel: healthLabel(predictionWindow30dRiskLevel),
  };
  const predictionCohortsByOutcomeView = predictionCohortsByOutcomeWithRisk.map(
    (entry) => ({
      accuracyRateText: toRateText(entry.accuracyRate),
      netPoints: entry.netPoints,
      predictedOutcomeLabel: formatPredictionOutcomeMetricLabel(
        entry.predictedOutcome,
      ),
      predictions: entry.predictions,
      resolvedPredictions: entry.resolvedPredictions,
      riskBadgeClassName: healthBadgeClass(entry.riskLevel),
      riskLabel: healthLabel(entry.riskLevel),
      settlementRateText: toRateText(entry.settlementRate),
    }),
  );
  const predictionCohortsByStakeBandView =
    predictionCohortsByStakeBandWithRisk.map((entry) => ({
      accuracyRateText: toRateText(entry.accuracyRate),
      netPoints: entry.netPoints,
      predictions: entry.predictions,
      resolvedPredictions: entry.resolvedPredictions,
      riskBadgeClassName: healthBadgeClass(entry.riskLevel),
      riskLabel: healthLabel(entry.riskLevel),
      settlementRateText: toRateText(entry.settlementRate),
      stakeBand: entry.stakeBand,
    }));
  const gatewayLiveBodyProps = {
    activePanel,
    appliedGatewaySessionChannelFilter,
    appliedGatewaySessionProviderFilter,
    appliedGatewaySessionStatusInputValue,
    buildEventsCsv,
    closeInfoMessage,
    compactInfoMessage,
    eventQuery,
    eventsLimit,
    eventTypeFilter,
    gatewayError,
    gatewayOverview,
    gatewayRecentEvents,
    gatewaySessionScopeLabel,
    gatewaySessions,
    gatewaySessionsSource,
    gatewaySourceFilter,
    hours,
    keepRecentValue,
    selectedSession,
    selectedSessionClosed,
    selectedSessionId,
    toDurationText,
    topGatewayProvider,
  };
  const gatewayTelemetryBodyProps = {
    activePanel,
    appliedGatewayChannelFilter,
    appliedGatewayProviderFilter,
    appliedGatewaySessionStatusInputValue,
    channelUsageCard: (
      <BreakdownListCard
        emptyLabel="No channel usage in current sample."
        items={gatewayTelemetryChannelUsage}
        title="Channel usage (sample)"
      />
    ),
    compactionTrendCard: (
      <GatewayCompactionHourlyTrendCard
        compactEmptyState
        emptyLabel="No compaction events in current sample."
        items={gatewayCompactionHourlyTrend}
        title="Gateway compaction trend (UTC)"
      />
    ),
    eventCounters: gatewayEventCounters,
    eventQuery,
    eventsLimit,
    eventTypeFilter,
    gatewayScopeOverridesApplied,
    gatewayScopeRows,
    gatewaySourceFilter,
    hours,
    providerUsageCard: (
      <BreakdownListCard
        emptyLabel="No provider usage in current sample."
        items={gatewayTelemetryProviderUsage}
        title="Provider usage (sample)"
      />
    ),
    resetScopeHref: buildPanelHref(activePanel),
    riskSignals: gatewayRiskSignalsView,
    selectedSessionId,
    statCards: gatewayTelemetryStatCards,
    telemetryError: gatewayTelemetryError,
    thresholdsCard: (
      <GatewayTelemetryThresholdsCard thresholds={gatewayTelemetryThresholds} />
    ),
  };
  const runtimeBodyProps = {
    aiFailuresCsv,
    aiPrompt,
    aiProvidersCsv,
    aiRole,
    aiRuntimeDryRunErrorMessage,
    aiRuntimeDryRunInfoMessage,
    aiRuntimeDryRunResult,
    aiRuntimeHealthError,
    aiRuntimeHealthGeneratedAt,
    aiRuntimeProviders,
    aiRuntimeRoleStates: aiRuntimeRoleStatesBase,
    aiRuntimeSummary,
    aiTimeoutMs,
    hours,
    panel: activePanel,
    roleOptions: [...AI_RUNTIME_ROLES],
    scopeFields: {
      eventQuery,
      eventTypeFilter,
      eventsLimit,
      gatewaySessionStatusInputValue: appliedGatewaySessionStatusInputValue,
      gatewaySourceFilter,
      selectedSessionId,
      sessionChannelFilter: appliedGatewaySessionChannelFilter,
      sessionProviderFilter: appliedGatewaySessionProviderFilter,
    },
  };

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-4" id="main-content">
      <header className="card p-4 sm:p-5">
        <h1 className="font-semibold text-foreground text-xl sm:text-2xl">
          Admin UX Metrics
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Observer engagement and feed preference telemetry. Window:{' '}
          {toNumber(data?.windowHours, hours)}h
        </p>
      </header>

      <AdminUxPanelChrome
        activePanel={activePanel}
        panelTabs={panelTabsView}
        stickyKpis={stickyKpisView}
      />

      <GatewayPanels
        gatewayHealthBadgeClassName={healthBadgeClass(gatewayHealthLevel)}
        gatewayHealthLabel={healthLabel(gatewayHealthLevel)}
        isVisible={isPanelVisible('gateway')}
        liveBodyProps={gatewayLiveBodyProps}
        showGatewayHealthBadge={gatewayOverview !== null}
        telemetryBodyProps={gatewayTelemetryBodyProps}
        telemetryHealthBadgeClassName={healthBadgeClass(
          resolvedGatewayTelemetryHealthLevel,
        )}
        telemetryHealthLabel={healthLabel(resolvedGatewayTelemetryHealthLevel)}
      />

      <RuntimePanel
        bodyProps={runtimeBodyProps}
        isVisible={isPanelVisible('runtime')}
        runtimeHealthBadgeClassName={healthBadgeClass(aiRuntimeHealthLevel)}
        runtimeHealthLabel={healthLabel(aiRuntimeHealthLevel)}
      />

      <EngagementOverviewSection
        digestOpenRateText={toRateText(kpis.digestOpenRate)}
        engagementAvgSessionSeconds={engagementAvgSessionSeconds}
        engagementSessionCount={engagementSessionCount}
        followRateText={toRateText(kpis.followRate)}
        isVisible={isPanelVisible('engagement')}
        return24hRateText={toRateText(kpis.return24h)}
        shouldCompact={shouldCompactEngagementOverview}
      />

      <EngagementHealthSection
        isVisible={isPanelVisible('engagement')}
        signals={engagementHealthSignals}
      />
      {isPanelVisible('release') ? (
        <ReleaseHealthSection
          breakdownRows={releaseBreakdownRows}
          hourlyTrendCard={
            <ReleaseHealthAlertHourlyTrendCard
              compactEmptyState
              emptyLabel="No release-health alert hourly trend data in current window."
              items={releaseHealthAlertHourlyTrend}
              title="Release-health alert hourly trend (UTC)"
            />
          }
          releaseAlertsCount={`${releaseHealthAlertCount}`}
          releaseFirstAppearancesCount={`${releaseHealthAlertFirstAppearanceCount}`}
          releaseLatestReceivedAt={releaseHealthAlertLatestReceivedAt}
          releaseLatestRunLabel={releaseHealthAlertLatestRunLabel}
          releaseLatestRunUrl={
            typeof releaseHealthAlertLatest?.runUrl === 'string'
              ? releaseHealthAlertLatest.runUrl
              : null
          }
          releaseRiskBadgeClassName={healthBadgeClass(
            releaseHealthAlertRiskLevel,
          )}
          releaseRiskLabel={healthLabel(releaseHealthAlertRiskLevel)}
          releaseRunsCount={`${releaseHealthAlertedRunCount}`}
        />
      ) : null}

      <FeedPreferenceKpisSection
        comfortDensityShareText={toRateText(kpis.densityComfortRate)}
        compactDensityShareText={toRateText(kpis.densityCompactRate)}
        hintDismissRateText={toRateText(kpis.hintDismissRate)}
        isVisible={isPanelVisible('engagement')}
        legacyFocusShareText={toRateText(kpis.viewModeFocusRate)}
        observerModeShareText={toRateText(kpis.viewModeObserverRate)}
        shouldCompact={shouldCompactFeedPreferenceKpis}
      />

      {isPanelVisible('style') ? (
        <MultimodalTelemetrySection
          breakdownRows={multimodalBreakdownRows}
          coverageRiskBadgeClassName={healthBadgeClass(multimodalOverallLevel)}
          coverageRiskLabel={healthLabel(multimodalOverallLevel)}
          hourlyTrendCard={
            <HourlyTrendCard
              compactEmptyState
              emptyLabel="No hourly multimodal trend data in current window."
              items={multimodalHourlyTrend}
              title="Hourly trend (UTC)"
            />
          }
          invalidQueryErrorsValue={`${toNumber(multimodalGuardrails.invalidQueryErrors)}`}
          invalidQueryShareText={toRateText(
            multimodalGuardrails.invalidQueryRate,
          )}
          multimodalStatCards={multimodalStatCards}
        />
      ) : null}

      {isPanelVisible('prediction') ? (
        <PredictionMarketSection
          accuracyBadgeClassName={healthBadgeClass(predictionAccuracyLevel)}
          accuracyLabel={healthLabel(predictionAccuracyLevel)}
          averageStakeText={toFixedText(predictionTotals.averageStakePoints)}
          cohortsByOutcomeRows={predictionCohortsByOutcomeView}
          cohortsByStakeBandRows={predictionCohortsByStakeBandView}
          cohortThresholdSummary={predictionCohortThresholdSummary}
          correctPredictions={toNumber(predictionTotals.correctPredictions)}
          filterScopeMixCard={
            <BreakdownListCard
              compactEmptyState
              emptyLabel="No scope-switch data in current window."
              items={predictionFilterByScopeBreakdown}
              title="Filter scope mix"
            />
          }
          filterSwitchesValue={`${toNumber(predictionFilterTelemetry.totalSwitches)}`}
          filterSwitchShareText={toRateText(kpis.predictionFilterSwitchShare)}
          filterValueMixCard={
            <BreakdownListCard
              compactEmptyState
              emptyLabel="No filter-value data in current window."
              items={predictionFilterByFilterBreakdown}
              title="Filter value mix"
            />
          }
          historyScopeRows={predictionHistoryScopeStates}
          hourlyTrendCard={
            <PredictionHourlyTrendCard
              compactEmptyState
              emptyLabel="No hourly prediction trend data in current window."
              items={predictionHourlyTrend}
              title="Prediction hourly trend (UTC)"
            />
          }
          nonDefaultSortShareText={toRateText(
            kpis.predictionNonDefaultSortRate,
          )}
          outcomeMixCard={
            <BreakdownListCard
              compactEmptyState
              emptyLabel="No prediction outcomes in current window."
              items={predictionOutcomesBreakdown}
              title="Outcome mix"
            />
          }
          participationRateText={toRateText(kpis.predictionParticipationRate)}
          predictionStatCards={predictionStatCards}
          resolvedPredictions={toNumber(predictionTotals.resolvedPredictions)}
          scopeFilterMatrixRows={predictionFilterByScopeAndFilter}
          scopeSortMatrixRows={predictionSortByScopeAndSort}
          sortScopeMixCard={
            <BreakdownListCard
              compactEmptyState
              emptyLabel="No sort scope data in current window."
              items={predictionSortByScopeBreakdown}
              title="Sort scope mix"
            />
          }
          sortSwitchesValue={`${toNumber(predictionSortTelemetry.totalSwitches)}`}
          sortSwitchShareText={toRateText(kpis.predictionSortSwitchShare)}
          sortValueMixCard={
            <BreakdownListCard
              compactEmptyState
              emptyLabel="No sort-value data in current window."
              items={predictionSortBySortBreakdown}
              title="Sort value mix"
            />
          }
          window7d={predictionWindow7dView}
          window30d={predictionWindow30dView}
          windowThresholdCriticalText={toRateText(
            predictionResolutionWindowThresholds.accuracyRate.criticalBelow,
          )}
          windowThresholdMinSample={
            predictionResolutionWindowThresholds.minResolvedPredictions
          }
          windowThresholdWatchText={toRateText(
            predictionResolutionWindowThresholds.accuracyRate.watchBelow,
          )}
        />
      ) : null}
      {isPanelVisible('style') ? (
        <StyleFusionMetricsSection
          copyRiskBadgeClassName={healthBadgeClass(styleFusionCopyRiskLevel)}
          copyRiskLabel={healthLabel(styleFusionCopyRiskLevel)}
          fusionRiskBadgeClassName={healthBadgeClass(styleFusionRiskLevel)}
          fusionRiskLabel={healthLabel(styleFusionRiskLevel)}
          metrics={styleFusionMetrics}
        />
      ) : null}

      {isDebugPanelVisible ? (
        <DebugDiagnosticsSection
          attentionSessionsCount={`${toNumber(gatewayTelemetrySessions.attention)}`}
          debugContextRows={debugContextRows}
          debugPayloadText={debugPayloadText}
          eventsSampleCount={debugPayload.gateway.eventsSample.length}
          releaseAlertsCount={`${releaseHealthAlertCount}`}
          runtimeProvidersCount={aiRuntimeProviders.length}
        />
      ) : null}

      <FeedInteractionCountersSection
        density={{
          comfort: toNumber(density.comfort),
          compact: toNumber(density.compact),
          total: densityTotal,
          unknown: toNumber(density.unknown),
        }}
        hint={{
          dismissCount: toNumber(hint.dismissCount),
          switchCount: toNumber(hint.switchCount),
          total: hintInteractionTotal,
        }}
        isVisible={isPanelVisible('engagement')}
        shouldCompact={shouldCompactFeedPreferenceEvents}
        viewMode={{
          focus: toNumber(viewMode.focus),
          observer: toNumber(viewMode.observer),
          total: viewModeTotal,
          unknown: toNumber(viewMode.unknown),
        }}
      />

      <TopSegmentsSection
        isVisible={isPanelVisible('engagement')}
        shouldCompactFeedPreferenceEvents={shouldCompactFeedPreferenceEvents}
        topSegments={topSegmentsView}
      />
    </main>
  );
}
