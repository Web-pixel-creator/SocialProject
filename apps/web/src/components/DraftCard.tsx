'use client';

import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';
import {
  EvolutionTimeline,
  ImagePair,
  ObserverActions,
  StatsGrid,
  signalForGlowUp,
} from './CardPrimitives';

interface DraftCardProps {
  id: string;
  title: string;
  glowUpScore: number;
  live?: boolean;
  updatedAt?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  reasonLabel?: string;
  hotScore?: number;
}

export const DraftCard = ({
  id,
  title,
  glowUpScore,
  live,
  updatedAt,
  beforeImageUrl,
  afterImageUrl,
  reasonLabel,
  hotScore,
}: DraftCardProps) => {
  const { t } = useLanguage();

  const impact = Math.max(0.5, glowUpScore / 5 + (hotScore ?? 0.8));
  const signalLabel = signalForGlowUp(glowUpScore);
  const prCount = Math.max(1, Math.round(glowUpScore / 2.8));
  const fixCount = Math.max(1, Math.round(glowUpScore / 1.4));
  const timelineValue = Math.max(
    18,
    Math.min(92, Math.round(glowUpScore * 3 + (hotScore ?? 0) * 12)),
  );
  const activityLabel = updatedAt
    ? new Date(updatedAt).toLocaleString()
    : t('common.twoHoursAgo');
  const stageLabel = live ? t('common.draft') : t('common.update');
  const decisionLabel =
    hotScore && hotScore >= 2.2
      ? t('draft.changesRequested')
      : t('draft.merged');

  return (
    <article className="card overflow-hidden p-4 transition hover:-translate-y-1">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-primary/45 bg-primary/15 font-semibold text-primary text-sm uppercase">
            {title.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground text-lg">
              {title}
            </h3>
            <p className="truncate text-muted-foreground text-xs">
              {t('common.aiStudio')} • {activityLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {typeof hotScore === 'number' && (
            <span className="rounded-full border border-primary/35 bg-primary/10 px-2 py-1 font-semibold text-[10px] text-primary">
              Hot {hotScore.toFixed(2)}
            </span>
          )}
          <span className="rounded-full border border-border bg-muted/70 px-2 py-1 font-semibold text-[10px] text-foreground uppercase">
            {stageLabel}
          </span>
          {live && (
            <span className="rounded-full border border-secondary/40 bg-secondary/15 px-2 py-1 font-semibold text-secondary text-xs">
              Live
            </span>
          )}
        </div>
      </header>

      <section className="mt-3">
        <ImagePair
          afterImageUrl={afterImageUrl}
          afterLabel={t('common.after')}
          beforeImageUrl={beforeImageUrl}
          beforeLabel={t('common.before')}
          id={`draft ${id}`}
          showCornerLabels
        />
      </section>

      <EvolutionTimeline timelineValue={timelineValue}>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-foreground/85 text-xs">
          <span>PRs: {prCount}</span>
          <span>Fix Requests: {fixCount}</span>
          <span className="rounded-full border border-secondary/40 bg-secondary/10 px-2 py-0.5 font-semibold text-secondary">
            {decisionLabel}
          </span>
        </div>
      </EvolutionTimeline>

      <StatsGrid
        tiles={[
          {
            label: 'GlowUp',
            value: `+${glowUpScore.toFixed(1)}%`,
            colorClass: 'text-secondary',
          },
          {
            label: 'Impact',
            value: `+${impact.toFixed(1)}`,
            colorClass: 'text-primary',
          },
          { label: 'Signal', value: signalLabel },
          { label: 'PRs • Fix', value: `${prCount} • ${fixCount}` },
        ]}
      />

      <ObserverActions title={t('draft.observerActions')} />

      <div className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
        <span>Draft ID: {id}</span>
        <Link
          className="font-semibold text-[11px] text-primary transition hover:text-primary/80"
          href={`/drafts/${id}`}
        >
          Open detail
        </Link>
      </div>

      {reasonLabel && (
        <p className="text-foreground/85 text-xs">Why hot: {reasonLabel}</p>
      )}
      <p className="font-semibold text-foreground text-sm">
        GlowUp score: {glowUpScore.toFixed(1)}
      </p>
    </article>
  );
};
