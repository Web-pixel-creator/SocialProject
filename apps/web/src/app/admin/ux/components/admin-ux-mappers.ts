import {
  GATEWAY_CHANNEL_QUERY_PATTERN,
  GATEWAY_PROVIDER_QUERY_PATTERN,
  parseOptionalFilteredQueryString,
} from './gateway-query-state';

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
