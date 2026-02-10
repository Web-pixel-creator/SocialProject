'use client';

import { Flame, Wifi } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useLanguage } from '../contexts/LanguageContext';
import { type RealtimeEvent, useRealtimeRoom } from '../hooks/useRealtimeRoom';
import { apiClient } from '../lib/api';
import {
  ActivityTicker,
  asNumber,
  asRows,
  asString,
  BattleList,
  fallbackActivity,
  fallbackBattles,
  fallbackGlowUps,
  fallbackStudios,
  formatRelativeTime,
  formatSyncRelativeTime,
  ItemList,
  PanelHeader,
  type RailItem,
} from './RailPanels';

interface ObserverRailData {
  liveDraftCount: number;
  prPendingCount: number;
  battles: RailItem[];
  glowUps: RailItem[];
  studios: RailItem[];
  activity: RailItem[];
  fallbackUsed: boolean;
}

const fallbackRailData: ObserverRailData = {
  liveDraftCount: 128,
  prPendingCount: 57,
  battles: fallbackBattles,
  glowUps: fallbackGlowUps,
  studios: fallbackStudios,
  activity: fallbackActivity,
  fallbackUsed: true,
};

const fetchObserverRailData = async (): Promise<ObserverRailData> => {
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
      (sum, row) => sum + asNumber(row.prPendingCount ?? row.pr_pending_count),
      0,
    );

    const hasApiData =
      battleItems.length > 0 ||
      glowUpItems.length > 0 ||
      studioItems.length > 0 ||
      activityItems.length > 0;

    return {
      battles: battleItems.length > 0 ? battleItems : fallbackBattles,
      glowUps: glowUpItems.length > 0 ? glowUpItems : fallbackGlowUps,
      studios: studioItems.length > 0 ? studioItems : fallbackStudios,
      activity: activityItems.length > 0 ? activityItems : fallbackActivity,
      liveDraftCount: liveRows.length,
      prPendingCount: pendingTotal,
      fallbackUsed: !hasApiData,
    };
  } catch {
    return fallbackRailData;
  }
};

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
  const [resyncToast, setResyncToast] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncNow, setSyncNow] = useState(() => Date.now());
  const manualResyncPendingRef = useRef(false);
  const toastTimeoutRef = useRef<number | null>(null);

  const { data, isLoading, isValidating } = useSWR<ObserverRailData>(
    'observer-right-rail-data',
    fetchObserverRailData,
    {
      fallbackData: fallbackRailData,
      refreshInterval: 30_000,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const loading = isLoading || isValidating;
  const fallbackUsed = data?.fallbackUsed ?? true;
  const liveDraftCount =
    data?.liveDraftCount ?? fallbackRailData.liveDraftCount;
  const prPendingCount =
    data?.prPendingCount ?? fallbackRailData.prPendingCount;
  const battles = data?.battles ?? fallbackRailData.battles;
  const glowUps = data?.glowUps ?? fallbackRailData.glowUps;
  const studios = data?.studios ?? fallbackRailData.studios;
  const activity = data?.activity ?? fallbackRailData.activity;

  const realtimeActivity = useMemo(() => {
    const mapRealtimeEvent = (event: RealtimeEvent): RailItem => {
      const draftId = asString(event.payload.draftId);
      let eventLabel = event.type;
      if (event.type === 'draft_created') {
        eventLabel = t('rail.draftCreated');
      } else if (event.type === 'draft_activity') {
        eventLabel = t('rail.draftActivity');
      }

      const title = draftId
        ? `${eventLabel}: ${draftId.slice(0, 8)}`
        : eventLabel;

      return {
        id: `rt-${event.id}`,
        title,
        meta: t('common.liveNowLower'),
      };
    };

    return realtimeEvents
      .slice(-5)
      .reverse()
      .map((event) => mapRealtimeEvent(event));
  }, [realtimeEvents, t]);

  const mergedActivity = useMemo(() => {
    const byId = new Set<string>();
    const result: RailItem[] = [];
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
    setResyncToast(t('rail.resyncCompleted'));
    return undefined;
  }, [lastResyncAt, t]);

  useEffect(() => {
    if (!resyncToast) {
      return undefined;
    }

    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = window.setTimeout(() => {
      setResyncToast(null);
      toastTimeoutRef.current = null;
    }, 3500);

    return () => {
      if (toastTimeoutRef.current === null) {
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

  return (
    <aside className="observer-right-rail grid grid-cols-1 gap-3">
      <section className="card relative overflow-hidden p-3">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 right-0 h-24 w-24 rounded-full bg-secondary/10 blur-2xl"
        />
        <p className="inline-flex items-center gap-2 text-secondary text-xs uppercase tracking-wide">
          <span className="icon-breathe inline-flex h-2.5 w-2.5 rounded-full bg-secondary" />
          {t('rail.liveWsConnected')}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground/70 uppercase tracking-wide">
          <Wifi aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
          {t('rail.realtimeShell')}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="text-muted-foreground/70">{t('rail.liveDrafts')}</p>
            <p className="mt-1 font-semibold text-lg text-primary">
              {liveDraftCount}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="text-muted-foreground/70">{t('rail.prPending')}</p>
            <p className="mt-1 font-semibold text-lg text-primary">
              {prPendingCount}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="text-muted-foreground/70">{t('rail.eventsMin')}</p>
            <p className="mt-1 font-semibold text-lg text-primary">
              {liveEventRate}+
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="text-muted-foreground/70">{t('rail.latency')}</p>
            <p className="mt-1 font-semibold text-lg text-secondary">~18ms</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground/70">
          {loading && <span>{t('rail.loadingData')}</span>}
          {isResyncing && <span>{t('rail.resyncingStream')}</span>}
          {fallbackUsed && !loading && <span>{t('rail.fallbackData')}</span>}
          {lastSyncLabel && !isResyncing && (
            <span>
              {t('rail.lastSync')}: {lastSyncLabel}
            </span>
          )}
        </div>
        {needsResync && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2">
            <span className="text-[11px] text-primary">
              {t('rail.resyncRequired')}
            </span>
            <button
              aria-label={t('rail.resyncNow')}
              className="rounded-full border border-primary/45 px-2 py-1 font-semibold text-[10px] text-primary uppercase tracking-wide"
              disabled={isResyncing}
              onClick={handleManualResync}
              type="button"
            >
              {isResyncing ? t('rail.resyncing') : t('rail.resyncNow')}
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
        <PanelHeader icon={Flame} title={t('rail.pulseRadar')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/70 p-2">
            <p className="font-semibold text-foreground text-xs">
              {t('rail.trendingBattles')}
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
              {t('rail.topGlowUps24h')}
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
            {t('rail.liveActivityStream')}
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
        hotLabel={t('rail.hot')}
        items={battles}
        liveLabel={t('common.live')}
        title={t('rail.trendingBattles')}
      />
      <ItemList
        className="hidden lg:block"
        icon={Flame}
        items={glowUps}
        title={t('rail.topGlowUps24h')}
      />
      <ItemList
        className="hidden lg:block"
        icon={Flame}
        items={studios}
        title={t('rail.topStudios')}
      />
      <ActivityTicker
        className="hidden lg:block"
        items={mergedActivity}
        title={t('rail.liveActivityStream')}
      />
    </aside>
  );
};
