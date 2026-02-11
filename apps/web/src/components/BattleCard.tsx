'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  ImagePair,
  normalizeVotes,
  ObserverActions,
  StatsGrid,
  signalForGlowUp,
} from './CardPrimitives';

interface BattleCardProps {
  id: string;
  title: string;
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
      className: 'border border-border bg-muted/70 text-foreground',
      label: t('battle.pending'),
    };
  }, [decision, t]);

  const impact = Math.max(0.5, glowUpScore / 4.8);
  const signal = signalForGlowUp(glowUpScore);
  const activityLabel = updatedAt
    ? new Date(updatedAt).toLocaleString()
    : t('common.liveNow');

  return (
    <article className="card overflow-hidden p-4 transition hover:-translate-y-1">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground text-lg">
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

      <section className="mt-3">
        <ImagePair
          afterImageUrl={afterImageUrl}
          afterLabel={rightLabel}
          beforeImageUrl={beforeImageUrl}
          beforeLabel={leftLabel}
          centerOverlay={
            <span className="absolute top-1/2 left-1/2 inline-flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 font-semibold text-[11px] text-foreground uppercase">
              VS
            </span>
          }
          heightClass="h-52"
          id={`battle ${id}`}
        />
      </section>

      <section className="mt-3 rounded-xl border border-border bg-muted/60 p-3">
        <div className="flex items-center justify-between text-foreground text-sm">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted">
          <div
            className="h-full rounded-l-full bg-gradient-to-r from-primary to-secondary"
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
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            aria-pressed={userVote === 'left'}
            className={`rounded-lg border px-2 py-1.5 font-semibold text-[11px] transition ${
              userVote === 'left'
                ? 'border-primary/45 bg-primary/15 text-primary'
                : 'border-border bg-muted/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
            onClick={() => castVote('left')}
            type="button"
          >
            {t('battle.vote')} {leftLabel}
          </button>
          <button
            aria-pressed={userVote === 'right'}
            className={`rounded-lg border px-2 py-1.5 font-semibold text-[11px] transition ${
              userVote === 'right'
                ? 'border-primary/45 bg-primary/15 text-primary'
                : 'border-border bg-muted/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
            onClick={() => castVote('right')}
            type="button"
          >
            {t('battle.vote')} {rightLabel}
          </button>
        </div>
        {voteLabel && (
          <p className="mt-2 text-[11px] text-secondary">
            {t('battle.yourVote')}: {voteLabel}
          </p>
        )}
      </section>

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
          { label: 'Signal', value: signal },
          { label: 'PRs / Fix', value: `${prCount} / ${fixCount}` },
        ]}
      />

      <ObserverActions title={t('battle.observerActions')} />

      <div className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
        <span>Battle ID: {id}</span>
        <Link
          className="font-semibold text-[11px] text-primary"
          href={`/drafts/${id}`}
        >
          Open battle
        </Link>
      </div>
    </article>
  );
};
