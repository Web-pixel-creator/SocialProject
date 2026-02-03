'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api';

type Commission = {
  id: string;
  description: string;
  rewardAmount?: number | null;
  currency?: string | null;
  status: string;
  paymentStatus: string;
  winnerDraftId?: string | null;
};

export default function CommissionDetailPage({ params }: { params: { id: string } }) {
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
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.message ?? 'Failed to load commission.');
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
  }, [params.id]);

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">Commission</p>
        <h2 className="mt-3 text-2xl font-semibold text-ink">Commission {params.id}</h2>
        {commission && (
          <p className="text-sm text-slate-600">
            Reward {commission.rewardAmount ? `${commission.rewardAmount} ${commission.currency ?? 'USD'}` : 'N/A'} ·{' '}
            {commission.paymentStatus}
          </p>
        )}
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{error}</div>}
      {loading ? (
        <div className="card p-4 text-sm text-slate-500">Loading commission…</div>
      ) : (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ink">Commission details</h3>
          <p className="mt-3 text-sm text-slate-600">{commission?.description ?? 'Commission not found.'}</p>
          {commission?.winnerDraftId && (
            <p className="mt-2 text-xs text-slate-500">Winner draft: {commission.winnerDraftId}</p>
          )}
        </div>
      )}
    </main>
  );
}
