'use client';

import { Flame } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useLanguage } from '../contexts/LanguageContext';
import { type RealtimeEvent, useRealtimeRoom } from '../hooks/useRealtimeRoom';
import { apiClient } from '../lib/api';
import { useLastSuccessfulValue } from '../lib/useLastSuccessfulValue';
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
  allFeedsFailed: boolean;
  fallbackUsed: boolean;
}

type RailPanelKey = 'battles' | 'activity' | 'glowUps' | 'studios';
type RailPanelVisibility = Record<RailPanelKey, boolean>;
type RailPanelVisibilityUpdater =
  | RailPanelVisibility
  | ((previous: RailPanelVisibility) => RailPanelVisibility);

const PANEL_VISIBILITY_STORAGE_KEY = 'finishit-observer-rail-panels';
const PANEL_KEYS: RailPanelKey[] = [
  'battles',
  'activity',
  'glowUps',
  'studios',
];

const DEFAULT_PANEL_VISIBILITY: RailPanelVisibility = {
  battles: true,
  activity: true,
  // Keep secondary widgets collapsed by default to reduce first-load noise.
  glowUps: false,
  studios: false,
};

const ALL_PANEL_VISIBILITY: RailPanelVisibility = {
  battles: true,
  activity: true,
  glowUps: true,
  studios: true,
};

const HIDDEN_PANEL_VISIBILITY: RailPanelVisibility = {
  battles: false,
  activity: false,
  glowUps: false,
  studios: false,
};

const parsePanelVisibility = (
  value: string | null,
): RailPanelVisibility | null => {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<RailPanelVisibility>;
    if (
      typeof parsed.battles !== 'boolean' ||
      typeof parsed.activity !== 'boolean' ||
      typeof parsed.glowUps !== 'boolean' ||
      typeof parsed.studios !== 'boolean'
    ) {
      return null;
    }
    return {
      battles: parsed.battles,
      activity: parsed.activity,
      glowUps: parsed.glowUps,
      studios: parsed.studios,
    };
  } catch {
    return null;
  }
};

const fallbackRailData: ObserverRailData = {
  liveDraftCount: 128,
  prPendingCount: 57,
  battles: fallbackBattles,
  glowUps: fallbackGlowUps,
  studios: fallbackStudios,
  activity: fallbackActivity,
  allFeedsFailed: false,
  fallbackUsed: true,
};

const fetchObserverRailData = async (): Promise<ObserverRailData> => {
  try {
    const [
      battleResult,
      glowUpResult,
      studioResult,
      liveResult,
      hotNowResult,
      changesResult,
    ] = await Promise.allSettled([
      apiClient.get('/feeds/battles', { params: { limit: 5 } }),
      apiClient.get('/feeds/glowups', { params: { limit: 5 } }),
      apiClient.get('/feeds/studios', { params: { limit: 5 } }),
      apiClient.get('/feeds/live-drafts', { params: { limit: 200 } }),
      apiClient.get('/feeds/hot-now', { params: { limit: 10 } }),
      apiClient.get('/feeds/changes', { params: { limit: 8 } }),
    ]);

    const rowsFromResult = (
      result: PromiseSettledResult<{ data: unknown }>,
    ): Record<string, unknown>[] =>
      result.status === 'fulfilled' ? asRows(result.value.data) : [];

    const battleRows = rowsFromResult(battleResult);
    const glowUpRows = rowsFromResult(glowUpResult);
    const studioRows = rowsFromResult(studioResult);
    const liveRows = rowsFromResult(liveResult);
    const hotRows = rowsFromResult(hotNowResult);
    const activityRows = rowsFromResult(changesResult);

    const battleItems = battleRows
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

    const glowUpItems = glowUpRows
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

    const studioItems = studioRows
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

    const activityItems = activityRows
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

    const pendingTotal = hotRows.reduce(
      (sum, row) => sum + asNumber(row.prPendingCount ?? row.pr_pending_count),
      0,
    );
    const battleFallback = battleItems.length === 0;
    const glowUpFallback = glowUpItems.length === 0;
    const studioFallback = studioItems.length === 0;
    const activityFallback = activityItems.length === 0;
    const countFallback =
      liveResult.status === 'rejected' || hotNowResult.status === 'rejected';
    const allFeedsFailed = [
      battleResult,
      glowUpResult,
      studioResult,
      liveResult,
      hotNowResult,
      changesResult,
    ].every((result) => result.status === 'rejected');

    return {
      battles: battleFallback ? fallbackBattles : battleItems,
      glowUps: glowUpFallback ? fallbackGlowUps : glowUpItems,
      studios: studioFallback ? fallbackStudios : studioItems,
      activity: activityFallback ? fallbackActivity : activityItems,
      liveDraftCount:
        liveResult.status === 'fulfilled'
          ? liveRows.length
          : fallbackRailData.liveDraftCount,
      prPendingCount:
        hotNowResult.status === 'fulfilled'
          ? pendingTotal
          : fallbackRailData.prPendingCount,
      allFeedsFailed,
      fallbackUsed:
        battleFallback ||
        glowUpFallback ||
        studioFallback ||
        activityFallback ||
        countFallback,
    };
  } catch {
    return {
      ...fallbackRailData,
      allFeedsFailed: true,
    };
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
  const [panelVisibility, setPanelVisibility] = useState<RailPanelVisibility>(
    DEFAULT_PANEL_VISIBILITY,
  );
  const manualResyncPendingRef = useRef(false);
  const toastTimeoutRef = useRef<number | null>(null);
  const processedResyncAtRef = useRef<string | null>(null);

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

  const stableData = useLastSuccessfulValue<ObserverRailData>(
    data,
    Boolean(data && !data.allFeedsFailed),
    fallbackRailData,
  );
  const loading = isLoading || isValidating;
  const fallbackUsed =
    data?.allFeedsFailed === true ? true : stableData.fallbackUsed;
  const liveDraftCount = stableData.liveDraftCount;
  const prPendingCount = stableData.prPendingCount;
  const battles = stableData.battles;
  const glowUps = stableData.glowUps;
  const studios = stableData.studios;
  const activity = stableData.activity;

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

  const visiblePanelCount = useMemo(
    () => PANEL_KEYS.filter((key) => panelVisibility[key]).length,
    [panelVisibility],
  );
  const allPanelsHidden = visiblePanelCount === 0;
  const allPanelsVisible = visiblePanelCount === PANEL_KEYS.length;

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
    if (processedResyncAtRef.current === lastResyncAt) {
      return undefined;
    }
    processedResyncAtRef.current = lastResyncAt;

    const parsedLastResyncAt = Date.parse(lastResyncAt);
    const nextLastSyncAt = Number.isNaN(parsedLastResyncAt)
      ? Date.now()
      : parsedLastResyncAt;
    setLastSyncAt((previous) =>
      previous === nextLastSyncAt ? previous : nextLastSyncAt,
    );
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

  useEffect(() => {
    try {
      const storedVisibility = parsePanelVisibility(
        window.localStorage.getItem(PANEL_VISIBILITY_STORAGE_KEY),
      );
      if (storedVisibility) {
        setPanelVisibility(storedVisibility);
      }
    } catch {
      // ignore localStorage read errors
    }
  }, []);

  const persistPanelVisibility = useCallback((next: RailPanelVisibility) => {
    try {
      window.localStorage.setItem(
        PANEL_VISIBILITY_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch {
      // ignore localStorage write errors
    }
  }, []);

  const applyPanelVisibility = useCallback(
    (nextOrUpdater: RailPanelVisibilityUpdater) => {
      setPanelVisibility((previous) => {
        const next =
          typeof nextOrUpdater === 'function'
            ? nextOrUpdater(previous)
            : nextOrUpdater;
        persistPanelVisibility(next);
        return next;
      });
    },
    [persistPanelVisibility],
  );

  const handleManualResync = useCallback(() => {
    manualResyncPendingRef.current = true;
    requestResync();
  }, [requestResync]);

  const metricTileClass =
    'rounded-lg border border-border/25 bg-background/42 p-2 sm:p-2.5';
  const statusChipClass =
    'rounded-full border border-border/25 bg-background/60 px-2 py-0.5 sm:px-2.5 sm:py-1';
  const controlButtonBaseClass =
    'min-h-8 rounded-full border px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:px-3.5 sm:py-2 sm:text-xs';
  const controlButtonEnabledClass =
    'border-transparent bg-background/58 text-muted-foreground hover:bg-background/74 hover:text-foreground';
  const controlButtonDisabledClass =
    'cursor-not-allowed border-transparent bg-background/45 text-muted-foreground/45';
  const primaryActionButtonClass =
    'min-h-8 rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 font-semibold text-primary uppercase tracking-wide transition hover:border-primary/45 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:px-3.5 sm:py-2';
  const softPanelClass = 'rounded-lg border border-border/25 bg-background/42';

  return (
    <aside className="observer-right-rail grid grid-cols-1 gap-4 sm:gap-4">
      <section className="card relative overflow-hidden p-4 sm:p-4">
        <p className="live-signal inline-flex items-center gap-2 font-semibold text-xs uppercase tracking-wide">
          <span className="icon-breathe live-dot inline-flex h-2.5 w-2.5 rounded-full motion-reduce:animate-none" />
          {t('rail.liveWsConnected')}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs sm:mt-3 sm:gap-2">
          <div className={metricTileClass}>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
              {t('rail.liveDrafts')}
            </p>
            <p className="mt-1 font-semibold text-lg text-primary">
              {liveDraftCount}
            </p>
          </div>
          <div className={metricTileClass}>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
              {t('rail.prPending')}
            </p>
            <p className="mt-1 font-semibold text-lg text-primary">
              {prPendingCount}
            </p>
          </div>
          <div className={metricTileClass}>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
              {t('rail.eventsMin')}
            </p>
            <p className="mt-1 font-semibold text-lg text-primary">
              {liveEventRate}+
            </p>
          </div>
          <div className={metricTileClass}>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
              {t('rail.latency')}
            </p>
            <p className="mt-1 font-semibold text-foreground text-lg">
              {t('rail.latencyValue')}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/70 sm:mt-3 sm:gap-2">
          {loading && (
            <span className={statusChipClass}>{t('rail.loadingData')}</span>
          )}
          {isResyncing && (
            <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
              {t('rail.resyncingStream')}
            </span>
          )}
          {fallbackUsed && !loading && (
            <span className={statusChipClass}>{t('rail.fallbackData')}</span>
          )}
          {lastSyncLabel && !isResyncing && (
            <span className={statusChipClass}>
              {t('rail.lastSync')}: {lastSyncLabel}
            </span>
          )}
        </div>
        {needsResync && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/10 p-1.5 sm:p-2">
            <span className="text-[11px] text-primary">
              {t('rail.resyncRequired')}
            </span>
            <button
              aria-label={t('rail.resyncNow')}
              className={`${primaryActionButtonClass} px-2 text-[10px]`}
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
            className="mt-2 rounded-lg border border-border/25 bg-accent/60 p-1.5 text-[11px] text-foreground sm:p-2"
          >
            {resyncToast}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span
            className={`${statusChipClass} font-semibold text-muted-foreground`}
          >
            {t('rail.panelsVisible')}: {visiblePanelCount}/{PANEL_KEYS.length}
          </span>
          {allPanelsHidden ? (
            <button
              className={primaryActionButtonClass}
              onClick={() => applyPanelVisibility(DEFAULT_PANEL_VISIBILITY)}
              type="button"
            >
              {t('rail.restoreDefaultPanels')}
            </button>
          ) : null}
        </div>
        <div
          className="mt-2 hidden gap-2 pt-2 lg:grid"
          data-testid="observer-rail-desktop-controls"
        >
          <div className="flex flex-wrap gap-1">
            <button
              className={`${controlButtonBaseClass} ${
                allPanelsVisible
                  ? controlButtonDisabledClass
                  : controlButtonEnabledClass
              }`}
              disabled={allPanelsVisible}
              onClick={() => applyPanelVisibility(ALL_PANEL_VISIBILITY)}
              type="button"
            >
              {t('rail.showAll')}
            </button>
            <button
              className={`${controlButtonBaseClass} ${
                allPanelsHidden
                  ? controlButtonDisabledClass
                  : controlButtonEnabledClass
              }`}
              disabled={allPanelsHidden}
              onClick={() => applyPanelVisibility(HIDDEN_PANEL_VISIBILITY)}
              type="button"
            >
              {t('rail.hideAll')}
            </button>
          </div>
        </div>
      </section>
      <section className="card p-4 sm:p-4 lg:hidden">
        <PanelHeader icon={Flame} title={t('rail.pulseRadar')} />
        <div
          className="mt-2 grid gap-2"
          data-testid="observer-rail-mobile-controls"
        >
          <div className="flex flex-wrap gap-1">
            <button
              className={`${controlButtonBaseClass} ${
                allPanelsVisible
                  ? controlButtonDisabledClass
                  : controlButtonEnabledClass
              }`}
              disabled={allPanelsVisible}
              onClick={() => applyPanelVisibility(ALL_PANEL_VISIBILITY)}
              type="button"
            >
              {t('rail.showAll')}
            </button>
            <button
              className={`${controlButtonBaseClass} ${
                allPanelsHidden
                  ? controlButtonDisabledClass
                  : controlButtonEnabledClass
              }`}
              disabled={allPanelsHidden}
              onClick={() => applyPanelVisibility(HIDDEN_PANEL_VISIBILITY)}
              type="button"
            >
              {t('rail.hideAll')}
            </button>
          </div>
        </div>
        {allPanelsHidden ? (
          <div
            className={`mt-3 p-2 text-[11px] text-muted-foreground ${softPanelClass}`}
          >
            <p>{t('rail.noPanelsSelected')}</p>
            <div className="mt-2 flex justify-end">
              <button
                className={primaryActionButtonClass}
                onClick={() => applyPanelVisibility(DEFAULT_PANEL_VISIBILITY)}
                type="button"
              >
                {t('rail.restoreDefaultPanels')}
              </button>
            </div>
          </div>
        ) : null}
        <div className="grid gap-2.5 sm:grid-cols-2">
          {panelVisibility.battles ? (
            <div className={`${softPanelClass} p-2 sm:p-2.5`}>
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
          ) : null}
          {panelVisibility.glowUps ? (
            <div className={`${softPanelClass} p-2 sm:p-2.5`}>
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
          ) : null}
          {panelVisibility.studios ? (
            <div className={`${softPanelClass} p-2 sm:p-2.5`}>
              <p className="font-semibold text-foreground text-xs">
                {t('rail.topStudios')}
              </p>
              <ul className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
                {studios.slice(0, 2).map((item) => (
                  <li className="line-clamp-1" key={`mobile-studio-${item.id}`}>
                    {item.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {panelVisibility.activity ? (
          <div className={`mt-3 p-2 sm:p-2.5 ${softPanelClass}`}>
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
        ) : null}
      </section>
      <BattleList
        className={panelVisibility.battles ? 'hidden lg:block' : 'hidden'}
        hotLabel={t('rail.hot')}
        items={battles}
        liveLabel={t('common.live')}
        title={t('rail.trendingBattles')}
      />
      <ActivityTicker
        className={panelVisibility.activity ? 'hidden lg:block' : 'hidden'}
        items={mergedActivity}
        title={t('rail.liveActivityStream')}
      />
      <ItemList
        className={panelVisibility.glowUps ? 'hidden lg:block' : 'hidden'}
        icon={Flame}
        items={glowUps}
        title={t('rail.topGlowUps24h')}
      />
      <ItemList
        className={panelVisibility.studios ? 'hidden lg:block' : 'hidden'}
        icon={Flame}
        items={studios}
        title={t('rail.topStudios')}
      />
      {allPanelsHidden ? (
        <section className="card hidden p-4 text-[11px] text-muted-foreground sm:p-4 lg:block">
          <p>{t('rail.noPanelsSelected')}</p>
          <div className="mt-2">
            <button
              className={primaryActionButtonClass}
              onClick={() => applyPanelVisibility(DEFAULT_PANEL_VISIBILITY)}
              type="button"
            >
              {t('rail.restoreDefaultPanels')}
            </button>
          </div>
        </section>
      ) : null}
    </aside>
  );
};
