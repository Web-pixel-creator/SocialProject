'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';
import { useLastSuccessfulValue } from '../../../lib/useLastSuccessfulValue';

type PersonaRole = 'author' | 'critic' | 'maker' | 'judge';

interface RolePersona {
  tone?: string;
  signaturePhrase?: string;
}

type RolePersonas = Partial<Record<PersonaRole, RolePersona>>;

const PERSONA_ROLE_ORDER: PersonaRole[] = [
  'author',
  'critic',
  'maker',
  'judge',
];
const PERSONA_ROLE_LABELS: Record<PersonaRole, string> = {
  author: 'Author',
  critic: 'Critic',
  maker: 'Maker',
  judge: 'Judge',
};

interface StudioProfile {
  id: string;
  studio_name?: string;
  studioName?: string;
  personality?: string;
  skill_profile?: {
    rolePersonas?: RolePersonas;
  };
  skillProfile?: {
    rolePersonas?: RolePersonas;
  };
  impact?: number;
  signal?: number;
  follower_count?: number;
  followerCount?: number;
  is_following?: boolean;
  isFollowing?: boolean;
}

interface ImpactLedgerEntry {
  kind: 'pr_merged' | 'fix_request';
  id: string;
  draftId: string;
  draftTitle: string;
  description: string;
  severity?: 'major' | 'minor' | null;
  occurredAt: string;
  impactDelta: number;
}

interface StudioProfileData {
  studio: StudioProfile;
  studioLoadFailed: boolean;
  metrics: {
    impact: number;
    signal: number;
  } | null;
  metricsLoadFailed: boolean;
  ledger: ImpactLedgerEntry[];
  ledgerLoadFailed: boolean;
}

const settledData = <T,>(
  result: PromiseSettledResult<{ data: T }>,
): T | undefined => {
  if (result.status !== 'fulfilled') {
    return undefined;
  }
  return result.value?.data;
};

const fetchStudioProfile = async (
  studioId: string,
): Promise<StudioProfileData> => {
  const [studioResult, metricsResult, ledgerResult] = await Promise.allSettled([
    apiClient.get(`/studios/${studioId}`),
    apiClient.get(`/studios/${studioId}/metrics`),
    apiClient.get(`/studios/${studioId}/ledger`, {
      params: { limit: 6 },
    }),
  ]);

  const studioData = settledData(studioResult);
  const metricsData = settledData(metricsResult);
  const ledgerData = settledData(ledgerResult);

  const studioUnavailable = studioData === undefined;
  const metricsUnavailable = metricsData === undefined;
  const ledgerUnavailable = ledgerData === undefined;

  if (studioUnavailable && metricsUnavailable && ledgerUnavailable) {
    if (studioResult.status === 'rejected') {
      throw studioResult.reason;
    }
    throw new Error('Studio profile unavailable');
  }

  return {
    studio:
      studioData && typeof studioData === 'object'
        ? (studioData as StudioProfile)
        : { id: studioId },
    studioLoadFailed: studioUnavailable,
    metrics:
      metricsData && typeof metricsData === 'object'
        ? (metricsData as StudioProfileData['metrics'])
        : null,
    metricsLoadFailed: metricsUnavailable,
    ledger: Array.isArray(ledgerData) ? ledgerData : [],
    ledgerLoadFailed: ledgerUnavailable,
  };
};

export default function StudioProfilePage() {
  const { t } = useLanguage();
  const params = useParams<{ id?: string | string[] }>();
  const rawId = params?.id;
  const resolvedId = Array.isArray(rawId) ? rawId[0] : rawId;
  const studioId = resolvedId && resolvedId !== 'undefined' ? resolvedId : '';
  const missingStudioId = studioId.length === 0;
  const {
    data,
    error: loadError,
    isLoading,
  } = useSWR<StudioProfileData>(
    missingStudioId ? null : ['studio:profile', studioId],
    () => fetchStudioProfile(studioId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  let error: string | null = null;
  if (missingStudioId) {
    error = t('studioDetail.errors.missingStudioId');
  } else if (loadError) {
    error = getApiErrorMessage(loadError, t('studioDetail.errors.loadStudio'));
  }

  const stableStudio = useLastSuccessfulValue<StudioProfile | null>(
    data?.studio,
    data?.studioLoadFailed === false,
    null,
  );
  const stableMetrics = useLastSuccessfulValue<StudioProfileData['metrics']>(
    data?.metrics,
    data?.metricsLoadFailed === false,
    null,
  );
  const stableLedger = useLastSuccessfulValue<ImpactLedgerEntry[]>(
    data?.ledger,
    data?.ledgerLoadFailed === false,
    [],
  );
  const studio = stableStudio;
  const metrics = stableMetrics ?? null;
  const ledger = stableLedger;
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowPending, setIsFollowPending] = useState(false);

  const studioName =
    studio?.studioName ??
    studio?.studio_name ??
    (studioId
      ? `${t('studioDetail.header.defaultStudioName')} ${studioId}`
      : t('studioDetail.header.defaultStudioName'));
  const impact = metrics?.impact ?? studio?.impact ?? 0;
  const signal = metrics?.signal ?? studio?.signal ?? 0;
  const profileFollowerCount = Number(
    studio?.followerCount ?? studio?.follower_count ?? 0,
  );
  const profileIsFollowing = Boolean(
    studio?.isFollowing ?? studio?.is_following,
  );
  const rolePersonasSource =
    studio?.skillProfile?.rolePersonas ?? studio?.skill_profile?.rolePersonas;
  const rolePersonaEntries = PERSONA_ROLE_ORDER.flatMap((role) => {
    const persona = rolePersonasSource?.[role];
    if (!persona || typeof persona !== 'object') {
      return [];
    }
    const tone = typeof persona.tone === 'string' ? persona.tone : '';
    const signature =
      typeof persona.signaturePhrase === 'string'
        ? persona.signaturePhrase
        : '';
    if (!(tone || signature)) {
      return [];
    }
    return [
      {
        role,
        label: PERSONA_ROLE_LABELS[role],
        tone,
        signature,
      },
    ];
  });

  useEffect(() => {
    setFollowerCount(profileFollowerCount);
    setIsFollowing(profileIsFollowing);
  }, [profileFollowerCount, profileIsFollowing]);

  const toggleStudioFollow = useCallback(async () => {
    if (!studioId || isFollowPending) {
      return;
    }

    const nextFollowing = !isFollowing;
    const delta = nextFollowing ? 1 : -1;
    setIsFollowPending(true);
    setIsFollowing(nextFollowing);
    setFollowerCount((current) => Math.max(0, current + delta));

    try {
      if (nextFollowing) {
        await apiClient.post(`/studios/${studioId}/follow`);
      } else {
        await apiClient.delete(`/studios/${studioId}/follow`);
      }
    } catch (_error) {
      setIsFollowing(isFollowing);
      setFollowerCount((current) => Math.max(0, current - delta));
    } finally {
      setIsFollowPending(false);
    }
  }, [isFollowPending, isFollowing, studioId]);

  const topGlowUps = [
    t('studioDetail.topGlowUps.editorialLanding'),
    t('studioDetail.topGlowUps.neonPoster'),
    t('studioDetail.topGlowUps.productStoryboard'),
  ];
  const recentContributions = [
    t('studioDetail.recentContributions.heroRefresh'),
    t('studioDetail.recentContributions.typographySystem'),
    t('studioDetail.recentContributions.colorGrading'),
  ];

  return (
    <main className="grid gap-4 sm:gap-6">
      <div className="card p-4 sm:p-6">
        <p className="pill">{t('studioDetail.header.pill')}</p>
        <h1 className="mt-3 font-semibold text-foreground text-xl sm:text-2xl">
          {studioName}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            aria-busy={isFollowPending}
            aria-pressed={isFollowing}
            className={`rounded-full border px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              isFollowing
                ? 'border-primary/35 bg-primary/10 text-primary'
                : 'border-border/35 bg-background/65 text-muted-foreground hover:bg-background/82 hover:text-foreground'
            }`}
            disabled={missingStudioId || isFollowPending}
            onClick={toggleStudioFollow}
            type="button"
          >
            {isFollowing
              ? t('draftDetail.follow.following')
              : t('observerAction.follow')}
          </button>
          <span className="rounded-full border border-border/25 bg-background/60 px-2.5 py-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            {t('studioCard.followersLabel')}: {followerCount}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          {t('studioDetail.metrics.impact')} {impact.toFixed(1)} |{' '}
          {t('studioDetail.metrics.signal')} {signal.toFixed(1)}
        </p>
        {studio?.personality && (
          <p className="mt-2 text-muted-foreground text-sm">
            {studio.personality}
          </p>
        )}
        {rolePersonaEntries.length > 0 && (
          <div className="mt-3 grid gap-2 rounded-xl border border-border/25 bg-background/55 p-2.5 sm:p-3">
            <p className="font-semibold text-foreground text-xs uppercase tracking-wide">
              Role personas
            </p>
            <ul className="grid gap-1.5 text-xs">
              {rolePersonaEntries.map((entry) => (
                <li
                  className="rounded-lg border border-border/20 bg-background/75 px-2.5 py-2 text-muted-foreground"
                  key={entry.role}
                >
                  <span className="font-semibold text-foreground">
                    {entry.label}: {entry.tone || 'Configured'}
                  </span>
                  {entry.signature ? (
                    <span className="block text-muted-foreground/90">
                      "{entry.signature}"
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-destructive text-sm sm:p-4">
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="card p-4 text-muted-foreground text-sm sm:p-6">
          {t('studioDetail.loading')}
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="card p-4 sm:p-6">
            <h2 className="font-semibold text-foreground text-sm">
              {t('studioDetail.sections.topGlowUps')}
            </h2>
            <ul className="mt-3 grid gap-2.5 text-muted-foreground text-sm sm:mt-4 sm:gap-3">
              {topGlowUps.map((item) => (
                <li
                  className="rounded-xl border border-border/25 bg-background/60 p-2.5 sm:p-3"
                  key={item}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4 sm:p-6">
            <h2 className="font-semibold text-foreground text-sm">
              {t('studioDetail.sections.impactLedger')}
            </h2>
            {ledger.length === 0 ? (
              <p className="mt-3 text-muted-foreground text-sm sm:mt-4">
                {t('studioDetail.states.noRecentContributions')}
              </p>
            ) : (
              <ul className="mt-3 grid gap-2.5 text-muted-foreground text-sm sm:mt-4 sm:gap-3">
                {ledger.map((entry) => (
                  <li
                    className="rounded-xl border border-border/25 bg-background/60 p-2.5 sm:p-3"
                    key={entry.id}
                  >
                    <span className="font-semibold text-foreground">
                      {entry.kind === 'pr_merged'
                        ? t('studioDetail.ledger.prMerged')
                        : t('studioDetail.ledger.fixRequest')}
                    </span>
                    {entry.severity ? ` (${entry.severity})` : ''} |{' '}
                    {entry.draftTitle}
                    <div className="text-muted-foreground text-xs">
                      {t('studioDetail.metrics.impact')} +{entry.impactDelta} |{' '}
                      {new Date(entry.occurredAt).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-4 sm:p-6">
            <h2 className="font-semibold text-foreground text-sm">
              {t('studioDetail.sections.recentContributions')}
            </h2>
            <ul className="mt-3 grid gap-2.5 text-muted-foreground text-sm sm:mt-4 sm:gap-3">
              {recentContributions.map((item) => (
                <li
                  className="rounded-xl border border-border/25 bg-background/60 p-2.5 sm:p-3"
                  key={item}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}
