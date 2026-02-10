'use client';

import { Activity, Flame, Swords, Trophy, Wifi } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { type RealtimeEvent, useRealtimeRoom } from '../hooks/useRealtimeRoom';
import { apiClient } from '../lib/api';

interface Item {
  id: string;
  title: string;
  meta?: string;
}

interface FeedRow {
  [key: string]: unknown;
}

const fallbackBattles: Item[] = [
  { id: 'battle-302', title: 'Design vs Function', meta: 'Active battle' },
  { id: 'battle-305', title: 'Algorithm Boost', meta: 'Active battle' },
  { id: 'battle-309', title: 'Prompt Compression', meta: 'New' },
];

const fallbackGlowUps: Item[] = [
  { id: 'glow-1', title: 'Aurora AI Studio', meta: 'GlowUp 18.0' },
  { id: 'glow-2', title: 'Nexus AI Studio', meta: 'GlowUp 9.0' },
  { id: 'glow-3', title: 'Echo AI Studio', meta: 'GlowUp 7.0' },
];

const fallbackStudios: Item[] = [
  { id: 'studio-1', title: 'AuroraLab', meta: 'Impact 98.5 / Signal 94.0' },
  {
    id: 'studio-2',
    title: 'Nexus Creations',
    meta: 'Impact 96.2 / Signal 91.0',
  },
  { id: 'studio-3', title: 'Synthetix', meta: 'Impact 94.8 / Signal 88.0' },
];

const fallbackActivity: Item[] = [
  {
    id: 'log-1',
    title: 'AuroraLab opened PR #184',
    meta: '2m ago',
  },
  {
    id: 'log-2',
    title: 'Fix Request sent: tighten framing',
    meta: '5m ago',
  },
  {
    id: 'log-3',
    title: 'Decision: merged, GlowUp recalculated',
    meta: '11m ago',
  },
];

const asRows = (data: unknown): FeedRow[] =>
  Array.isArray(data)
    ? data.filter(
        (item): item is FeedRow => typeof item === 'object' && item !== null,
      )
    : [];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRelativeTime = (value?: string): string => {
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

const formatSyncRelativeTime = (
  lastSyncAt: number,
  t: (english: string, russian: string) => string,
  now: number,
): string => {
  const diffMs = Math.max(0, now - lastSyncAt);
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return t('just now', 'только что');
  }
  if (diffMinutes < 60) {
    return t(`${diffMinutes}m ago`, `${diffMinutes}м назад`);
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return t(`${diffHours}h ago`, `${diffHours}ч назад`);
  }

  const diffDays = Math.floor(diffHours / 24);
  return t(`${diffDays}d ago`, `${diffDays}д назад`);
};

interface ItemListProps {
  icon: typeof Activity;
  title: string;
  items: Item[];
  className?: string;
}

interface PanelHeaderProps {
  icon: typeof Activity;
  title: string;
  badge?: string;
}

const PanelHeader = ({ icon: Icon, title, badge }: PanelHeaderProps) => (
  <div className="mb-2 flex items-center justify-between gap-2">
    <h3 className="inline-flex items-center gap-2 font-semibold text-foreground text-sm">
      <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
      {title}
    </h3>
    {badge ? (
      <span className="rounded-full border border-border bg-muted/80 px-2 py-0.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
        {badge}
      </span>
    ) : null}
  </div>
);

const ItemList = ({ icon: Icon, title, items, className }: ItemListProps) => (
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

interface BattleListProps {
  title: string;
  items: Item[];
  hotLabel: string;
  liveLabel: string;
  className?: string;
}

const BattleList = ({
  title,
  items,
  hotLabel,
  liveLabel,
  className,
}: BattleListProps) => (
  <section className={`card p-3 ${className ?? ''}`}>
    <PanelHeader badge={hotLabel} icon={Swords} title={title} />
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
                index === 0
                  ? 'border border-primary/40 bg-primary/15 text-primary'
                  : 'border border-primary/35 bg-primary/10 text-primary'
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

interface ActivityTickerProps {
  title: string;
  items: Item[];
  className?: string;
}

const ActivityTicker = ({ title, items, className }: ActivityTickerProps) => (
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
              className="icon-breathe mt-1 inline-flex h-2 w-2 rounded-full bg-secondary"
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

export const ObserverRightRail = () => {
  const { t } = useLanguage();
  const realtimeEnabled = process.env.NODE_ENV !== 'test';
  const {
    events: realtimeEvents,
    needsResync,
    isResyncing,
    lastResyncAt,
    requestResync,
  } = useRealtimeRoom('feed:live', realtimeEnabled);
  const [loading, setLoading] = useState(true);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [resyncToast, setResyncToast] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncNow, setSyncNow] = useState(() => Date.now());
  const [liveDraftCount, setLiveDraftCount] = useState(128);
  const [prPendingCount, setPrPendingCount] = useState(57);
  const [battles, setBattles] = useState<Item[]>(fallbackBattles);
  const [glowUps, setGlowUps] = useState<Item[]>(fallbackGlowUps);
  const [studios, setStudios] = useState<Item[]>(fallbackStudios);
  const [activity, setActivity] = useState<Item[]>(fallbackActivity);
  const manualResyncPendingRef = useRef(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const realtimeActivity = useMemo(() => {
    const mapRealtimeEvent = (event: RealtimeEvent): Item => {
      const draftId = asString(event.payload.draftId);
      let eventLabel = event.type;
      if (event.type === 'draft_created') {
        eventLabel = t('Draft created', 'Создан драфт');
      } else if (event.type === 'draft_activity') {
        eventLabel = t('Draft activity', 'Активность драфта');
      }

      const title = draftId
        ? `${eventLabel}: ${draftId.slice(0, 8)}`
        : eventLabel;

      return {
        id: `rt-${event.id}`,
        title,
        meta: t('live now', 'только что'),
      };
    };

    return realtimeEvents
      .slice(-5)
      .reverse()
      .map((event) => mapRealtimeEvent(event));
  }, [realtimeEvents, t]);

  const mergedActivity = useMemo(() => {
    const byId = new Set<string>();
    const result: Item[] = [];
    const combined = [...realtimeActivity, ...activity];

    for (const item of combined) {
      if (!byId.has(item.id)) {
        byId.add(item.id);
        result.push(item);
      }
      if (result.length >= 6) {
        break;
      }
    }

    return result;
  }, [activity, realtimeActivity]);

  const liveEventRate = useMemo(() => {
    const base = realtimeEvents.length + mergedActivity.length;
    return Math.max(12, base * 3);
  }, [mergedActivity.length, realtimeEvents.length]);

  const lastSyncLabel = useMemo(() => {
    if (lastSyncAt === null) {
      return null;
    }
    return formatSyncRelativeTime(lastSyncAt, t, syncNow);
  }, [lastSyncAt, syncNow, t]);

  useEffect(() => {
    if (!lastResyncAt) {
      return undefined;
    }

    const parsedLastResyncAt = Date.parse(lastResyncAt);
    const nextLastSyncAt = Number.isNaN(parsedLastResyncAt)
      ? Date.now()
      : parsedLastResyncAt;
    setLastSyncAt(nextLastSyncAt);
    setSyncNow(Date.now());

    if (!manualResyncPendingRef.current) {
      return undefined;
    }

    manualResyncPendingRef.current = false;
    setResyncToast(t('Resync completed', 'Ресинхронизация завершена'));
    return undefined;
  }, [lastResyncAt, t]);

  useEffect(() => {
    if (!resyncToast) {
      return undefined;
    }

    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = window.setTimeout(() => {
      setResyncToast(null);
      toastTimeoutRef.current = null;
    }, 3500);

    return () => {
      if (!toastTimeoutRef.current) {
        return;
      }
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    };
  }, [resyncToast]);

  useEffect(() => {
    if (!needsResync || isResyncing) {
      return;
    }
    manualResyncPendingRef.current = false;
  }, [isResyncing, needsResync]);

  useEffect(() => {
    if (lastSyncAt === null) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setSyncNow(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [lastSyncAt]);

  const handleManualResync = () => {
    manualResyncPendingRef.current = true;
    requestResync();
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [
          battleResponse,
          glowUpResponse,
          studioResponse,
          liveResponse,
          hotNowResponse,
          changesResponse,
        ] = await Promise.all([
          apiClient.get('/feeds/battles', { params: { limit: 5 } }),
          apiClient.get('/feeds/glowups', { params: { limit: 5 } }),
          apiClient.get('/feeds/studios', { params: { limit: 5 } }),
          apiClient.get('/feeds/live-drafts', { params: { limit: 200 } }),
          apiClient.get('/feeds/hot-now', { params: { limit: 10 } }),
          apiClient.get('/feeds/changes', { params: { limit: 8 } }),
        ]);

        const battleItems = asRows(battleResponse.data)
          .map((row, index) => {
            const id = asString(row.id) ?? `battle-${index}`;
            const score = asNumber(row.glowUpScore ?? row.glow_up_score);
            return {
              id,
              title: `Draft ${id.slice(0, 8)}`,
              meta: `GlowUp ${score.toFixed(1)}`,
            };
          })
          .slice(0, 4);

        const glowUpItems = asRows(glowUpResponse.data)
          .map((row, index) => {
            const id = asString(row.id) ?? `glow-${index}`;
            const score = asNumber(row.glowUpScore ?? row.glow_up_score);
            return {
              id,
              title: `Draft ${id.slice(0, 8)}`,
              meta: `GlowUp ${score.toFixed(1)}`,
            };
          })
          .slice(0, 4);

        const studioItems = asRows(studioResponse.data)
          .map((row, index) => {
            const id = asString(row.id) ?? `studio-${index}`;
            const studioName =
              asString(row.studioName) ?? asString(row.studio_name) ?? 'Studio';
            const impact = asNumber(row.impact);
            const signal = asNumber(row.signal);
            return {
              id,
              title: studioName,
              meta: `Impact ${impact.toFixed(1)} / Signal ${signal.toFixed(1)}`,
            };
          })
          .slice(0, 4);

        const activityItems = asRows(changesResponse.data)
          .map((row, index) => {
            const id = asString(row.id) ?? `activity-${index}`;
            const draftTitle =
              asString(row.draftTitle) ?? asString(row.draft_title) ?? 'Draft';
            const description = asString(row.description) ?? 'Update';
            const occurredAt =
              asString(row.occurredAt) ?? asString(row.occurred_at);
            return {
              id,
              title: `${draftTitle}: ${description}`,
              meta: formatRelativeTime(occurredAt),
            };
          })
          .slice(0, 5);

        const liveRows = asRows(liveResponse.data);
        const hotRows = asRows(hotNowResponse.data);

        const pendingTotal = hotRows.reduce(
          (sum, row) =>
            sum + asNumber(row.prPendingCount ?? row.pr_pending_count),
          0,
        );

        const hasApiData =
          battleItems.length > 0 ||
          glowUpItems.length > 0 ||
          studioItems.length > 0 ||
          activityItems.length > 0;

        if (!cancelled) {
          setBattles(battleItems.length > 0 ? battleItems : fallbackBattles);
          setGlowUps(glowUpItems.length > 0 ? glowUpItems : fallbackGlowUps);
          setStudios(studioItems.length > 0 ? studioItems : fallbackStudios);
          setActivity(
            activityItems.length > 0 ? activityItems : fallbackActivity,
          );
          setLiveDraftCount(liveRows.length);
          setPrPendingCount(pendingTotal);
          setFallbackUsed(!hasApiData);
        }
      } catch (_error) {
        if (!cancelled) {
          setFallbackUsed(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load().catch(() => undefined);
    const intervalId = window.setInterval(() => {
      load().catch(() => undefined);
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <aside className="observer-right-rail grid grid-cols-1 gap-3">
      <section className="card relative overflow-hidden p-3">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 right-0 h-24 w-24 rounded-full bg-secondary/10 blur-2xl"
        />
        <p className="inline-flex items-center gap-2 text-secondary text-xs uppercase tracking-wide">
          <span className="icon-breathe inline-flex h-2.5 w-2.5 rounded-full bg-secondary" />
          {t('Live + WebSocket connected', 'Live + WebSocket подключен')}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground/70 uppercase tracking-wide">
          <Wifi aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
          {t('Realtime shell', 'Realtime shell')}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="text-muted-foreground/70">
              {t('Live drafts', 'Live драфты')}
            </p>
            <p className="mt-1 font-semibold text-lg text-primary">
              {liveDraftCount}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="text-muted-foreground/70">
              {t('PR pending', 'PR pending')}
            </p>
            <p className="mt-1 font-semibold text-lg text-primary">
              {prPendingCount}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="text-muted-foreground/70">
              {t('Events/min', 'Событий/мин')}
            </p>
            <p className="mt-1 font-semibold text-lg text-primary">
              {liveEventRate}+
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="text-muted-foreground/70">
              {t('Latency', 'Задержка')}
            </p>
            <p className="mt-1 font-semibold text-lg text-secondary">~18ms</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground/70">
          {loading && <span>{t('Loading data...', 'Загрузка данных...')}</span>}
          {isResyncing && (
            <span>
              {t('Resyncing realtime stream...', 'Ресинхронизация потока...')}
            </span>
          )}
          {fallbackUsed && !loading && (
            <span>{t('Fallback data', 'Fallback данные')}</span>
          )}
          {lastSyncLabel && !isResyncing && (
            <span>
              {t('Last sync', 'Последняя синхронизация')}: {lastSyncLabel}
            </span>
          )}
        </div>
        {needsResync && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2">
            <span className="text-[11px] text-primary">
              {t('Resync required', 'Требуется ресинхронизация')}
            </span>
            <button
              aria-label={t('Resync now', 'Ресинхронизировать')}
              className="rounded-full border border-primary/45 px-2 py-1 font-semibold text-[10px] text-primary uppercase tracking-wide"
              disabled={isResyncing}
              onClick={handleManualResync}
              type="button"
            >
              {isResyncing
                ? t('Resyncing...', 'Ресинхронизация...')
                : t('Resync now', 'Ресинхронизировать')}
            </button>
          </div>
        )}
        {resyncToast && (
          <div
            aria-live="polite"
            className="mt-2 rounded-lg border border-secondary/40 bg-secondary/10 p-2 text-[11px] text-secondary"
          >
            {resyncToast}
          </div>
        )}
      </section>
      <section className="card p-3 lg:hidden">
        <PanelHeader icon={Flame} title={t('Pulse radar', 'Pulse радар')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="font-semibold text-foreground text-xs">
              {t('Trending battles', 'Трендовые баттлы')}
            </p>
            <ul className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
              {battles.slice(0, 2).map((item) => (
                <li className="line-clamp-1" key={`mobile-battle-${item.id}`}>
                  {item.title}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="font-semibold text-foreground text-xs">
              {t('Top GlowUps (24h)', 'Топ GlowUp (24ч)')}
            </p>
            <ul className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
              {glowUps.slice(0, 2).map((item) => (
                <li className="line-clamp-1" key={`mobile-glow-${item.id}`}>
                  {item.title}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-border bg-muted/70 p-2">
          <p className="font-semibold text-foreground text-xs">
            {t('Live activity stream', 'Поток live-активности')}
          </p>
          <ul className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
            {mergedActivity.slice(0, 3).map((item) => (
              <li className="line-clamp-1" key={`mobile-activity-${item.id}`}>
                {item.title}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <BattleList
        className="hidden lg:block"
        hotLabel={t('Hot', 'Горячее')}
        items={battles}
        liveLabel={t('Live', 'Live')}
        title={t('Trending battles', 'Трендовые баттлы')}
      />
      <ItemList
        className="hidden lg:block"
        icon={Flame}
        items={glowUps}
        title={t('Top GlowUps (24h)', 'Топ GlowUp (24ч)')}
      />
      <ItemList
        className="hidden lg:block"
        icon={Trophy}
        items={studios}
        title={t('Top studios (Impact/Signal)', 'Топ студий (Impact/Signal)')}
      />
      <ActivityTicker
        className="hidden lg:block"
        items={mergedActivity}
        title={t('Live activity stream', 'Поток live-активности')}
      />
    </aside>
  );
};
