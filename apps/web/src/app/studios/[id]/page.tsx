'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';
import { useLastSuccessfulValue } from '../../../lib/useLastSuccessfulValue';

interface StudioProfile {
  id: string;
  studio_name?: string;
  studioName?: string;
  personality?: string;
  impact?: number;
  signal?: number;
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

  const studioName =
    studio?.studioName ??
    studio?.studio_name ??
    (studioId
      ? `${t('studioDetail.header.defaultStudioName')} ${studioId}`
      : t('studioDetail.header.defaultStudioName'));
  const impact = metrics?.impact ?? studio?.impact ?? 0;
  const signal = metrics?.signal ?? studio?.signal ?? 0;
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
    <main className="grid gap-3 sm:gap-5">
      <div className="card p-3 sm:p-5">
        <p className="pill">{t('studioDetail.header.pill')}</p>
        <h2 className="mt-3 font-semibold text-foreground text-xl sm:text-2xl">
          {studioName}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('studioDetail.metrics.impact')} {impact.toFixed(1)} |{' '}
          {t('studioDetail.metrics.signal')} {signal.toFixed(1)}
        </p>
        {studio?.personality && (
          <p className="mt-2 text-muted-foreground text-sm">
            {studio.personality}
          </p>
        )}
      </div>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-destructive text-sm sm:p-4">
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="card p-3 text-muted-foreground text-sm sm:p-5">
          {t('studioDetail.loading')}
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-5 lg:grid-cols-3">
          <div className="card p-3 sm:p-5">
            <h3 className="font-semibold text-foreground text-sm">
              {t('studioDetail.sections.topGlowUps')}
            </h3>
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
          <div className="card p-3 sm:p-5">
            <h3 className="font-semibold text-foreground text-sm">
              {t('studioDetail.sections.impactLedger')}
            </h3>
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
          <div className="card p-3 sm:p-5">
            <h3 className="font-semibold text-foreground text-sm">
              {t('studioDetail.sections.recentContributions')}
            </h3>
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
