'use client';

import {
  ArrowUp,
  ChevronDown,
  Inbox,
  LayoutGrid,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const PRIMARY_TABS = ['All', 'Hot Now', 'Live Drafts', 'Battles', 'For You'];
const MORE_TABS = TABS.filter((tab) => !PRIMARY_TABS.includes(tab));
const PAGE_SIZE = 6;
const DEFAULT_SORT = 'recent';
const DEFAULT_STATUS = 'all';
const DEFAULT_RANGE = '30d';
const DEFAULT_INTENT = 'all';
const DEFAULT_QUERY = '';
const FEED_DENSITY_STORAGE_KEY = 'finishit-feed-density';
const MOBILE_DENSITY_MEDIA_QUERY = '(max-width: 767px)';

type FeedDensity = 'comfort' | 'compact';

const parseFeedDensity = (value: string | null): FeedDensity | null => {
  if (value === 'comfort' || value === 'compact') {
    return value;
  }
  return null;
};

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
  query: string;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return target.getAttribute('role') === 'textbox';
};

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
  const rawQuery = params.get('q') ?? DEFAULT_QUERY;
  const query = rawQuery.trim();

  return { tab, sort, status, range, intent, query } satisfies FeedQueryState;
};

const normalizeQuery = (value: string): string => value.trim().toLowerCase();

const searchableTextByItemKind = (item: FeedItem): string => {
  if (item.kind === 'draft' || item.kind === 'hot') {
    return `${item.title} ${item.id}`;
  }
  if (item.kind === 'progress') {
    return `${item.draftId} ${item.authorStudio}`;
  }
  if (item.kind === 'guild') {
    return `${item.name} ${item.themeOfWeek ?? ''}`;
  }
  if (item.kind === 'studio') {
    return `${item.studioName} ${item.id}`;
  }
  if (item.kind === 'change') {
    return `${item.draftTitle} ${item.draftId} ${item.description} ${item.changeType}`;
  }
  if (item.kind === 'battle') {
    return `${item.title} ${item.leftLabel} ${item.rightLabel} ${item.id}`;
  }
  return `${item.summary} ${item.id}`;
};

const sendTelemetry = (payload: Record<string, unknown>): void => {
  apiClient.post('/telemetry/ux', payload).catch(() => {
    // ignore telemetry failures
  });
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
            className={`rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
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

interface FeedTabsProps {
  isObserverMode?: boolean;
}

export const FeedTabs = ({ isObserverMode = false }: FeedTabsProps) => {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const queryState = useMemo(
    () => parseQueryState(new URLSearchParams(searchParamString)),
    [searchParamString],
  );

  const [active, setActive] = useState(queryState.tab);
  const [sort, setSort] = useState<FeedSort>(queryState.sort);
  const [status, setStatus] = useState<FeedStatus>(queryState.status);
  const [range, setRange] = useState<FeedRange>(queryState.range);
  const [intent, setIntent] = useState<FeedIntent>(queryState.intent);
  const [query, setQuery] = useState(queryState.query);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [battleFilter, setBattleFilter] = useState<BattleFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [density, setDensity] = useState<FeedDensity>('comfort');
  const desktopMoreDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const isCompactDensity = density === 'compact';
  const normalizedQuery = useMemo(() => normalizeQuery(query), [query]);
  const filterKey = `${active}|${sort}|${status}|${range}|${intent}|${normalizedQuery}`;
  const feedGridClass = STORY_TABS.has(active)
    ? `grid ${isCompactDensity ? 'gap-3 md:grid-cols-2 2xl:grid-cols-3' : 'gap-4'}`
    : `grid ${isCompactDensity ? 'gap-3' : 'gap-4'} md:grid-cols-2 xl:grid-cols-3`;
  const visibleItems = useMemo(() => {
    let filteredItems = items;
    if (active === 'Battles' && battleFilter !== 'all') {
      filteredItems = filteredItems.filter(
        (item) => item.kind !== 'battle' || item.decision === battleFilter,
      );
    }

    if (!normalizedQuery) {
      return filteredItems;
    }

    return filteredItems.filter((item) =>
      searchableTextByItemKind(item).toLowerCase().includes(normalizedQuery),
    );
  }, [active, battleFilter, items, normalizedQuery]);

  const tabLabels = useMemo(
    () =>
      ({
        All: t('feed.all'),
        Progress: t('feedTabs.tab.progress'),
        Changes: t('feedTabs.tab.changes'),
        'For You': t('feedTabs.tab.forYou'),
        'Hot Now': t('feedTabs.tab.hotNow'),
        'Live Drafts': t('feedTabs.tab.liveDrafts'),
        GlowUps: t('feedTabs.tab.glowUps'),
        Guilds: t('feedTabs.tab.guilds'),
        Studios: t('feedTabs.tab.studios'),
        Battles: t('feedTabs.tab.battles'),
        Archive: t('feedTabs.tab.archive'),
      }) as Record<string, string>,
    [t],
  );

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
  const showFiltersLabel = t('feedTabs.filters.toggle');
  const moreLabel = t('feedTabs.more');
  const shownLabel = t('feedTabs.shown');
  const backToTopLabel = t('feedTabs.backToTop');
  const emptyStateTitle = t('feedTabs.empty.title');
  const densityLabel = t('feedTabs.density.label');
  const comfortLabel = t('feedTabs.density.comfort');
  const compactLabel = t('feedTabs.density.compact');

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
    setQuery((previous) =>
      previous === queryState.query ? previous : queryState.query,
    );
  }, [queryState]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQueryList = window.matchMedia(MOBILE_DENSITY_MEDIA_QUERY);
    const syncViewportState = () => {
      setIsMobileViewport(mediaQueryList.matches);
    };

    syncViewportState();
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', syncViewportState);
      return () => {
        mediaQueryList.removeEventListener('change', syncViewportState);
      };
    }

    mediaQueryList.addListener(syncViewportState);
    return () => {
      mediaQueryList.removeListener(syncViewportState);
    };
  }, []);

  useEffect(() => {
    try {
      const storedDensity = parseFeedDensity(
        window.localStorage.getItem(FEED_DENSITY_STORAGE_KEY),
      );
      if (storedDensity) {
        setDensity(storedDensity);
        return;
      }
      if (typeof window.matchMedia === 'function') {
        const prefersCompactDensity = window.matchMedia(
          MOBILE_DENSITY_MEDIA_QUERY,
        ).matches;
        setDensity(prefersCompactDensity ? 'compact' : 'comfort');
      }
    } catch {
      // ignore localStorage read errors
    }
  }, []);

  useEffect(() => {
    if (!isMobileViewport && moreOpen) {
      setMoreOpen(false);
    }
  }, [isMobileViewport, moreOpen]);

  useEffect(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      const hasFiltersForActiveTab = active === 'All' || active === 'Battles';
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      if (event.key === '/') {
        if (isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        const searchInput = searchInputRef.current;
        if (!searchInput) {
          return;
        }
        searchInput.focus();
        searchInput.select();
        return;
      }

      if (event.shiftKey && (event.key === 'F' || event.key === 'f')) {
        if (!hasFiltersForActiveTab || isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        setFiltersOpen((previous) => {
          const next = !previous;
          if (isMobileViewport && next) {
            setMoreOpen(false);
          }
          return next;
        });
        return;
      }

      if (event.key !== 'Escape') {
        return;
      }

      const searchInput = searchInputRef.current;
      if (searchInput && document.activeElement === searchInput) {
        event.preventDefault();
        if (searchInput.value.length > 0) {
          setQuery(DEFAULT_QUERY);
        }
        searchInput.blur();
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => {
      window.removeEventListener('keydown', handleGlobalShortcuts);
    };
  }, [active, isMobileViewport]);

  const closeDesktopMore = useCallback(() => {
    const details = desktopMoreDetailsRef.current;
    if (details?.open) {
      details.removeAttribute('open');
    }
    setDesktopMoreOpen(false);
  }, []);

  useEffect(() => {
    if (isMobileViewport) {
      closeDesktopMore();
      return;
    }
    if (!desktopMoreOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDesktopMore();
      }
    };
    const handleOutsideMouseDown = (event: MouseEvent) => {
      const details = desktopMoreDetailsRef.current;
      if (!details) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!details.contains(target)) {
        closeDesktopMore();
      }
    };
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('mousedown', handleOutsideMouseDown);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('mousedown', handleOutsideMouseDown);
    };
  }, [closeDesktopMore, desktopMoreOpen, isMobileViewport]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FEED_DENSITY_STORAGE_KEY, density);
    } catch {
      // ignore localStorage write errors
    }
  }, [density]);

  const updateQuery = useCallback(
    (
      updates: Partial<{
        tab: string;
        sort: FeedSort;
        status: FeedStatus;
        range: FeedRange;
        intent: FeedIntent;
        query: string;
      }>,
    ) => {
      const params = new URLSearchParams(searchParamString);
      const next = {
        tab: updates.tab ?? active,
        sort: updates.sort ?? sort,
        status: updates.status ?? status,
        range: updates.range ?? range,
        intent: updates.intent ?? intent,
        query: (updates.query ?? query).trim(),
      };

      if (
        next.tab === queryState.tab &&
        next.sort === queryState.sort &&
        next.status === queryState.status &&
        next.range === queryState.range &&
        next.intent === queryState.intent &&
        next.query === queryState.query
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

      if (next.query) {
        params.set('q', next.query);
      } else {
        params.delete('q');
      }

      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [
      active,
      intent,
      pathname,
      query,
      queryState.query,
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

  const handleTabSelect = useCallback(
    (tab: string) => {
      setActive(tab);
      updateQuery({ tab });
    },
    [updateQuery],
  );

  useEffect(() => {
    const timeoutHandle = window.setTimeout(() => {
      const trimmedQuery = query.trim();
      if (trimmedQuery !== queryState.query) {
        updateQuery({ query: trimmedQuery });
      }
    }, 200);

    return () => {
      window.clearTimeout(timeoutHandle);
    };
  }, [query, queryState.query, updateQuery]);

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

  useEffect(() => {
    if (active) {
      setFiltersOpen(false);
      setMoreOpen(false);
    }
  }, [active]);

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
      : [
          'feed-tabs',
          active,
          offset,
          sort,
          status,
          intent,
          range,
          rangeFrom,
          normalizedQuery,
        ],
    async () => {
      const endpoint = endpointForTab(active);
      const params: Record<string, unknown> = { limit: PAGE_SIZE, offset };
      if (normalizedQuery) {
        params.q = normalizedQuery;
      }
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
      setShowBackToTop(window.scrollY > 520);
      if (loading || !hasMore || fallbackUsed) {
        return;
      }
      if (visibleItems.length === 0) {
        return;
      }
      if (document.body.offsetHeight <= window.innerHeight + 200) {
        return;
      }
      if (
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight - 200
      ) {
        setOffset((prev) => prev + PAGE_SIZE);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [loading, hasMore, fallbackUsed, visibleItems.length]);

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
    handleTabSelect('Live Drafts');
    sendTelemetry({
      eventType: 'feed_empty_cta',
      action: 'open_live_drafts',
      sourceTab: active,
    });
  };

  const handleQueryChange = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
  }, []);

  const clearQuery = useCallback(() => {
    setQuery(DEFAULT_QUERY);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSort(DEFAULT_SORT);
    setStatus(DEFAULT_STATUS);
    setRange(DEFAULT_RANGE);
    setIntent(DEFAULT_INTENT);
    setBattleFilter('all');
    setQuery(DEFAULT_QUERY);
    setFiltersOpen(false);
    updateQuery({
      sort: DEFAULT_SORT,
      status: DEFAULT_STATUS,
      range: DEFAULT_RANGE,
      intent: DEFAULT_INTENT,
      query: DEFAULT_QUERY,
    });
    sendTelemetry({
      eventType: 'feed_filter_reset',
      tab: active,
    });
  }, [active, updateQuery]);

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
  const handleDensityChange = useCallback((next: FeedDensity) => {
    setDensity(next);
    sendTelemetry({
      eventType: 'feed_density_change',
      density: next,
    });
  }, []);
  const handleProgressCardOpen = useCallback((draftId: string) => {
    sendTelemetry({
      eventType: 'feed_card_open',
      draftId,
      source: 'feed',
    });
  }, []);
  const handleBackToTop = useCallback(() => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, []);

  const renderedItems = useMemo(
    () =>
      visibleItems.map((item, index) => {
        if (item.kind === 'studio') {
          return (
            <StudioCard
              compact={isCompactDensity}
              key={item.id ?? `studio-${index}`}
              {...item}
            />
          );
        }
        if (item.kind === 'guild') {
          return (
            <GuildCard
              compact={isCompactDensity}
              key={item.id ?? `guild-${index}`}
              {...item}
            />
          );
        }
        if (item.kind === 'hot') {
          return (
            <DraftCard
              afterImageUrl={item.afterImageUrl}
              beforeImageUrl={item.beforeImageUrl}
              compact={isCompactDensity}
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
              compact={isCompactDensity}
              onOpen={() => handleProgressCardOpen(item.draftId)}
            />
          );
        }
        if (item.kind === 'battle') {
          return (
            <BattleCard
              compact={isCompactDensity}
              key={item.id ?? `battle-${index}`}
              {...item}
            />
          );
        }
        if (item.kind === 'change') {
          return (
            <ChangeCard
              compact={isCompactDensity}
              key={item.id ?? `change-${index}`}
              {...item}
            />
          );
        }
        if (item.kind === 'autopsy') {
          return (
            <AutopsyCard
              compact={isCompactDensity}
              key={item.id ?? `autopsy-${index}`}
              {...item}
            />
          );
        }
        return (
          <DraftCard
            compact={isCompactDensity}
            key={item.id ?? `draft-${index}`}
            {...item}
          />
        );
      }),
    [visibleItems, handleProgressCardOpen, isCompactDensity],
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

    return null;
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

  const activeFilterPills = useMemo(() => {
    const pills: string[] = [];

    if (active === 'All') {
      if (sort !== DEFAULT_SORT) {
        pills.push(`${filterLabels.sort}: ${sortLabel(sort)}`);
      }
      if (status !== DEFAULT_STATUS) {
        pills.push(`${filterLabels.status}: ${statusLabel(status)}`);
      }
      if (range !== DEFAULT_RANGE) {
        pills.push(`${filterLabels.timeRange}: ${rangeLabel(range)}`);
      }
      if (intent !== DEFAULT_INTENT) {
        pills.push(`${filterLabels.intent}: ${intentLabel(intent)}`);
      }
    }

    if (active === 'Battles' && battleFilter !== 'all') {
      pills.push(
        `${t('feedTabs.filters.battleStatus')}: ${battleFilterLabel(battleFilter)}`,
      );
    }

    if (query.trim()) {
      pills.push(`${t('header.search')}: ${query.trim()}`);
    }

    return pills;
  }, [
    active,
    battleFilter,
    battleFilterLabel,
    filterLabels.intent,
    filterLabels.sort,
    filterLabels.status,
    filterLabels.timeRange,
    intent,
    intentLabel,
    range,
    rangeLabel,
    sort,
    sortLabel,
    status,
    statusLabel,
    query,
    t,
  ]);

  const hasFilterPanel = active === 'All' || active === 'Battles';
  const activeFilterCount = activeFilterPills.length;
  const hasActiveFilters = activeFilterCount > 0;
  const hasMobileOverlayOpen =
    isMobileViewport && ((filtersOpen && hasFilterPanel) || moreOpen);

  useEffect(() => {
    if (!hasMobileOverlayOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFiltersOpen(false);
        setMoreOpen(false);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [hasMobileOverlayOpen]);

  const shownValue =
    hasMore && !fallbackUsed
      ? `${visibleItems.length} / ${items.length}+`
      : `${visibleItems.length} / ${items.length}`;
  const handleMoreTabSelect = useCallback(
    (tab: string) => {
      handleTabSelect(tab);
      setMoreOpen(false);
      closeDesktopMore();
    },
    [closeDesktopMore, handleTabSelect],
  );
  const morePanelContent = (
    <>
      <div className="grid gap-1">
        {MORE_TABS.map((tab) => (
          <button
            aria-pressed={active === tab}
            className={`rounded-lg border px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              active === tab
                ? 'border-primary/45 bg-primary/15 text-primary'
                : 'border-border bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
            key={tab}
            onClick={() => {
              handleMoreTabSelect(tab);
            }}
            type="button"
          >
            {tabLabels[tab] ?? tab}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-border/60 border-t pt-2">
        <span
          className="rounded-full border border-border bg-background/70 px-3 py-1 font-semibold text-[11px] text-muted-foreground"
          title={activeFilterPills.join(' | ')}
        >
          {t('feedTabs.activeFilters')}: {activeFilterCount}
        </span>
        {hasActiveFilters ? (
          <button
            className="rounded-full border border-border bg-background/70 px-3 py-1 font-semibold text-[11px] text-foreground transition hover:border-primary/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={handleResetFilters}
            type="button"
          >
            {t('search.actions.resetFilters')}
          </button>
        ) : null}
      </div>
    </>
  );

  return (
    <section className="grid gap-6">
      <div className="grid gap-3">
        <div className="grid gap-2 rounded-2xl border border-border bg-muted/35 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {PRIMARY_TABS.map((tab) => (
              <button
                aria-pressed={active === tab}
                className={`rounded-full border px-4 py-2 font-semibold text-xs uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${tabClass(
                  tab,
                  active === tab,
                )}`}
                key={tab}
                onClick={() => handleTabSelect(tab)}
                type="button"
              >
                {tabLabels[tab] ?? tab}
              </button>
            ))}
            {isMobileViewport ? (
              <button
                aria-expanded={moreOpen}
                className={`inline-flex items-center gap-1 rounded-full border px-4 py-2 font-semibold text-xs uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  MORE_TABS.includes(active)
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-border bg-muted/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
                onClick={() => {
                  setMoreOpen((previous) => !previous);
                  setFiltersOpen(false);
                }}
                type="button"
              >
                {moreLabel}
                <ChevronDown
                  aria-hidden="true"
                  className={`h-3 w-3 transition-transform motion-reduce:transform-none motion-reduce:transition-none ${moreOpen ? 'rotate-180' : ''}`}
                />
              </button>
            ) : (
              <details
                className="relative"
                data-testid="feed-more-details"
                onToggle={(event) => {
                  setDesktopMoreOpen(event.currentTarget.open);
                }}
                ref={desktopMoreDetailsRef}
              >
                <summary
                  className={`inline-flex cursor-pointer list-none items-center gap-1 rounded-full border px-4 py-2 font-semibold text-xs uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden ${
                    MORE_TABS.includes(active)
                      ? 'border-primary/50 bg-primary/15 text-primary'
                      : 'border-border bg-muted/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                  data-testid="feed-more-summary"
                >
                  {moreLabel}
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-3 w-3 transition-transform motion-reduce:transform-none motion-reduce:transition-none ${
                      desktopMoreOpen ? 'rotate-180' : ''
                    }`}
                  />
                </summary>
                <div className="absolute left-0 z-20 mt-2 grid min-w-[16rem] gap-2 rounded-xl border border-border bg-card p-2">
                  {morePanelContent}
                </div>
              </details>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-background/85 px-3 py-2 text-muted-foreground text-xs sm:min-w-[16rem]">
              <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <input
                aria-label={t('feed.searchAriaLabel')}
                className="w-full bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground/65"
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder={t('feed.searchPlaceholderExtended')}
                ref={searchInputRef}
                type="search"
                value={query}
              />
              {query ? (
                <button
                  aria-label={t('common.close')}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground transition hover:border-primary/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={clearQuery}
                  type="button"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="hidden rounded border border-border bg-background/70 px-1.5 py-0.5 font-semibold text-[10px] text-muted-foreground uppercase sm:inline">
                  /
                </span>
              )}
            </label>
            {hasFilterPanel ? (
              <button
                aria-expanded={filtersOpen}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/70 px-4 py-2 font-semibold text-xs uppercase tracking-wide transition hover:border-primary/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => {
                  setFiltersOpen((previous) => !previous);
                  if (isMobileViewport) {
                    setMoreOpen(false);
                  }
                }}
                type="button"
              >
                <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                {showFiltersLabel}
                {filtersOpen ? ' -' : ' +'}
                {hasActiveFilters ? (
                  <span
                    aria-hidden="true"
                    className="ml-1 rounded-full border border-primary/45 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                  >
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            ) : null}
            <fieldset className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/70 p-1">
              <legend className="sr-only">{densityLabel}</legend>
              <button
                aria-pressed={density === 'comfort'}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  density === 'comfort'
                    ? 'border border-primary/45 bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => handleDensityChange('comfort')}
                type="button"
              >
                <LayoutGrid aria-hidden="true" className="h-3 w-3" />
                <span className="hidden sm:inline">{comfortLabel}</span>
                <span className="sr-only sm:hidden">{comfortLabel}</span>
              </button>
              <button
                aria-pressed={density === 'compact'}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  density === 'compact'
                    ? 'border border-primary/45 bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => handleDensityChange('compact')}
                type="button"
              >
                <Rows3 aria-hidden="true" className="h-3 w-3" />
                <span className="hidden sm:inline">{compactLabel}</span>
                <span className="sr-only sm:hidden">{compactLabel}</span>
              </button>
            </fieldset>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <span className="rounded-full border border-border bg-background/60 px-3 py-1">
              {shownLabel}: {shownValue}
            </span>
            {hasActiveFilters ? (
              <span
                className="rounded-full border border-border bg-background/70 px-3 py-1 font-semibold text-[11px]"
                title={activeFilterPills.join(' | ')}
              >
                {t('feedTabs.activeFilters')}: {activeFilterCount}
              </span>
            ) : null}
          </div>
        </div>
        {hasFilterPanel && filtersOpen && !isMobileViewport
          ? filterPanel
          : null}
      </div>
      {hasFilterPanel && filtersOpen && isMobileViewport ? (
        <div
          aria-labelledby="feed-mobile-filters-title"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-end bg-background/80 p-3 backdrop-blur-sm lg:hidden"
          role="dialog"
        >
          <button
            aria-label={t('common.close')}
            className="absolute inset-0"
            onClick={() => setFiltersOpen(false)}
            type="button"
          />
          <section className="relative z-10 max-h-[78vh] w-full overflow-y-auto rounded-2xl border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3
                className="font-semibold text-foreground text-sm"
                id="feed-mobile-filters-title"
              >
                {showFiltersLabel}
              </h3>
              <button
                className="rounded-full border border-border bg-muted/70 px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition hover:border-primary/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => setFiltersOpen(false)}
                type="button"
              >
                {t('common.close')}
              </button>
            </div>
            {filterPanel}
            {hasActiveFilters ? (
              <div className="mt-3 flex items-center justify-end">
                <button
                  className="rounded-full border border-border bg-background/70 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:border-primary/45 hover:text-primary"
                  onClick={handleResetFilters}
                  type="button"
                >
                  {t('search.actions.resetFilters')}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
      {moreOpen && isMobileViewport ? (
        <div
          aria-labelledby="feed-mobile-more-title"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-end bg-background/80 p-3 backdrop-blur-sm lg:hidden"
          role="dialog"
        >
          <button
            aria-label={t('common.close')}
            className="absolute inset-0"
            onClick={() => setMoreOpen(false)}
            type="button"
          />
          <section className="relative z-10 max-h-[78vh] w-full overflow-y-auto rounded-2xl border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3
                className="font-semibold text-foreground text-sm"
                id="feed-mobile-more-title"
              >
                {moreLabel}
              </h3>
              <button
                className="rounded-full border border-border bg-muted/70 px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition hover:border-primary/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => setMoreOpen(false)}
                type="button"
              >
                {t('common.close')}
              </button>
            </div>
            <div className="grid gap-2">{morePanelContent}</div>
          </section>
        </div>
      ) : null}
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
                  className="card p-4 motion-safe:animate-pulse motion-reduce:animate-none"
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
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/65 text-muted-foreground">
                <Inbox aria-hidden="true" className="h-5 w-5" />
              </div>
              <div className="grid gap-1">
                <p className="font-semibold text-base text-foreground">
                  {emptyStateTitle}
                </p>
                <p>{emptyMessage}</p>
              </div>
              {hasActiveFilters ? (
                <div className="grid gap-2 rounded-xl border border-border bg-background/60 p-3">
                  <p className="font-semibold text-foreground text-xs uppercase tracking-wide">
                    {t('feedTabs.activeFilters')}: {activeFilterCount}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {activeFilterPills.map((pill) => (
                      <span
                        className="rounded-full border border-border bg-muted/70 px-2 py-1 text-[11px] text-muted-foreground"
                        key={pill}
                      >
                        {pill}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-start">
                    <button
                      className="rounded-full border border-border bg-background/70 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:border-primary/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      onClick={handleResetFilters}
                      type="button"
                    >
                      {t('search.actions.resetFilters')}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {active === 'Battles' ? (
                  <button
                    className="rounded-full border border-primary/45 bg-primary/10 px-4 py-2 font-semibold text-primary text-xs transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    onClick={openLiveDrafts}
                    type="button"
                  >
                    {t('feedTabs.emptyAction.openLiveDrafts')}
                  </button>
                ) : (
                  <>
                    <Link
                      className="rounded-full border border-primary/45 bg-primary/10 px-4 py-2 font-semibold text-primary text-xs transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      href="/demo"
                    >
                      {t('feedTabs.emptyAction.runDemo')}
                    </Link>
                    <Link
                      className="rounded-full border border-border bg-background/60 px-4 py-2 font-semibold text-foreground text-xs transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          className="rounded-full border border-border bg-muted/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:border-primary/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
          type="button"
        >
          {t('feedTabs.loadMore')}
        </button>
      )}
      {!(loading || fallbackUsed || hasMore) && visibleItems.length > 0 ? (
        <div
          className="inline-flex w-fit items-center rounded-full border border-border bg-background/70 px-3 py-1 text-muted-foreground text-xs"
          data-testid="feed-end-indicator"
        >
          {shownLabel}: {shownValue}
        </div>
      ) : null}
      {showBackToTop && (
        <button
          className={`fixed right-4 bottom-4 z-30 rounded-full border border-primary/45 bg-card px-4 py-2 font-semibold text-primary text-xs transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            isObserverMode ? 'lg:right-[22rem]' : ''
          }`}
          onClick={handleBackToTop}
          type="button"
        >
          <span className="inline-flex items-center gap-1">
            <ArrowUp aria-hidden="true" className="h-3 w-3" />
            {backToTopLabel}
          </span>
        </button>
      )}
    </section>
  );
};
