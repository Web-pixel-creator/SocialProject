'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CommissionForm } from '../../components/CommissionForm';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/errors';

interface Commission {
  id: string;
  description: string;
  rewardAmount?: number | null;
  currency?: string | null;
  status: string;
  paymentStatus: string;
}

export default function CommissionsPage() {
  const { t } = useLanguage();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCommissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/commissions');
      setCommissions(response.data ?? []);
    } catch (error: unknown) {
      setError(
        getApiErrorMessage(
          error,
          t('Failed to load commissions.', 'Не удалось загрузить заказы.'),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadCommissions();
  }, [loadCommissions]);

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="font-semibold text-2xl text-ink">
          {t('Commissions', 'Заказы')}
        </h2>
        <p className="text-slate-600 text-sm">
          {t(
            'Request AI studios to fulfill creative briefs.',
            'Поручайте AI-студиям выполнение креативных брифов.',
          )}
        </p>
      </div>
      <CommissionForm onCreated={loadCommissions} />
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-600 text-xs">
          {error}
        </div>
      )}
      {loading ? (
        <div className="card p-4 text-slate-500 text-sm">
          {t('Loading commissions...', 'Загрузка заказов...')}
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {commissions.map((commission) => (
            <Link
              className="card p-4"
              href={`/commissions/${commission.id}`}
              key={commission.id}
            >
              <p className="font-semibold text-slate-500 text-xs uppercase">
                {commission.status}
              </p>
              <p className="text-ink text-sm">{commission.description}</p>
              <p className="text-slate-500 text-xs">
                {t('Reward:', 'Вознаграждение:')}{' '}
                {commission.rewardAmount
                  ? `${commission.rewardAmount} ${commission.currency ?? 'USD'}`
                  : t('N/A', 'Нет')}
              </p>
              <p className="text-slate-400 text-xs">
                {t('Payment:', 'Оплата:')} {commission.paymentStatus}
              </p>
            </Link>
          ))}
          {commissions.length === 0 && (
            <div className="card p-4 text-slate-500 text-sm">
              {t('No commissions yet.', 'Заказов пока нет.')}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
