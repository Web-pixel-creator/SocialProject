import { asPredictionNumber } from './predictionStake';
import {
  isPredictionTrustTier,
  type PredictionTrustTier,
} from './predictionTier';

export interface BuildPredictionMarketSnapshotInput {
  dailyStakeCapPoints?: unknown;
  dailyStakeUsedPoints?: unknown;
  dailySubmissionCap?: unknown;
  dailySubmissionsUsed?: unknown;
  marketPoolPoints?: unknown;
  mergeOdds?: unknown;
  mergePayoutMultiplier?: unknown;
  mergeStakePoints?: unknown;
  observerNetPoints?: unknown;
  potentialMergePayout?: unknown;
  potentialRejectPayout?: unknown;
  rejectOdds?: unknown;
  rejectPayoutMultiplier?: unknown;
  rejectStakePoints?: unknown;
  stakePointsForPotential?: number;
  totalStakePoints?: unknown;
  trustTier?: unknown;
}

export interface PredictionMarketSnapshot {
  dailyStakeCapPoints: number | null;
  dailyStakeRemainingPoints: number | null;
  dailyStakeUsedPoints: number | null;
  dailySubmissionCap: number | null;
  dailySubmissionsRemaining: number | null;
  dailySubmissionsUsed: number | null;
  hasMarketSummary: boolean;
  hasObserverMarketProfile: boolean;
  hasPotentialPayout: boolean;
  hasUsageCaps: boolean;
  marketPoolPoints: number | null;
  mergeOddsPercent: number | null;
  mergeOddsRatio: number | null;
  mergePayoutMultiplier: number | null;
  mergeStakePoints: number;
  observerNetPoints: number | null;
  potentialMergePayout: number | null;
  potentialRejectPayout: number | null;
  rejectOddsPercent: number | null;
  rejectOddsRatio: number | null;
  rejectPayoutMultiplier: number | null;
  rejectStakePoints: number;
  totalStakePoints: number;
  trustTier: PredictionTrustTier | null;
}

const clampProbability = (value: number): number =>
  Math.max(0, Math.min(1, value));

const toOddsPercent = (value: number | null): number | null => {
  if (value === null) {
    return null;
  }
  return Math.round(clampProbability(value) * 100);
};

export const buildPredictionMarketSnapshot = ({
  dailyStakeCapPoints,
  dailyStakeUsedPoints,
  dailySubmissionCap,
  dailySubmissionsUsed,
  marketPoolPoints,
  mergeOdds,
  mergePayoutMultiplier,
  mergeStakePoints,
  observerNetPoints,
  potentialMergePayout,
  potentialRejectPayout,
  rejectOdds,
  rejectPayoutMultiplier,
  rejectStakePoints,
  stakePointsForPotential,
  totalStakePoints,
  trustTier,
}: BuildPredictionMarketSnapshotInput): PredictionMarketSnapshot => {
  const mergeStake = Math.max(0, asPredictionNumber(mergeStakePoints) ?? 0);
  const rejectStake = Math.max(0, asPredictionNumber(rejectStakePoints) ?? 0);
  const totalStakeRaw =
    asPredictionNumber(totalStakePoints) ?? mergeStake + rejectStake;
  const totalStake = Math.max(0, totalStakeRaw);
  const poolPointsRaw =
    asPredictionNumber(marketPoolPoints) ??
    (totalStake > 0 ? Math.round(totalStake) : null);
  const poolPoints = poolPointsRaw === null ? null : Math.max(0, poolPointsRaw);

  const mergeOddsRatioRaw =
    asPredictionNumber(mergeOdds) ??
    (totalStake > 0 ? mergeStake / totalStake : null);
  const rejectOddsRatioRaw =
    asPredictionNumber(rejectOdds) ??
    (totalStake > 0 ? rejectStake / totalStake : null);
  const mergeOddsRatio =
    mergeOddsRatioRaw === null ? null : clampProbability(mergeOddsRatioRaw);
  const rejectOddsRatio =
    rejectOddsRatioRaw === null ? null : clampProbability(rejectOddsRatioRaw);

  const mergeMultiplierRaw =
    asPredictionNumber(mergePayoutMultiplier) ??
    (mergeOddsRatio && mergeOddsRatio > 0 ? 1 / mergeOddsRatio : null);
  const rejectMultiplierRaw =
    asPredictionNumber(rejectPayoutMultiplier) ??
    (rejectOddsRatio && rejectOddsRatio > 0 ? 1 / rejectOddsRatio : null);
  const mergeMultiplier =
    mergeMultiplierRaw === null ? null : Math.max(0, mergeMultiplierRaw);
  const rejectMultiplier =
    rejectMultiplierRaw === null ? null : Math.max(0, rejectMultiplierRaw);

  const normalizedStakePoints = asPredictionNumber(stakePointsForPotential);
  const potentialMerge =
    asPredictionNumber(potentialMergePayout) ??
    (normalizedStakePoints !== null && mergeMultiplier !== null
      ? Math.max(0, Math.round(normalizedStakePoints * mergeMultiplier))
      : null);
  const potentialReject =
    asPredictionNumber(potentialRejectPayout) ??
    (normalizedStakePoints !== null && rejectMultiplier !== null
      ? Math.max(0, Math.round(normalizedStakePoints * rejectMultiplier))
      : null);

  const dailyStakeCap = asPredictionNumber(dailyStakeCapPoints);
  const dailyStakeUsed = asPredictionNumber(dailyStakeUsedPoints);
  const dailySubmissionCapPoints = asPredictionNumber(dailySubmissionCap);
  const dailySubmissions = asPredictionNumber(dailySubmissionsUsed);
  const dailyStakeRemaining =
    dailyStakeCap !== null && dailyStakeUsed !== null
      ? Math.max(0, dailyStakeCap - dailyStakeUsed)
      : null;
  const dailySubmissionsRemaining =
    dailySubmissionCapPoints !== null && dailySubmissions !== null
      ? Math.max(0, dailySubmissionCapPoints - dailySubmissions)
      : null;

  const normalizedTrustTier = isPredictionTrustTier(trustTier)
    ? trustTier
    : null;

  const hasMarketSummary =
    poolPoints !== null || mergeOddsRatio !== null || rejectOddsRatio !== null;
  const hasPotentialPayout =
    potentialMerge !== null || potentialReject !== null;
  const hasObserverMarketProfile =
    asPredictionNumber(observerNetPoints) !== null ||
    normalizedTrustTier !== null;
  const hasUsageCaps =
    dailyStakeCap !== null ||
    dailyStakeUsed !== null ||
    dailySubmissionCapPoints !== null ||
    dailySubmissions !== null;

  return {
    dailyStakeCapPoints: dailyStakeCap,
    dailyStakeRemainingPoints: dailyStakeRemaining,
    dailyStakeUsedPoints: dailyStakeUsed,
    dailySubmissionCap: dailySubmissionCapPoints,
    dailySubmissionsRemaining,
    dailySubmissionsUsed: dailySubmissions,
    hasMarketSummary,
    hasObserverMarketProfile,
    hasPotentialPayout,
    hasUsageCaps,
    marketPoolPoints: poolPoints,
    mergeOddsPercent: toOddsPercent(mergeOddsRatio),
    mergeOddsRatio,
    mergePayoutMultiplier: mergeMultiplier,
    mergeStakePoints: mergeStake,
    observerNetPoints: asPredictionNumber(observerNetPoints),
    potentialMergePayout: potentialMerge,
    potentialRejectPayout: potentialReject,
    rejectOddsPercent: toOddsPercent(rejectOddsRatio),
    rejectOddsRatio,
    rejectPayoutMultiplier: rejectMultiplier,
    rejectStakePoints: rejectStake,
    totalStakePoints: Math.round(totalStake),
    trustTier: normalizedTrustTier,
  };
};
