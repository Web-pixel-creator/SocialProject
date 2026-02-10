'use client';

import { ArrowRightLeft, Bookmark, Eye, Star, UserPlus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

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

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

const normalizeVotes = (
  rawLeft: number,
  rawRight: number,
): { left: number; right: number } => {
  const safeLeft = Math.max(0, rawLeft);
  const safeRight = Math.max(0, rawRight);
  const total = safeLeft + safeRight;

  if (total <= 0) {
    return { left: 50, right: 50 };
  }

  const normalizedLeft = clampPercent((safeLeft / total) * 100);
  const boundedLeft = Math.max(5, Math.min(95, normalizedLeft));
  return {
    left: boundedLeft,
    right: 100 - boundedLeft,
  };
};

const signalForGlowUp = (glowUpScore: number): string => {
  if (glowUpScore >= 18) {
    return 'Very High';
  }
  if (glowUpScore >= 10) {
    return 'High';
  }
  if (glowUpScore >= 5) {
    return 'Medium';
  }
  return 'Low';
};

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
  const [failedBeforeUrl, setFailedBeforeUrl] = useState<string | null>(null);
  const [failedAfterUrl, setFailedAfterUrl] = useState<string | null>(null);
  const [voteState, setVoteState] = useState<{ left: number; right: number }>(
    () => normalizeVotes(leftVote, rightVote),
  );
  const [userVote, setUserVote] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    setVoteState(normalizeVotes(leftVote, rightVote));
    setUserVote(null);
  }, [leftVote, rightVote]);

  const canRenderBefore =
    Boolean(beforeImageUrl) && beforeImageUrl !== failedBeforeUrl;
  const canRenderAfter =
    Boolean(afterImageUrl) && afterImageUrl !== failedAfterUrl;
  const voteSplit = voteState;

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
        className: 'border border-secondary/40 bg-secondary/10 text-secondary',
        label: t('Merged', 'РЎРјРµСЂР¶РµРЅРѕ'),
      };
    }
    if (decision === 'changes_requested') {
      return {
        className: 'border border-primary/35 bg-primary/10 text-primary',
        label: t('Changes requested', 'РќСѓР¶РЅС‹ РґРѕСЂР°Р±РѕС‚РєРё'),
      };
    }
    return {
      className: 'border border-border bg-muted/70 text-foreground',
      label: t('Pending', 'Р’ РѕР¶РёРґР°РЅРёРё'),
    };
  }, [decision, t]);

  const impact = Math.max(0.5, glowUpScore / 4.8);
  const signal = signalForGlowUp(glowUpScore);
  const activityLabel = updatedAt
    ? new Date(updatedAt).toLocaleString()
    : t('Live now', 'РџСЂСЏРјРѕ СЃРµР№С‡Р°СЃ');

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
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted/75">
          <div className="grid h-52 grid-cols-2">
            <div className="h-full w-full">
              {canRenderBefore ? (
                <Image
                  alt={`${leftLabel} contender for battle ${id}`}
                  className="h-full w-full object-cover"
                  height={208}
                  loading="lazy"
                  onError={() => setFailedBeforeUrl(beforeImageUrl)}
                  src={beforeImageUrl}
                  unoptimized
                  width={360}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/70">
                  <span className="text-muted-foreground text-xs">
                    {leftLabel}
                  </span>
                </div>
              )}
            </div>
            <div className="h-full w-full">
              {canRenderAfter ? (
                <Image
                  alt={`${rightLabel} contender for battle ${id}`}
                  className="h-full w-full object-cover"
                  height={208}
                  loading="lazy"
                  onError={() => setFailedAfterUrl(afterImageUrl)}
                  src={afterImageUrl}
                  unoptimized
                  width={360}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/70">
                  <span className="text-muted-foreground text-xs">
                    {rightLabel}
                  </span>
                </div>
              )}
            </div>
          </div>
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/40" />
          <span className="absolute top-1/2 left-1/2 inline-flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 font-semibold text-[11px] text-foreground uppercase">
            VS
          </span>
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-border bg-muted/60 p-3">
        <div className="flex items-center justify-between text-foreground text-sm">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted">
          <div
            className="h-full rounded-l-full bg-gradient-to-r from-primary to-secondary"
            style={{ width: `${voteSplit.left}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-foreground/85 text-xs">
          <span>
            {leftLabel} {voteSplit.left}%
          </span>
          <span>
            {rightLabel} {voteSplit.right}%
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
            {t('Vote', 'Р“РѕР»РѕСЃ Р·Р°')} {leftLabel}
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
            {t('Vote', 'Р“РѕР»РѕСЃ Р·Р°')} {rightLabel}
          </button>
        </div>
        {voteLabel && (
          <p className="mt-2 text-[11px] text-secondary">
            {t('Your vote', 'Р’Р°С€ РіРѕР»РѕСЃ')}: {voteLabel}
          </p>
        )}
      </section>

      <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-muted/70 p-2">
          <p className="text-muted-foreground text-xs">GlowUp</p>
          <p className="font-semibold text-lg text-secondary">
            +{glowUpScore.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/70 p-2">
          <p className="text-muted-foreground text-xs">Impact</p>
          <p className="font-semibold text-lg text-primary">
            +{impact.toFixed(1)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/70 p-2">
          <p className="text-muted-foreground text-xs">Signal</p>
          <p className="font-semibold text-foreground text-lg">{signal}</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/70 p-2">
          <p className="text-muted-foreground text-xs">PRs / Fix</p>
          <p className="font-semibold text-foreground text-lg">
            {prCount} / {fixCount}
          </p>
        </div>
      </section>

      <section className="mt-2 rounded-xl border border-border bg-muted/60 p-2">
        <p className="mb-2 text-muted-foreground text-xs">
          {t('Observer actions', 'Р”РµР№СЃС‚РІРёСЏ РЅР°Р±Р»СЋРґР°С‚РµР»СЏ')}
        </p>
        <div className="grid grid-cols-5 gap-1">
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-muted/70 px-1 py-1.5 text-[10px] text-foreground/85"
            type="button"
          >
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Watch', 'РЎРјРѕС‚СЂРµС‚СЊ')}
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-muted/70 px-1 py-1.5 text-[10px] text-foreground/85"
            type="button"
          >
            <ArrowRightLeft aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Compare', 'РЎСЂР°РІРЅРёС‚СЊ')}
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-muted/70 px-1 py-1.5 text-[10px] text-foreground/85"
            type="button"
          >
            <Star aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Rate', 'РћС†РµРЅРёС‚СЊ')}
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-muted/70 px-1 py-1.5 text-[10px] text-foreground/85"
            type="button"
          >
            <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Follow', 'РџРѕРґРїРёСЃР°С‚СЊСЃСЏ')}
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-muted/70 px-1 py-1.5 text-[10px] text-foreground/85"
            type="button"
          >
            <Bookmark aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Save', 'РЎРѕС…СЂР°РЅРёС‚СЊ')}
          </button>
        </div>
      </section>

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
