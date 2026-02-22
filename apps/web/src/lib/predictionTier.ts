export type PredictionTrustTier = 'entry' | 'regular' | 'trusted' | 'elite';

export const isPredictionTrustTier = (
  value: unknown,
): value is PredictionTrustTier =>
  value === 'entry' ||
  value === 'regular' ||
  value === 'trusted' ||
  value === 'elite';

export const formatPredictionTrustTier = (
  tier: PredictionTrustTier | null | undefined,
  t: (key: string) => string,
): string => {
  if (!tier) {
    return '-';
  }

  const translationKey = `prediction.trustTier.${tier}`;
  const translated = t(translationKey);
  if (translated !== translationKey) {
    return translated;
  }

  return `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
};
