import type { PredictionMarketSnapshot } from './predictionMarket';

type Translate = (key: string) => string;

const formatMultiplier = (value: number | null): string =>
  (value ?? 0).toFixed(2);

export const formatPredictionMarketPoolLine = (
  t: Translate,
  snapshot: PredictionMarketSnapshot,
): string =>
  `${t('prediction.marketPool')} ${snapshot.marketPoolPoints ?? 0} FIN | ${t('pr.merge')} ${snapshot.mergeStakePoints} | ${t('pr.reject')} ${snapshot.rejectStakePoints}`;

export const formatPredictionOddsLine = (
  t: Translate,
  snapshot: PredictionMarketSnapshot,
): string =>
  `${t('prediction.oddsLabel')} ${t('pr.merge')} ${snapshot.mergeOddsPercent ?? 0}% (x${formatMultiplier(snapshot.mergePayoutMultiplier)}) | ${t('pr.reject')} ${snapshot.rejectOddsPercent ?? 0}% (x${formatMultiplier(snapshot.rejectPayoutMultiplier)})`;

export const formatPredictionPayoutLine = (
  t: Translate,
  snapshot: PredictionMarketSnapshot,
): string =>
  `${t('prediction.potentialPayoutLabel')} ${t('pr.merge')} ${snapshot.potentialMergePayout ?? 0} FIN | ${t('pr.reject')} ${snapshot.potentialRejectPayout ?? 0} FIN`;

interface FormatPredictionUsageLineOptions {
  includeRemaining: boolean;
  unknownCapLabel: string;
}

export const formatPredictionUsageLine = (
  t: Translate,
  snapshot: PredictionMarketSnapshot,
  options: FormatPredictionUsageLineOptions,
): string => {
  const stakeUsed = snapshot.dailyStakeUsedPoints ?? 0;
  const stakeCap = snapshot.dailyStakeCapPoints ?? options.unknownCapLabel;
  const submissionsUsed = snapshot.dailySubmissionsUsed ?? 0;
  const submissionsCap = snapshot.dailySubmissionCap ?? options.unknownCapLabel;
  const stakeRemainingPart = options.includeRemaining
    ? ` (${t('observerProfile.remaining')} ${snapshot.dailyStakeRemainingPoints ?? options.unknownCapLabel})`
    : '';
  const submissionsRemainingPart = options.includeRemaining
    ? ` (${t('observerProfile.remaining')} ${snapshot.dailySubmissionsRemaining ?? options.unknownCapLabel})`
    : '';

  return `${t('prediction.dailyStakeLabel')} ${stakeUsed}/${stakeCap}${stakeRemainingPart} | ${t('prediction.dailySubmissionsLabel')} ${submissionsUsed}/${submissionsCap}${submissionsRemainingPart}`;
};

export const formatPredictionNetPointsLine = (
  t: Translate,
  observerNetPoints: number | null,
): string => `${t('prediction.netPoints')} ${observerNetPoints ?? 0} FIN`;
