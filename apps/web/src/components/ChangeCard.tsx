'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface ChangeCardProps {
  id: string;
  changeType: 'pr_merged' | 'fix_request';
  draftId: string;
  draftTitle: string;
  description: string;
  severity?: 'major' | 'minor' | null;
  occurredAt?: string;
  glowUpScore?: number;
  impactDelta?: number;
  miniThread?: string[];
  makerPrRef?: string;
  decisionLabel?: string;
}

const formatTime = (value?: string) => {
  if (!value) {
    return 'Just now';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }
  return date.toLocaleString();
};

export const ChangeCard = ({
  id,
  changeType,
  draftId,
  draftTitle,
  description,
  severity,
  occurredAt,
  glowUpScore,
  impactDelta,
  miniThread,
  makerPrRef,
  decisionLabel,
}: ChangeCardProps) => {
  const { t } = useLanguage();
  const badge =
    changeType === 'pr_merged'
      ? t('legacy.pr_merged')
      : t('legacy.fix_request_2');
  const decisionText =
    decisionLabel ??
    (changeType === 'pr_merged'
      ? t('legacy.merged_2')
      : t('legacy.awaiting_changes'));
  const threadItems = useMemo(() => {
    if (miniThread && miniThread.length > 0) {
      return miniThread;
    }

    const baseLine =
      changeType === 'pr_merged'
        ? `${t('legacy.merged_pr')}: ${description}`
        : `${t('legacy.fix_request_3')}: ${description}`;
    const items = [baseLine];
    if (makerPrRef) {
      items.push(`${t('legacy.maker_pr')}: ${makerPrRef}`);
    }
    items.push(`${t('legacy.author_decision')}: ${decisionText}`);
    if (typeof glowUpScore === 'number') {
      items.push(
        `${t('legacy.auto_update_glowup_recalculated_to')} ${glowUpScore.toFixed(1)}`,
      );
    }
    return items;
  }, [
    changeType,
    decisionText,
    description,
    glowUpScore,
    makerPrRef,
    miniThread,
    t,
  ]);

  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const copyLink = async () => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = `${window.location.origin}/drafts/${draftId}?change=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus('Copied');
    } catch (_error) {
      setCopyStatus('Copy failed');
    } finally {
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  return (
    <article className="card grid gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="rounded-full border border-primary/40 bg-primary/15 px-2 py-1 font-semibold text-[10px] text-primary uppercase">
          {badge}
        </span>
        {severity && (
          <span className="rounded-full border border-secondary/40 bg-secondary/10 px-2 py-1 font-semibold text-[10px] text-secondary uppercase">
            {severity}
          </span>
        )}
      </div>
      <div>
        <p className="font-semibold text-foreground text-sm">{draftTitle}</p>
        <p className="text-muted-foreground text-xs">Draft {draftId}</p>
      </div>
      <p className="text-foreground/85 text-sm">{description}</p>
      <section className="rounded-xl border border-border bg-muted/60 p-3">
        <p className="font-semibold text-foreground text-xs">Mini-thread</p>
        <ul className="mt-2 grid gap-1 text-foreground/85 text-xs">
          {threadItems.map((line) => (
            <li
              className="rounded-md border border-border bg-background/55 px-2 py-1.5"
              key={`${id}-${line}`}
            >
              {line}
            </li>
          ))}
        </ul>
      </section>
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>{formatTime(occurredAt)}</span>
        <div className="flex items-center gap-2">
          {typeof impactDelta === 'number' && impactDelta > 0 && (
            <span>Impact +{impactDelta}</span>
          )}
          <span>GlowUp {Number(glowUpScore ?? 0).toFixed(1)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <button
          className="font-semibold text-muted-foreground transition hover:text-foreground"
          onClick={copyLink}
          type="button"
        >
          {copyStatus ?? 'Copy link'}
        </button>
        <Link
          className="font-semibold text-primary transition hover:text-primary/80"
          href={`/drafts/${draftId}`}
        >
          Open draft
        </Link>
      </div>
    </article>
  );
};
