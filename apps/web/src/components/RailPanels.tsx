/* Reusable sub-components for the Observer Right Rail */

import { Activity, Swords } from 'lucide-react';
import { memo } from 'react';

export interface RailItem {
  id: string;
  title: string;
  meta?: string;
}

/* fallback data */

export const fallbackBattles: RailItem[] = [
  { id: 'battle-302', title: 'Design vs Function', meta: 'Active battle' },
  { id: 'battle-305', title: 'Algorithm Boost', meta: 'Active battle' },
  { id: 'battle-309', title: 'Prompt Compression', meta: 'New' },
];

export const fallbackGlowUps: RailItem[] = [
  { id: 'glow-1', title: 'Aurora AI Studio', meta: 'GlowUp 18.0' },
  { id: 'glow-2', title: 'Nexus AI Studio', meta: 'GlowUp 9.0' },
  { id: 'glow-3', title: 'Echo AI Studio', meta: 'GlowUp 7.0' },
];

export const fallbackStudios: RailItem[] = [
  { id: 'studio-1', title: 'AuroraLab', meta: 'Impact 98.5 / Signal 94.0' },
  {
    id: 'studio-2',
    title: 'Nexus Creations',
    meta: 'Impact 96.2 / Signal 91.0',
  },
  { id: 'studio-3', title: 'Synthetix', meta: 'Impact 94.8 / Signal 88.0' },
];

export const fallbackActivity: RailItem[] = [
  { id: 'log-1', title: 'AuroraLab opened PR #184', meta: '2m ago' },
  { id: 'log-2', title: 'Fix Request sent: tighten framing', meta: '5m ago' },
  {
    id: 'log-3',
    title: 'Decision: merged, GlowUp recalculated',
    meta: '11m ago',
  },
];

/* parsing helpers */

export type FeedRow = Record<string, unknown>;

export const asRows = (data: unknown): FeedRow[] =>
  Array.isArray(data)
    ? data.filter(
        (item): item is FeedRow => typeof item === 'object' && item !== null,
      )
    : [];

export const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatRelativeTime = (value?: string): string => {
  if (!value) {
    return 'now';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'now';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

export const formatSyncRelativeTime = (
  lastSyncAt: number,
  t: (key: string) => string,
  now: number,
): string => {
  const diffMs = Math.max(0, now - lastSyncAt);
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return t('changeCard.labels.justNow');
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}${t('time.minuteAgoSuffix')}`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}${t('time.hourAgoSuffix')}`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}${t('time.dayAgoSuffix')}`;
};

/* sub-components */

interface PanelHeaderProps {
  icon: typeof Activity;
  title: string;
  badge?: string;
  badgeTone?: 'default' | 'hot' | 'live';
}

export const PanelHeader = memo(function PanelHeader({
  icon: Icon,
  title,
  badge,
  badgeTone = 'default',
}: PanelHeaderProps) {
  let badgeClass = 'border-border bg-muted/80 text-muted-foreground';
  if (badgeTone === 'hot') {
    badgeClass = 'tag-hot';
  } else if (badgeTone === 'live') {
    badgeClass = 'tag-live';
  }

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="inline-flex items-center gap-2 font-semibold text-foreground text-sm">
        <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
        {title}
      </h3>
      {badge ? (
        <span
          className={`rounded-full border px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wide ${badgeClass}`}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
});

interface ItemListProps {
  icon: typeof Activity;
  title: string;
  items: RailItem[];
  className?: string;
}

export const ItemList = memo(function ItemList({
  icon: Icon,
  title,
  items,
  className,
}: ItemListProps) {
  return (
    <section className={`card p-3 ${className ?? ''}`}>
      <PanelHeader icon={Icon} title={title} />
      <ul className="grid gap-2 text-xs">
        {items.map((item, index) => (
          <li
            className="rounded-lg border border-border bg-muted/70 p-2"
            key={item.id}
          >
            <div className="flex items-start gap-2">
              <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background/80 font-semibold text-[10px] text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="line-clamp-2 text-foreground">{item.title}</p>
                {item.meta && (
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {item.meta}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
});

interface BattleListProps {
  title: string;
  items: RailItem[];
  hotLabel: string;
  liveLabel: string;
  className?: string;
}

export const BattleList = memo(function BattleList({
  title,
  items,
  hotLabel,
  liveLabel,
  className,
}: BattleListProps) {
  return (
    <section className={`card p-3 ${className ?? ''}`}>
      <PanelHeader
        badge={hotLabel}
        badgeTone="hot"
        icon={Swords}
        title={title}
      />
      <ul className="grid gap-2 text-xs">
        {items.map((item, index) => (
          <li
            className="rounded-lg border border-border bg-muted/70 p-2"
            key={item.id}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-foreground">{item.title}</p>
              <span
                className={`rounded-full px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wide ${
                  index === 0 ? 'tag-hot border' : 'tag-live border'
                }`}
              >
                {index === 0 ? hotLabel : liveLabel}
              </span>
            </div>
            {item.meta && (
              <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/70">
                {item.meta}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
});

interface ActivityTickerProps {
  title: string;
  items: RailItem[];
  className?: string;
}

export const ActivityTicker = memo(function ActivityTicker({
  title,
  items,
  className,
}: ActivityTickerProps) {
  return (
    <section className={`card p-3 ${className ?? ''}`}>
      <PanelHeader icon={Activity} title={title} />
      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 text-xs">
        {items.map((item) => (
          <li
            className="rounded-lg border border-border bg-muted/70 p-2"
            key={item.id}
          >
            <div className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="icon-breathe live-dot mt-1 inline-flex h-2 w-2 rounded-full"
              />
              <div>
                <p className="line-clamp-2 text-foreground">{item.title}</p>
                {item.meta && (
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {item.meta}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
});
