import {
  normalizePredictionResolutionWindowThresholds,
  resolvePredictionResolutionWindowRiskLevel,
} from '../lib/predictionResolutionWindowRisk';

describe('prediction resolution window risk helpers', () => {
  test('uses explicit backend risk level when provided', () => {
    const thresholds = normalizePredictionResolutionWindowThresholds(undefined);
    expect(
      resolvePredictionResolutionWindowRiskLevel({
        window: {
          resolved: 10,
          rate: 0.95,
          riskLevel: 'critical',
        },
        thresholds,
      }),
    ).toBe('critical');
  });

  test('returns unknown when resolved sample is below threshold', () => {
    const thresholds = normalizePredictionResolutionWindowThresholds({
      accuracyRate: { criticalBelow: 0.4, watchBelow: 0.6 },
      minResolvedPredictions: 3,
    });
    expect(
      resolvePredictionResolutionWindowRiskLevel({
        window: {
          resolved: 2,
          rate: 0.2,
        },
        thresholds,
      }),
    ).toBe('unknown');
  });

  test('classifies healthy/watch/critical from thresholds', () => {
    const thresholds = normalizePredictionResolutionWindowThresholds({
      accuracyRate: { criticalBelow: 0.45, watchBelow: 0.6 },
      minResolvedPredictions: 1,
    });

    expect(
      resolvePredictionResolutionWindowRiskLevel({
        window: { resolved: 5, rate: 0.7 },
        thresholds,
      }),
    ).toBe('healthy');
    expect(
      resolvePredictionResolutionWindowRiskLevel({
        window: { resolved: 5, rate: 0.55 },
        thresholds,
      }),
    ).toBe('watch');
    expect(
      resolvePredictionResolutionWindowRiskLevel({
        window: { resolved: 5, rate: 0.2 },
        thresholds,
      }),
    ).toBe('critical');
  });
});
