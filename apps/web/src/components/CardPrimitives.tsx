/* Shared primitives reused across BattleCard, DraftCard, and BeforeAfterCard */
'use client';

import {
  ArrowRightLeft,
  Bookmark,
  Eye,
  MoreHorizontal,
  Star,
  UserPlus,
} from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

/* helpers */

export const signalForGlowUp = (glowUpScore: number): string => {
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

export const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

export const normalizeVotes = (
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

/* Image pair with error handling */

interface ImagePairProps {
  id: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  beforeLabel: string;
  afterLabel: string;
  /** Grid height class, default "h-56" */
  heightClass?: string;
  /** Center overlay element. Defaults to ArrowRightLeft icon. */
  centerOverlay?: React.ReactNode;
  /** Show corner labels (Before / After). */
  showCornerLabels?: boolean;
}

export const ImagePair = ({
  id,
  beforeImageUrl,
  afterImageUrl,
  beforeLabel,
  afterLabel,
  heightClass = 'h-56',
  centerOverlay,
  showCornerLabels = false,
}: ImagePairProps) => {
  const [failedBeforeUrl, setFailedBeforeUrl] = useState<string | null>(null);
  const [failedAfterUrl, setFailedAfterUrl] = useState<string | null>(null);
  const canRenderBefore =
    Boolean(beforeImageUrl) && beforeImageUrl !== failedBeforeUrl;
  const canRenderAfter =
    Boolean(afterImageUrl) && afterImageUrl !== failedAfterUrl;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-muted/75">
      <div className={`grid ${heightClass} grid-cols-2`}>
        <div className="h-full w-full">
          {canRenderBefore ? (
            <Image
              alt={`${beforeLabel} ${id}`}
              className="h-full w-full object-cover"
              height={224}
              loading="lazy"
              onError={() => setFailedBeforeUrl(beforeImageUrl ?? null)}
              src={beforeImageUrl ?? ''}
              unoptimized
              width={360}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted/70">
              <span className="text-muted-foreground text-xs">
                {beforeLabel}
              </span>
            </div>
          )}
        </div>
        <div className="h-full w-full">
          {canRenderAfter ? (
            <Image
              alt={`${afterLabel} ${id}`}
              className="h-full w-full object-cover"
              height={224}
              loading="lazy"
              onError={() => setFailedAfterUrl(afterImageUrl ?? null)}
              src={afterImageUrl ?? ''}
              unoptimized
              width={360}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted/70">
              <span className="text-muted-foreground text-xs">
                {afterLabel}
              </span>
            </div>
          )}
        </div>
      </div>
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/40" />
      {centerOverlay ?? (
        <span className="absolute top-1/2 left-1/2 inline-flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground">
          <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
        </span>
      )}
      {showCornerLabels && (
        <>
          <span className="absolute bottom-2 left-2 rounded-full bg-background/80 px-2 py-1 font-semibold text-[10px] text-foreground">
            {beforeLabel}
          </span>
          <span className="absolute right-2 bottom-2 rounded-full bg-background/80 px-2 py-1 font-semibold text-[10px] text-foreground">
            {afterLabel}
          </span>
        </>
      )}
    </div>
  );
};

/* Stats grid (GlowUp, Impact, Signal, PRs) */

export interface StatTile {
  label: string;
  value: string;
  colorClass?: string; // e.g. "text-secondary", default "text-foreground"
}

interface StatsGridProps {
  tiles: StatTile[];
}

export const StatsGrid = ({ tiles }: StatsGridProps) => (
  <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
    {tiles.map((tile) => (
      <div
        className="rounded-xl border border-border bg-muted/70 p-2"
        key={tile.label}
      >
        <p className="text-muted-foreground text-xs">{tile.label}</p>
        <p
          className={`font-semibold text-lg ${tile.colorClass ?? 'text-foreground'}`}
        >
          {tile.value}
        </p>
      </div>
    ))}
  </section>
);

interface KeyMetricPreviewProps {
  label: string;
  value: string;
  helper?: string;
  toneClass?: string;
}

export const KeyMetricPreview = ({
  label,
  value,
  helper,
  toneClass = 'text-secondary',
}: KeyMetricPreviewProps) => (
  <section className="mt-3 rounded-xl border border-border bg-muted/65 p-3">
    <p className="text-muted-foreground text-xs">{label}</p>
    <p className={`font-semibold text-2xl ${toneClass}`}>{value}</p>
    {helper ? (
      <p className="mt-1 text-foreground/80 text-xs">{helper}</p>
    ) : null}
  </section>
);

/* Observer actions (Watch, Compare, Rate, Follow, Save) */

interface ObserverActionsProps {
  title?: string;
  buttonClassName?: string;
}

export const ObserverActions = ({
  title,
  buttonClassName = 'inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-background/60 px-1 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground',
}: ObserverActionsProps) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const resolvedTitle = title ?? t('draft.observerActions');
  const actions = [
    { icon: Eye, label: t('observerAction.watch') },
    { icon: ArrowRightLeft, label: t('observerAction.compare') },
    { icon: Star, label: t('observerAction.rate') },
    { icon: UserPlus, label: t('observerAction.follow') },
    { icon: Bookmark, label: t('observerAction.save') },
  ];
  const primaryActions = actions.slice(0, 2);
  const secondaryActions = actions.slice(2);

  return (
    <section className="mt-2 rounded-xl border border-border bg-muted/60 p-2">
      <p className="mb-2 text-muted-foreground text-xs">{resolvedTitle}</p>
      <div className="grid grid-cols-3 gap-1">
        {primaryActions.map(({ icon: Icon, label }) => (
          <button className={buttonClassName} key={label} type="button">
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
        <button
          aria-expanded={expanded}
          className={buttonClassName}
          onClick={() => setExpanded((previous) => !previous)}
          type="button"
        >
          <MoreHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
          {t('feedTabs.more')}
        </button>
      </div>
      {expanded ? (
        <div className="mt-1 grid grid-cols-3 gap-1">
          {secondaryActions.map(({ icon: Icon, label }) => (
            <button className={buttonClassName} key={label} type="button">
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};

/* Evolution timeline bar */

interface EvolutionTimelineProps {
  timelineValue: number;
  children?: React.ReactNode;
}

export const EvolutionTimeline = ({
  timelineValue,
  children,
}: EvolutionTimelineProps) => {
  const { t } = useLanguage();

  return (
    <section className="mt-3 rounded-xl border border-border bg-muted/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-foreground text-sm">
          {t('common.evolution')}
        </p>
        <p className="text-muted-foreground text-xs">
          {t('common.beforeAfter')}
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
          className="absolute top-1/2 inline-flex h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-primary/70 bg-primary"
          style={{ left: `calc(${timelineValue}% - 7px)` }}
        />
      </div>
      {children}
    </section>
  );
};

/* Compact feed details */

interface CardDetailsProps {
  summaryLabel: string;
  children: React.ReactNode;
}

export const CardDetails = ({ summaryLabel, children }: CardDetailsProps) => (
  <details className="mt-3 overflow-hidden rounded-xl border border-border bg-muted/55">
    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide transition hover:text-foreground [&::-webkit-details-marker]:hidden">
      {summaryLabel}
      <span aria-hidden="true" className="text-[10px]">
        +
      </span>
    </summary>
    <div className="grid gap-2 border-border/60 border-t px-3 py-3">
      {children}
    </div>
  </details>
);
