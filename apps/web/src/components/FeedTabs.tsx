'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { apiClient } from '../lib/api';
import {
  fallbackItemsFor,
  mapDraftItems,
  endpointForTab as mapEndpointForTab,
  mapItemsForTab,
} from '../lib/feedMappers';
import type {
  BattleFilter,
  FeedIntent,
  FeedItem,
  FeedRange,
  FeedSort,
  FeedStatus,
} from '../lib/feedTypes';
import { AutopsyCard } from './AutopsyCard';
import { BattleCard } from './BattleCard';
import { BeforeAfterCard } from './BeforeAfterCard';
import { ChangeCard } from './ChangeCard';
import { DraftCard } from './DraftCard';
import { GuildCard } from './GuildCard';
import { StudioCard } from './StudioCard';

const TABS = [
  'All',
  'Progress',
  'Changes',
  'For You',
  'Hot Now',
  'Live Drafts',
  'GlowUps',
  'Guilds',
  'Studios',
  'Battles',
  'Archive',
];
const PAGE_SIZE = 6;
const DEFAULT_SORT = 'recent';
const DEFAULT_STATUS = 'all';
const DEFAULT_RANGE = '30d';
const DEFAULT_INTENT = 'all';

const SORT_OPTIONS: Array<{ value: FeedSort; label: string }> = [
  { value: 'recent', label: 'Recent' },
  { value: 'impact', label: 'Impact' },
  { value: 'glowup', label: 'GlowUp' },
];

const STATUS_OPTIONS: Array<{ value: FeedStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'release', label: 'Releases' },
  { value: 'pr', label: 'Pending PRs' },
];

const RANGE_OPTIONS: Array<{ value: FeedRange; label: string; days?: number }> =
  [
    { value: '7d', label: 'Last 7 days', days: 7 },
    { value: '30d', label: 'Last 30 days', days: 30 },
    { value: '90d', label: 'Last 90 days', days: 90 },
    { value: 'all', label: 'All time' },
  ];

const INTENT_OPTIONS: Array<{ value: FeedIntent; label: string }> = [
  { value: 'all', label: 'All intents' },
  { value: 'needs_help', label: 'Needs help' },
  { value: 'seeking_pr', label: 'Seeking PR' },
  { value: 'ready_for_review', label: 'Ready for review' },
];

const QUICK_SCOPE_TABS: Array<{ id: string; label: string; tab: string }> = [
  { id: 'live', label: 'Live', tab: 'Live Drafts' },
  { id: 'top24', label: 'Top 24h', tab: 'Hot Now' },
  { id: 'glowup', label: 'GlowUp', tab: 'GlowUps' },
  { id: 'battle-radar', label: 'Battle radar', tab: 'Battles' },
  { id: 'following', label: 'Following', tab: 'For You' },
];

const BATTLE_FILTER_OPTIONS: Array<{ value: BattleFilter; label: string }> = [
  { value: 'all', label: 'All battles' },
  { value: 'pending', label: 'Pending' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'merged', label: 'Merged' },
];

const sendTelemetry = async (payload: Record<string, unknown>) => {
  try {
    await apiClient.post('/telemetry/ux', payload);
  } catch (_error) {
    // ignore telemetry failures
  }
};

export const endpointForTab = (tab: string) => mapEndpointForTab(tab);

export const FeedTabs = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();

  const readParam = (key: string, fallback: string) =>
    searchParams.get(key) ?? fallback;
  const initialTab = TABS.includes(readParam('tab', TABS[0]))
    ? readParam('tab', TABS[0])
    : TABS[0];
  const initialSort = readParam('sort', DEFAULT_SORT) as FeedSort;
  const initialStatus = readParam('status', DEFAULT_STATUS) as FeedStatus;
  const initialRange = readParam('range', DEFAULT_RANGE) as FeedRange;
  const initialIntent = readParam('intent', DEFAULT_INTENT) as FeedIntent;

  const [active, setActive] = useState(initialTab);
  const [sort, setSort] = useState<FeedSort>(initialSort);
  const [status, setStatus] = useState<FeedStatus>(initialStatus);
  const [range, setRange] = useState<FeedRange>(initialRange);
  const [intent, setIntent] = useState<FeedIntent>(initialIntent);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [battleFilter, setBattleFilter] = useState<BattleFilter>('all');
  const filterKey = `${active}|${sort}|${status}|${range}|${intent}`;
  const storyTabs = new Set([
    'All',
    'Progress',
    'Changes',
    'For You',
    'Hot Now',
    'Live Drafts',
    'GlowUps',
    'Battles',
  ]);
  const feedGridClass = storyTabs.has(active)
    ? 'grid gap-4'
    : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3';
  const visibleItems = useMemo(() => {
    if (active !== 'Battles' || battleFilter === 'all') {
      return items;
    }

    return items.filter(
      (item) => item.kind !== 'battle' || item.decision === battleFilter,
    );
  }, [active, battleFilter, items]);

  const tabLabel = (tab: string): string => {
    if (tab === 'All') {
      return t('feed.all');
    }
    if (tab === 'Progress') {
      return t('feedTabs.tab.progress');
    }
    if (tab === 'Changes') {
      return t('feedTabs.tab.changes');
    }
    if (tab === 'For You') {
      return t('feedTabs.tab.forYou');
    }
    if (tab === 'Hot Now') {
      return t('feedTabs.tab.hotNow');
    }
    if (tab === 'Live Drafts') {
      return t('feedTabs.tab.liveDrafts');
    }
    if (tab === 'GlowUps') {
      return t('feedTabs.tab.glowUps');
    }
    if (tab === 'Guilds') {
      return t('feedTabs.tab.guilds');
    }
    if (tab === 'Studios') {
      return t('feedTabs.tab.studios');
    }
    if (tab === 'Battles') {
      return t('feedTabs.tab.battles');
    }
    if (tab === 'Archive') {
      return t('feedTabs.tab.archive');
    }
    return tab;
  };

  const sortLabel = (value: FeedSort): string => {
    if (value === 'impact') {
      return t('search.sort.impact');
    }
    if (value === 'glowup') {
      return t('changeCard.metrics.glowUp');
    }
    return t('search.sort.recency');
  };

  const statusLabel = (value: FeedStatus): string => {
    if (value === 'draft') {
      return t('feedTabs.status.drafts');
    }
    if (value === 'release') {
      return t('feedTabs.status.releases');
    }
    if (value === 'pr') {
      return t('feed.pendingPRs');
    }
    return t('fixRequestList.filters.all');
  };

  const rangeLabel = (value: FeedRange): string => {
    if (value === '7d') {
      return t('search.range.last7Days');
    }
    if (value === '30d') {
      return t('search.range.last30Days');
    }
    if (value === '90d') {
      return t('feedTabs.range.last90Days');
    }
    return t('search.range.allTime');
  };

  const intentLabel = (value: FeedIntent): string => {
    if (value === 'needs_help') {
      return t('feed.needsHelp');
    }
    if (value === 'seeking_pr') {
      return t('search.filters.seekingPr');
    }
    if (value === 'ready_for_review') {
      return t('feed.readyForReview');
    }
    return t('search.filters.allIntents');
  };

  const quickScopeLabel = (id: string): string => {
    if (id === 'live') {
      return t('common.live');
    }
    if (id === 'top24') {
      return t('feedTabs.quickScope.top24h');
    }
    if (id === 'glowup') {
      return t('changeCard.metrics.glowUp');
    }
    if (id === 'battle-radar') {
      return t('feedTabs.quickScope.battleRadar');
    }
    if (id === 'following') {
      return t('feedTabs.quickScope.following');
    }
    return id;
  };

  const battleFilterLabel = (value: BattleFilter): string => {
    if (value === 'pending') {
      return t('battle.pending');
    }
    if (value === 'changes_requested') {
      return t('battle.changesRequested');
    }
    if (value === 'merged') {
      return t('battle.merged');
    }
    return t('feedTabs.battleFilter.allBattles');
  };

  useEffect(() => {
    const params = new URLSearchParams(searchParamString);
    const nextTab = TABS.includes(params.get('tab') ?? TABS[0])
      ? (params.get('tab') ?? TABS[0])
      : TABS[0];
    const nextSort = (params.get('sort') ?? DEFAULT_SORT) as FeedSort;
    const nextStatus = (params.get('status') ?? DEFAULT_STATUS) as FeedStatus;
    const nextRange = (params.get('range') ?? DEFAULT_RANGE) as FeedRange;
    const nextIntent = (params.get('intent') ?? DEFAULT_INTENT) as FeedIntent;
    setActive(nextTab);
    setSort(nextSort);
    setStatus(nextStatus);
    setRange(nextRange);
    setIntent(nextIntent);
  }, [searchParamString]);

  const updateQuery = (
    updates: Partial<{
      tab: string;
      sort: FeedSort;
      status: FeedStatus;
      range: FeedRange;
      intent: FeedIntent;
    }>,
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    const next = {
      tab: updates.tab ?? active,
      sort: updates.sort ?? sort,
      status: updates.status ?? status,
      range: updates.range ?? range,
      intent: updates.intent ?? intent,
    };

    if (next.tab !== TABS[0]) {
      params.set('tab', next.tab);
    } else {
      params.delete('tab');
    }

    if (next.sort !== DEFAULT_SORT) {
      params.set('sort', next.sort);
    } else {
      params.delete('sort');
    }

    if (next.status !== DEFAULT_STATUS) {
      params.set('status', next.status);
    } else {
      params.delete('status');
    }

    if (next.range !== DEFAULT_RANGE) {
      params.set('range', next.range);
    } else {
      params.delete('range');
    }

    if (next.intent !== DEFAULT_INTENT) {
      params.set('intent', next.intent);
    } else {
      params.delete('intent');
    }

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  useEffect(() => {
    if (!filterKey) {
      return;
    }
    setItems([]);
    setOffset(0);
    setHasMore(true);
    setFallbackUsed(false);
  }, [filterKey]);

  useEffect(() => {
    if (active === 'Battles') {
      return;
    }
    if (battleFilter !== 'all') {
      setBattleFilter('all');
    }
  }, [active, battleFilter]);

  const rangeFrom = useMemo(() => {
    const match = RANGE_OPTIONS.find((option) => option.value === range);
    if (!match?.days) {
      return undefined;
    }
    const fromDate = new Date(Date.now() - match.days * 24 * 60 * 60 * 1000);
    return fromDate.toISOString();
  }, [range]);

  useEffect(() => {
    const onScroll = () => {
      if (loading || !hasMore || fallbackUsed) {
        return;
      }
      if (
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight - 200
      ) {
        setOffset((prev) => prev + PAGE_SIZE);
      }
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [loading, hasMore, fallbackUsed]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (fallbackUsed) {
        return;
      }
      setLoading(true);
      const startedAt = performance.now();
      const endpoint = endpointForTab(active);
      const params: Record<string, unknown> = { limit: PAGE_SIZE, offset };
      if (active === 'All') {
        params.sort = sort;
        if (status !== 'all') {
          params.status = status;
        }
        if (intent !== 'all') {
          params.intent = intent;
        }
        if (rangeFrom) {
          params.from = rangeFrom;
        }
      }

      try {
        const response = await apiClient.get(endpoint, { params });
        const nextItems = mapItemsForTab(active, response.data);
        if (!cancelled) {
          setItems((prev) =>
            offset === 0 ? nextItems : [...prev, ...nextItems],
          );
          setHasMore(nextItems.length >= PAGE_SIZE);
          if (active === 'All' && offset === 0) {
            const timingMs = Math.round(performance.now() - startedAt);
            sendTelemetry({
              eventType: 'feed_load_timing',
              sort,
              status: status === 'all' ? undefined : status,
              intent: intent === 'all' ? undefined : intent,
              range,
              timingMs,
            });
          }
        }
      } catch (_error) {
        if (active === 'For You') {
          try {
            const response = await apiClient.get('/feeds/glowups', { params });
            const nextItems = mapDraftItems(response.data, false);
            if (!cancelled) {
              setItems((prev) =>
                offset === 0 ? nextItems : [...prev, ...nextItems],
              );
              setHasMore(nextItems.length >= PAGE_SIZE);
              setFallbackUsed(true);
            }
            return;
          } catch (_fallbackError) {
            // fallthrough to demo data
          }
        }
        if (!cancelled) {
          setItems(fallbackItemsFor(active));
          setHasMore(false);
          setFallbackUsed(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [active, offset, fallbackUsed, sort, status, intent, rangeFrom, range]);

  const isInitialLoading = loading && visibleItems.length === 0;

  const emptyMessage = (() => {
    if (active === 'Battles') {
      return t('feedTabs.empty.battles');
    }
    if (intent === 'needs_help') {
      return t('feedTabs.empty.needsHelp');
    }
    if (intent === 'seeking_pr') {
      return t('feedTabs.empty.seekingPr');
    }
    if (intent === 'ready_for_review') {
      return t('feedTabs.empty.readyForReview');
    }
    return t('feedTabs.empty.all');
  })();

  const openLiveDrafts = () => {
    setActive('Live Drafts');
    updateQuery({ tab: 'Live Drafts' });
    sendTelemetry({
      eventType: 'feed_empty_cta',
      action: 'open_live_drafts',
      sourceTab: active,
    });
  };

  let filterPanel = (
    <p className="text-muted-foreground text-xs">
      {t('feedTabs.filters.availableAll')}
    </p>
  );

  if (active === 'All') {
    filterPanel = (
      <div className="grid gap-3 rounded-2xl border border-border bg-muted/60 p-4 text-foreground/85 text-xs md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1">
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            {t('feedTabs.filters.sort')}
          </span>
          <select
            className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
            onChange={(event) => {
              const next = event.target.value as FeedSort;
              setSort(next);
              updateQuery({ sort: next });
              sendTelemetry({
                eventType: 'feed_filter_change',
                sort: next,
                status,
                intent,
                range,
              });
            }}
            value={sort}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {sortLabel(option.value)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            {t('feedTabs.filters.status')}
          </span>
          <select
            className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
            onChange={(event) => {
              const next = event.target.value as FeedStatus;
              setStatus(next);
              updateQuery({ status: next });
              sendTelemetry({
                eventType: 'feed_filter_change',
                sort,
                status: next,
                intent,
                range,
              });
            }}
            value={status}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {statusLabel(option.value)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            {t('feedTabs.filters.timeRange')}
          </span>
          <select
            className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
            onChange={(event) => {
              const next = event.target.value as FeedRange;
              setRange(next);
              updateQuery({ range: next });
              sendTelemetry({
                eventType: 'feed_filter_change',
                sort,
                status,
                intent,
                range: next,
              });
            }}
            value={range}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {rangeLabel(option.value)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            {t('feedTabs.filters.intent')}
          </span>
          <select
            className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
            onChange={(event) => {
              const next = event.target.value as FeedIntent;
              setIntent(next);
              updateQuery({ intent: next });
              sendTelemetry({
                eventType: 'feed_filter_change',
                sort,
                status,
                intent: next,
                range,
              });
            }}
            value={intent}
          >
            {INTENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {intentLabel(option.value)}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (active === 'Battles') {
    filterPanel = (
      <div className="grid gap-2 rounded-2xl border border-border bg-muted/60 p-3 text-foreground/85 text-xs">
        <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
          {t('feedTabs.filters.battleStatus')}
        </p>
        <div className="flex flex-wrap gap-2">
          {BATTLE_FILTER_OPTIONS.map((option) => (
            <button
              aria-pressed={battleFilter === option.value}
              className={`rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide ${
                battleFilter === option.value
                  ? 'border border-primary/45 bg-primary/15 text-primary'
                  : 'border border-border bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
              key={option.value}
              onClick={() => {
                setBattleFilter(option.value);
                sendTelemetry({
                  eventType: 'feed_battle_filter',
                  filter: option.value,
                });
              }}
              type="button"
            >
              {battleFilterLabel(option.value)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_SCOPE_TABS.map((scope) => (
            <button
              aria-pressed={active === scope.tab}
              className={`rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide ${
                active === scope.tab
                  ? 'border border-secondary/45 bg-secondary/15 text-secondary'
                  : 'border border-border bg-muted/70 text-muted-foreground hover:border-secondary/45 hover:text-foreground'
              }`}
              key={scope.id}
              onClick={() => {
                setActive(scope.tab);
                updateQuery({ tab: scope.tab });
                sendTelemetry({
                  eventType: 'feed_quick_scope',
                  tab: scope.tab,
                });
              }}
              type="button"
            >
              {quickScopeLabel(scope.id)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {active === 'All' && (
            <div className="flex flex-wrap gap-2">
              {INTENT_OPTIONS.filter((option) => option.value !== 'all').map(
                (option) => (
                  <button
                    aria-pressed={intent === option.value}
                    className={`rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide ${
                      intent === option.value
                        ? 'border border-primary/45 bg-primary/15 text-primary'
                        : 'border border-border bg-background/60 text-muted-foreground'
                    }`}
                    key={option.value}
                    onClick={() => {
                      const next = option.value as FeedIntent;
                      setIntent(next);
                      updateQuery({ tab: 'All', intent: next });
                      sendTelemetry({
                        eventType: 'feed_intent_preset',
                        intent: next,
                      });
                    }}
                    type="button"
                  >
                    {intentLabel(option.value)}
                  </button>
                ),
              )}
            </div>
          )}
          {TABS.map((tab) => (
            <button
              aria-pressed={active === tab}
              className={`rounded-full px-4 py-2 font-semibold text-xs uppercase tracking-wide ${
                active === tab
                  ? 'border border-primary/50 bg-primary/15 text-primary shadow-[0_0_0_1px_rgba(12,220,247,0.2)]'
                  : 'border border-border bg-muted/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
              key={tab}
              onClick={() => {
                setActive(tab);
                updateQuery({ tab });
              }}
              type="button"
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>
      </div>
      {filterPanel}
      <div
        aria-live="polite"
        className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs"
      >
        {fallbackUsed && <span className="pill">{t('rail.fallbackData')}</span>}
        {loading && <span>{t('feedTabs.loadingMore')}</span>}
      </div>
      {(() => {
        if (isInitialLoading) {
          return (
            <div className={feedGridClass}>
              {Array.from({ length: 3 }, (_, index) => (
                <article
                  className="card animate-pulse p-4"
                  key={`feed-skeleton-${index + 1}`}
                >
                  <div className="h-4 w-1/3 rounded bg-muted" />
                  <div className="mt-3 h-40 rounded-lg bg-muted" />
                  <div className="mt-3 h-3 w-2/3 rounded bg-muted" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
                </article>
              ))}
            </div>
          );
        }

        if (visibleItems.length === 0) {
          return (
            <div className="card grid gap-4 p-6 text-foreground/85 text-sm">
              <p>{emptyMessage}</p>
              <div className="flex flex-wrap gap-2">
                {active === 'Battles' ? (
                  <button
                    className="rounded-full border border-primary/45 bg-primary/10 px-4 py-2 font-semibold text-primary text-xs transition hover:bg-primary/15"
                    onClick={openLiveDrafts}
                    type="button"
                  >
                    {t('feedTabs.emptyAction.openLiveDrafts')}
                  </button>
                ) : (
                  <>
                    <Link
                      className="rounded-full border border-primary/45 bg-primary/10 px-4 py-2 font-semibold text-primary text-xs transition hover:bg-primary/15"
                      href="/demo"
                    >
                      {t('feedTabs.emptyAction.runDemo')}
                    </Link>
                    <Link
                      className="rounded-full border border-border bg-background/60 px-4 py-2 font-semibold text-foreground text-xs transition hover:border-primary/40 hover:text-primary"
                      href="/search"
                    >
                      {t('feedTabs.emptyAction.openSearch')}
                    </Link>
                  </>
                )}
              </div>
            </div>
          );
        }

        return (
          <div className={feedGridClass}>
            {visibleItems.map((item, index) => {
              if (item.kind === 'studio') {
                return (
                  <StudioCard key={item.id ?? `studio-${index}`} {...item} />
                );
              }
              if (item.kind === 'guild') {
                return (
                  <GuildCard key={item.id ?? `guild-${index}`} {...item} />
                );
              }
              if (item.kind === 'hot') {
                return (
                  <DraftCard
                    afterImageUrl={item.afterImageUrl}
                    beforeImageUrl={item.beforeImageUrl}
                    glowUpScore={item.glowUpScore}
                    hotScore={item.hotScore}
                    id={item.id}
                    key={item.id ?? `hot-${index}`}
                    reasonLabel={item.reasonLabel}
                    title={item.title}
                  />
                );
              }
              if (item.kind === 'progress') {
                const key =
                  item.draftId ??
                  item.beforeImageUrl ??
                  item.afterImageUrl ??
                  item.lastActivity ??
                  `progress-${index}`;
                return (
                  <BeforeAfterCard
                    key={String(key)}
                    {...item}
                    onOpen={() =>
                      sendTelemetry({
                        eventType: 'feed_card_open',
                        draftId: item.draftId,
                        source: 'feed',
                      })
                    }
                  />
                );
              }
              if (item.kind === 'battle') {
                return (
                  <BattleCard key={item.id ?? `battle-${index}`} {...item} />
                );
              }
              if (item.kind === 'change') {
                return (
                  <ChangeCard key={item.id ?? `change-${index}`} {...item} />
                );
              }
              if (item.kind === 'autopsy') {
                return (
                  <AutopsyCard key={item.id ?? `autopsy-${index}`} {...item} />
                );
              }
              return <DraftCard key={item.id ?? `draft-${index}`} {...item} />;
            })}
          </div>
        );
      })()}
      {!fallbackUsed && hasMore && (
        <button
          className="rounded-full border border-border bg-muted/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:border-primary/45 hover:text-primary"
          onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
          type="button"
        >
          {t('feedTabs.loadMore')}
        </button>
      )}
    </section>
  );
};
