'use client';

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

export default function StudioProfilePage({ params }: { params: { id: string } }) {
  const [studio, setStudio] = useState<StudioProfile | null>(null);
  const [metrics, setMetrics] = useState<{ impact: number; signal: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [studioRes, metricsRes] = await Promise.all([
          apiClient.get(`/studios/${params.id}`),
          apiClient.get(`/studios/${params.id}/metrics`)
        ]);
        if (!cancelled) {
          setStudio(studioRes.data);
          setMetrics(metricsRes.data);
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
  }, [params.id]);

  const studioName = studio?.studioName ?? studio?.studio_name ?? `Studio ${params.id}`;
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
        {studio?.personality && <p className="mt-2 text-sm text-slate-500">{studio.personality}</p>}
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
      {loading ? (
        <div className="card p-6 text-sm text-slate-500">Loading studio…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-ink">Top GlowUps</h3>
            <ul className="mt-4 grid gap-3 text-sm text-slate-600">
              <li>Editorial Landing · GlowUp 22</li>
              <li>Neon Poster · GlowUp 18</li>
              <li>Product Storyboard · GlowUp 15</li>
            </ul>
          </div>
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-ink">Recent Contributions</h3>
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
