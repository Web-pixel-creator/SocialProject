'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api';

type StudioProfile = {
  id: string;
  studio_name?: string;
  studioName?: string;
  personality?: string;
  impact?: number;
  signal?: number;
};

type ImpactLedgerEntry = {
  kind: 'pr_merged' | 'fix_request';
  id: string;
  draftId: string;
  draftTitle: string;
  description: string;
  severity?: 'major' | 'minor' | null;
  occurredAt: string;
  impactDelta: number;
};

export default function StudioProfilePage() {
  const params = useParams<{ id?: string | string[] }>();
  const rawId = params?.id;
  const resolvedId = Array.isArray(rawId) ? rawId[0] : rawId;
  const studioId = resolvedId && resolvedId !== 'undefined' ? resolvedId : '';
  const [studio, setStudio] = useState<StudioProfile | null>(null);
  const [metrics, setMetrics] = useState<{
    impact: number;
    signal: number;
  } | null>(null);
  const [ledger, setLedger] = useState<ImpactLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!studioId) {
        setError('Studio id missing.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [studioRes, metricsRes, ledgerRes] = await Promise.all([
          apiClient.get(`/studios/${studioId}`),
          apiClient.get(`/studios/${studioId}/metrics`),
          apiClient.get(`/studios/${studioId}/ledger`, {
            params: { limit: 6 },
          }),
        ]);
        if (!cancelled) {
          setStudio(studioRes.data);
          setMetrics(metricsRes.data);
          setLedger(Array.isArray(ledgerRes.data) ? ledgerRes.data : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.message ?? 'Failed to load studio.');
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
  }, [studioId]);

  const studioName =
    studio?.studioName ??
    studio?.studio_name ??
    (studioId ? `Studio ${studioId}` : 'Studio');
  const impact = metrics?.impact ?? studio?.impact ?? 0;
  const signal = metrics?.signal ?? studio?.signal ?? 0;

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">Studio Profile</p>
        <h2 className="mt-3 text-2xl font-semibold text-ink">{studioName}</h2>
        <p className="text-sm text-slate-600">
          Impact {impact.toFixed(1)} · Signal {signal.toFixed(1)}
        </p>
        {studio?.personality && (
          <p className="mt-2 text-sm text-slate-500">{studio.personality}</p>
        )}
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}
      {loading ? (
        <div className="card p-6 text-sm text-slate-500">Loading studio…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-ink">Top GlowUps</h3>
            <ul className="mt-4 grid gap-3 text-sm text-slate-600">
              <li>Editorial Landing · GlowUp 22</li>
              <li>Neon Poster · GlowUp 18</li>
              <li>Product Storyboard · GlowUp 15</li>
            </ul>
          </div>
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-ink">Impact ledger</h3>
            {ledger.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No recent contributions yet.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 text-sm text-slate-600">
                {ledger.map((entry) => (
                  <li key={entry.id}>
                    <span className="font-semibold text-slate-800">
                      {entry.kind === 'pr_merged' ? 'PR merged' : 'Fix request'}
                    </span>
                    {entry.severity ? ` (${entry.severity})` : ''} ·{' '}
                    {entry.draftTitle}
                    <div className="text-xs text-slate-500">
                      Impact +{entry.impactDelta} ·{' '}
                      {new Date(entry.occurredAt).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-ink">
              Recent Contributions
            </h3>
            <ul className="mt-4 grid gap-3 text-sm text-slate-600">
              <li>PR #124 · Hero refresh</li>
              <li>PR #120 · Typography system</li>
              <li>PR #115 · Color grading</li>
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}
