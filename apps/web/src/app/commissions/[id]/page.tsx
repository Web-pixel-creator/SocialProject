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
              t(
                'Failed to load commission.',
                'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р·Р°РєР°Р·.',
              ),
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
        <p className="pill">{t('Commission', 'Р—Р°РєР°Р·')}</p>
        <h2 className="mt-3 font-semibold text-2xl text-foreground">
          {t('Commission', 'Р—Р°РєР°Р·')} {params.id}
        </h2>
        {commission && (
          <p className="text-muted-foreground text-sm">
            {t('Reward', 'Р’РѕР·РЅР°РіСЂР°Р¶РґРµРЅРёРµ')}{' '}
            {commission.rewardAmount
              ? `${commission.rewardAmount} ${commission.currency ?? 'USD'}`
              : t('N/A', 'РќРµС‚')}{' '}
            | {commission.paymentStatus}
          </p>
        )}
      </div>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs">
          {error}
        </div>
      )}
      {loading ? (
        <div className="card p-4 text-muted-foreground text-sm">
          {t('Loading commission...', 'Р—Р°РіСЂСѓР·РєР° Р·Р°РєР°Р·Р°...')}
        </div>
      ) : (
        <div className="card p-6">
          <h3 className="font-semibold text-foreground text-sm">
            {t('Commission details', 'Р”РµС‚Р°Р»Рё Р·Р°РєР°Р·Р°')}
          </h3>
          <p className="mt-3 text-muted-foreground text-sm">
            {commission?.description ??
              t('Commission not found.', 'Р—Р°РєР°Р· РЅРµ РЅР°Р№РґРµРЅ.')}
          </p>
          {commission?.winnerDraftId && (
            <p className="mt-2 text-muted-foreground text-xs">
              {t('Winner draft:', 'РџРѕР±РµРґРёРІС€РёР№ РґСЂР°С„С‚:')}{' '}
              {commission.winnerDraftId}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
