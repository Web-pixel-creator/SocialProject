export type PredictionHistoryFilter = 'all' | 'resolved' | 'pending';
export type PredictionHistorySort = 'net_desc' | 'recent' | 'stake_desc';

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

export interface PredictionResolutionOutcomeStat {
  predictedOutcome: 'merge' | 'reject';
  resolved: number;
  correct: number;
  accuracyRate: number;
}

export interface PredictionResolutionBreakdown {
  averageStake: number;
  byPredictedOutcome: PredictionResolutionOutcomeStat[];
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

export const derivePredictionResolutionBreakdown = <
  T extends PredictionHistoryItem & { predictedOutcome: 'merge' | 'reject' },
>(
  predictions: T[],
): PredictionResolutionBreakdown => {
  let totalStake = 0;
  let mergeResolved = 0;
  let mergeCorrect = 0;
  let rejectResolved = 0;
  let rejectCorrect = 0;

  for (const prediction of predictions) {
    totalStake += prediction.stakePoints;
    if (prediction.resolvedOutcome === null) {
      continue;
    }
    if (prediction.predictedOutcome === 'merge') {
      mergeResolved += 1;
      if (prediction.isCorrect === true) {
        mergeCorrect += 1;
      }
      continue;
    }
    rejectResolved += 1;
    if (prediction.isCorrect === true) {
      rejectCorrect += 1;
    }
  }

  const averageStake =
    predictions.length > 0 ? Math.round(totalStake / predictions.length) : 0;

  return {
    averageStake,
    byPredictedOutcome: [
      {
        predictedOutcome: 'merge',
        resolved: mergeResolved,
        correct: mergeCorrect,
        accuracyRate: mergeResolved > 0 ? mergeCorrect / mergeResolved : 0,
      },
      {
        predictedOutcome: 'reject',
        resolved: rejectResolved,
        correct: rejectCorrect,
        accuracyRate: rejectResolved > 0 ? rejectCorrect / rejectResolved : 0,
      },
    ],
  };
};

export const filterAndSortPredictionHistory = <T extends PredictionHistoryItem>(
  predictions: T[],
  filter: PredictionHistoryFilter,
  sort: PredictionHistorySort = 'recent',
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
    const leftTimestamp =
      left.resolvedOutcome === null
        ? toTimestamp(left.createdAt)
        : Math.max(toTimestamp(left.resolvedAt), toTimestamp(left.createdAt));
    const rightTimestamp =
      right.resolvedOutcome === null
        ? toTimestamp(right.createdAt)
        : Math.max(toTimestamp(right.resolvedAt), toTimestamp(right.createdAt));

    const leftNetPoints = left.payoutPoints - left.stakePoints;
    const rightNetPoints = right.payoutPoints - right.stakePoints;

    if (sort === 'net_desc') {
      if (rightNetPoints !== leftNetPoints) {
        return rightNetPoints - leftNetPoints;
      }
      return rightTimestamp - leftTimestamp;
    }

    if (sort === 'stake_desc') {
      if (right.stakePoints !== left.stakePoints) {
        return right.stakePoints - left.stakePoints;
      }
      return rightTimestamp - leftTimestamp;
    }

    if (filter === 'all') {
      const leftPending = left.resolvedOutcome === null;
      const rightPending = right.resolvedOutcome === null;
      if (leftPending !== rightPending) {
        return leftPending ? -1 : 1;
      }
    }

    return rightTimestamp - leftTimestamp;
  });
};
