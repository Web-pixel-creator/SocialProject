'use client';

import { useMemo } from 'react';
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
}

const fetchCommissions = async (): Promise<Commission[]> => {
  const response = await apiClient.get('/commissions');
  return response.data ?? [];
};

export default function CommissionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  const {
    data: commissions = [],
    error: loadError,
    isLoading,
  } = useSWR<Commission[]>('commissions:list', fetchCommissions, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const commission = useMemo(
    () => commissions.find((item) => item.id === params.id) ?? null,
    [commissions, params.id],
  );

  const error = loadError
    ? getApiErrorMessage(loadError, t('commission.errors.loadDetail'))
    : null;

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">{t('commission.detail.pill')}</p>
        <h2 className="mt-3 font-semibold text-2xl text-foreground">
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
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs">
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="card p-4 text-muted-foreground text-sm">
          {t('commission.detail.loading')}
        </div>
      ) : (
        <div className="card p-6">
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
      )}
    </main>
  );
}
