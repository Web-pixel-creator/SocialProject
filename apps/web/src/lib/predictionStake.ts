export interface PredictionStakeBounds {
  minStakePoints: number;
  maxStakePoints: number;
}

interface NormalizePredictionStakeBoundsInput {
  minStakePoints?: number | null;
  maxStakePoints?: number | null;
  defaultMinStakePoints?: number;
  defaultMaxStakePoints?: number;
}

interface ResolvePredictionStakeInputInput {
  rawValue: number | string;
  bounds: PredictionStakeBounds;
  fallbackStakePoints?: number;
}

interface DerivePredictionUsageLimitStateInput {
  hasExistingPrediction: boolean;
  stakePoints: number;
  dailyStakeCapPoints?: number | null;
  dailyStakeUsedPoints?: number | null;
  dailySubmissionCap?: number | null;
  dailySubmissionsUsed?: number | null;
}

export interface PredictionUsageLimitState {
  dailyStakeCapReached: boolean;
  dailySubmissionCapReached: boolean;
}

export interface PredictionStakeResolution {
  adjusted: boolean;
  stakePoints: number;
}

export const asPredictionNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const normalizePredictionStakeBounds = ({
  minStakePoints,
  maxStakePoints,
  defaultMinStakePoints = 5,
  defaultMaxStakePoints = 500,
}: NormalizePredictionStakeBoundsInput): PredictionStakeBounds => {
  const resolvedMin = Math.max(
    1,
    Math.round(asPredictionNumber(minStakePoints) ?? defaultMinStakePoints),
  );
  const resolvedMax = Math.max(
    resolvedMin,
    Math.round(asPredictionNumber(maxStakePoints) ?? defaultMaxStakePoints),
  );

  return {
    minStakePoints: resolvedMin,
    maxStakePoints: resolvedMax,
  };
};

export const isPredictionStakeWithinBounds = (
  stakePoints: number,
  bounds: PredictionStakeBounds,
): boolean =>
  Number.isInteger(stakePoints) &&
  stakePoints >= bounds.minStakePoints &&
  stakePoints <= bounds.maxStakePoints;

export const resolvePredictionStakeInput = ({
  rawValue,
  bounds,
  fallbackStakePoints,
}: ResolvePredictionStakeInputInput): PredictionStakeResolution => {
  const numericValue =
    typeof rawValue === 'number' ? rawValue : Number(rawValue);
  const fallbackValue =
    asPredictionNumber(fallbackStakePoints) ?? bounds.minStakePoints;
  const baseValue = Number.isFinite(numericValue)
    ? numericValue
    : fallbackValue;
  const roundedValue = Math.round(baseValue);
  const boundedValue = Math.max(
    bounds.minStakePoints,
    Math.min(bounds.maxStakePoints, roundedValue),
  );

  return {
    adjusted:
      !Number.isFinite(numericValue) ||
      roundedValue !== baseValue ||
      boundedValue !== roundedValue,
    stakePoints: boundedValue,
  };
};

export const derivePredictionUsageLimitState = ({
  hasExistingPrediction,
  stakePoints,
  dailyStakeCapPoints,
  dailyStakeUsedPoints,
  dailySubmissionCap,
  dailySubmissionsUsed,
}: DerivePredictionUsageLimitStateInput): PredictionUsageLimitState => {
  const stakeCap = asPredictionNumber(dailyStakeCapPoints);
  const stakeUsed = asPredictionNumber(dailyStakeUsedPoints);
  const submissionCap = asPredictionNumber(dailySubmissionCap);
  const submissionsUsed = asPredictionNumber(dailySubmissionsUsed);

  const projectedStake = stakeUsed !== null ? stakeUsed + stakePoints : null;

  const dailyStakeCapReached =
    !hasExistingPrediction &&
    stakeCap !== null &&
    projectedStake !== null &&
    projectedStake > stakeCap;
  const dailySubmissionCapReached =
    !hasExistingPrediction &&
    submissionCap !== null &&
    submissionsUsed !== null &&
    submissionsUsed >= submissionCap;

  return {
    dailyStakeCapReached,
    dailySubmissionCapReached,
  };
};
