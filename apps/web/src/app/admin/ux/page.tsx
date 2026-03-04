import {
  type AgentGatewayOverview,
  type AgentGatewayRecentEvent,
  closeAgentGatewaySession,
  compactAgentGatewaySession,
  fetchAgentGatewayOverview,
  fetchAgentGatewayRecentEvents,
  fetchAgentGatewaySessions,
  fetchAgentGatewayTelemetry,
  fetchObserverEngagement,
  fetchSimilarSearchMetrics,
  resolveAdminApiBaseUrl,
  resolveAdminToken,
  type SimilarSearchMetricsResponse,
} from './components/admin-ux-data-client';
import { AdminUxPanelChrome } from './components/admin-ux-panel-chrome';
import {
  buildDebugContextRows,
  buildDebugPayloadText,
  buildEngagementCompactionView,
  buildEngagementHealthSignals,
  buildGatewayEventCounters,
  buildGatewayRiskSignalsView,
  buildGatewayScopeRows,
  buildGatewayTelemetryStatCards,
  buildGatewayTelemetryView,
  buildMultimodalBreakdownRows,
  buildMultimodalStatCards,
  buildMultimodalTelemetryView,
  buildPanelTabsView,
  buildPredictionCohortsByOutcomeView,
  buildPredictionCohortsByStakeBandView,
  buildPredictionMarketTelemetryView,
  buildPredictionStatCards,
  buildPredictionWindowView,
  buildReleaseBreakdownRows,
  buildReleaseHealthAlertsView,
  buildStickyKpisView,
  buildTopSegmentsView,
} from './components/admin-ux-view-models';
import {
  AI_RUNTIME_ROLES,
  fetchAiRuntimeHealth,
  recomputeAiRuntimeSummary,
  resolveAiRuntimeDryRunState,
  resolveAiRuntimeQueryState,
} from './components/ai-runtime-orchestration';
import { DebugDiagnosticsSection } from './components/debug-diagnostics-section';
import {
  EngagementHealthSection,
  EngagementOverviewSection,
  FeedInteractionCountersSection,
  FeedPreferenceKpisSection,
  TopSegmentsSection,
} from './components/engagement-sections';
import {
  GATEWAY_CHANNEL_QUERY_PATTERN,
  GATEWAY_PROVIDER_QUERY_PATTERN,
  parseOptionalFilteredQueryString,
  resolveGatewayEventsRequestFilters,
  resolveGatewayQueryState,
  resolveGatewaySessionMutations,
} from './components/gateway-query-state';
import {
  GatewayPanels,
  RuntimePanel,
} from './components/gateway-runtime-panels';
import { resolveGatewaySessionOrchestrationState } from './components/gateway-session-orchestration';
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

const PREDICTION_OUTCOME_LABEL_SEGMENT_PATTERN = /[_\s-]+/;
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

const resolveGatewaySessionMutationsWithApi = (args: {
  closeRequested: boolean;
  compactRequested: boolean;
  selectedSessionClosed: boolean;
  selectedSessionId: string | null;
  keepRecent?: number;
}) =>
  resolveGatewaySessionMutations({
    ...args,
    closeAgentGatewaySession,
    compactAgentGatewaySession,
  });

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
  } = await fetchAiRuntimeHealth({
    adminToken: resolveAdminToken,
    apiBaseUrl: resolveAdminApiBaseUrl,
    toNumber,
    toStringValue,
  });
  const {
    closeInfoMessage,
    compactInfoMessage,
    gatewayError,
    gatewayOverview,
    gatewayRecentEvents,
    keepRecentValue,
    selectedSession,
    selectedSessionClosed,
    selectedSessionId,
  } = await resolveGatewaySessionOrchestrationState({
    closeRequested,
    compactRequested,
    eventQuery,
    eventTypeFilter,
    eventsLimit,
    fetchAgentGatewayOverview,
    fetchAgentGatewayRecentEvents,
    gatewayProviderFilter,
    gatewaySessionFilters,
    gatewaySessions,
    gatewaySessionsError,
    gatewaySessionsSource,
    keepRecent,
    resolveGatewayEventsRequestFilters,
    resolveGatewaySessionMutations: resolveGatewaySessionMutationsWithApi,
    sessionIdFromQuery,
    toStringValue,
  });

  const kpis = data?.kpis ?? {};
  const predictionMarket = data?.predictionMarket ?? {};
  const predictionFilterTelemetry = data?.predictionFilterTelemetry ?? {};
  const predictionSortTelemetry = data?.predictionSortTelemetry ?? {};
  const predictionHistoryStateTelemetry =
    data?.predictionHistoryStateTelemetry ?? {};
  const {
    predictionCohortThresholdSummary,
    predictionCohortsByOutcomeWithRisk,
    predictionCohortsByStakeBandWithRisk,
    predictionFilterByFilterBreakdown,
    predictionFilterByScopeAndFilter,
    predictionFilterByScopeBreakdown,
    predictionHistoryScopeStates,
    predictionHourlyTrend,
    predictionOutcomesBreakdown,
    predictionResolutionWindowThresholds,
    predictionSortByScopeAndSort,
    predictionSortByScopeBreakdown,
    predictionSortBySortBreakdown,
    predictionTotals,
    predictionWindow30d,
    predictionWindow30dRiskLevel,
    predictionWindow7d,
    predictionWindow7dRiskLevel,
  } = buildPredictionMarketTelemetryView({
    formatPredictionOutcomeMetricLabel,
    normalizeBreakdownItems,
    normalizePredictionCohortByOutcomeItems,
    normalizePredictionCohortByStakeBandItems,
    normalizePredictionCohortRiskThresholds,
    normalizePredictionFilterScopeFilterItems,
    normalizePredictionHistoryScopeStateItems,
    normalizePredictionHourlyTrendItems,
    normalizePredictionResolutionWindow,
    normalizePredictionResolutionWindowThresholds,
    normalizePredictionSortScopeSortItems,
    predictionFilterTelemetry,
    predictionHistoryStateTelemetry,
    predictionMarket,
    predictionSortTelemetry,
    resolvePredictionCohortHealthLevel,
    resolvePredictionResolutionWindowHealthLevel,
    toRateText,
  });
  const multimodal = data?.multimodal ?? {};
  const {
    multimodalCoverageRate,
    multimodalEmptyReasonBreakdown,
    multimodalErrorRate,
    multimodalErrorReasonBreakdown,
    multimodalGuardrails,
    multimodalHourlyTrend,
    multimodalOverallLevel,
    multimodalProviderBreakdown,
  } = buildMultimodalTelemetryView({
    kpis,
    multimodal,
    normalizeBreakdownItems,
    normalizeHourlyTrendItems,
    pickFirstFiniteRate,
    resolveHealthLevel,
    resolveRiskHealthLevel,
  });
  const releaseHealthAlerts = data?.releaseHealthAlerts ?? {};
  const {
    releaseHealthAlertByChannel,
    releaseHealthAlertByFailureMode,
    releaseHealthAlertCount,
    releaseHealthAlertFirstAppearanceCount,
    releaseHealthAlertHourlyTrend,
    releaseHealthAlertLatest,
    releaseHealthAlertLatestReceivedAt,
    releaseHealthAlertLatestRunLabel,
    releaseHealthAlertRiskLevel,
    releaseHealthAlertedRunCount,
  } = buildReleaseHealthAlertsView({
    deriveReleaseHealthAlertRiskLevel,
    kpis,
    normalizeBreakdownItems,
    normalizeReleaseHealthAlertHourlyTrendItems,
    releaseHealthAlerts,
    toNullableIsoTimestamp,
    toNumber,
  });
  const feedPreferences = data?.feedPreferences ?? {};
  const viewMode = feedPreferences.viewMode ?? {};
  const density = feedPreferences.density ?? {};
  const hint = feedPreferences.hint ?? {};
  const {
    densityTotal,
    engagementAvgSessionSeconds,
    engagementSessionCount,
    hintInteractionTotal,
    shouldCompactEngagementOverview,
    shouldCompactFeedPreferenceEvents,
    shouldCompactFeedPreferenceKpis,
    viewModeTotal,
  } = buildEngagementCompactionView({
    feedPreferences,
    kpis,
    toNumber,
  });
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
  const {
    appliedGatewayChannelFilter,
    appliedGatewayProviderFilter,
    appliedGatewaySessionChannelFilter,
    appliedGatewaySessionProviderFilter,
    appliedGatewaySessionStatusInputValue,
    appliedGatewaySessionStatusLabel,
    gatewayAutoCompactionShareLevel,
    gatewayCompactionHourlyTrend,
    gatewayCooldownSkipLevel,
    gatewayFailedStepLevel,
    gatewayRuntimeSuccessLevel,
    gatewaySessionScopeLabel,
    gatewayTelemetryAttempts,
    gatewayTelemetryChannelUsage,
    gatewayTelemetryEvents,
    gatewayTelemetryProviderUsage,
    gatewayTelemetrySessions,
    gatewayTelemetryThresholds,
    resolvedGatewayTelemetryHealthLevel,
  } = buildGatewayTelemetryView({
    gatewayChannelFilter,
    gatewayProviderFilter,
    gatewaySessionFilters,
    gatewayStatusFilter,
    gatewayTelemetry,
    normalizeBreakdownItems,
    normalizeGatewayCompactionHourlyTrendItems,
    normalizeGatewayTelemetryFilters,
    normalizeGatewayTelemetryThresholds,
    resolveGatewaySessionScope,
    resolveGatewayTelemetryHealthLevel,
    resolveHealthLevel,
    resolveRiskHealthLevel,
    toHealthLevelValue,
  });
  const aiRuntimeDryRunState = await resolveAiRuntimeDryRunState({
    adminToken: resolveAdminToken,
    apiBaseUrl: resolveAdminApiBaseUrl,
    toStringValue,
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
  const releaseBreakdownRows = buildReleaseBreakdownRows({
    byChannel: releaseHealthAlertByChannel,
    byFailureMode: releaseHealthAlertByFailureMode,
  });
  const multimodalBreakdownRows = buildMultimodalBreakdownRows({
    emptyReasonBreakdown: multimodalEmptyReasonBreakdown,
    errorReasonBreakdown: multimodalErrorReasonBreakdown,
    providerBreakdown: multimodalProviderBreakdown,
  });
  const multimodalStatCards = buildMultimodalStatCards({
    multimodal,
    multimodalCoverageRate,
    multimodalErrorRate,
    toNumber,
    toRateText,
  });
  const gatewayDebugStatusLabel = toStringValue(
    gatewayOverview?.session.status ?? selectedSession?.status,
    appliedGatewaySessionStatusLabel,
  );
  const debugPayloadText = buildDebugPayloadText({
    activePanel,
    aiRuntimeDryRunResult,
    aiRuntimeProviders,
    aiRuntimeSummary,
    gatewayChannelFilter,
    gatewayOverview,
    gatewayProviderFilter,
    gatewayRecentEvents,
    gatewaySourceFilter,
    gatewayStatusFilter,
    gatewayTelemetry,
    releaseHealthAlertCount,
    releaseHealthAlertFirstAppearanceCount,
    releaseHealthAlertLatest,
    releaseHealthAlertedRunCount,
  });
  const debugContextRows = buildDebugContextRows({
    activePanel,
    gatewaySessionScopeLabel,
    gatewaySessionsSource: toStringValue(gatewaySessionsSource, 'n/a'),
    gatewayStatusLabel: gatewayDebugStatusLabel,
    hours,
    releaseRiskLabel: healthLabel(releaseHealthAlertRiskLevel),
    runtimeHealthLabel: toStringValue(aiRuntimeSummary.health, 'n/a'),
    selectedSessionId,
  });
  const debugEventsSampleCount = Array.isArray(gatewayRecentEvents)
    ? gatewayRecentEvents.slice(0, 10).length
    : 0;
  const gatewayRiskSignalsView = buildGatewayRiskSignalsView({
    autoCompactionLevel: gatewayAutoCompactionShareLevel,
    cooldownSkipLevel: gatewayCooldownSkipLevel,
    failedStepLevel: gatewayFailedStepLevel,
    healthBadgeClass,
    healthLabel,
    runtimeSuccessLevel: gatewayRuntimeSuccessLevel,
  });
  const gatewayScopeOverridesApplied =
    (gatewaySourceFilter ?? '').length > 0 ||
    (appliedGatewayChannelFilter ?? '').length > 0 ||
    (appliedGatewayProviderFilter ?? '').length > 0 ||
    (appliedGatewaySessionStatusInputValue ?? '').length > 0;
  const gatewayScopeRows = buildGatewayScopeRows({
    appliedGatewayChannelFilter,
    appliedGatewayProviderFilter,
    appliedGatewaySessionStatusLabel,
    gatewaySourceFilter,
  });
  const gatewayTelemetryStatCards = buildGatewayTelemetryStatCards({
    attempts: gatewayTelemetryAttempts,
    events: gatewayTelemetryEvents,
    sessions: gatewayTelemetrySessions,
    toNumber,
    toRateText,
  });
  const gatewayEventCounters = buildGatewayEventCounters({
    events: gatewayTelemetryEvents,
    toNumber,
  });
  const predictionAccuracyLevel = resolveHealthLevel(
    kpis.predictionAccuracyRate,
    {
      criticalBelow: 0.45,
      watchBelow: 0.6,
    },
  );
  const predictionStatCards = buildPredictionStatCards({
    kpis,
    predictionTotals,
    toNumber,
    toRateText,
  });
  const predictionWindow7dView = buildPredictionWindowView({
    healthBadgeClass,
    healthLabel,
    riskLevel: predictionWindow7dRiskLevel,
    toRateText,
    window: predictionWindow7d,
  });
  const predictionWindow30dView = buildPredictionWindowView({
    healthBadgeClass,
    healthLabel,
    riskLevel: predictionWindow30dRiskLevel,
    toRateText,
    window: predictionWindow30d,
  });
  const predictionCohortsByOutcomeView = buildPredictionCohortsByOutcomeView({
    healthBadgeClass,
    healthLabel,
    rows: predictionCohortsByOutcomeWithRisk,
    toOutcomeLabel: formatPredictionOutcomeMetricLabel,
    toRateText,
  });
  const predictionCohortsByStakeBandView =
    buildPredictionCohortsByStakeBandView({
      healthBadgeClass,
      healthLabel,
      rows: predictionCohortsByStakeBandWithRisk,
      toRateText,
    });
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
          eventsSampleCount={debugEventsSampleCount}
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
