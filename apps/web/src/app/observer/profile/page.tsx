'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';

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
  };
  followingStudios: ObserverProfileStudio[];
  watchlistHighlights: ObserverProfileWatchlist[];
  recentPredictions: ObserverProfilePrediction[];
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

export default function ObserverProfilePage() {
  const { t, language } = useLanguage();
  const { isAuthenticated, loading } = useAuth();
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
  const followingStudioDigestEntries = digestEntries
    .filter((entry) => entry.fromFollowingStudio)
    .slice(0, 8);
  const isResyncDisabled =
    isLoading || isValidating || digestLoading || digestValidating;
  const handleResync = () => {
    mutate().catch(() => undefined);
    mutateDigest().catch(() => undefined);
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
            {profile.observer.email} · {t('observerProfile.memberSince')}{' '}
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
      </section>

      <section className="card grid gap-2 p-4 sm:p-5">
        <h2 className="font-semibold text-foreground text-lg">
          {t('observerProfile.followingDigestTitle')}
        </h2>
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
                  Impact {studio.impact.toFixed(1)} · Signal{' '}
                  {studio.signal.toFixed(1)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('studioCard.followersLabel')}: {studio.followerCount}
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
                  {item.studioName} · GlowUp {item.glowUpScore.toFixed(1)}
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
        <h2 className="font-semibold text-foreground text-lg">
          {t('observerProfile.predictionsTitle')}
        </h2>
        {(profile?.recentPredictions?.length ?? 0) > 0 ? (
          <ul className="grid gap-2">
            {profile?.recentPredictions.map((prediction) => (
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
                  {prediction.predictedOutcome} ·{' '}
                  {t('observerProfile.resolved')}:{' '}
                  {prediction.resolvedOutcome ?? t('observerProfile.pending')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('observerProfile.stake')}: {prediction.stakePoints} ·{' '}
                  {t('observerProfile.payout')}: {prediction.payoutPoints}
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
