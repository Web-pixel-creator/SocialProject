import type {
  AgentGatewayOverview,
  SimilarSearchMetricsResponse,
} from './admin-ux-data-client';
import type { AIRuntimeSummaryViewState } from './ai-runtime-orchestration';
import {
  GATEWAY_CHANNEL_QUERY_PATTERN,
  GATEWAY_PROVIDER_QUERY_PATTERN,
  parseOptionalFilteredQueryString,
} from './gateway-query-state';
import type { StyleFusionMetricsView } from './style-fusion-metrics-section';

export type HealthLevel = 'critical' | 'healthy' | 'unknown' | 'watch';

export interface GatewayRiskAboveThresholds {
  criticalAbove: number;
  watchAbove: number;
}

export interface GatewayRiskBelowThresholds {
  criticalBelow: number;
  watchBelow: number;
}

export interface GatewayTelemetryThresholds {
  autoCompactionShare: GatewayRiskAboveThresholds;
  failedStepRate: GatewayRiskAboveThresholds;
  runtimeSuccessRate: GatewayRiskBelowThresholds;
  cooldownSkipRate: GatewayRiskAboveThresholds;
}

export interface MultimodalHourlyTrendItem {
  attempts: number;
  coverageRate: number | null;
  emptyStates: number;
  errorRate: number | null;
  errors: number;
  hour: string;
  totalEvents: number;
  views: number;
}

export interface PredictionHourlyTrendItem {
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

export interface PredictionResolutionWindowItem {
  accuracyRate: number | null;
  correctPredictions: number;
  days: number;
  netPoints: number;
  predictors: number;
  resolvedPredictions: number;
  riskLevel: HealthLevel | null;
}

export interface PredictionResolutionWindowThresholds {
  accuracyRate: {
    criticalBelow: number;
    watchBelow: number;
  };
  minResolvedPredictions: number;
}

export interface PredictionCohortRiskThresholds {
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

export interface PredictionFilterScopeFilterItem {
  count: number;
  filter: string;
  scope: string;
}

export interface PredictionSortScopeSortItem {
  count: number;
  scope: string;
  sort: string;
}

export interface PredictionHistoryScopeStateItem {
  activeFilter: string | null;
  activeSort: string | null;
  filterChangedAt: string | null;
  lastChangedAt: string | null;
  scope: string;
  sortChangedAt: string | null;
}

export interface PredictionCohortByOutcomeItem {
  accuracyRate: number | null;
  correctPredictions: number;
  netPoints: number;
  predictedOutcome: string;
  predictions: number;
  resolvedPredictions: number;
  settlementRate: number | null;
}

export interface PredictionCohortByStakeBandItem {
  accuracyRate: number | null;
  correctPredictions: number;
  netPoints: number;
  predictions: number;
  resolvedPredictions: number;
  settlementRate: number | null;
  stakeBand: string;
}

export interface GatewayCompactionHourlyTrendItem {
  autoCompactionShare: number | null;
  autoCompactionRiskLevel: HealthLevel;
  autoCompactions: number;
  compactions: number;
  hour: string;
  manualCompactions: number;
  prunedEventCount: number;
}

export interface ReleaseHealthAlertHourlyTrendItem {
  alerts: number;
  firstAppearances: number;
  hour: string;
}

export const DEFAULT_GATEWAY_TELEMETRY_THRESHOLDS: GatewayTelemetryThresholds =
  {
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

export const DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS: PredictionResolutionWindowThresholds =
  {
    accuracyRate: {
      criticalBelow: 0.45,
      watchBelow: 0.6,
    },
    minResolvedPredictions: 3,
  };

export const DEFAULT_PREDICTION_COHORT_RISK_THRESHOLDS: PredictionCohortRiskThresholds =
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

export const toNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const toStringValue = (value: unknown, fallback = 'n/a'): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

export const toRateText = (value: unknown): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
};

export const toHealthLevelValue = (value: unknown): HealthLevel | null => {
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

export const toFixedText = (value: unknown, digits = 2): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return value.toFixed(digits);
};

export const pickFirstFiniteRate = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

export const toNullableIsoTimestamp = (value: unknown): string | null => {
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

export const normalizeGatewayTelemetryThresholds = (
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

export const normalizeGatewayTelemetryFilters = (
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

export const normalizeBreakdownItems = ({
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

export const normalizeHourlyTrendItems = (
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

export const normalizeReleaseHealthAlertHourlyTrendItems = (
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

export const normalizePredictionHourlyTrendItems = (
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

export const normalizePredictionResolutionWindow = (
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

export const normalizePredictionResolutionWindowThresholds = (
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

export const normalizePredictionCohortRiskThresholds = (
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

export const normalizePredictionFilterScopeFilterItems = (
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

export const normalizePredictionSortScopeSortItems = (
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

export const normalizePredictionHistoryScopeStateItems = (
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

export const normalizePredictionCohortByOutcomeItems = (
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

export const normalizePredictionCohortByStakeBandItems = (
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

export const resolveHealthLevel = (
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

export const resolveRiskHealthLevel = (
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

export const normalizeGatewayCompactionHourlyTrendItems = (
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

export const toDurationText = (value: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 'n/a';
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  return `${(value / 1000).toFixed(1)}s`;
};

interface GatewaySessionScopeFilters {
  channel: string | null;
  provider: string | null;
  status: string | null;
}

interface GatewaySessionScopeInput {
  queryChannel: string | null;
  queryProvider: string | null;
  queryStatus: string | null;
  sessionFilters: GatewaySessionScopeFilters;
}

interface GatewaySessionScopeView extends GatewaySessionScopeFilters {
  label: string;
  statusInputValue: string;
  statusLabel: string;
}

const formatGatewayScopeLabel = ({
  channel,
  provider,
  status,
}: GatewaySessionScopeFilters): string | null => {
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

export const resolveGatewaySessionScope = ({
  queryChannel,
  queryProvider,
  queryStatus,
  sessionFilters,
}: GatewaySessionScopeInput): GatewaySessionScopeView => {
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

export const resolveGatewayTelemetryHealthLevel = ({
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

export const resolvePredictionResolutionWindowHealthLevel = (
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

export const resolvePredictionCohortHealthLevel = ({
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

export const healthLabel = (level: HealthLevel): string => {
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

export const healthBadgeClass = (level: HealthLevel): string => {
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

export const deriveAiRuntimeHealthLevel = (
  summary: AIRuntimeSummaryViewState,
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

export const deriveGatewayHealthLevel = (
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

export const deriveReleaseHealthAlertRiskLevel = ({
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

export const normalizeStyleFusionMetrics = (
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
