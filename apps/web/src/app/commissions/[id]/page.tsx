'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';

interface Commission {
  id: string;
  description: string;
  rewardAmount?: number | null;
  currency?: string | null;
  status: string;
  paymentStatus: string;
  winnerDraftId?: string | null;
  responses?: Array<{
    id: string;
    draftId: string;
    draftTitle: string | null;
    studioId: string;
    studioName: string;
    createdAt: string;
  }>;
}

const fetchCommissionDetail = async (id: string): Promise<Commission> => {
  const response = await apiClient.get(`/commissions/${id}`);
  return response.data;
};

interface CommissionDetailPageProps {
  params?: unknown;
}

const getRouteParamId = (params: unknown): string | null => {
  if (!(params && typeof params === 'object')) {
    return null;
  }
  if ('then' in (params as Record<string, unknown>)) {
    return null;
  }
  const id = (params as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
};

export default function CommissionDetailPage({
  params,
}: CommissionDetailPageProps) {
  const { t } = useLanguage();
  const routeParams = useParams<{ id?: string }>();
  const commissionId = getRouteParamId(params) ?? routeParams?.id ?? '';
  const {
    data: commission,
    error: loadError,
    isLoading,
  } = useSWR<Commission>(
    commissionId ? `commissions:detail:${commissionId}` : null,
    () => fetchCommissionDetail(commissionId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const error = loadError
    ? getApiErrorMessage(loadError, t('commission.errors.loadDetail'))
    : null;

  return (
    <main className="grid gap-4 sm:gap-6">
      <div className="card p-4 sm:p-6">
        <p className="pill">{t('commission.detail.pill')}</p>
        <h1 className="mt-3 font-semibold text-foreground text-xl sm:text-2xl">
          {t('commission.detail.pill')} {commissionId}
        </h1>
        {commission && (
          <p className="text-muted-foreground text-sm">
            {t('commission.labels.reward')}{' '}
            {commission.rewardAmount
              ? `${commission.rewardAmount} ${commission.currency ?? 'USD'}`
              : t('commission.labels.na')}{' '}
            | {commission.paymentStatus}
          </p>
        )}
      </div>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-destructive text-xs sm:p-3">
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="card p-4 text-muted-foreground text-sm sm:p-5">
          {t('commission.detail.loading')}
        </div>
      ) : (
        <>
          <div className="card p-4 sm:p-6">
            <h2 className="font-semibold text-foreground text-sm">
              {t('commission.detail.infoTitle')}
            </h2>
            <p className="mt-3 text-muted-foreground text-sm">
              {commission?.description ?? t('commission.detail.notFound')}
            </p>
            {commission?.winnerDraftId && (
              <p className="mt-2 text-muted-foreground text-xs">
                {t('commission.detail.winnerDraft')} {commission.winnerDraftId}
              </p>
            )}
          </div>

          <div className="card p-4 sm:p-6">
            <h2 className="font-semibold text-foreground text-sm">
              {t('commission.detail.responsesTitle')}
            </h2>
            {commission?.responses && commission.responses.length > 0 ? (
              <ul className="mt-3 grid gap-3">
                {commission.responses.map((response) => (
                  <li
                    className="rounded-xl border border-border/25 bg-background/60 p-2.5 sm:p-3"
                    key={response.id}
                  >
                    <p className="font-semibold text-foreground text-sm">
                      {response.draftTitle ?? response.draftId}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t('commission.detail.responseBy')} {response.studioName}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-muted-foreground text-sm">
                {t('commission.detail.noResponses')}
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
