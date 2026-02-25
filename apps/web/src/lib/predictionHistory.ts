export type PredictionHistoryFilter = 'all' | 'resolved' | 'pending';

export interface PredictionHistoryItem {
  resolvedOutcome: 'merge' | 'reject' | null;
  isCorrect: boolean | null;
  stakePoints: number;
  payoutPoints: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PredictionHistoryStats {
  total: number;
  resolved: number;
  pending: number;
  correct: number;
  accuracyRate: number;
  netPoints: number;
}

const toTimestamp = (value: string | null): number => {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const derivePredictionHistoryStats = (
  predictions: PredictionHistoryItem[],
): PredictionHistoryStats => {
  let resolved = 0;
  let correct = 0;
  let netPoints = 0;

  for (const prediction of predictions) {
    if (prediction.resolvedOutcome !== null) {
      resolved += 1;
      if (prediction.isCorrect === true) {
        correct += 1;
      }
    }
    netPoints += prediction.payoutPoints - prediction.stakePoints;
  }

  const total = predictions.length;
  const pending = Math.max(0, total - resolved);
  const accuracyRate = resolved > 0 ? correct / resolved : 0;

  return {
    total,
    resolved,
    pending,
    correct,
    accuracyRate,
    netPoints,
  };
};

export const filterAndSortPredictionHistory = <T extends PredictionHistoryItem>(
  predictions: T[],
  filter: PredictionHistoryFilter,
): T[] => {
  const filtered = predictions.filter((prediction) => {
    if (filter === 'resolved') {
      return prediction.resolvedOutcome !== null;
    }
    if (filter === 'pending') {
      return prediction.resolvedOutcome === null;
    }
    return true;
  });

  return [...filtered].sort((left, right) => {
    if (filter === 'all') {
      const leftPending = left.resolvedOutcome === null;
      const rightPending = right.resolvedOutcome === null;
      if (leftPending !== rightPending) {
        return leftPending ? -1 : 1;
      }
    }

    const leftTimestamp =
      left.resolvedOutcome === null
        ? toTimestamp(left.createdAt)
        : Math.max(toTimestamp(left.resolvedAt), toTimestamp(left.createdAt));
    const rightTimestamp =
      right.resolvedOutcome === null
        ? toTimestamp(right.createdAt)
        : Math.max(toTimestamp(right.resolvedAt), toTimestamp(right.createdAt));

    return rightTimestamp - leftTimestamp;
  });
};
