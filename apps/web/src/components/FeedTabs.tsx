'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
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

const STORY_TABS = new Set([
  'All',
  'Progress',
  'Changes',
  'For You',
  'Hot Now',
  'Live Drafts',
  'GlowUps',
  'Battles',
]);

const SORT_VALUES = new Set<FeedSort>(['recent', 'impact', 'glowup']);
const STATUS_VALUES = new Set<FeedStatus>(['all', 'draft', 'release', 'pr']);
const RANGE_VALUES = new Set<FeedRange>(['7d', '30d', '90d', 'all']);
const INTENT_VALUES = new Set<FeedIntent>([
  'all',
  'needs_help',
  'seeking_pr',
  'ready_for_review',
]);

interface FeedQueryState {
  tab: string;
  sort: FeedSort;
  status: FeedStatus;
  range: FeedRange;
  intent: FeedIntent;
}

const parseQueryState = (params: { get: (key: string) => string | null }) => {
  const rawTab = params.get('tab');
  const tab = rawTab && TABS.includes(rawTab) ? rawTab : TABS[0];

  const rawSort = params.get('sort');
  const sort =
    rawSort && SORT_VALUES.has(rawSort as FeedSort)
      ? (rawSort as FeedSort)
      : DEFAULT_SORT;

  const rawStatus = params.get('status');
  const status =
    rawStatus && STATUS_VALUES.has(rawStatus as FeedStatus)
      ? (rawStatus as FeedStatus)
      : DEFAULT_STATUS;

  const rawRange = params.get('range');
  const range =
    rawRange && RANGE_VALUES.has(rawRange as FeedRange)
      ? (rawRange as FeedRange)
      : DEFAULT_RANGE;

  const rawIntent = params.get('intent');
  const intent =
    rawIntent && INTENT_VALUES.has(rawIntent as FeedIntent)
      ? (rawIntent as FeedIntent)
      : DEFAULT_INTENT;

  return { tab, sort, status, range, intent } satisfies FeedQueryState;
};

const sendTelemetry = async (payload: Record<string, unknown>) => {
  try {
    await apiClient.post('/telemetry/ux', payload);
  } catch (_error) {
    // ignore telemetry failures
  }
};

export const endpointForTab = (tab: string) => mapEndpointForTab(tab);

interface FeedPageResponse {
  items: FeedItem[];
  fallbackUsed: boolean;
  hasMore: boolean;
  replaceCurrentItems?: boolean;
  keepCurrentItems?: boolean;
  loadTimingMs?: number;
}

interface AllFeedFiltersProps {
  sort: FeedSort;
  status: FeedStatus;
  range: FeedRange;
  intent: FeedIntent;
  sortOptions: Array<{ value: FeedSort; label: string }>;
  statusOptions: Array<{ value: FeedStatus; label: string }>;
  rangeOptions: Array<{ value: FeedRange; label: string }>;
  intentOptions: Array<{ value: FeedIntent; label: string }>;
  labels: {
    sort: string;
    status: string;
    timeRange: string;
    intent: string;
  };
  onSortChange: (value: FeedSort) => void;
  onStatusChange: (value: FeedStatus) => void;
  onRangeChange: (value: FeedRange) => void;
  onIntentChange: (value: FeedIntent) => void;
}

const AllFeedFilters = memo(function AllFeedFilters({
  sort,
  status,
  range,
  intent,
  sortOptions,
  statusOptions,
  rangeOptions,
  intentOptions,
  labels,
  onSortChange,
  onStatusChange,
  onRangeChange,
  onIntentChange,
}: AllFeedFiltersProps) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/60 p-4 text-foreground/85 text-xs md:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-1">
        <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
          {labels.sort}
        </span>
        <select
          className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
          onChange={(event) => onSortChange(event.target.value as FeedSort)}
          value={sort}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
          {labels.status}
        </span>
        <select
          className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
          onChange={(event) => onStatusChange(event.target.value as FeedStatus)}
          value={status}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
          {labels.timeRange}
        </span>
        <select
          className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
          onChange={(event) => onRangeChange(event.target.value as FeedRange)}
          value={range}
        >
          {rangeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
          {labels.intent}
        </span>
        <select
          className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
          onChange={(event) => onIntentChange(event.target.value as FeedIntent)}
          value={intent}
        >
          {intentOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
});

interface BattleFiltersProps {
  battleFilter: BattleFilter;
  battleFilterOptions: Array<{ value: BattleFilter; label: string }>;
  label: string;
  onBattleFilterChange: (value: BattleFilter) => void;
}

const BattleFilters = memo(function BattleFilters({
  battleFilter,
  battleFilterOptions,
  label,
  onBattleFilterChange,
}: BattleFiltersProps) {
  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-muted/60 p-3 text-foreground/85 text-xs">
      <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {battleFilterOptions.map((option) => (
          <button
            aria-pressed={battleFilter === option.value}
            className={`rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide ${
              battleFilter === option.value
                ? 'border border-primary/45 bg-primary/15 text-primary'
                : 'border border-border bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
            key={option.value}
            onClick={() => onBattleFilterChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
});

export const FeedTabs = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const queryState = useMemo(
    () => parseQueryState(searchParams),
    [searchParams],
  );

  const [active, setActive] = useState(queryState.tab);
  const [sort, setSort] = useState<FeedSort>(queryState.sort);
  const [status, setStatus] = useState<FeedStatus>(queryState.status);
  const [range, setRange] = useState<FeedRange>(queryState.range);
  const [intent, setIntent] = useState<FeedIntent>(queryState.intent);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [battleFilter, setBattleFilter] = useState<BattleFilter>('all');
  const filterKey = `${active}|${sort}|${status}|${range}|${intent}`;
  const feedGridClass = STORY_TABS.has(active)
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

  const sortLabel = useCallback(
    (value: FeedSort): string => {
      if (value === 'impact') {
        return t('search.sort.impact');
      }
      if (value === 'glowup') {
        return t('changeCard.metrics.glowUp');
      }
      return t('search.sort.recency');
    },
    [t],
  );

  const statusLabel = useCallback(
    (value: FeedStatus): string => {
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
    },
    [t],
  );

  const rangeLabel = useCallback(
    (value: FeedRange): string => {
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
    },
    [t],
  );

  const intentLabel = useCallback(
    (value: FeedIntent): string => {
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
    },
    [t],
  );

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

  const battleFilterLabel = useCallback(
    (value: BattleFilter): string => {
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
    },
    [t],
  );
  const localizedSortOptions = useMemo(
    () =>
      SORT_OPTIONS.map((option) => ({
        value: option.value,
        label: sortLabel(option.value),
      })),
    [sortLabel],
  );
  const localizedStatusOptions = useMemo(
    () =>
      STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label: statusLabel(option.value),
      })),
    [statusLabel],
  );
  const localizedRangeOptions = useMemo(
    () =>
      RANGE_OPTIONS.map((option) => ({
        value: option.value,
        label: rangeLabel(option.value),
      })),
    [rangeLabel],
  );
  const localizedIntentOptions = useMemo(
    () =>
      INTENT_OPTIONS.map((option) => ({
        value: option.value,
        label: intentLabel(option.value),
      })),
    [intentLabel],
  );
  const localizedBattleFilterOptions = useMemo(
    () =>
      BATTLE_FILTER_OPTIONS.map((option) => ({
        value: option.value,
        label: battleFilterLabel(option.value),
      })),
    [battleFilterLabel],
  );
  const filterLabels = useMemo(
    () => ({
      sort: t('feedTabs.filters.sort'),
      status: t('feedTabs.filters.status'),
      timeRange: t('feedTabs.filters.timeRange'),
      intent: t('feedTabs.filters.intent'),
    }),
    [t],
  );

  const quickScopeClass = (scopeId: string, isActive: boolean): string => {
    if (!isActive) {
      return 'border-border bg-muted/70 text-muted-foreground hover:border-secondary/45 hover:text-foreground';
    }
    if (scopeId === 'live') {
      return 'tag-live';
    }
    if (scopeId === 'top24') {
      return 'tag-hot';
    }
    return 'border-secondary/45 bg-secondary/15 text-secondary';
  };

  const tabClass = (tab: string, isActive: boolean): string => {
    if (!isActive) {
      return 'border-border bg-muted/70 text-muted-foreground hover:border-primary/40 hover:text-foreground';
    }
    if (tab === 'Hot Now') {
      return 'tag-hot';
    }
    if (tab === 'Live Drafts') {
      return 'tag-live';
    }
    return 'border-primary/50 bg-primary/15 text-primary';
  };

  useEffect(() => {
    setActive((previous) =>
      previous === queryState.tab ? previous : queryState.tab,
    );
    setSort((previous) =>
      previous === queryState.sort ? previous : queryState.sort,
    );
    setStatus((previous) =>
      previous === queryState.status ? previous : queryState.status,
    );
    setRange((previous) =>
      previous === queryState.range ? previous : queryState.range,
    );
    setIntent((previous) =>
      previous === queryState.intent ? previous : queryState.intent,
    );
  }, [queryState]);

  const updateQuery = useCallback(
    (
      updates: Partial<{
        tab: string;
        sort: FeedSort;
        status: FeedStatus;
        range: FeedRange;
        intent: FeedIntent;
      }>,
    ) => {
      const params = new URLSearchParams(searchParamString);
      const next = {
        tab: updates.tab ?? active,
        sort: updates.sort ?? sort,
        status: updates.status ?? status,
        range: updates.range ?? range,
        intent: updates.intent ?? intent,
      };

      if (
        next.tab === queryState.tab &&
        next.sort === queryState.sort &&
        next.status === queryState.status &&
        next.range === queryState.range &&
        next.intent === queryState.intent
      ) {
        return;
      }

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
    },
    [
      active,
      intent,
      pathname,
      queryState.intent,
      queryState.range,
      queryState.sort,
      queryState.status,
      queryState.tab,
      range,
      router,
      searchParamString,
      sort,
      status,
    ],
  );

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

  const {
    data: pageData,
    isLoading,
    isValidating,
  } = useSWR<FeedPageResponse>(
    fallbackUsed
      ? null
      : ['feed-tabs', active, offset, sort, status, intent, range, rangeFrom],
    async () => {
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

      const startedAt = performance.now();

      try {
        const response = await apiClient.get(endpoint, { params });
        const nextItems = mapItemsForTab(active, response.data);
        return {
          items: nextItems,
          fallbackUsed: false,
          hasMore: nextItems.length >= PAGE_SIZE,
          loadTimingMs:
            active === 'All' && offset === 0
              ? Math.round(performance.now() - startedAt)
              : undefined,
        };
      } catch (_error) {
        if (active === 'For You') {
          try {
            const response = await apiClient.get('/feeds/glowups', { params });
            const nextItems = mapDraftItems(response.data, false);
            return {
              items: nextItems,
              fallbackUsed: true,
              hasMore: false,
            };
          } catch (_fallbackError) {
            // fallthrough to demo data
          }
        }

        return {
          items: offset > 0 ? [] : fallbackItemsFor(active),
          fallbackUsed: true,
          hasMore: false,
          keepCurrentItems: offset > 0,
        };
      }
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      revalidateIfStale: true,
      revalidateOnMount: true,
    },
  );

  const loading = isLoading || isValidating;

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
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [loading, hasMore, fallbackUsed]);

  useEffect(() => {
    if (!pageData) {
      return;
    }

    setItems((prev) => {
      if (pageData.keepCurrentItems) {
        return prev;
      }
      if (pageData.replaceCurrentItems) {
        return pageData.items;
      }
      if (pageData.fallbackUsed && offset === 0 && prev.length > 0) {
        return prev;
      }
      return offset === 0 ? pageData.items : [...prev, ...pageData.items];
    });
    setHasMore(pageData.hasMore);
    if (pageData.fallbackUsed) {
      setFallbackUsed(true);
    }
    if (pageData.loadTimingMs !== undefined) {
      sendTelemetry({
        eventType: 'feed_load_timing',
        sort,
        status: status === 'all' ? undefined : status,
        intent: intent === 'all' ? undefined : intent,
        range,
        timingMs: pageData.loadTimingMs,
      });
    }
  }, [pageData, offset, sort, status, intent, range]);

  const isInitialLoading = loading && visibleItems.length === 0;

  const emptyMessage = useMemo(() => {
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
  }, [active, intent, t]);

  const openLiveDrafts = () => {
    setActive('Live Drafts');
    updateQuery({ tab: 'Live Drafts' });
    sendTelemetry({
      eventType: 'feed_empty_cta',
      action: 'open_live_drafts',
      sourceTab: active,
    });
  };
  const handleSortChange = useCallback(
    (next: FeedSort) => {
      setSort(next);
      updateQuery({ sort: next });
      sendTelemetry({
        eventType: 'feed_filter_change',
        sort: next,
        status,
        intent,
        range,
      });
    },
    [intent, range, status, updateQuery],
  );
  const handleStatusChange = useCallback(
    (next: FeedStatus) => {
      setStatus(next);
      updateQuery({ status: next });
      sendTelemetry({
        eventType: 'feed_filter_change',
        sort,
        status: next,
        intent,
        range,
      });
    },
    [intent, range, sort, updateQuery],
  );
  const handleRangeChange = useCallback(
    (next: FeedRange) => {
      setRange(next);
      updateQuery({ range: next });
      sendTelemetry({
        eventType: 'feed_filter_change',
        sort,
        status,
        intent,
        range: next,
      });
    },
    [intent, sort, status, updateQuery],
  );
  const handleIntentChange = useCallback(
    (next: FeedIntent) => {
      setIntent(next);
      updateQuery({ intent: next });
      sendTelemetry({
        eventType: 'feed_filter_change',
        sort,
        status,
        intent: next,
        range,
      });
    },
    [range, sort, status, updateQuery],
  );
  const handleBattleFilterChange = useCallback((next: BattleFilter) => {
    setBattleFilter(next);
    sendTelemetry({
      eventType: 'feed_battle_filter',
      filter: next,
    });
  }, []);
  const handleProgressCardOpen = useCallback((draftId: string) => {
    sendTelemetry({
      eventType: 'feed_card_open',
      draftId,
      source: 'feed',
    });
  }, []);

  const renderedItems = useMemo(
    () =>
      visibleItems.map((item, index) => {
        if (item.kind === 'studio') {
          return <StudioCard key={item.id ?? `studio-${index}`} {...item} />;
        }
        if (item.kind === 'guild') {
          return <GuildCard key={item.id ?? `guild-${index}`} {...item} />;
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
              onOpen={() => handleProgressCardOpen(item.draftId)}
            />
          );
        }
        if (item.kind === 'battle') {
          return <BattleCard key={item.id ?? `battle-${index}`} {...item} />;
        }
        if (item.kind === 'change') {
          return <ChangeCard key={item.id ?? `change-${index}`} {...item} />;
        }
        if (item.kind === 'autopsy') {
          return <AutopsyCard key={item.id ?? `autopsy-${index}`} {...item} />;
        }
        return <DraftCard key={item.id ?? `draft-${index}`} {...item} />;
      }),
    [visibleItems, handleProgressCardOpen],
  );

  const filterPanel = useMemo(() => {
    if (active === 'All') {
      return (
        <AllFeedFilters
          intent={intent}
          intentOptions={localizedIntentOptions}
          labels={filterLabels}
          onIntentChange={handleIntentChange}
          onRangeChange={handleRangeChange}
          onSortChange={handleSortChange}
          onStatusChange={handleStatusChange}
          range={range}
          rangeOptions={localizedRangeOptions}
          sort={sort}
          sortOptions={localizedSortOptions}
          status={status}
          statusOptions={localizedStatusOptions}
        />
      );
    }

    if (active === 'Battles') {
      return (
        <BattleFilters
          battleFilter={battleFilter}
          battleFilterOptions={localizedBattleFilterOptions}
          label={t('feedTabs.filters.battleStatus')}
          onBattleFilterChange={handleBattleFilterChange}
        />
      );
    }

    return (
      <p className="text-muted-foreground text-xs">
        {t('feedTabs.filters.availableAll')}
      </p>
    );
  }, [
    active,
    battleFilter,
    filterLabels,
    handleBattleFilterChange,
    handleIntentChange,
    handleRangeChange,
    handleSortChange,
    handleStatusChange,
    intent,
    localizedBattleFilterOptions,
    localizedIntentOptions,
    localizedRangeOptions,
    localizedSortOptions,
    localizedStatusOptions,
    range,
    sort,
    status,
    t,
  ]);

  return (
    <section className="grid gap-6">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_SCOPE_TABS.map((scope) => (
            <button
              aria-pressed={active === scope.tab}
              className={`rounded-full border px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide ${quickScopeClass(scope.id, active === scope.tab)}`}
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
              className={`rounded-full border px-4 py-2 font-semibold text-xs uppercase tracking-wide ${tabClass(tab, active === tab)}`}
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

        return <div className={feedGridClass}>{renderedItems}</div>;
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
