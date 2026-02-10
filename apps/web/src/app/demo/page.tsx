'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/errors';

interface DemoResult {
  draftId: string;
  fixRequestId: string;
  pullRequestId: string;
  glowUp: number;
}

const steps = [
  { key: 'draft', labelKey: 'demo.step.draftCreated' },
  { key: 'fix', labelKey: 'demo.step.fixRequestCreated' },
  { key: 'pr', labelKey: 'demo.step.prCreatedMerged' },
  { key: 'glow', labelKey: 'demo.step.glowUpUpdated' },
] as const;

export default function DemoPage() {
  const { t } = useLanguage();
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
        draftId: draftId.trim() || undefined,
      });
      setResult(response.data);
    } catch (typedError: unknown) {
      setError(getApiErrorMessage(typedError, t('legacy.failed_to_run_demo')));
    } finally {
      setLoading(false);
    }
  };

  const isDone = (key: (typeof steps)[number]['key']) => {
    if (!result) {
      return false;
    }
    if (key === 'draft') {
      return Boolean(result.draftId);
    }
    if (key === 'fix') {
      return Boolean(result.fixRequestId);
    }
    if (key === 'pr') {
      return Boolean(result.pullRequestId);
    }
    if (key === 'glow') {
      return typeof result.glowUp === 'number';
    }
    return false;
  };

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">{t('legacy.demo')}</p>
        <h2 className="mt-3 font-semibold text-2xl text-foreground">
          {t('legacy.one_click_demo_flow')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('legacy.runs_the_full_loop_draft_fix_request')}
        </p>
      </div>

      <section className="card grid gap-4 p-6">
        <label className="grid gap-2 font-medium text-foreground text-sm">
          {t('legacy.draft_id_optional')}
          <input
            className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
            onChange={(event) => setDraftId(event.target.value)}
            placeholder={t('legacy.draft_uuid_or_leave_blank')}
            value={draftId}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 disabled:opacity-60"
            disabled={loading}
            onClick={runDemo}
            type="button"
          >
            {loading ? t('legacy.running') : t('legacy.run_demo')}
          </button>
          {result?.draftId && (
            <Link
              className="rounded-full border border-border bg-background/70 px-5 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60"
              href={`/drafts/${result.draftId}`}
            >
              {t('legacy.open_draft')}
            </Link>
          )}
        </div>
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs">
            {error}
          </div>
        )}
      </section>

      <section className="card grid gap-3 p-6">
        <h3 className="font-semibold text-foreground text-sm">
          {t('legacy.steps')}
        </h3>
        <ul className="grid gap-2 text-sm">
          {steps.map((step) => (
            <li
              className="flex items-center justify-between rounded-xl border border-border bg-background/70 p-3"
              key={step.key}
            >
              <span className="text-foreground">{t(step.labelKey)}</span>
              <span
                className={
                  isDone(step.key)
                    ? 'text-emerald-500'
                    : 'text-muted-foreground'
                }
              >
                {isDone(step.key) ? t('legacy.done') : t('legacy.pending')}
              </span>
            </li>
          ))}
        </ul>
        {result && (
          <div className="rounded-xl border border-border bg-background/70 p-3 text-muted-foreground text-xs">
            {t('legacy.glowup')}: {Number(result.glowUp ?? 0).toFixed(1)}
          </div>
        )}
      </section>
    </main>
  );
}
