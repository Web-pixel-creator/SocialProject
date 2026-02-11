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

  const formatTime = (value?: string) => {
    if (!value) {
      return t('changeCard.labels.justNow');
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return t('changeCard.labels.justNow');
    }
    return date.toLocaleString();
  };

  const badge =
    changeType === 'pr_merged'
      ? t('changeCard.badges.prMerged')
      : t('changeCard.badges.fixRequest');
  const decisionText =
    decisionLabel ??
    (changeType === 'pr_merged'
      ? t('changeCard.status.merged')
      : t('changeCard.status.awaitingChanges'));
  const badgeTone =
    changeType === 'pr_merged' ? 'tag-success border' : 'tag-alert border';
  const severityTone =
    severity === 'major' ? 'tag-alert border' : 'tag-hot border';
  const threadItems = useMemo(() => {
    if (miniThread && miniThread.length > 0) {
      return miniThread;
    }

    const baseLine =
      changeType === 'pr_merged'
        ? `${t('changeCard.thread.mergedPr')}: ${description}`
        : `${t('changeCard.thread.fixRequest')}: ${description}`;
    const items = [baseLine];
    if (makerPrRef) {
      items.push(`${t('changeCard.thread.makerPr')}: ${makerPrRef}`);
    }
    items.push(`${t('changeCard.thread.authorDecision')}: ${decisionText}`);
    if (typeof glowUpScore === 'number') {
      items.push(
        `${t('changeCard.thread.autoUpdateGlowUp')} ${glowUpScore.toFixed(1)}`,
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
      setCopyStatus(t('changeCard.actions.copied'));
    } catch (_error) {
      setCopyStatus(t('changeCard.actions.copyFailed'));
    } finally {
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  return (
    <article className="card grid gap-3 p-4">
      <div className="flex items-center justify-between">
        <span
          className={`rounded-full px-2 py-1 font-semibold text-[10px] uppercase ${badgeTone}`}
        >
          {badge}
        </span>
        {severity && (
          <span
            className={`rounded-full px-2 py-1 font-semibold text-[10px] uppercase ${severityTone}`}
          >
            {severity}
          </span>
        )}
      </div>
      <div>
        <p className="font-semibold text-foreground text-sm">{draftTitle}</p>
        <p className="text-muted-foreground text-xs">
          {t('feedTabs.draftId')}: {draftId}
        </p>
      </div>
      <p className="text-foreground/85 text-sm">{description}</p>
      <section className="rounded-xl border border-border bg-muted/60 p-3">
        <p className="font-semibold text-foreground text-xs">
          {t('changeCard.labels.miniThread')}
        </p>
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
            <span>
              {t('changeCard.metrics.impact')} +{impactDelta}
            </span>
          )}
          <span>
            {t('changeCard.metrics.glowUp')}{' '}
            {Number(glowUpScore ?? 0).toFixed(1)}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <button
          className="font-semibold text-muted-foreground transition hover:text-foreground"
          onClick={copyLink}
          type="button"
        >
          {copyStatus ?? t('changeCard.actions.copyLink')}
        </button>
        <Link
          className="font-semibold text-primary transition hover:text-primary/80"
          href={`/drafts/${draftId}`}
        >
          {t('changeCard.actions.openDraft')}
        </Link>
      </div>
    </article>
  );
};
