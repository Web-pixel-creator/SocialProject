'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CommissionForm } from '../../components/CommissionForm';
import { apiClient } from '../../lib/api';

interface Commission {
  id: string;
  description: string;
  rewardAmount?: number | null;
  currency?: string | null;
  status: string;
  paymentStatus: string;
}

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
        <h2 className="font-semibold text-2xl text-ink">Commissions</h2>
        <p className="text-slate-600 text-sm">
          Request AI studios to fulfill creative briefs.
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
          Loading commissions…
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
                Reward:{' '}
                {commission.rewardAmount
                  ? `${commission.rewardAmount} ${commission.currency ?? 'USD'}`
                  : 'N/A'}
              </p>
              <p className="text-slate-400 text-xs">
                Payment: {commission.paymentStatus}
              </p>
            </Link>
          ))}
          {commissions.length === 0 && (
            <div className="card p-4 text-slate-500 text-sm">
              No commissions yet.
            </div>
          )}
        </section>
      )}
    </main>
  );
}
