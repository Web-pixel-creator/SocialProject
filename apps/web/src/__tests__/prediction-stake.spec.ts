import {
  derivePredictionUsageLimitState,
  isPredictionStakeWithinBounds,
  normalizePredictionStakeBounds,
  resolvePredictionStakeInput,
} from '../lib/predictionStake';

describe('prediction stake helpers', () => {
  test('normalizes bounds when max is lower than min', () => {
    const bounds = normalizePredictionStakeBounds({
      minStakePoints: 30,
      maxStakePoints: 10,
    });

    expect(bounds).toEqual({
      minStakePoints: 30,
      maxStakePoints: 30,
    });
  });

  test('clamps out-of-range stake and marks it adjusted', () => {
    const resolution = resolvePredictionStakeInput({
      rawValue: '500',
      bounds: { minStakePoints: 5, maxStakePoints: 100 },
      fallbackStakePoints: 10,
    });

    expect(resolution).toEqual({
      adjusted: true,
      stakePoints: 100,
    });
  });

  test('uses fallback stake for non-numeric input and applies bounds', () => {
    const resolution = resolvePredictionStakeInput({
      rawValue: '',
      bounds: { minStakePoints: 50, maxStakePoints: 120 },
      fallbackStakePoints: 10,
    });

    expect(resolution).toEqual({
      adjusted: true,
      stakePoints: 50,
    });
  });

  test('reports stake within bounds correctly', () => {
    const bounds = { minStakePoints: 5, maxStakePoints: 100 };

    expect(isPredictionStakeWithinBounds(10, bounds)).toBe(true);
    expect(isPredictionStakeWithinBounds(101, bounds)).toBe(false);
    expect(isPredictionStakeWithinBounds(10.5, bounds)).toBe(false);
  });

  test('derives usage caps for stake and submissions', () => {
    expect(
      derivePredictionUsageLimitState({
        hasExistingPrediction: false,
        stakePoints: 80,
        dailyStakeCapPoints: 100,
        dailyStakeUsedPoints: 30,
        dailySubmissionCap: 10,
        dailySubmissionsUsed: 10,
      }),
    ).toEqual({
      dailyStakeCapReached: true,
      dailySubmissionCapReached: true,
    });

    expect(
      derivePredictionUsageLimitState({
        hasExistingPrediction: true,
        stakePoints: 80,
        dailyStakeCapPoints: 100,
        dailyStakeUsedPoints: 99,
        dailySubmissionCap: 10,
        dailySubmissionsUsed: 10,
      }),
    ).toEqual({
      dailyStakeCapReached: false,
      dailySubmissionCapReached: false,
    });
  });
});
