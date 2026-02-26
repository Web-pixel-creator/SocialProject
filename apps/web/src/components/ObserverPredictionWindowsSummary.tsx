'use client';

import {
  normalizePredictionResolutionWindowThresholds,
  resolvePredictionResolutionWindowRiskLevel,
} from '../lib/predictionResolutionWindowRisk';

interface PredictionRecentWindow {
  size: number;
  resolved: number;
  correct: number;
  rate: number;
}

interface PredictionTimeWindow {
  days: number;
  resolved: number;
  correct: number;
  rate: number;
  netPoints: number;
  riskLevel?: string | null;
}

interface ObserverPredictionWindowsSummaryProps {
  recentWindow?: PredictionRecentWindow | null;
  thresholds?: unknown;
  timeWindows?: {
    d7: PredictionTimeWindow;
    d30: PredictionTimeWindow;
  } | null;
  t: (key: string) => string;
}

const defaultRecentWindow: PredictionRecentWindow = {
  size: 10,
  resolved: 0,
  correct: 0,
  rate: 0,
};

const defaultTimeWindows: {
  d7: PredictionTimeWindow;
  d30: PredictionTimeWindow;
} = {
  d7: {
    days: 7,
    resolved: 0,
    correct: 0,
    rate: 0,
    netPoints: 0,
    riskLevel: 'unknown',
  },
  d30: {
    days: 30,
    resolved: 0,
    correct: 0,
    rate: 0,
    netPoints: 0,
    riskLevel: 'unknown',
  },
};

const riskBadgeClassName = (riskLevel: string): string => {
  if (riskLevel === 'healthy') {
    return 'border-chart-2/45 bg-chart-2/12 text-chart-2';
  }
  if (riskLevel === 'watch') {
    return 'border-chart-3/45 bg-chart-3/12 text-chart-3';
  }
  if (riskLevel === 'critical') {
    return 'border-destructive/45 bg-destructive/12 text-destructive';
  }
  return 'border-border/35 bg-background/58 text-muted-foreground';
};

export const ObserverPredictionWindowsSummary = ({
  recentWindow,
  thresholds,
  timeWindows,
  t,
}: ObserverPredictionWindowsSummaryProps) => {
  const resolvedRecentWindow = recentWindow ?? defaultRecentWindow;
  const resolvedTimeWindows = timeWindows ?? defaultTimeWindows;
  const predictionResolutionThresholds =
    normalizePredictionResolutionWindowThresholds(thresholds);

  const riskLevel7d = resolvePredictionResolutionWindowRiskLevel({
    window: resolvedTimeWindows.d7,
    thresholds: predictionResolutionThresholds,
  });
  const riskLevel30d = resolvePredictionResolutionWindowRiskLevel({
    window: resolvedTimeWindows.d30,
    thresholds: predictionResolutionThresholds,
  });

  return (
    <>
      <p className="text-muted-foreground text-xs">
        {t('observerProfile.recentWindowAccuracy')} ({resolvedRecentWindow.size}
        ): {Math.round(resolvedRecentWindow.rate * 100)}% (
        {resolvedRecentWindow.correct}/{resolvedRecentWindow.resolved})
      </p>
      <p className="text-muted-foreground text-xs">
        7d: {Math.round(resolvedTimeWindows.d7.rate * 100)}% (
        {resolvedTimeWindows.d7.correct}/{resolvedTimeWindows.d7.resolved}),{' '}
        {t('observerProfile.predictionNet')}:{' '}
        {resolvedTimeWindows.d7.netPoints >= 0 ? '+' : ''}
        {resolvedTimeWindows.d7.netPoints} | 30d:{' '}
        {Math.round(resolvedTimeWindows.d30.rate * 100)}% (
        {resolvedTimeWindows.d30.correct}/{resolvedTimeWindows.d30.resolved}),{' '}
        {t('observerProfile.predictionNet')}:{' '}
        {resolvedTimeWindows.d30.netPoints >= 0 ? '+' : ''}
        {resolvedTimeWindows.d30.netPoints}
      </p>
      <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <span>{t('observerProfile.predictionWindowRisk7d')}:</span>
        <span
          className={`rounded-full border px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wide ${riskBadgeClassName(
            riskLevel7d,
          )}`}
        >
          {t(`observerProfile.health.${riskLevel7d}`)}
        </span>
        <span>{t('observerProfile.predictionWindowRisk30d')}:</span>
        <span
          className={`rounded-full border px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wide ${riskBadgeClassName(
            riskLevel30d,
          )}`}
        >
          {t(`observerProfile.health.${riskLevel30d}`)}
        </span>
        <span>
          {t('observerProfile.predictionWindowRiskMinSample')}:{' '}
          {predictionResolutionThresholds.minResolvedPredictions}
        </span>
        <span>
          {t('observerProfile.predictionWindowRiskThresholds')}: watch &lt;
          {Math.round(
            predictionResolutionThresholds.accuracyRate.watchBelow * 100,
          )}
          %, critical &lt;
          {Math.round(
            predictionResolutionThresholds.accuracyRate.criticalBelow * 100,
          )}
          %
        </span>
      </p>
    </>
  );
};
