'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWRMutation from 'swr/mutation';
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/errors';

interface DemoResult {
  draftId: string;
  fixRequestId: string;
  pullRequestId: string;
  glowUp: number;
}

interface DemoFlowPayload {
  draftId?: string;
}

const steps = [
  { key: 'draft', labelKey: 'demo.step.draftCreated' },
  { key: 'fix', labelKey: 'demo.step.fixRequestCreated' },
  { key: 'pr', labelKey: 'demo.step.prCreatedMerged' },
  { key: 'glow', labelKey: 'demo.step.glowUpUpdated' },
] as const;
const focusRingClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export default function DemoPage() {
  const { t } = useLanguage();
  const [draftId, setDraftId] = useState('');
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isMutating: loading, trigger: triggerDemoFlow } = useSWRMutation<
    DemoResult,
    unknown,
    string,
    DemoFlowPayload
  >('demo:flow', async (_key, { arg }) => {
    const response = await apiClient.post('/demo/flow', arg);
    return response.data as DemoResult;
  });

  const runDemo = async () => {
    setError(null);
    try {
      const payload: DemoFlowPayload = {
        draftId: draftId.trim() || undefined,
      };
      const nextResult = await triggerDemoFlow(payload, { throwOnError: true });
      setResult(nextResult);
    } catch (typedError: unknown) {
      setError(getApiErrorMessage(typedError, t('demo.errors.runDemo')));
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

  let doneCount = 0;
  for (const step of steps) {
    if (isDone(step.key)) {
      doneCount += 1;
    }
  }

  const progressWidth = `${(doneCount / steps.length) * 100}%`;

  return (
    <main className="grid gap-4 sm:gap-5">
      <div className="card p-4 sm:p-5">
        <p className="pill">{t('demo.header.pill')}</p>
        <h2 className="mt-3 font-semibold text-foreground text-xl sm:text-2xl">
          {t('demo.header.title')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('demo.header.subtitle')}
        </p>
      </div>

      <PanelErrorBoundary
        description={t('error.refreshPage')}
        retryLabel={t('common.retry')}
        title={t('error.unexpected')}
      >
        <section className="card grid gap-3 p-3 sm:gap-3.5 sm:p-4">
          <div className="rounded-xl border border-border/25 bg-background/60 p-3 text-muted-foreground text-sm sm:p-3.5">
            {t('demo.info.trackEveryChange')}
          </div>
          <label className="grid gap-2 font-medium text-foreground text-sm">
            {t('demo.form.draftIdOptional')}
            <input
              className={`rounded-xl border border-border/40 bg-background/68 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
              onChange={(event) => setDraftId(event.target.value)}
              placeholder={t('demo.form.draftIdPlaceholder')}
              value={draftId}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              className={`rounded-full border border-primary/45 bg-primary px-5 py-1.5 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 disabled:opacity-60 sm:py-2 ${focusRingClass}`}
              disabled={loading}
              onClick={runDemo}
              type="button"
            >
              {loading ? t('demo.actions.running') : t('demo.actions.run')}
            </button>
            {result?.draftId ? (
              <Link
                className={`rounded-full border border-transparent bg-background/58 px-5 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
                href={`/drafts/${result.draftId}`}
              >
                {t('demo.actions.openDraft')}
              </Link>
            ) : null}
            <Link
              className={`rounded-full border border-transparent bg-background/58 px-5 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
              href="/feed"
            >
              {t('feed.exploreFeeds')}
            </Link>
          </div>
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-destructive text-xs sm:p-3">
              <p>{error}</p>
              <button
                className={`mt-2 rounded-full border border-destructive/40 px-3 py-1 font-semibold text-[11px] transition hover:bg-destructive/10 disabled:opacity-60 ${focusRingClass}`}
                disabled={loading}
                onClick={runDemo}
                type="button"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : null}
        </section>

        <section className="card grid gap-3 p-3 sm:gap-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-foreground text-sm">
              {t('demo.progress.title')}
            </h3>
            <span className="text-muted-foreground text-xs">
              {doneCount}/{steps.length}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted/70">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: progressWidth }}
            />
          </div>
          <ul className="grid gap-2 text-sm">
            {steps.map((step) => (
              <li
                className="flex items-center justify-between rounded-xl border border-border/25 bg-background/60 p-2.5 sm:p-3"
                key={step.key}
              >
                <span className="text-foreground">{t(step.labelKey)}</span>
                <span
                  className={
                    isDone(step.key) ? 'text-chart-2' : 'text-muted-foreground'
                  }
                >
                  {isDone(step.key)
                    ? t('demo.progress.done')
                    : t('demo.progress.pending')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {result ? (
          <section className="card grid gap-4 p-4 sm:p-5 md:grid-cols-2">
            <div className="rounded-xl border border-border/25 bg-background/60 p-3 text-xs sm:p-3.5">
              <p className="text-muted-foreground">{t('demo.summary.draft')}</p>
              <p className="mt-1 break-all text-foreground">{result.draftId}</p>
            </div>
            <div className="rounded-xl border border-border/25 bg-background/60 p-3 text-xs sm:p-3.5">
              <p className="text-muted-foreground">
                {t('demo.summary.fixRequest')}
              </p>
              <p className="mt-1 break-all text-foreground">
                {result.fixRequestId}
              </p>
            </div>
            <div className="rounded-xl border border-border/25 bg-background/60 p-3 text-xs sm:p-3.5">
              <p className="text-muted-foreground">
                {t('demo.summary.pullRequest')}
              </p>
              <p className="mt-1 break-all text-foreground">
                {result.pullRequestId}
              </p>
            </div>
            <div className="rounded-xl border border-border/25 bg-background/60 p-3 text-xs sm:p-3.5">
              <p className="text-muted-foreground">
                {t('demo.summary.glowUp')}
              </p>
              <p className="mt-1 text-foreground">
                {`${t('demo.summary.glowUp')}: ${Number(result.glowUp ?? 0).toFixed(1)}`}
              </p>
            </div>
          </section>
        ) : null}
      </PanelErrorBoundary>
    </main>
  );
}
