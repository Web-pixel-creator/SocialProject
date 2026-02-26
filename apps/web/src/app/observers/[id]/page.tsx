'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ObserverPredictionHistoryPanel } from '../../../components/ObserverPredictionHistoryPanel';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient } from '../../../lib/api';
import { getApiErrorMessage, getApiErrorStatus } from '../../../lib/errors';
import {
  normalizePredictionResolutionWindowThresholds,
  resolvePredictionResolutionWindowRiskLevel,
} from '../../../lib/predictionResolutionWindowRisk';
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

interface ObserverProfileResolvedPredictionSnapshot {
  id: string;
  pullRequestId: string;
  draftId: string;
  draftTitle: string;
  predictedOutcome: 'merge' | 'reject';
  resolvedOutcome: 'merge' | 'reject';
  isCorrect: boolean;
  stakePoints: number;
  payoutPoints: number;
  createdAt: string;
  resolvedAt: string;
  netPoints: number;
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
    streak: {
      current: number;
      best: number;
    };
    recentWindow: {
      size: number;
      resolved: number;
      correct: number;
      rate: number;
    };
    timeWindows?: {
      d7: {
        days: number;
        resolved: number;
        correct: number;
        rate: number;
        netPoints: number;
        riskLevel?: string | null;
      };
      d30: {
        days: number;
        resolved: number;
        correct: number;
        rate: number;
        netPoints: number;
        riskLevel?: string | null;
      };
    };
    thresholds?: {
      resolutionWindows?: {
        accuracyRate: {
          criticalBelow: number;
          watchBelow: number;
        };
        minResolvedPredictions: number;
      };
    };
    lastResolved: ObserverProfileResolvedPredictionSnapshot | null;
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

export default function ObserverPublicProfilePage() {
  const { t, language } = useLanguage();
  const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
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
    {
      label: t('observerProfile.cards.predictionStreak'),
      value: profile?.predictions.streak?.current ?? 0,
      description: `${t('observerProfile.streakBest')}: ${profile?.predictions.streak?.best ?? 0}`,
    },
  ];

  const observerHandle =
    profile?.observer.handle ?? t('observerPublicProfile.observerLabel');
  const recentPredictions = profile?.recentPredictions ?? [];
  const lastResolvedPrediction = profile?.predictions.lastResolved ?? null;
  const recentWindow = profile?.predictions.recentWindow ?? {
    size: 10,
    resolved: 0,
    correct: 0,
    rate: 0,
  };
  const timeWindows = profile?.predictions.timeWindows ?? {
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
  const predictionResolutionThresholds =
    normalizePredictionResolutionWindowThresholds(
      profile?.predictions.thresholds?.resolutionWindows,
    );
  const riskLevel7d = resolvePredictionResolutionWindowRiskLevel({
    window: timeWindows.d7,
    thresholds: predictionResolutionThresholds,
  });
  const riskLevel30d = resolvePredictionResolutionWindowRiskLevel({
    window: timeWindows.d30,
    thresholds: predictionResolutionThresholds,
  });

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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
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
        {lastResolvedPrediction ? (
          <p className="text-muted-foreground text-xs">
            {t('observerProfile.lastResolved')}:{' '}
            {lastResolvedPrediction.isCorrect
              ? t('observerProfile.predictionResultCorrect')
              : t('observerProfile.predictionResultIncorrect')}{' '}
            | {t('observerProfile.predictionNet')}:{' '}
            {lastResolvedPrediction.netPoints >= 0 ? '+' : ''}
            {lastResolvedPrediction.netPoints} |{' '}
            {lastResolvedPrediction.draftTitle}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            {t('observerProfile.lastResolvedNone')}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          {t('observerProfile.recentWindowAccuracy')} ({recentWindow.size}):{' '}
          {Math.round(recentWindow.rate * 100)}% ({recentWindow.correct}/
          {recentWindow.resolved})
        </p>
        <p className="text-muted-foreground text-xs">
          7d: {Math.round(timeWindows.d7.rate * 100)}% ({timeWindows.d7.correct}
          /{timeWindows.d7.resolved}), {t('observerProfile.predictionNet')}:{' '}
          {timeWindows.d7.netPoints >= 0 ? '+' : ''}
          {timeWindows.d7.netPoints} | 30d:{' '}
          {Math.round(timeWindows.d30.rate * 100)}% ({timeWindows.d30.correct}/
          {timeWindows.d30.resolved}), {t('observerProfile.predictionNet')}:{' '}
          {timeWindows.d30.netPoints >= 0 ? '+' : ''}
          {timeWindows.d30.netPoints}
        </p>
        <p className="text-muted-foreground text-xs">
          {t('observerProfile.predictionWindowRisk7d')}:{' '}
          {t(`observerProfile.health.${riskLevel7d}`)} |{' '}
          {t('observerProfile.predictionWindowRisk30d')}:{' '}
          {t(`observerProfile.health.${riskLevel30d}`)} |{' '}
          {t('observerProfile.predictionWindowRiskMinSample')}:{' '}
          {predictionResolutionThresholds.minResolvedPredictions} |{' '}
          {t('observerProfile.predictionWindowRiskThresholds')}: watch &lt;
          {Math.round(
            predictionResolutionThresholds.accuracyRate.watchBelow * 100,
          )}
          %, critical &lt;
          {Math.round(
            predictionResolutionThresholds.accuracyRate.criticalBelow * 100,
          )}
          %
        </p>
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

      <ObserverPredictionHistoryPanel
        focusRingClass={focusRingClass}
        predictions={recentPredictions}
        t={t}
        telemetryScope="public"
      />
    </main>
  );
}
