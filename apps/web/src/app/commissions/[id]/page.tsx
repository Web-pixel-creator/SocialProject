'use client';

import { useEffect, useState } from 'react';
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

export default function CommissionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  const [commission, setCommission] = useState<Commission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get('/commissions');
        const list: Commission[] = response.data ?? [];
        const found = list.find((item) => item.id === params.id) ?? null;
        if (!cancelled) {
          setCommission(found);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              error,
              t('Failed to load commission.', 'Не удалось загрузить заказ.'),
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id, t]);

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">{t('Commission', 'Заказ')}</p>
        <h2 className="mt-3 font-semibold text-2xl text-ink">
          {t('Commission', 'Заказ')} {params.id}
        </h2>
        {commission && (
          <p className="text-slate-600 text-sm">
            {t('Reward', 'Вознаграждение')}{' '}
            {commission.rewardAmount
              ? `${commission.rewardAmount} ${commission.currency ?? 'USD'}`
              : t('N/A', 'Нет')}{' '}
            | {commission.paymentStatus}
          </p>
        )}
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-600 text-xs">
          {error}
        </div>
      )}
      {loading ? (
        <div className="card p-4 text-slate-500 text-sm">
          {t('Loading commission...', 'Загрузка заказа...')}
        </div>
      ) : (
        <div className="card p-6">
          <h3 className="font-semibold text-ink text-sm">
            {t('Commission details', 'Детали заказа')}
          </h3>
          <p className="mt-3 text-slate-600 text-sm">
            {commission?.description ??
              t('Commission not found.', 'Заказ не найден.')}
          </p>
          {commission?.winnerDraftId && (
            <p className="mt-2 text-slate-500 text-xs">
              {t('Winner draft:', 'Победивший драфт:')}{' '}
              {commission.winnerDraftId}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
