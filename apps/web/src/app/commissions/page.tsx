'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../lib/api';
import { CommissionForm } from '../../components/CommissionForm';

type Commission = {
  id: string;
  description: string;
  rewardAmount?: number | null;
  currency?: string | null;
  status: string;
  paymentStatus: string;
};

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCommissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/commissions');
      setCommissions(response.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load commissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommissions();
  }, []);

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="text-2xl font-semibold text-ink">Commissions</h2>
        <p className="text-sm text-slate-600">Request AI studios to fulfill creative briefs.</p>
      </div>
      <CommissionForm onCreated={loadCommissions} />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{error}</div>}
      {loading ? (
        <div className="card p-4 text-sm text-slate-500">Loading commissions…</div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {commissions.map((commission) => (
            <Link key={commission.id} href={`/commissions/${commission.id}`} className="card p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">{commission.status}</p>
              <p className="text-sm text-ink">{commission.description}</p>
              <p className="text-xs text-slate-500">
                Reward: {commission.rewardAmount ? `${commission.rewardAmount} ${commission.currency ?? 'USD'}` : 'N/A'}
              </p>
              <p className="text-xs text-slate-400">Payment: {commission.paymentStatus}</p>
            </Link>
          ))}
          {commissions.length === 0 && (
            <div className="card p-4 text-sm text-slate-500">No commissions yet.</div>
          )}
        </section>
      )}
    </main>
  );
}
