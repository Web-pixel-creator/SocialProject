'use client';

import { useLanguage } from '../contexts/LanguageContext';

type DraftArcState =
  | 'needs_help'
  | 'in_progress'
  | 'ready_for_review'
  | 'released';

export interface DraftArcSummaryView {
  draftId: string;
  state: DraftArcState;
  latestMilestone: string;
  fixOpenCount: number;
  prPendingCount: number;
  lastMergeAt: string | Date | null;
  updatedAt: string | Date;
}

interface DraftArcCardProps {
  summary: DraftArcSummaryView | null;
  loading?: boolean;
  error?: string | null;
}

const stateToTone: Record<DraftArcState, string> = {
  needs_help: 'bg-rose-500/15 text-rose-500',
  in_progress: 'bg-sky-100 text-sky-700',
  ready_for_review: 'bg-amber-100 text-amber-800',
  released: 'bg-emerald-500/15 text-emerald-500',
};

export const DraftArcCard = ({
  summary,
  loading = false,
  error = null,
}: DraftArcCardProps) => {
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="card p-4 text-muted-foreground text-xs">
        {t('arc.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">{t('arc.title')}</p>
        <p className="mt-3 text-rose-600 text-xs">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card p-4">
        <p className="pill">{t('arc.title')}</p>
        <p className="mt-3 text-muted-foreground text-xs">{t('arc.noData')}</p>
      </div>
    );
  }

  const stateLabel = (() => {
    if (summary.state === 'needs_help') {
      return t('feed.needsHelp');
    }
    if (summary.state === 'in_progress') {
      return t('pr.inProgress');
    }
    if (summary.state === 'ready_for_review') {
      return t('feed.readyForReview');
    }
    return t('pr.released');
  })();
  const stateTone = stateToTone[summary.state] ?? 'bg-muted/60 text-foreground';
  const lastMerge = summary.lastMergeAt
    ? new Date(summary.lastMergeAt).toLocaleString()
    : t('pr.noMerges');
  const updatedAt = new Date(summary.updatedAt).toLocaleString();

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="pill">{t('arc.title')}</p>
        <span
          className={`rounded-full px-2 py-1 font-semibold text-[10px] ${stateTone}`}
        >
          {stateLabel}
        </span>
      </div>
      <p className="mt-3 font-semibold text-foreground text-sm">
        {summary.latestMilestone}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-muted-foreground text-xs">
        <div className="rounded-lg border border-border/45 bg-background/70 p-2">
          <p className="text-[10px] text-muted-foreground uppercase">
            {t('feed.openFixes')}
          </p>
          <p className="mt-1 font-semibold text-foreground text-sm">
            {summary.fixOpenCount}
          </p>
        </div>
        <div className="rounded-lg border border-border/45 bg-background/70 p-2">
          <p className="text-[10px] text-muted-foreground uppercase">
            {t('feed.pendingPRs')}
          </p>
          <p className="mt-1 font-semibold text-foreground text-sm">
            {summary.prPendingCount}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {t('pr.lastMerge')} {lastMerge}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {t('pr.updated')} {updatedAt}
      </p>
    </div>
  );
};
