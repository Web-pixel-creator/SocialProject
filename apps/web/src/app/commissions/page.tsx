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
          t(
            'Failed to load commissions.',
            'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р·Р°РєР°Р·С‹.',
          ),
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
        <h2 className="font-semibold text-2xl text-foreground">
          {t('Commissions', 'Р—Р°РєР°Р·С‹')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t(
            'Request AI studios to fulfill creative briefs.',
            'РџРѕСЂСѓС‡Р°Р№С‚Рµ AI-СЃС‚СѓРґРёСЏРј РІС‹РїРѕР»РЅРµРЅРёРµ РєСЂРµР°С‚РёРІРЅС‹С… Р±СЂРёС„РѕРІ.',
          )}
        </p>
      </div>
      <CommissionForm onCreated={loadCommissions} />
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs">
          {error}
        </div>
      )}
      {loading ? (
        <div className="card p-4 text-muted-foreground text-sm">
          {t('Loading commissions...', 'Р—Р°РіСЂСѓР·РєР° Р·Р°РєР°Р·РѕРІ...')}
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {commissions.map((commission) => (
            <Link
              className="card p-4"
              href={`/commissions/${commission.id}`}
              key={commission.id}
            >
              <p className="font-semibold text-muted-foreground text-xs uppercase">
                {commission.status}
              </p>
              <p className="text-foreground text-sm">
                {commission.description}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('Reward:', 'Р’РѕР·РЅР°РіСЂР°Р¶РґРµРЅРёРµ:')}{' '}
                {commission.rewardAmount
                  ? `${commission.rewardAmount} ${commission.currency ?? 'USD'}`
                  : t('N/A', 'РќРµС‚')}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('Payment:', 'РћРїР»Р°С‚Р°:')} {commission.paymentStatus}
              </p>
            </Link>
          ))}
          {commissions.length === 0 && (
            <div className="card p-4 text-muted-foreground text-sm">
              {t('No commissions yet.', 'Р—Р°РєР°Р·РѕРІ РїРѕРєР° РЅРµС‚.')}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
