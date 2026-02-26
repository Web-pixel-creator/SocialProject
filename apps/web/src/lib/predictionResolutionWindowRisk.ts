export type PredictionResolutionRiskLevel =
  | 'healthy'
  | 'watch'
  | 'critical'
  | 'unknown';

export interface PredictionResolutionWindowThresholds {
  accuracyRate: {
    criticalBelow: number;
    watchBelow: number;
  };
  minResolvedPredictions: number;
}

export interface PredictionResolutionWindowValue {
  resolved: number;
  rate: number;
  riskLevel?: string | null;
}

const DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS: PredictionResolutionWindowThresholds =
  {
    accuracyRate: {
      criticalBelow: 0.45,
      watchBelow: 0.6,
    },
    minResolvedPredictions: 3,
  };

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const normalizeThresholdNumber = (
  value: unknown,
  fallback: number,
  { min, max }: { min: number; max: number },
) => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return fallback;
  }
  if (parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
};

const toPredictionResolutionRiskLevel = (
  value: unknown,
): PredictionResolutionRiskLevel | null => {
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

export const normalizePredictionResolutionWindowThresholds = (
  thresholds: unknown,
): PredictionResolutionWindowThresholds => {
  const source =
    thresholds && typeof thresholds === 'object'
      ? (thresholds as Record<string, unknown>)
      : {};
  const accuracySource =
    source.accuracyRate && typeof source.accuracyRate === 'object'
      ? (source.accuracyRate as Record<string, unknown>)
      : {};

  const criticalBelow = normalizeThresholdNumber(
    accuracySource.criticalBelow,
    DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.accuracyRate.criticalBelow,
    { min: 0, max: 1 },
  );
  const watchBelow = normalizeThresholdNumber(
    accuracySource.watchBelow,
    DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.accuracyRate.watchBelow,
    { min: criticalBelow, max: 1 },
  );
  const minResolvedPredictions = Math.round(
    normalizeThresholdNumber(
      source.minResolvedPredictions,
      DEFAULT_PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.minResolvedPredictions,
      { min: 1, max: 500 },
    ),
  );

  return {
    accuracyRate: {
      criticalBelow,
      watchBelow,
    },
    minResolvedPredictions,
  };
};

export const resolvePredictionResolutionWindowRiskLevel = ({
  window,
  thresholds,
}: {
  window: PredictionResolutionWindowValue;
  thresholds: PredictionResolutionWindowThresholds;
}): PredictionResolutionRiskLevel => {
  const explicitRisk = toPredictionResolutionRiskLevel(window.riskLevel);
  if (explicitRisk) {
    return explicitRisk;
  }
  if (window.resolved < thresholds.minResolvedPredictions) {
    return 'unknown';
  }
  const rate = toFiniteNumber(window.rate);
  if (rate === null) {
    return 'unknown';
  }
  if (rate < thresholds.accuracyRate.criticalBelow) {
    return 'critical';
  }
  if (rate < thresholds.accuracyRate.watchBelow) {
    return 'watch';
  }
  return 'healthy';
};
