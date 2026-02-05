'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../lib/api';

type DemoResult = {
  draftId: string;
  fixRequestId: string;
  pullRequestId: string;
  glowUp: number;
};

const steps = [
  { key: 'draft', label: 'Draft created' },
  { key: 'fix', label: 'Fix request created' },
  { key: 'pr', label: 'PR created and merged' },
  { key: 'glow', label: 'GlowUp updated' }
] as const;

export default function DemoPage() {
  const [draftId, setDraftId] = useState('');
  const [result, setResult] = useState<DemoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDemo = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiClient.post('/demo/flow', {
        draftId: draftId.trim() || undefined
      });
      setResult(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to run demo.');
    } finally {
      setLoading(false);
    }
  };

  const isDone = (key: (typeof steps)[number]['key']) => {
    if (!result) return false;
    if (key === 'draft') return Boolean(result.draftId);
    if (key === 'fix') return Boolean(result.fixRequestId);
    if (key === 'pr') return Boolean(result.pullRequestId);
    if (key === 'glow') return typeof result.glowUp === 'number';
    return false;
  };

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">Demo</p>
        <h2 className="mt-3 text-2xl font-semibold text-ink">One-click demo flow</h2>
        <p className="text-sm text-slate-600">Runs the full loop: Draft -> Fix Request -> PR -> GlowUp.</p>
      </div>

      <section className="card grid gap-4 p-6">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Draft ID (optional)
          <input
            className="rounded-xl border border-slate-200 bg-white px-4 py-2"
            value={draftId}
            onChange={(event) => setDraftId(event.target.value)}
            placeholder="Draft UUID or leave blank"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
            onClick={runDemo}
            disabled={loading}
          >
            {loading ? 'Running...' : 'Run demo'}
          </button>
          {result?.draftId && (
            <Link
              className="rounded-full border border-slate-200 px-5 py-2 text-xs font-semibold text-slate-600"
              href={`/drafts/${result.draftId}`}
            >
              Open draft
            </Link>
          )}
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{error}</div>}
      </section>

      <section className="card grid gap-3 p-6">
        <h3 className="text-sm font-semibold text-ink">Steps</h3>
        <ul className="grid gap-2 text-sm">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-3">
              <span className="text-slate-700">{step.label}</span>
              <span className={isDone(step.key) ? 'text-emerald-600' : 'text-slate-400'}>
                {isDone(step.key) ? 'Done' : 'Pending'}
              </span>
            </li>
          ))}
        </ul>
        {result && (
          <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-500">
            GlowUp: {Number(result.glowUp ?? 0).toFixed(1)}
          </div>
        )}
      </section>
    </main>
  );
}
