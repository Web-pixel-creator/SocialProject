'use client';

import { formatPredictionTrustTier } from '../lib/predictionTier';

interface ObserverPredictionMarketSummaryMarket {
  trustTier: 'entry' | 'regular' | 'trusted' | 'elite';
  maxStakePoints: number;
  dailyStakeCapPoints: number;
  dailyStakeUsedPoints: number;
  dailyStakeRemainingPoints: number;
  dailySubmissionCap: number;
  dailySubmissionsUsed: number;
  dailySubmissionsRemaining: number;
}

interface ObserverPredictionMarketSummaryProps {
  market?: ObserverPredictionMarketSummaryMarket | null;
  t: (key: string) => string;
}

export const ObserverPredictionMarketSummary = ({
  market,
  t,
}: ObserverPredictionMarketSummaryProps) => {
  if (!market) {
    return null;
  }

  const formattedPredictionTier = formatPredictionTrustTier(
    market.trustTier,
    t,
  );

  return (
    <>
      <p className="text-muted-foreground text-xs">
        {t('observerProfile.marketTier')}: {formattedPredictionTier} |{' '}
        {t('observerProfile.maxStake')}: {market.maxStakePoints}
      </p>
      <p className="text-muted-foreground text-xs">
        {t('observerProfile.dailyStake')}: {market.dailyStakeUsedPoints}/
        {market.dailyStakeCapPoints} ({t('observerProfile.remaining')}{' '}
        {market.dailyStakeRemainingPoints}) |{' '}
        {t('observerProfile.dailySubmissions')}: {market.dailySubmissionsUsed}/
        {market.dailySubmissionCap} ({t('observerProfile.remaining')}{' '}
        {market.dailySubmissionsRemaining})
      </p>
    </>
  );
};
