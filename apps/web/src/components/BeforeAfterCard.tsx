'use client';

import { ArrowRightLeft, Bookmark, Eye, Star, UserPlus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

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
  const [failedBeforeUrl, setFailedBeforeUrl] = useState<string | null>(null);
  const [failedAfterUrl, setFailedAfterUrl] = useState<string | null>(null);
  const canRenderBefore =
    Boolean(beforeImageUrl) && beforeImageUrl !== failedBeforeUrl;
  const canRenderAfter =
    Boolean(afterImageUrl) && afterImageUrl !== failedAfterUrl;
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
              {authorStudio ?? 'Studio'}
            </p>
            <p className="truncate text-muted-foreground text-xs">
              AI Studio •{' '}
              {lastActivity ? new Date(lastActivity).toLocaleString() : 'now'}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-muted/70 px-2 py-1 font-semibold text-[10px] text-foreground uppercase">
          Update
        </span>
      </header>

      <section className="mt-3">
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted/75">
          <div className="grid h-56 grid-cols-2">
            <div className="h-full w-full">
              {canRenderBefore ? (
                <Image
                  alt={`Before draft ${draftId}`}
                  className="h-full w-full object-cover"
                  height={224}
                  loading="lazy"
                  onError={() => setFailedBeforeUrl(beforeImageUrl)}
                  src={beforeImageUrl}
                  unoptimized
                  width={360}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/70">
                  <span className="text-muted-foreground text-xs">Before</span>
                </div>
              )}
            </div>
            <div className="h-full w-full">
              {canRenderAfter ? (
                <Image
                  alt={`After draft ${draftId}`}
                  className="h-full w-full object-cover"
                  height={224}
                  loading="lazy"
                  onError={() => setFailedAfterUrl(afterImageUrl)}
                  src={afterImageUrl}
                  unoptimized
                  width={360}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/70">
                  <span className="text-muted-foreground text-xs">After</span>
                </div>
              )}
            </div>
          </div>
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/40" />
          <span className="absolute top-1/2 left-1/2 inline-flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground">
            <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="absolute bottom-2 left-2 rounded-full bg-background/80 px-2 py-1 font-semibold text-[10px] text-foreground">
            Before
          </span>
          <span className="absolute right-2 bottom-2 rounded-full bg-background/80 px-2 py-1 font-semibold text-[10px] text-foreground">
            After
          </span>
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-border bg-muted/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-foreground text-sm">Evolution</p>
          <p className="text-muted-foreground text-xs">Before / After</p>
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
        <div className="mt-2 flex items-center justify-between text-foreground/85 text-xs">
          <span>PRs: {prCount}</span>
          <span>{authorStudio ?? 'Studio'}</span>
        </div>
        {lastActivity && (
          <p className="mt-1 text-muted-foreground text-xs">
            Last activity: {new Date(lastActivity).toLocaleString()}
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
          <p className="font-semibold text-foreground text-lg">{signalLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/70 p-2">
          <p className="text-muted-foreground text-xs">PRs</p>
          <p className="font-semibold text-foreground text-lg">{prCount}</p>
        </div>
      </section>

      <section className="mt-2 rounded-xl border border-border bg-muted/60 p-2">
        <p className="mb-2 text-muted-foreground text-xs">Observer actions</p>
        <div className="grid grid-cols-5 gap-1">
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            type="button"
          >
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            Watch
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            type="button"
          >
            <ArrowRightLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Compare
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            type="button"
          >
            <Star aria-hidden="true" className="h-3.5 w-3.5" />
            Rate
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            type="button"
          >
            <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
            Follow
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            type="button"
          >
            <Bookmark aria-hidden="true" className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </section>

      <div className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
        <span>Draft ID: {draftId}</span>
        <Link
          className="font-semibold text-[11px] text-primary transition hover:text-primary/80"
          href={`/drafts/${draftId}`}
          onClick={onOpen}
        >
          Open detail
        </Link>
      </div>

      <p className="font-semibold text-foreground text-sm">
        GlowUp {glowUpScore.toFixed(1)}
      </p>
    </article>
  );
};
