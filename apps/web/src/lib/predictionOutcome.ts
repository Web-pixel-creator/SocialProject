export type PredictionOutcome = 'merge' | 'reject';

export const formatPredictionOutcomeLabel = (
  outcome: PredictionOutcome,
  t: (key: string) => string,
): string => {
  if (outcome === 'merge') {
    return t('observerProfile.predictionOutcomeMerge');
  }
  return t('observerProfile.predictionOutcomeReject');
};
