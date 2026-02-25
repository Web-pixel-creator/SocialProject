import { buildPredictionMarketSnapshot } from '../lib/predictionMarket';

describe('prediction market helpers', () => {
  test('derives odds, multipliers, and payouts from stake distribution', () => {
    const snapshot = buildPredictionMarketSnapshot({
      mergeStakePoints: 30,
      rejectStakePoints: 70,
      stakePointsForPotential: 20,
    });

    expect(snapshot.totalStakePoints).toBe(100);
    expect(snapshot.marketPoolPoints).toBe(100);
    expect(snapshot.mergeOddsPercent).toBe(30);
    expect(snapshot.rejectOddsPercent).toBe(70);
    expect(snapshot.mergePayoutMultiplier).toBeCloseTo(3.333, 3);
    expect(snapshot.rejectPayoutMultiplier).toBeCloseTo(1.4286, 4);
    expect(snapshot.potentialMergePayout).toBe(67);
    expect(snapshot.potentialRejectPayout).toBe(29);
  });

  test('keeps provided market values and computes usage remaining', () => {
    const snapshot = buildPredictionMarketSnapshot({
      marketPoolPoints: 150,
      mergeOdds: 0.25,
      rejectOdds: 0.75,
      mergePayoutMultiplier: 4,
      rejectPayoutMultiplier: 1.333,
      potentialMergePayout: 80,
      potentialRejectPayout: 27,
      observerNetPoints: 12,
      trustTier: 'trusted',
      dailyStakeCapPoints: 1000,
      dailyStakeUsedPoints: 455,
      dailySubmissionCap: 30,
      dailySubmissionsUsed: 11,
    });

    expect(snapshot.marketPoolPoints).toBe(150);
    expect(snapshot.mergeOddsPercent).toBe(25);
    expect(snapshot.rejectOddsPercent).toBe(75);
    expect(snapshot.potentialMergePayout).toBe(80);
    expect(snapshot.potentialRejectPayout).toBe(27);
    expect(snapshot.observerNetPoints).toBe(12);
    expect(snapshot.trustTier).toBe('trusted');
    expect(snapshot.dailyStakeRemainingPoints).toBe(545);
    expect(snapshot.dailySubmissionsRemaining).toBe(19);
    expect(snapshot.hasUsageCaps).toBe(true);
    expect(snapshot.hasObserverMarketProfile).toBe(true);
  });

  test('drops invalid trust tier and clamps invalid odds', () => {
    const snapshot = buildPredictionMarketSnapshot({
      mergeOdds: 2,
      rejectOdds: -1,
      trustTier: 'unknown',
    });

    expect(snapshot.mergeOddsPercent).toBe(100);
    expect(snapshot.rejectOddsPercent).toBe(0);
    expect(snapshot.trustTier).toBeNull();
  });
});
