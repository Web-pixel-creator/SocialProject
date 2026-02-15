'use client';

import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';
import {
  CardDetails,
  EvolutionTimeline,
  ImagePair,
  KeyMetricPreview,
  ObserverActions,
  StatsGrid,
  signalForGlowUp,
} from './CardPrimitives';

interface BeforeAfterCardProps {
  draftId: string;
  compact?: boolean;
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
  compact,
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
  const signalLabel = signalForGlowUp(glowUpScore, t);
  const activityText = lastActivity
    ? new Date(lastActivity).toLocaleString()
    : t('changeCard.labels.justNow');
  const compactMeta = compact
    ? activityText
    : `${t('common.aiStudio')} • ${activityText}`;

  return (
    <article className={`card overflow-hidden ${compact ? 'p-2' : 'p-4'}`}>
      <header
        className={`flex items-start justify-between gap-3 ${
          compact ? '' : 'pb-3'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex flex-shrink-0 items-center justify-center rounded-full border border-primary/45 bg-primary/15 font-semibold text-primary uppercase ${
              compact ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'
            }`}
          >
            {(authorStudio ?? 'S').slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p
              className={`truncate font-semibold text-foreground ${
                compact ? 'text-base' : 'text-lg'
              }`}
            >
              {authorStudio ?? t('feed.studio')}
            </p>
            <p className="truncate text-muted-foreground text-xs">
              {compactMeta}
            </p>
          </div>
        </div>
        {compact ? null : (
          <span className="rounded-full border border-border/30 bg-muted/60 px-2 py-1 font-semibold text-[10px] text-foreground uppercase">
            {t('common.update')}
          </span>
        )}
      </header>

      <section className={compact ? 'mt-3' : 'mt-4'}>
        <ImagePair
          afterImageUrl={afterImageUrl}
          afterLabel={t('common.after')}
          beforeImageUrl={beforeImageUrl}
          beforeLabel={t('common.before')}
          heightClass={compact ? 'h-28' : 'h-52'}
          id={`draft ${draftId}`}
          showCornerLabels
        />
      </section>

      {compact ? (
        <section className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/35 bg-primary/12 px-2 py-0.5 font-semibold text-primary">
              +{glowUpScore.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">
              {t('feedTabs.metrics.prs')}: {prCount}
            </span>
          </div>
          <Link
            className="font-semibold text-[11px] text-primary transition hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href={`/drafts/${draftId}`}
            onClick={onOpen}
          >
            {t('feedTabs.openDetail')}
          </Link>
        </section>
      ) : (
        <>
          <KeyMetricPreview
            helper={`${t('studioDetail.metrics.signal')}: ${signalLabel} • ${t(
              'feedTabs.metrics.prs',
            )} ${prCount}`}
            label={t('changeCard.metrics.glowUp')}
            value={`+${glowUpScore.toFixed(1)}%`}
          />

          <CardDetails summaryLabel={t('card.viewDetails')}>
            <StatsGrid
              tiles={[
                {
                  label: t('changeCard.metrics.glowUp'),
                  value: `+${glowUpScore.toFixed(1)}%`,
                  colorClass: 'text-primary',
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
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <span>
                {t('feedTabs.draftId')}: {draftId}
              </span>
              <span>{authorStudio ?? t('feed.studio')}</span>
            </div>
            <ObserverActions />
          </CardDetails>
        </>
      )}

      {compact ? null : (
        <div className="mt-2 flex items-center justify-end text-muted-foreground text-xs">
          <Link
            className="font-semibold text-[11px] text-primary transition hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href={`/drafts/${draftId}`}
            onClick={onOpen}
          >
            {t('feedTabs.openDetail')}
          </Link>
        </div>
      )}
    </article>
  );
};
