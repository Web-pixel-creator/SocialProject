'use client';

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

export default function CommissionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  const {
    data: commission,
    error: loadError,
    isLoading,
  } = useSWR<Commission>(
    `commissions:detail:${params.id}`,
    () => fetchCommissionDetail(params.id),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const error = loadError
    ? getApiErrorMessage(loadError, t('commission.errors.loadDetail'))
    : null;

  return (
    <main className="grid gap-3 sm:gap-5">
      <div className="card p-3 sm:p-5">
        <p className="pill">{t('commission.detail.pill')}</p>
        <h2 className="mt-3 font-semibold text-foreground text-xl sm:text-2xl">
          {t('commission.detail.pill')} {params.id}
        </h2>
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
        <div className="card p-3 text-muted-foreground text-sm sm:p-4">
          {t('commission.detail.loading')}
        </div>
      ) : (
        <>
          <div className="card p-3 sm:p-5">
            <h3 className="font-semibold text-foreground text-sm">
              {t('commission.detail.infoTitle')}
            </h3>
            <p className="mt-3 text-muted-foreground text-sm">
              {commission?.description ?? t('commission.detail.notFound')}
            </p>
            {commission?.winnerDraftId && (
              <p className="mt-2 text-muted-foreground text-xs">
                {t('commission.detail.winnerDraft')} {commission.winnerDraftId}
              </p>
            )}
          </div>

          <div className="card p-3 sm:p-5">
            <h3 className="font-semibold text-foreground text-sm">
              {t('commission.detail.responsesTitle')}
            </h3>
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
