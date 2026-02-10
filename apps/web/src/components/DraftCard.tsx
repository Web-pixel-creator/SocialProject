'use client';

import { ArrowRightLeft, Bookmark, Eye, Star, UserPlus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

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
  const [failedBeforeUrl, setFailedBeforeUrl] = useState<string | null>(null);
  const [failedAfterUrl, setFailedAfterUrl] = useState<string | null>(null);
  const canRenderBefore =
    Boolean(beforeImageUrl) && beforeImageUrl !== failedBeforeUrl;
  const canRenderAfter =
    Boolean(afterImageUrl) && afterImageUrl !== failedAfterUrl;

  const impact = Math.max(0.5, glowUpScore / 5 + (hotScore ?? 0.8));
  let signalLabel = t('Low', 'Low');
  if (glowUpScore >= 18) {
    signalLabel = t('Very High', 'Very High');
  } else if (glowUpScore >= 10) {
    signalLabel = t('High', 'High');
  } else if (glowUpScore >= 5) {
    signalLabel = t('Medium', 'Medium');
  }
  const prCount = Math.max(1, Math.round(glowUpScore / 2.8));
  const fixCount = Math.max(1, Math.round(glowUpScore / 1.4));
  const timelineValue = Math.max(
    18,
    Math.min(92, Math.round(glowUpScore * 3 + (hotScore ?? 0) * 12)),
  );
  const activityLabel = updatedAt
    ? new Date(updatedAt).toLocaleString()
    : t('2h ago', '2h ago');
  const stageLabel = live ? t('Draft', 'Draft') : t('Update', 'Update');
  const decisionLabel =
    hotScore && hotScore >= 2.2
      ? t('Changes requested', 'Changes requested')
      : t('Merged', 'Merged');

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
              {t('AI Studio', 'AI Studio')} • {activityLabel}
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
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted/75">
          <div className="grid h-56 grid-cols-2">
            <div className="h-full w-full">
              {canRenderBefore ? (
                <Image
                  alt={`Before draft ${id}`}
                  className="h-full w-full object-cover"
                  height={224}
                  loading="lazy"
                  onError={() => setFailedBeforeUrl(beforeImageUrl)}
                  src={beforeImageUrl}
                  unoptimized
                  width={360}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-muted/70 text-center">
                  <span className="font-semibold text-[11px] text-foreground/85">
                    {t('Before', 'Before')}
                  </span>
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    {t('Preview unavailable', 'Preview unavailable')}
                  </span>
                </div>
              )}
            </div>
            <div className="h-full w-full">
              {canRenderAfter ? (
                <Image
                  alt={`After draft ${id}`}
                  className="h-full w-full object-cover"
                  height={224}
                  loading="lazy"
                  onError={() => setFailedAfterUrl(afterImageUrl)}
                  src={afterImageUrl}
                  unoptimized
                  width={360}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-muted/70 text-center">
                  <span className="font-semibold text-[11px] text-foreground/85">
                    {t('After', 'After')}
                  </span>
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    {t('Preview unavailable', 'Preview unavailable')}
                  </span>
                </div>
              )}
            </div>
          </div>
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/40" />
          <span className="absolute top-1/2 left-1/2 inline-flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground">
            <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="absolute bottom-2 left-2 rounded-full bg-background/80 px-2 py-1 font-semibold text-[10px] text-foreground">
            {t('Before', 'Before')}
          </span>
          <span className="absolute right-2 bottom-2 rounded-full bg-background/80 px-2 py-1 font-semibold text-[10px] text-foreground">
            {t('After', 'After')}
          </span>
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-border bg-muted/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-foreground text-sm">
            {t('Evolution', 'Evolution')}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('Before / After', 'Before / After')}
          </p>
        </div>
        <div className="relative mt-2">
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/35 via-primary to-secondary"
              style={{ width: `${timelineValue}%` }}
            />
          </div>
          <span
            className="absolute top-1/2 inline-flex h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-primary/70 bg-primary shadow-[0_0_8px_rgba(12,220,247,0.45)]"
            style={{ left: `calc(${timelineValue}% - 7px)` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-foreground/85 text-xs">
          <span>PRs: {prCount}</span>
          <span>Fix Requests: {fixCount}</span>
          <span className="rounded-full border border-secondary/40 bg-secondary/10 px-2 py-0.5 font-semibold text-secondary">
            {decisionLabel}
          </span>
        </div>
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
          <p className="font-semibold text-foreground text-lg">{signalLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/70 p-2">
          <p className="text-muted-foreground text-xs">PRs • Fix</p>
          <p className="font-semibold text-foreground text-lg">
            {prCount} • {fixCount}
          </p>
        </div>
      </section>

      <section className="mt-2 rounded-xl border border-border bg-muted/60 p-2">
        <p className="mb-2 text-muted-foreground text-xs">
          {t('Observer actions', 'Observer actions')}
        </p>
        <div className="grid grid-cols-5 gap-1">
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            type="button"
          >
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Watch', 'Watch')}
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            type="button"
          >
            <ArrowRightLeft aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Compare', 'Compare')}
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            type="button"
          >
            <Star aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Rate', 'Rate')}
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            type="button"
          >
            <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Follow', 'Follow')}
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            type="button"
          >
            <Bookmark aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Save', 'Save')}
          </button>
        </div>
      </section>

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
