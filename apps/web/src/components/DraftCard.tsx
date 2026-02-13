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

interface DraftCardProps {
  id: string;
  title: string;
  glowUpScore: number;
  compact?: boolean;
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
  compact,
  live,
  updatedAt,
  beforeImageUrl,
  afterImageUrl,
  reasonLabel,
  hotScore,
}: DraftCardProps) => {
  const { t } = useLanguage();

  const impact = Math.max(0.5, glowUpScore / 5 + (hotScore ?? 0.8));
  const signalLabel = signalForGlowUp(glowUpScore, t);
  const prCount = Math.max(1, Math.round(glowUpScore / 2.8));
  const fixCount = Math.max(1, Math.round(glowUpScore / 1.4));
  const timelineValue = Math.max(
    18,
    Math.min(92, Math.round(glowUpScore * 3 + (hotScore ?? 0) * 12)),
  );
  const activityLabel = updatedAt
    ? new Date(updatedAt).toLocaleString()
    : t('common.twoHoursAgo');
  const compactActivityMeta = compact
    ? activityLabel
    : `${t('common.aiStudio')} • ${activityLabel}`;
  const stageLabel = live ? t('common.draft') : t('common.update');
  const needsChanges = Boolean(hotScore && hotScore >= 2.2);
  const decisionLabel = needsChanges
    ? t('draft.changesRequested')
    : t('draft.merged');

  return (
    <article
      className={`card overflow-hidden transition ${
        compact ? 'p-2.5' : 'p-4 motion-safe:hover:-translate-y-1'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex flex-shrink-0 items-center justify-center rounded-full border border-primary/45 bg-primary/15 font-semibold text-primary uppercase ${
              compact ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'
            }`}
          >
            {title.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <h3
              className={`truncate font-semibold text-foreground ${
                compact ? 'text-base' : 'text-lg'
              }`}
            >
              {title}
            </h3>
            <p className="truncate text-muted-foreground text-xs">
              {compactActivityMeta}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {typeof hotScore === 'number' && (
            <span className="tag-hot rounded-full border px-2 py-1 font-semibold text-[10px]">
              {t('rail.hot')} {hotScore.toFixed(2)}
            </span>
          )}
          {compact ? null : (
            <span className="rounded-full border border-border bg-muted/70 px-2 py-1 font-semibold text-[10px] text-foreground uppercase">
              {stageLabel}
            </span>
          )}
          {live && (
            <span className="tag-live rounded-full border px-2 py-1 font-semibold text-xs">
              {t('common.live')}
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
          heightClass={compact ? 'h-32' : 'h-52'}
          id={`draft ${id}`}
          showCornerLabels
        />
      </section>

      {compact ? (
        <section className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-secondary/45 bg-secondary/15 px-2 py-0.5 font-semibold text-secondary">
            +{glowUpScore.toFixed(1)}%
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 font-semibold ${
              needsChanges ? 'tag-alert' : 'tag-success'
            }`}
          >
            {decisionLabel}
          </span>
        </section>
      ) : (
        <>
          <KeyMetricPreview
            helper={`${t('studioDetail.metrics.signal')}: ${signalLabel} • ${t(
              'feedTabs.metrics.prsFix',
            )}: ${prCount} • ${fixCount}`}
            label={t('changeCard.metrics.glowUp')}
            value={`+${glowUpScore.toFixed(1)}%`}
          />

          <CardDetails summaryLabel={t('card.viewDetails')}>
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
                {
                  label: t('feedTabs.metrics.prsFix'),
                  value: `${prCount} • ${fixCount}`,
                },
              ]}
            />
            <EvolutionTimeline timelineValue={timelineValue}>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-foreground/85 text-xs">
                <span>
                  {t('feedTabs.metrics.prs')}: {prCount}
                </span>
                <span>
                  {t('fix.fixRequests')}: {fixCount}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 font-semibold ${
                    needsChanges ? 'tag-alert' : 'tag-success'
                  }`}
                >
                  {decisionLabel}
                </span>
              </div>
            </EvolutionTimeline>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <span>
                {t('feedTabs.draftId')}: {id}
              </span>
            </div>
            <ObserverActions title={t('draft.observerActions')} />
          </CardDetails>
        </>
      )}

      <div className="mt-2 flex items-center justify-end text-muted-foreground text-xs">
        <Link
          className="font-semibold text-[11px] text-primary transition hover:text-primary/80"
          href={`/drafts/${id}`}
        >
          {t('feedTabs.openDetail')}
        </Link>
      </div>
      {reasonLabel && !compact ? (
        <p className="text-foreground/85 text-xs">
          {t('feedTabs.whyHot')}: {reasonLabel}
        </p>
      ) : null}
    </article>
  );
};
