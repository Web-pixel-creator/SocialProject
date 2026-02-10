'use client';

import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';
import {
  EvolutionTimeline,
  ImagePair,
  ObserverActions,
  StatsGrid,
} from './CardPrimitives';

interface BeforeAfterCardProps {
  draftId: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  glowUpScore: number;
  prCount: number;
  lastActivity?: string;
  authorStudio?: string;
  onOpen?: () => void;
}

export const BeforeAfterCard = ({
  draftId,
  beforeImageUrl,
  afterImageUrl,
  glowUpScore,
  prCount,
  lastActivity,
  authorStudio,
  onOpen,
}: BeforeAfterCardProps) => {
  const { t } = useLanguage();
  const timelineValue = Math.max(22, Math.min(95, Math.round(glowUpScore * 4)));
  const impact = Math.max(0.5, glowUpScore / 4.4);
  let signalLabel = 'Low';
  if (glowUpScore >= 12) {
    signalLabel = 'High';
  } else if (glowUpScore >= 7) {
    signalLabel = 'Medium';
  }

  return (
    <article className="card overflow-hidden p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-primary/45 bg-primary/15 font-semibold text-primary text-sm uppercase">
            {(authorStudio ?? 'S').slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground text-lg">
              {authorStudio ?? t('feed.studio')}
            </p>
            <p className="truncate text-muted-foreground text-xs">
              {t('common.aiStudio')} •{' '}
              {lastActivity
                ? new Date(lastActivity).toLocaleString()
                : t('changeCard.labels.justNow')}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-muted/70 px-2 py-1 font-semibold text-[10px] text-foreground uppercase">
          {t('common.update')}
        </span>
      </header>

      <section className="mt-3">
        <ImagePair
          afterImageUrl={afterImageUrl}
          afterLabel={t('common.after')}
          beforeImageUrl={beforeImageUrl}
          beforeLabel={t('common.before')}
          id={`draft ${draftId}`}
          showCornerLabels
        />
      </section>

      <EvolutionTimeline timelineValue={timelineValue}>
        <div className="mt-2 flex items-center justify-between text-foreground/85 text-xs">
          <span>
            {t('feedTabs.metrics.prs')}: {prCount}
          </span>
          <span>{authorStudio ?? t('feed.studio')}</span>
        </div>
        {lastActivity && (
          <p className="mt-1 text-muted-foreground text-xs">
            {t('feedTabs.lastActivity')}:{' '}
            {new Date(lastActivity).toLocaleString()}
          </p>
        )}
      </EvolutionTimeline>

      <StatsGrid
        tiles={[
          {
            label: t('changeCard.metrics.glowUp'),
            value: `+${glowUpScore.toFixed(1)}%`,
            colorClass: 'text-secondary',
          },
          {
            label: t('changeCard.metrics.impact'),
            value: `+${impact.toFixed(1)}`,
            colorClass: 'text-primary',
          },
          { label: t('studioDetail.metrics.signal'), value: signalLabel },
          { label: t('feedTabs.metrics.prs'), value: String(prCount) },
        ]}
      />

      <ObserverActions />

      <div className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
        <span>
          {t('feedTabs.draftId')}: {draftId}
        </span>
        <Link
          className="font-semibold text-[11px] text-primary transition hover:text-primary/80"
          href={`/drafts/${draftId}`}
          onClick={onOpen}
        >
          {t('feedTabs.openDetail')}
        </Link>
      </div>

      <p className="font-semibold text-foreground text-sm">
        {t('changeCard.metrics.glowUp')} {glowUpScore.toFixed(1)}
      </p>
    </article>
  );
};
