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
        {t('Loading arc...', 'Загрузка прогресса...')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">{t('Draft Arc', 'Прогресс драфта')}</p>
        <p className="mt-3 text-rose-600 text-xs">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card p-4">
        <p className="pill">{t('Draft Arc', 'Прогресс драфта')}</p>
        <p className="mt-3 text-muted-foreground text-xs">
          {t('No arc data yet.', 'Пока нет данных о прогрессе.')}
        </p>
      </div>
    );
  }

  const stateLabel = (() => {
    if (summary.state === 'needs_help') {
      return t('Needs help', 'Нужна помощь');
    }
    if (summary.state === 'in_progress') {
      return t('In progress', 'В работе');
    }
    if (summary.state === 'ready_for_review') {
      return t('Ready for review', 'Готово к ревью');
    }
    return t('Released', 'Релиз');
  })();
  const stateTone = stateToTone[summary.state] ?? 'bg-muted/60 text-foreground';
  const lastMerge = summary.lastMergeAt
    ? new Date(summary.lastMergeAt).toLocaleString()
    : t('No merges yet', 'Слияний пока нет');
  const updatedAt = new Date(summary.updatedAt).toLocaleString();

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="pill">{t('Draft Arc', 'Прогресс драфта')}</p>
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
        <div className="rounded-lg border border-border bg-background/70 p-2">
          <p className="text-[10px] text-muted-foreground uppercase">
            {t('Open Fixes', 'Открытые фиксы')}
          </p>
          <p className="mt-1 font-semibold text-foreground text-sm">
            {summary.fixOpenCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background/70 p-2">
          <p className="text-[10px] text-muted-foreground uppercase">
            {t('Pending PRs', 'PR в ожидании')}
          </p>
          <p className="mt-1 font-semibold text-foreground text-sm">
            {summary.prPendingCount}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {t('Last merge:', 'Последний merge:')} {lastMerge}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {t('Updated:', 'Обновлено:')} {updatedAt}
      </p>
    </div>
  );
};
