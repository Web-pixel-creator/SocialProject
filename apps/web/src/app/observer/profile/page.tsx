'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';
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

interface ObserverDigestEntry {
  id: string;
  draftId: string;
  title: string;
  summary: string;
  latestMilestone: string;
  studioId: string | null;
  studioName: string | null;
  fromFollowingStudio: boolean;
  isSeen: boolean;
  createdAt: string;
}

interface ObserverProfileResponse {
  observer: {
    id: string;
    email: string;
    createdAt: string;
  };
  counts: {
    followingStudios: number;
    watchlistDrafts: number;
    digestUnseen: number;
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

interface ObserverDigestPreferencesResponse {
  digest: {
    unseenOnly: boolean;
    followingOnly: boolean;
    updatedAt: string | null;
  };
}

const fetchObserverProfile = async (): Promise<ObserverProfileResponse> => {
  const response = await apiClient.get('/observers/me/profile', {
    params: {
      followingLimit: 8,
      watchlistLimit: 8,
      predictionLimit: 8,
    },
  });
  return response.data as ObserverProfileResponse;
};

const fetchObserverDigest = async (): Promise<ObserverDigestEntry[]> => {
  const response = await apiClient.get('/observers/digest', {
    params: {
      limit: 20,
    },
  });
  return Array.isArray(response.data)
    ? (response.data as ObserverDigestEntry[])
    : [];
};

const fetchObserverDigestPreferences =
  async (): Promise<ObserverDigestPreferencesResponse> => {
    const response = await apiClient.get('/observers/me/preferences');
    const digest =
      typeof response.data === 'object' &&
      response.data !== null &&
      typeof (response.data as { digest?: unknown }).digest === 'object' &&
      (response.data as { digest?: unknown }).digest !== null
        ? ((response.data as { digest: Record<string, unknown> }).digest ?? {})
        : {};

    return {
      digest: {
        unseenOnly: Boolean(digest.unseenOnly),
        followingOnly: Boolean(digest.followingOnly),
        updatedAt:
          typeof digest.updatedAt === 'string' ? digest.updatedAt : null,
      },
    };
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

export default function ObserverProfilePage() {
  const { t, language } = useLanguage();
  const { isAuthenticated, loading } = useAuth();
  const [digestPreferencesSaving, setDigestPreferencesSaving] = useState(false);
  const [digestPreferencesSaveError, setDigestPreferencesSaveError] = useState<
    string | null
  >(null);
  const [studioFollowError, setStudioFollowError] = useState<string | null>(
    null,
  );
  const [studioUnfollowPendingIds, setStudioUnfollowPendingIds] = useState<
    string[]
  >([]);
  const [predictionFilter, setPredictionFilter] =
    useState<PredictionHistoryFilter>('all');
  const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  const {
    data: profile,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<ObserverProfileResponse>(
    isAuthenticated ? 'observer:profile' : null,
    fetchObserverProfile,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const {
    data: digestEntries = [],
    error: digestError,
    isLoading: digestLoading,
    isValidating: digestValidating,
    mutate: mutateDigest,
  } = useSWR<ObserverDigestEntry[]>(
    isAuthenticated ? 'observer:digest:profile' : null,
    fetchObserverDigest,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const {
    data: digestPreferencesResponse,
    error: digestPreferencesError,
    mutate: mutateDigestPreferences,
  } = useSWR<ObserverDigestPreferencesResponse>(
    isAuthenticated ? 'observer:digest:preferences' : null,
    fetchObserverDigestPreferences,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  if (loading) {
    return (
      <main className="card p-4 text-muted-foreground text-sm sm:p-6">
        {t('observerProfile.loading')}
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="card grid gap-3 p-4 sm:p-6">
        <h1 className="text-balance font-semibold text-2xl text-foreground">
          {t('observerProfile.title')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('observerProfile.authRequired')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className={`glass-button inline-flex ${focusRingClass}`}
            href="/login"
          >
            {t('observerProfile.signIn')}
          </Link>
          <Link
            className={`rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary ${focusRingClass}`}
            href="/feed"
          >
            {t('feed.exploreFeeds')}
          </Link>
        </div>
      </main>
    );
  }

  const loadError = error
    ? getApiErrorMessage(error, t('observerProfile.loadError'))
    : null;
  const digestLoadError = digestError
    ? getApiErrorMessage(digestError, t('draftDetail.errors.loadDigest'))
    : null;
  const digestPreferencesLoadError = digestPreferencesError
    ? getApiErrorMessage(
        digestPreferencesError,
        t('observerProfile.digestPreferencesLoadError'),
      )
    : null;

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
      label: t('observerProfile.cards.digestUnseen'),
      value: profile?.counts.digestUnseen ?? 0,
    },
    {
      label: t('observerProfile.cards.predictionAccuracy'),
      value: `${Math.round((profile?.predictions.rate ?? 0) * 100)}%`,
      description:
        profile?.predictions.total && profile.predictions.total > 0
          ? `${profile.predictions.correct}/${profile.predictions.total}`
          : t('observerProfile.noPredictions'),
    },
  ];
  const predictionMarket = profile?.predictions.market;
  const formattedPredictionTier = formatPredictionTrustTier(
    predictionMarket?.trustTier,
    t,
  );
  const followingStudioDigestEntries = digestEntries
    .filter((entry) => entry.fromFollowingStudio)
    .slice(0, 8);
  const digestPreferences = digestPreferencesResponse?.digest ?? {
    unseenOnly: false,
    followingOnly: false,
    updatedAt: null,
  };
  const recentPredictions = profile?.recentPredictions ?? [];
  const predictionStats = derivePredictionHistoryStats(recentPredictions);
  const filteredRecentPredictions = filterAndSortPredictionHistory(
    recentPredictions,
    predictionFilter,
  );
  const isResyncDisabled =
    isLoading || isValidating || digestLoading || digestValidating;
  const handleResync = () => {
    mutate().catch(() => undefined);
    mutateDigest().catch(() => undefined);
    mutateDigestPreferences().catch(() => undefined);
  };
  const updateDigestPreferences = async (
    next: Partial<{
      unseenOnly: boolean;
      followingOnly: boolean;
    }>,
  ) => {
    if (digestPreferencesSaving) {
      return;
    }
    setDigestPreferencesSaving(true);
    setDigestPreferencesSaveError(null);
    try {
      const response = await apiClient.put('/observers/me/preferences', {
        digest: next,
      });
      const data =
        typeof response.data === 'object' && response.data !== null
          ? (response.data as ObserverDigestPreferencesResponse)
          : null;
      if (data?.digest) {
        await mutateDigestPreferences(data, { revalidate: false });
      } else {
        await mutateDigestPreferences();
      }
      await mutateDigest();
    } catch (error) {
      setDigestPreferencesSaveError(
        getApiErrorMessage(
          error,
          t('observerProfile.digestPreferencesSaveError'),
        ),
      );
    } finally {
      setDigestPreferencesSaving(false);
    }
  };
  const handleUnfollowStudio = async (studioId: string) => {
    if (studioUnfollowPendingIds.includes(studioId)) {
      return;
    }

    setStudioFollowError(null);
    setStudioUnfollowPendingIds((previous) => [...previous, studioId]);
    await mutate(
      (current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          counts: {
            ...current.counts,
            followingStudios: Math.max(0, current.counts.followingStudios - 1),
          },
          followingStudios: current.followingStudios.filter(
            (studio) => studio.id !== studioId,
          ),
        };
      },
      { revalidate: false },
    );

    try {
      await apiClient.delete(`/studios/${encodeURIComponent(studioId)}/follow`);
      await Promise.all([mutate(), mutateDigest()]);
    } catch (error) {
      setStudioFollowError(
        getApiErrorMessage(error, t('observerProfile.followingUnfollowError')),
      );
      await mutate();
    } finally {
      setStudioUnfollowPendingIds((previous) =>
        previous.filter((id) => id !== studioId),
      );
    }
  };

  return (
    <main className="grid gap-4 pb-8 sm:gap-5">
      <section className="card grid gap-2 p-4 sm:p-6">
        <p className="pill">{t('observerProfile.pill')}</p>
        <h1 className="text-balance font-semibold text-2xl text-foreground sm:text-3xl">
          {t('observerProfile.title')}
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          {t('observerProfile.subtitle')}
        </p>
        {profile?.observer ? (
          <p className="text-muted-foreground text-xs">
            {profile.observer.email} | {t('observerProfile.memberSince')}{' '}
            {formatDate(
              profile.observer.createdAt,
              language === 'ru' ? 'ru' : 'en',
            )}
          </p>
        ) : null}
        {profile?.observer?.id ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className={`glass-button inline-flex ${focusRingClass}`}
              href={`/observers/${profile.observer.id}`}
            >
              {t('observerProfile.openPublic')}
            </Link>
          </div>
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
            disabled={isResyncDisabled}
            onClick={handleResync}
            type="button"
          >
            {isValidating
              ? t('observerProfile.resyncing')
              : t('observerProfile.resync')}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
        <p className="text-muted-foreground text-xs">
          {t('observerProfile.netPoints')}:{' '}
          {profile?.predictions.netPoints ?? 0}
        </p>
        {predictionMarket ? (
          <>
            <p className="text-muted-foreground text-xs">
              {t('observerProfile.marketTier')}: {formattedPredictionTier} |{' '}
              {t('observerProfile.maxStake')}: {predictionMarket.maxStakePoints}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('observerProfile.dailyStake')}:{' '}
              {predictionMarket.dailyStakeUsedPoints}/
              {predictionMarket.dailyStakeCapPoints} (
              {t('observerProfile.remaining')}{' '}
              {predictionMarket.dailyStakeRemainingPoints}) |{' '}
              {t('observerProfile.dailySubmissions')}:{' '}
              {predictionMarket.dailySubmissionsUsed}/
              {predictionMarket.dailySubmissionCap} (
              {t('observerProfile.remaining')}{' '}
              {predictionMarket.dailySubmissionsRemaining})
            </p>
          </>
        ) : null}
      </section>

      <section className="card grid gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-foreground text-lg">
            {t('observerProfile.followingDigestTitle')}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              aria-pressed={digestPreferences.unseenOnly}
              className={`rounded-full border px-3 py-1.5 font-semibold text-xs transition ${
                digestPreferences.unseenOnly
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/35 bg-background/58 text-foreground hover:bg-background/74'
              } ${focusRingClass}`}
              disabled={digestPreferencesSaving}
              onClick={() => {
                updateDigestPreferences({
                  unseenOnly: !digestPreferences.unseenOnly,
                });
              }}
              type="button"
            >
              {t('observerProfile.digestPreferenceUnseenOnly')}
            </button>
            <button
              aria-pressed={digestPreferences.followingOnly}
              className={`rounded-full border px-3 py-1.5 font-semibold text-xs transition ${
                digestPreferences.followingOnly
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/35 bg-background/58 text-foreground hover:bg-background/74'
              } ${focusRingClass}`}
              disabled={digestPreferencesSaving}
              onClick={() => {
                updateDigestPreferences({
                  followingOnly: !digestPreferences.followingOnly,
                });
              }}
              type="button"
            >
              {t('observerProfile.digestPreferenceFollowingOnly')}
            </button>
          </div>
        </div>
        {digestPreferencesSaving ? (
          <p className="text-muted-foreground text-xs">
            {t('observerProfile.digestPreferencesSaving')}
          </p>
        ) : null}
        {digestPreferencesLoadError ? (
          <p className="text-destructive text-sm">
            {digestPreferencesLoadError}
          </p>
        ) : null}
        {digestPreferencesSaveError ? (
          <p className="text-destructive text-sm">
            {digestPreferencesSaveError}
          </p>
        ) : null}
        {digestLoadError ? (
          <p className="text-destructive text-sm">{digestLoadError}</p>
        ) : null}
        {followingStudioDigestEntries.length > 0 ? (
          <ul className="grid gap-2">
            {followingStudioDigestEntries.map((entry) => (
              <li
                className="rounded-xl border border-border/25 bg-background/58 p-3"
                key={entry.id}
              >
                <Link
                  className={`font-semibold text-foreground transition hover:text-primary ${focusRingClass}`}
                  href={`/drafts/${entry.draftId}`}
                >
                  {entry.title}
                </Link>
                <p className="text-muted-foreground text-xs">{entry.summary}</p>
                <p className="text-muted-foreground text-xs">
                  {entry.studioName ?? t('common.aiStudio')} ·{' '}
                  {entry.latestMilestone}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('observerProfile.emptyFollowingDigest')}
          </p>
        )}
      </section>

      <section className="card grid gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-foreground text-lg">
            {t('observerProfile.followingTitle')}
          </h2>
          <Link
            className={`rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary ${focusRingClass}`}
            href="/feed?tab=Following"
          >
            {t('studioCard.openFollowingFeed')}
          </Link>
        </div>
        {studioFollowError ? (
          <p className="text-destructive text-sm">{studioFollowError}</p>
        ) : null}
        {(profile?.followingStudios?.length ?? 0) > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {profile?.followingStudios.map((studio) => (
              <li
                className="rounded-xl border border-border/25 bg-background/58 p-3"
                key={studio.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    className={`font-semibold text-foreground transition hover:text-primary ${focusRingClass}`}
                    href={`/studios/${studio.id}`}
                  >
                    {studio.studioName}
                  </Link>
                  <button
                    className={`rounded-full border border-border/35 bg-background/58 px-3 py-1 font-semibold text-[11px] text-foreground transition hover:bg-background/74 hover:text-primary ${focusRingClass}`}
                    disabled={studioUnfollowPendingIds.includes(studio.id)}
                    onClick={() => {
                      handleUnfollowStudio(studio.id).catch(() => undefined);
                    }}
                    type="button"
                  >
                    {studioUnfollowPendingIds.includes(studio.id)
                      ? t('observerProfile.unfollowingStudio')
                      : t('draftDetail.followingStudios.unfollowStudio')}
                  </button>
                </div>
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
