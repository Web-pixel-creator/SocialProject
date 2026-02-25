import {
  derivePredictionHistoryStats,
  filterAndSortPredictionHistory,
} from '../lib/predictionHistory';

describe('predictionHistory helpers', () => {
  const predictions = [
    {
      resolvedOutcome: null,
      isCorrect: null,
      stakePoints: 10,
      payoutPoints: 0,
      createdAt: '2026-02-25T10:00:00.000Z',
      resolvedAt: null,
    },
    {
      resolvedOutcome: 'merge' as const,
      isCorrect: true,
      stakePoints: 12,
      payoutPoints: 20,
      createdAt: '2026-02-25T09:00:00.000Z',
      resolvedAt: '2026-02-25T09:20:00.000Z',
    },
    {
      resolvedOutcome: 'reject' as const,
      isCorrect: false,
      stakePoints: 8,
      payoutPoints: 0,
      createdAt: '2026-02-25T08:00:00.000Z',
      resolvedAt: '2026-02-25T08:30:00.000Z',
    },
  ];

  test('derivePredictionHistoryStats computes counts, accuracy, and net points', () => {
    const stats = derivePredictionHistoryStats(predictions);

    expect(stats).toEqual({
      total: 3,
      resolved: 2,
      pending: 1,
      correct: 1,
      accuracyRate: 0.5,
      netPoints: -10,
    });
  });

  test('filterAndSortPredictionHistory sorts all view with pending first then newest', () => {
    const result = filterAndSortPredictionHistory(predictions, 'all');

    expect(result[0]?.resolvedOutcome).toBeNull();
    expect(result[1]?.resolvedOutcome).toBe('merge');
    expect(result[2]?.resolvedOutcome).toBe('reject');
  });

  test('filterAndSortPredictionHistory filters resolved and pending views', () => {
    const resolved = filterAndSortPredictionHistory(predictions, 'resolved');
    const pending = filterAndSortPredictionHistory(predictions, 'pending');

    expect(resolved).toHaveLength(2);
    expect(resolved.every((item) => item.resolvedOutcome !== null)).toBe(true);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.resolvedOutcome).toBeNull();
  });

  test('filterAndSortPredictionHistory supports net and stake sort modes', () => {
    const byNet = filterAndSortPredictionHistory(
      predictions,
      'all',
      'net_desc',
    );
    const byStake = filterAndSortPredictionHistory(
      predictions,
      'all',
      'stake_desc',
    );

    expect(
      byNet[0]?.payoutPoints - byNet[0]?.stakePoints,
    ).toBeGreaterThanOrEqual(
      (byNet[1]?.payoutPoints ?? 0) - (byNet[1]?.stakePoints ?? 0),
    );
    expect(byStake[0]?.stakePoints).toBeGreaterThanOrEqual(
      byStake[1]?.stakePoints ?? 0,
    );
  });
});
