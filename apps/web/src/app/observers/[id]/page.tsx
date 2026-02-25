'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient } from '../../../lib/api';
import { getApiErrorMessage, getApiErrorStatus } from '../../../lib/errors';
import {
  derivePredictionHistoryStats,
  filterAndSortPredictionHistory,
  type PredictionHistoryFilter,
} from '../../../lib/predictionHistory';
import { formatPredictionTrustTier } from '../../../lib/predictionTier';

interface ObserverProfileStudio {
  id: string;
  studioName: string;
  impact: number;
  signal: number;
  followerCount: number;
  followedAt: string;
}

interface ObserverProfileWatchlist {
  draftId: string;
  draftTitle: string;
  updatedAt: string;
  glowUpScore: number;
  studioId: string;
  studioName: string;
}

interface ObserverProfilePrediction {
  id: string;
  pullRequestId: string;
  draftId: string;
  draftTitle: string;
  predictedOutcome: 'merge' | 'reject';
  resolvedOutcome: 'merge' | 'reject' | null;
  isCorrect: boolean | null;
  stakePoints: number;
  payoutPoints: number;
  createdAt: string;
  resolvedAt: string | null;
}

interface ObserverPublicProfileResponse {
  observer: {
    id: string;
    handle: string;
    createdAt: string;
  };
  counts: {
    followingStudios: number;
    watchlistDrafts: number;
  };
  predictions: {
    correct: number;
    total: number;
    rate: number;
    netPoints: number;
    market?: {
      trustTier: 'entry' | 'regular' | 'trusted' | 'elite';
      minStakePoints: number;
      maxStakePoints: number;
      dailyStakeCapPoints: number;
      dailyStakeUsedPoints: number;
      dailyStakeRemainingPoints: number;
      dailySubmissionCap: number;
      dailySubmissionsUsed: number;
      dailySubmissionsRemaining: number;
    };
  };
  followingStudios: ObserverProfileStudio[];
  watchlistHighlights: ObserverProfileWatchlist[];
  recentPredictions: ObserverProfilePrediction[];
}

const fetchObserverPublicProfile = async (
  key: readonly [string, string],
): Promise<ObserverPublicProfileResponse> => {
  const observerId = key[1];
  const response = await apiClient.get(`/observers/${observerId}/profile`, {
    params: {
      followingLimit: 8,
      watchlistLimit: 8,
      predictionLimit: 8,
    },
  });
  return response.data as ObserverPublicProfileResponse;
};

const formatDate = (value: string, locale: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getPredictionResultLabel = (
  prediction: ObserverProfilePrediction,
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
  prediction: ObserverProfilePrediction,
): string => {
  if (prediction.resolvedOutcome === null) {
    return 'text-muted-foreground';
  }
  if (prediction.isCorrect === true) {
    return 'text-chart-2';
  }
  return 'text-destructive';
};

const getPredictionNetPoints = (
  prediction: ObserverProfilePrediction,
): number => prediction.payoutPoints - prediction.stakePoints;

const formatPredictionNetPoints = (
  prediction: ObserverProfilePrediction,
): string => {
  const netPoints = getPredictionNetPoints(prediction);
  return `${netPoints >= 0 ? '+' : ''}${netPoints}`;
};

export default function ObserverPublicProfilePage() {
  const { t, language } = useLanguage();
  const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const [predictionFilter, setPredictionFilter] =
    useState<PredictionHistoryFilter>('all');
  const params = useParams<{ id: string }>();
  const observerIdParam = params?.id;
  const observerId = typeof observerIdParam === 'string' ? observerIdParam : '';

  const {
    data: profile,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<ObserverPublicProfileResponse>(
    observerId ? (['observer:public-profile', observerId] as const) : null,
    fetchObserverPublicProfile,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  if (!observerId) {
    return (
      <main className="card grid gap-3 p-4 sm:p-6">
        <h1 className="font-semibold text-2xl text-foreground">
          {t('observerPublicProfile.title')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('observerPublicProfile.invalidObserverId')}
        </p>
        <Link
          className={`glass-button inline-flex w-fit ${focusRingClass}`}
          href="/feed"
        >
          {t('feed.exploreFeeds')}
        </Link>
      </main>
    );
  }

  if (isLoading && !profile) {
    return (
      <main className="card p-4 text-muted-foreground text-sm sm:p-6">
        {t('observerPublicProfile.loading')}
      </main>
    );
  }

  const loadError = error
    ? getApiErrorMessage(error, t('observerPublicProfile.loadError'))
    : null;
  const loadErrorStatus = getApiErrorStatus(error);
  const observerNotFound = loadErrorStatus === 404;

  if (observerNotFound && !profile) {
    return (
      <main className="card grid gap-3 p-4 sm:p-6">
        <h1 className="font-semibold text-2xl text-foreground">
          {t('observerPublicProfile.title')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('observerPublicProfile.notFound')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className={`glass-button inline-flex w-fit ${focusRingClass}`}
            href="/feed"
          >
            {t('feed.exploreFeeds')}
          </Link>
          <Link
            className={`rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary ${focusRingClass}`}
            href="/observer/profile"
          >
            {t('observerProfile.title')}
          </Link>
        </div>
      </main>
    );
  }

  const summaryCards = [
    {
      label: t('observerProfile.cards.followingStudios'),
      value: profile?.counts.followingStudios ?? 0,
    },
    {
      label: t('observerProfile.cards.watchlistDrafts'),
      value: profile?.counts.watchlistDrafts ?? 0,
    },
    {
      label: t('observerProfile.cards.predictionAccuracy'),
      value: `${Math.round((profile?.predictions.rate ?? 0) * 100)}%`,
      description:
        profile?.predictions.total && profile.predictions.total > 0
          ? `${profile.predictions.correct}/${profile.predictions.total}`
          : t('observerProfile.noPredictions'),
    },
    {
      label: t('observerProfile.netPoints'),
      value: profile?.predictions.netPoints ?? 0,
    },
    {
      label: t('observerProfile.marketTier'),
      value: formatPredictionTrustTier(
        profile?.predictions.market?.trustTier,
        t,
      ),
      description: profile?.predictions.market
        ? `${t('observerProfile.maxStake')}: ${profile.predictions.market.maxStakePoints}`
        : undefined,
    },
  ];

  const observerHandle =
    profile?.observer.handle ?? t('observerPublicProfile.observerLabel');
  const recentPredictions = profile?.recentPredictions ?? [];
  const predictionStats = derivePredictionHistoryStats(recentPredictions);
  const filteredRecentPredictions = filterAndSortPredictionHistory(
    recentPredictions,
    predictionFilter,
  );

  return (
    <main className="grid gap-4 pb-8 sm:gap-5">
      <section className="card grid gap-2 p-4 sm:p-6">
        <p className="pill">{t('observerProfile.pill')}</p>
        <h1 className="text-balance font-semibold text-2xl text-foreground sm:text-3xl">
          {t('observerPublicProfile.title')}
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          {t('observerPublicProfile.subtitle')}
        </p>
        {profile?.observer ? (
          <p className="text-muted-foreground text-xs">
            {observerHandle} | {t('observerProfile.memberSince')}{' '}
            {formatDate(
              profile.observer.createdAt,
              language === 'ru' ? 'ru' : 'en',
            )}
          </p>
        ) : null}
      </section>

      {loadError ? (
        <section className="card grid gap-2 p-4 sm:p-5">
          <p className="text-destructive text-sm">{loadError}</p>
          <button
            className={`w-fit rounded-full border border-destructive/40 px-3 py-1.5 font-semibold text-[11px] text-destructive transition hover:bg-destructive/10 ${focusRingClass}`}
            onClick={() => {
              mutate();
            }}
            type="button"
          >
            {t('common.retry')}
          </button>
        </section>
      ) : null}

      <section className="card grid gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-foreground text-lg">
            {t('observerProfile.summaryTitle')}
          </h2>
          <button
            className={`rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary ${focusRingClass}`}
            disabled={isLoading || isValidating}
            onClick={() => {
              mutate();
            }}
            type="button"
          >
            {isValidating
              ? t('observerProfile.resyncing')
              : t('observerProfile.resync')}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map((card) => (
            <div
              className="rounded-xl border border-border/25 bg-background/58 p-3"
              key={card.label}
            >
              <p className="text-muted-foreground text-xs">{card.label}</p>
              <p className="mt-1 font-semibold text-2xl text-foreground">
                {card.value}
              </p>
              {card.description ? (
                <p className="mt-1 text-muted-foreground text-xs">
                  {card.description}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="card grid gap-2 p-4 sm:p-5">
        <h2 className="font-semibold text-foreground text-lg">
          {t('observerProfile.followingTitle')}
        </h2>
        {(profile?.followingStudios?.length ?? 0) > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {profile?.followingStudios.map((studio) => (
              <li
                className="rounded-xl border border-border/25 bg-background/58 p-3"
                key={studio.id}
              >
                <Link
                  className={`font-semibold text-foreground transition hover:text-primary ${focusRingClass}`}
                  href={`/studios/${studio.id}`}
                >
                  {studio.studioName}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {t('studioDetail.metrics.impact')} {studio.impact.toFixed(1)}{' '}
                  | {t('studioDetail.metrics.signal')}{' '}
                  {studio.signal.toFixed(1)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('studioCard.followersLabel')}: {studio.followerCount}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('observerProfile.followedAt')}:{' '}
                  {formatDate(
                    studio.followedAt,
                    language === 'ru' ? 'ru' : 'en',
                  )}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('observerProfile.emptyFollowing')}
          </p>
        )}
      </section>

      <section className="card grid gap-2 p-4 sm:p-5">
        <h2 className="font-semibold text-foreground text-lg">
          {t('observerProfile.watchlistTitle')}
        </h2>
        {(profile?.watchlistHighlights?.length ?? 0) > 0 ? (
          <ul className="grid gap-2">
            {profile?.watchlistHighlights.map((item) => (
              <li
                className="rounded-xl border border-border/25 bg-background/58 p-3"
                key={`${item.draftId}-${item.updatedAt}`}
              >
                <Link
                  className={`font-semibold text-foreground transition hover:text-primary ${focusRingClass}`}
                  href={`/drafts/${item.draftId}`}
                >
                  {item.draftTitle}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {item.studioName} | GlowUp {item.glowUpScore.toFixed(1)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('observerProfile.emptyWatchlist')}
          </p>
        )}
      </section>

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
                setPredictionFilter('all');
              }}
              type="button"
            >
              {t('observerProfile.predictionFilterAll')} (
              {predictionStats.total})
            </button>
            <button
              aria-pressed={predictionFilter === 'resolved'}
              className={`rounded-full border px-3 py-1.5 font-semibold text-xs transition ${
                predictionFilter === 'resolved'
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/35 bg-background/58 text-foreground hover:bg-background/74'
              } ${focusRingClass}`}
              onClick={() => {
                setPredictionFilter('resolved');
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
                setPredictionFilter('pending');
              }}
              type="button"
            >
              {t('observerProfile.predictionFilterPending')} (
              {predictionStats.pending})
            </button>
          </div>
        </div>
        {recentPredictions.length > 0 ? (
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
        {filteredRecentPredictions.length > 0 ? (
          <ul className="grid gap-2">
            {filteredRecentPredictions.map((prediction) => (
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
                  {t('observerProfile.predicted')}:{' '}
                  {prediction.predictedOutcome} |{' '}
                  {t('observerProfile.resolved')}:{' '}
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
          <p className="text-muted-foreground text-sm">
            {t('observerProfile.noPredictions')}
          </p>
        )}
      </section>
    </main>
  );
}
