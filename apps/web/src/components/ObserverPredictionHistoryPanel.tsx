'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '../lib/api';
import {
  derivePredictionHistoryStats,
  filterAndSortPredictionHistory,
  type PredictionHistoryFilter,
  type PredictionHistoryItem,
} from '../lib/predictionHistory';

export interface ObserverPredictionHistoryEntry extends PredictionHistoryItem {
  id: string;
  draftId: string;
  draftTitle: string;
  predictedOutcome: 'merge' | 'reject';
}

interface ObserverPredictionHistoryPanelProps {
  focusRingClass: string;
  predictions: ObserverPredictionHistoryEntry[];
  telemetryScope: 'self' | 'public';
  t: (key: string) => string;
}

const PREDICTION_FILTER_STORAGE_PREFIX = 'finishit:observer-prediction-filter';

const isPredictionHistoryFilter = (
  value: unknown,
): value is PredictionHistoryFilter =>
  value === 'all' || value === 'resolved' || value === 'pending';

const predictionFilterStorageKey = (
  scope: ObserverPredictionHistoryPanelProps['telemetryScope'],
): string => `${PREDICTION_FILTER_STORAGE_PREFIX}:${scope}`;

const readStoredPredictionFilter = (
  scope: ObserverPredictionHistoryPanelProps['telemetryScope'],
): PredictionHistoryFilter => {
  if (typeof window === 'undefined') {
    return 'all';
  }
  try {
    const raw = window.localStorage.getItem(predictionFilterStorageKey(scope));
    return isPredictionHistoryFilter(raw) ? raw : 'all';
  } catch {
    return 'all';
  }
};

const writeStoredPredictionFilter = (
  scope: ObserverPredictionHistoryPanelProps['telemetryScope'],
  filter: PredictionHistoryFilter,
): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(predictionFilterStorageKey(scope), filter);
  } catch {
    // ignore localStorage failures
  }
};

const getPredictionResultLabel = (
  prediction: ObserverPredictionHistoryEntry,
  t: (key: string) => string,
): string => {
  if (prediction.resolvedOutcome === null) {
    return t('observerProfile.pending');
  }
  if (prediction.isCorrect === true) {
    return t('observerProfile.predictionResultCorrect');
  }
  return t('observerProfile.predictionResultIncorrect');
};

const getPredictionResultClassName = (
  prediction: ObserverPredictionHistoryEntry,
): string => {
  if (prediction.resolvedOutcome === null) {
    return 'text-muted-foreground';
  }
  if (prediction.isCorrect === true) {
    return 'text-chart-2';
  }
  return 'text-destructive';
};

const formatPredictionNetPoints = (
  prediction: ObserverPredictionHistoryEntry,
): string => {
  const netPoints = prediction.payoutPoints - prediction.stakePoints;
  return `${netPoints >= 0 ? '+' : ''}${netPoints}`;
};

export const ObserverPredictionHistoryPanel = ({
  focusRingClass,
  predictions,
  telemetryScope,
  t,
}: ObserverPredictionHistoryPanelProps) => {
  const [predictionFilter, setPredictionFilter] =
    useState<PredictionHistoryFilter>(() =>
      readStoredPredictionFilter(telemetryScope),
    );

  const sendTelemetry = (payload: Record<string, unknown>): void => {
    if (typeof apiClient.post !== 'function') {
      return;
    }
    try {
      Promise.resolve(apiClient.post('/telemetry/ux', payload)).catch(() => {
        // ignore telemetry failures
      });
    } catch {
      // ignore telemetry failures
    }
  };

  const handlePredictionFilterChange = (
    nextFilter: PredictionHistoryFilter,
  ) => {
    if (nextFilter === predictionFilter) {
      return;
    }
    sendTelemetry({
      eventType: 'observer_prediction_filter_change',
      metadata: {
        filter: nextFilter,
        previousFilter: predictionFilter,
        scope: telemetryScope,
        total: predictionStats.total,
        resolved: predictionStats.resolved,
        pending: predictionStats.pending,
      },
    });
    writeStoredPredictionFilter(telemetryScope, nextFilter);
    setPredictionFilter(nextFilter);
  };

  const predictionStats = derivePredictionHistoryStats(predictions);
  const filteredPredictions = filterAndSortPredictionHistory(
    predictions,
    predictionFilter,
  );
  const hasPredictions = predictions.length > 0;
  const emptyStateMessage = hasPredictions
    ? t('observerProfile.noPredictionsInFilter')
    : t('observerProfile.noPredictions');

  return (
    <section className="card grid gap-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground text-lg">
          {t('observerProfile.predictionsTitle')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            aria-pressed={predictionFilter === 'all'}
            className={`rounded-full border px-3 py-1.5 font-semibold text-xs transition ${
              predictionFilter === 'all'
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/35 bg-background/58 text-foreground hover:bg-background/74'
            } ${focusRingClass}`}
            onClick={() => {
              handlePredictionFilterChange('all');
            }}
            type="button"
          >
            {t('observerProfile.predictionFilterAll')} ({predictionStats.total})
          </button>
          <button
            aria-pressed={predictionFilter === 'resolved'}
            className={`rounded-full border px-3 py-1.5 font-semibold text-xs transition ${
              predictionFilter === 'resolved'
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/35 bg-background/58 text-foreground hover:bg-background/74'
            } ${focusRingClass}`}
            onClick={() => {
              handlePredictionFilterChange('resolved');
            }}
            type="button"
          >
            {t('observerProfile.predictionFilterResolved')} (
            {predictionStats.resolved})
          </button>
          <button
            aria-pressed={predictionFilter === 'pending'}
            className={`rounded-full border px-3 py-1.5 font-semibold text-xs transition ${
              predictionFilter === 'pending'
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/35 bg-background/58 text-foreground hover:bg-background/74'
            } ${focusRingClass}`}
            onClick={() => {
              handlePredictionFilterChange('pending');
            }}
            type="button"
          >
            {t('observerProfile.predictionFilterPending')} (
            {predictionStats.pending})
          </button>
        </div>
      </div>
      {hasPredictions ? (
        <p className="text-muted-foreground text-xs">
          {t('observerProfile.resolved')}: {predictionStats.resolved} |{' '}
          {t('observerProfile.pending')}: {predictionStats.pending} |{' '}
          {t('observerProfile.cards.predictionAccuracy')}:{' '}
          {Math.round(predictionStats.accuracyRate * 100)}% |{' '}
          {t('observerProfile.predictionNet')}:{' '}
          {predictionStats.netPoints >= 0 ? '+' : ''}
          {predictionStats.netPoints}
        </p>
      ) : null}
      {filteredPredictions.length > 0 ? (
        <ul className="grid gap-2">
          {filteredPredictions.map((prediction) => (
            <li
              className="rounded-xl border border-border/25 bg-background/58 p-3"
              key={prediction.id}
            >
              <Link
                className={`font-semibold text-foreground transition hover:text-primary ${focusRingClass}`}
                href={`/drafts/${prediction.draftId}`}
              >
                {prediction.draftTitle}
              </Link>
              <p className="text-muted-foreground text-xs">
                {t('observerProfile.predicted')}: {prediction.predictedOutcome}{' '}
                | {t('observerProfile.resolved')}:{' '}
                {prediction.resolvedOutcome ?? t('observerProfile.pending')}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('observerProfile.stake')}: {prediction.stakePoints} |{' '}
                {t('observerProfile.payout')}: {prediction.payoutPoints}
              </p>
              <p
                className={`text-xs ${getPredictionResultClassName(prediction)}`}
              >
                {getPredictionResultLabel(prediction, t)} |{' '}
                {t('observerProfile.predictionNet')}:{' '}
                {formatPredictionNetPoints(prediction)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{emptyStateMessage}</p>
      )}
    </section>
  );
};
