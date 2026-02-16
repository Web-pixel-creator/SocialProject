'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  CardDetails,
  ImagePair,
  normalizeVotes,
  ObserverActions,
  StatsGrid,
  signalForGlowUp,
} from './CardPrimitives';

interface BattleCardProps {
  id: string;
  title: string;
  compact?: boolean;
  leftLabel: string;
  rightLabel: string;
  leftVote: number;
  rightVote: number;
  glowUpScore: number;
  prCount: number;
  fixCount: number;
  decision: 'merged' | 'changes_requested' | 'pending';
  updatedAt?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

export const BattleCard = ({
  id,
  title,
  compact,
  leftLabel,
  rightLabel,
  leftVote,
  rightVote,
  glowUpScore,
  prCount,
  fixCount,
  decision,
  updatedAt,
  beforeImageUrl,
  afterImageUrl,
}: BattleCardProps) => {
  const { t } = useLanguage();
  const [voteState, setVoteState] = useState<{ left: number; right: number }>(
    () => normalizeVotes(leftVote, rightVote),
  );
  const [userVote, setUserVote] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    setVoteState(normalizeVotes(leftVote, rightVote));
    setUserVote(null);
  }, [leftVote, rightVote]);

  const voteLabel = useMemo(() => {
    if (userVote === 'left') {
      return leftLabel;
    }
    if (userVote === 'right') {
      return rightLabel;
    }
    return null;
  }, [leftLabel, rightLabel, userVote]);

  const castVote = (side: 'left' | 'right') => {
    setVoteState((current) => {
      const boost = 3;
      if (side === 'left') {
        return normalizeVotes(current.left + boost, current.right);
      }
      return normalizeVotes(current.left, current.right + boost);
    });
    setUserVote(side);
  };

  const decisionUi = useMemo(() => {
    if (decision === 'merged') {
      return {
        className: 'border tag-success',
        label: t('battle.merged'),
      };
    }
    if (decision === 'changes_requested') {
      return {
        className: 'border tag-alert',
        label: t('battle.changesRequested'),
      };
    }
    return {
      className: 'border border-border/25 bg-muted/60 text-foreground',
      label: t('battle.pending'),
    };
  }, [decision, t]);

  const impact = Math.max(0.5, glowUpScore / 4.8);
  const signal = signalForGlowUp(glowUpScore, t);
  const activityLabel = updatedAt
    ? new Date(updatedAt).toLocaleString()
    : t('common.liveNow');

  return (
    <article
      className={`card overflow-hidden transition ${
        compact ? 'p-2.5' : 'p-4 motion-safe:hover:-translate-y-1'
      }`}
    >
      <header
        className={`flex items-start justify-between gap-3 ${
          compact ? '' : 'pb-3'
        }`}
      >
        <div className="min-w-0">
          <p
            className={`truncate font-semibold text-foreground ${
              compact ? 'text-base' : 'text-lg'
            }`}
          >
            {title}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            {activityLabel}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 font-semibold text-[10px] uppercase tracking-wide ${decisionUi.className}`}
        >
          {decisionUi.label}
        </span>
      </header>

      <section className={compact ? 'mt-3' : 'mt-4'}>
        <ImagePair
          afterImageUrl={afterImageUrl}
          afterLabel={rightLabel}
          beforeImageUrl={beforeImageUrl}
          beforeLabel={leftLabel}
          centerOverlay={
            <span className="absolute top-1/2 left-1/2 inline-flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/25 bg-background/74 font-semibold text-[11px] text-foreground uppercase">
              VS
            </span>
          }
          heightClass={compact ? 'h-28' : 'h-52'}
          id={`battle ${id}`}
        />
      </section>

      <section
        className={`mt-3.5 rounded-xl border border-border/25 bg-background/35 ${
          compact ? 'p-2.5' : 'p-3'
        }`}
      >
        <div className="flex items-center justify-between text-foreground text-sm">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
        <div className="chart-positive-track mt-2 h-2 rounded-full">
          <div
            className="chart-positive-fill h-full rounded-l-full"
            style={{ width: `${voteState.left}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-foreground/85 text-xs">
          <span>
            {leftLabel} {voteState.left}%
          </span>
          <span>
            {rightLabel} {voteState.right}%
          </span>
        </div>
        {compact ? null : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              aria-pressed={userVote === 'left'}
              className={`rounded-lg border px-2 py-1.5 font-semibold text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                userVote === 'left'
                  ? 'border-primary/45 bg-primary/15 text-primary'
                  : 'border-border/25 bg-muted/60 text-muted-foreground hover:bg-muted/74 hover:text-foreground'
              }`}
              onClick={() => castVote('left')}
              type="button"
            >
              {t('battle.vote')} {leftLabel}
            </button>
            <button
              aria-pressed={userVote === 'right'}
              className={`rounded-lg border px-2 py-1.5 font-semibold text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                userVote === 'right'
                  ? 'border-primary/45 bg-primary/15 text-primary'
                  : 'border-border/25 bg-muted/60 text-muted-foreground hover:bg-muted/74 hover:text-foreground'
              }`}
              onClick={() => castVote('right')}
              type="button"
            >
              {t('battle.vote')} {rightLabel}
            </button>
          </div>
        )}
        {voteLabel && (
          <p className="mt-2 text-[11px] text-primary">
            {t('battle.yourVote')}: {voteLabel}
          </p>
        )}
      </section>

      {compact ? (
        <section className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/35 bg-primary/12 px-2 py-0.5 font-semibold text-primary">
              +{glowUpScore.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">
              {t('battle.metrics.prsFix')}: {prCount} / {fixCount}
            </span>
          </div>
          <Link
            className="inline-flex min-h-8 items-center rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 font-semibold text-[11px] text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href={`/drafts/${id}`}
          >
            {t('battle.openBattle')}
          </Link>
        </section>
      ) : (
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
              { label: t('studioDetail.metrics.signal'), value: signal },
              {
                label: t('battle.metrics.prsFix'),
                value: `${prCount} / ${fixCount}`,
              },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <span>
              {t('battle.idLabel')}: {id}
            </span>
            <span>{activityLabel}</span>
          </div>

          <ObserverActions title={t('battle.observerActions')} />
        </CardDetails>
      )}

      {compact ? null : (
        <div className="mt-2 flex items-center justify-end text-muted-foreground text-xs">
          <Link
            className="font-semibold text-[11px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href={`/drafts/${id}`}
          >
            {t('battle.openBattle')}
          </Link>
        </div>
      )}
    </article>
  );
};
