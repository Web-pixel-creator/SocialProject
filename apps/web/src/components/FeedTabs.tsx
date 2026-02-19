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
import {
  memo,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import { useLanguage } from '../contexts/LanguageContext';
import { apiClient } from '../lib/api';
import { getApiErrorMessage, getApiErrorStatus } from '../lib/errors';
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
import type { ObserverActionType } from './CardPrimitives';
import { ChangeCard } from './ChangeCard';
import { DraftCard } from './DraftCard';
import { GuildCard } from './GuildCard';
import { StudioCard } from './StudioCard';

const TABS = [
  'All',
  'Progress',
  'Changes',
  'For You',
  'Following',
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
const FEED_FOLLOWED_STORAGE_KEY = 'finishit-feed-followed-draft-ids';
const FEED_SAVED_STORAGE_KEY = 'finishit-feed-saved-draft-ids';
const FEED_RATED_STORAGE_KEY = 'finishit-feed-rated-draft-ids';
const AUTH_TOKEN_STORAGE_KEY = 'finishit_token';
const MOBILE_DENSITY_MEDIA_QUERY = '(max-width: 767px)';

type FeedDensity = 'comfort' | 'compact';
type BattlePredictionOutcome = 'merge' | 'reject';

interface BattlePredictionEntry {
  error: string | null;
  pending: boolean;
  predictedOutcome: BattlePredictionOutcome | null;
  pullRequestId: string | null;
  marketPoolPoints: number | null;
  mergeOdds: number | null;
  potentialMergePayout: number | null;
  potentialRejectPayout: number | null;
  rejectOdds: number | null;
  stakePoints: number | null;
}

const parseFeedDensity = (value: string | null): FeedDensity | null => {
  if (value === 'comfort' || value === 'compact') {
    return value;
  }
  return null;
};

const readStoredIdSet = (storageKey: string): Set<string> => {
  if (typeof window === 'undefined') {
    return new Set<string>();
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }
    return new Set(
      parsed.filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      ),
    );
  } catch (_error) {
    return new Set<string>();
  }
};

const writeStoredIdSet = (storageKey: string, ids: Set<string>): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids)));
};

const toggleIdInSet = (current: Set<string>, id: string): Set<string> => {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
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
const FOLLOWING_STATUS_OPTIONS = STATUS_OPTIONS.filter(
  (option) => option.value !== 'pr',
);

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

const asFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBattlePredictionMarket = (
  summary: unknown,
  stakePoints: number,
  fallbackPullRequestId: string | null,
): Pick<
  BattlePredictionEntry,
  | 'pullRequestId'
  | 'marketPoolPoints'
  | 'mergeOdds'
  | 'rejectOdds'
  | 'potentialMergePayout'
  | 'potentialRejectPayout'
> => {
  const summaryRecord =
    typeof summary === 'object' && summary !== null
      ? (summary as Record<string, unknown>)
      : null;
  const marketRecord =
    summaryRecord && typeof summaryRecord.market === 'object'
      ? (summaryRecord.market as Record<string, unknown>)
      : null;

  const pullRequestId =
    typeof summaryRecord?.pullRequestId === 'string'
      ? summaryRecord.pullRequestId
      : fallbackPullRequestId;

  const mergeStakePoints = Math.max(
    0,
    asFiniteNumber(marketRecord?.mergeStakePoints) ?? 0,
  );
  const rejectStakePoints = Math.max(
    0,
    asFiniteNumber(marketRecord?.rejectStakePoints) ?? 0,
  );
  const totalStakePoints =
    Math.max(0, asFiniteNumber(marketRecord?.totalStakePoints) ?? 0) ||
    mergeStakePoints + rejectStakePoints;

  const mergeOddsFallback =
    totalStakePoints > 0 ? mergeStakePoints / totalStakePoints : null;
  const rejectOddsFallback =
    totalStakePoints > 0 ? rejectStakePoints / totalStakePoints : null;

  const mergeOdds =
    asFiniteNumber(marketRecord?.mergeOdds) ?? mergeOddsFallback;
  const rejectOdds =
    asFiniteNumber(marketRecord?.rejectOdds) ?? rejectOddsFallback;

  const mergePayoutMultiplier =
    asFiniteNumber(marketRecord?.mergePayoutMultiplier) ??
    (mergeOdds && mergeOdds > 0 ? 1 / mergeOdds : 1);
  const rejectPayoutMultiplier =
    asFiniteNumber(marketRecord?.rejectPayoutMultiplier) ??
    (rejectOdds && rejectOdds > 0 ? 1 / rejectOdds : 1);

  return {
    pullRequestId,
    marketPoolPoints:
      totalStakePoints > 0 ? Math.round(totalStakePoints) : null,
    mergeOdds,
    rejectOdds,
    potentialMergePayout: Math.max(
      0,
      Math.round(Math.max(0, stakePoints) * mergePayoutMultiplier),
    ),
    potentialRejectPayout: Math.max(
      0,
      Math.round(Math.max(0, stakePoints) * rejectPayoutMultiplier),
    ),
  };
};

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

interface ObserverWatchlistResponseItem {
  draftId?: string;
}

interface ObserverDraftEngagementResponseItem {
  draftId?: string;
  isSaved?: boolean;
  isRated?: boolean;
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
    <div className="grid gap-3 rounded-2xl border border-border/25 bg-background/60 p-4 text-foreground/85 text-xs md:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-1">
        <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
          {labels.sort}
        </span>
        <select
          className="rounded-lg border border-border/25 bg-background/70 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          className="rounded-lg border border-border/25 bg-background/70 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          className="rounded-lg border border-border/25 bg-background/70 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          className="rounded-lg border border-border/25 bg-background/70 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
    <div className="grid gap-2 rounded-2xl border border-border/25 bg-background/60 p-3 text-foreground/85 text-xs">
      <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {battleFilterOptions.map((option) => (
          <button
            aria-pressed={battleFilter === option.value}
            className={`rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              battleFilter === option.value
                ? 'border border-primary/35 bg-primary/15 text-primary'
                : 'border border-transparent bg-background/56 text-muted-foreground hover:bg-background/74 hover:text-foreground'
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

interface FollowingFiltersProps {
  sort: FeedSort;
  status: FeedStatus;
  sortOptions: Array<{ value: FeedSort; label: string }>;
  statusOptions: Array<{ value: FeedStatus; label: string }>;
  labels: {
    sort: string;
    status: string;
  };
  onSortChange: (value: FeedSort) => void;
  onStatusChange: (value: FeedStatus) => void;
}

const FollowingFilters = memo(function FollowingFilters({
  sort,
  status,
  sortOptions,
  statusOptions,
  labels,
  onSortChange,
  onStatusChange,
}: FollowingFiltersProps) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border/25 bg-background/60 p-4 text-foreground/85 text-xs md:grid-cols-2">
      <label className="grid gap-1">
        <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
          {labels.sort}
        </span>
        <select
          className="rounded-lg border border-border/25 bg-background/70 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          className="rounded-lg border border-border/25 bg-background/70 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
    </div>
  );
});

interface ActiveFilterChipsProps {
  shownLabel: string;
  shownValue: string;
  filtersPanelId: string;
  hasFilterPanel: boolean;
  filtersOpen: boolean;
  showFiltersLabel: string;
  hasActiveFilters: boolean;
  activeFilterPills: string[];
  activeFilterCount: number;
  hasBattleFilterApplied: boolean;
  hasStatusFilterApplied: boolean;
  hasSortFilterApplied: boolean;
  hasRangeFilterApplied: boolean;
  hasIntentFilterApplied: boolean;
  labels: {
    activeFilters: string;
    resetFilters: string;
    openAllBattles: string;
    allStatuses: string;
    recency: string;
    last30Days: string;
    allIntents: string;
  };
  onResetBattleFilterQuick: () => void;
  onResetStatusFilterQuick: () => void;
  onResetSortFilterQuick: () => void;
  onResetRangeFilterQuick: () => void;
  onResetIntentFilterQuick: () => void;
  onResetFilters: () => void;
  onToggleFilters: () => void;
  filtersButtonRef: RefObject<HTMLButtonElement>;
}

const ActiveFilterChips = memo(function ActiveFilterChips({
  shownLabel,
  shownValue,
  filtersPanelId,
  hasFilterPanel,
  filtersOpen,
  showFiltersLabel,
  hasActiveFilters,
  activeFilterPills,
  activeFilterCount,
  hasBattleFilterApplied,
  hasStatusFilterApplied,
  hasSortFilterApplied,
  hasRangeFilterApplied,
  hasIntentFilterApplied,
  labels,
  onResetBattleFilterQuick,
  onResetStatusFilterQuick,
  onResetSortFilterQuick,
  onResetRangeFilterQuick,
  onResetIntentFilterQuick,
  onResetFilters,
  onToggleFilters,
  filtersButtonRef,
}: ActiveFilterChipsProps) {
  const hasSecondaryRow =
    hasActiveFilters ||
    hasBattleFilterApplied ||
    hasStatusFilterApplied ||
    hasSortFilterApplied ||
    hasRangeFilterApplied ||
    hasIntentFilterApplied;

  return (
    <div
      className={`grid text-muted-foreground text-xs ${
        hasSecondaryRow ? 'gap-2 pt-1.5' : 'gap-1 pt-1'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span
          aria-atomic="true"
          aria-live="polite"
          className="inline-flex w-fit items-center rounded-full border border-transparent bg-background/55 px-2.5 py-1 text-[11px] sm:text-xs"
        >
          {shownLabel}: {shownValue}
        </span>
        {hasFilterPanel ? (
          <button
            aria-controls={filtersPanelId}
            aria-expanded={filtersOpen}
            aria-keyshortcuts="Shift+F"
            className={`inline-flex min-h-8 w-fit flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:px-3.5 sm:py-1.5 sm:text-xs ${
              filtersOpen
                ? 'border-primary/35 bg-primary/10 text-primary'
                : 'border-transparent bg-background/52 text-muted-foreground hover:bg-background/74 hover:text-foreground'
            }`}
            onClick={onToggleFilters}
            ref={filtersButtonRef}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
            {showFiltersLabel}
            <ChevronDown
              aria-hidden="true"
              className={`h-3 w-3 transition-transform motion-reduce:transform-none motion-reduce:transition-none ${
                filtersOpen ? 'rotate-180' : ''
              }`}
            />
            {hasActiveFilters ? (
              <span
                aria-hidden="true"
                className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary"
              >
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
      {hasSecondaryRow ? (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pr-1 pb-0.5">
          {hasActiveFilters ? (
            <span
              className="flex-shrink-0 rounded-full bg-muted/58 px-2.5 py-1 font-semibold text-[11px]"
              title={activeFilterPills.join(' | ')}
            >
              {labels.activeFilters}: {activeFilterCount}
            </span>
          ) : null}
          {hasBattleFilterApplied ? (
            <button
              className="min-h-8 flex-shrink-0 rounded-full bg-muted/58 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:bg-muted/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={onResetBattleFilterQuick}
              type="button"
            >
              {labels.openAllBattles}
            </button>
          ) : null}
          {hasStatusFilterApplied ? (
            <button
              className="min-h-8 flex-shrink-0 rounded-full bg-muted/58 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:bg-muted/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={onResetStatusFilterQuick}
              type="button"
            >
              {labels.allStatuses}
            </button>
          ) : null}
          {hasSortFilterApplied ? (
            <button
              className="min-h-8 flex-shrink-0 rounded-full bg-muted/58 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:bg-muted/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={onResetSortFilterQuick}
              type="button"
            >
              {labels.recency}
            </button>
          ) : null}
          {hasRangeFilterApplied ? (
            <button
              className="min-h-8 flex-shrink-0 rounded-full bg-muted/58 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:bg-muted/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={onResetRangeFilterQuick}
              type="button"
            >
              {labels.last30Days}
            </button>
          ) : null}
          {hasIntentFilterApplied ? (
            <button
              className="min-h-8 flex-shrink-0 rounded-full bg-muted/58 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:bg-muted/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={onResetIntentFilterQuick}
              type="button"
            >
              {labels.allIntents}
            </button>
          ) : null}
          {hasActiveFilters ? (
            <button
              className="min-h-8 flex-shrink-0 rounded-full bg-muted/58 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:bg-muted/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={onResetFilters}
              type="button"
            >
              {labels.resetFilters}
            </button>
          ) : null}
        </div>
      ) : null}
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
    () => parseQueryState(new URLSearchParams(searchParamString)),
    [searchParamString],
  );
  const queryStateRef = useRef<FeedQueryState>(queryState);
  const pendingQueryStringRef = useRef<string | null>(null);

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
  const [followedDraftIds, setFollowedDraftIds] = useState<Set<string>>(() =>
    readStoredIdSet(FEED_FOLLOWED_STORAGE_KEY),
  );
  const [savedDraftIds, setSavedDraftIds] = useState<Set<string>>(() =>
    readStoredIdSet(FEED_SAVED_STORAGE_KEY),
  );
  const [ratedDraftIds, setRatedDraftIds] = useState<Set<string>>(() =>
    readStoredIdSet(FEED_RATED_STORAGE_KEY),
  );
  const [pendingFollowDraftIds, setPendingFollowDraftIds] = useState<
    Set<string>
  >(() => new Set<string>());
  const [pendingSaveDraftIds, setPendingSaveDraftIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [pendingRateDraftIds, setPendingRateDraftIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [pendingStudioFollowIds, setPendingStudioFollowIds] = useState<
    Set<string>
  >(() => new Set<string>());
  const [
    observerActionAuthRequiredByDraftId,
    setObserverActionAuthRequiredByDraftId,
  ] = useState<Record<string, string>>({});
  const [battlePredictions, setBattlePredictions] = useState<
    Record<string, BattlePredictionEntry>
  >({});
  const desktopMoreDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileMoreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMoreCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobileFiltersButtonRef = useRef<HTMLButtonElement>(null);
  const mobileFiltersCloseButtonRef = useRef<HTMLButtonElement>(null);
  const previousMoreOpenRef = useRef(false);
  const previousFiltersOpenRef = useRef(false);
  const isCompactDensity = density === 'compact';
  const normalizedQuery = useMemo(() => normalizeQuery(query), [query]);
  const hasSearchQuery = normalizedQuery.length > 0;
  const filterKey = `${active}|${sort}|${status}|${range}|${intent}|${normalizedQuery}`;
  let feedGridClass = 'grid gap-2.5';
  if (!isCompactDensity) {
    feedGridClass = STORY_TABS.has(active)
      ? 'grid gap-4'
      : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3';
  }
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
        Following: t('feedTabs.tab.following'),
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
  const localizedFollowingStatusOptions = useMemo(
    () =>
      FOLLOWING_STATUS_OPTIONS.map((option) => ({
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
  const desktopFilterPanelId = 'feed-desktop-filter-panel';
  const mobileFilterPanelId = 'feed-mobile-filters-panel';
  const desktopMorePanelId = 'feed-desktop-more-panel';
  const mobileMorePanelId = 'feed-mobile-more-panel';
  const shownLabel = t('feedTabs.shown');
  const backToTopLabel = t('feedTabs.backToTop');
  const densityLabel = t('feedTabs.density.label');
  const comfortLabel = t('feedTabs.density.comfort');
  const compactLabel = t('feedTabs.density.compact');
  const activeFilterLabels = useMemo(
    () => ({
      activeFilters: t('feedTabs.activeFilters'),
      resetFilters: t('search.actions.resetFilters'),
      openAllBattles: t('feedTabs.emptyAction.openAllBattles'),
      allStatuses: t('feedTabs.quickReset.allStatuses'),
      recency: t('search.sort.recency'),
      last30Days: t('search.range.last30Days'),
      allIntents: t('search.filters.allIntents'),
    }),
    [t],
  );

  const tabClass = (tab: string, isActive: boolean): string => {
    if (!isActive) {
      return 'border-transparent bg-background/52 text-muted-foreground hover:bg-background/72 hover:text-foreground';
    }
    if (tab === 'Hot Now') {
      return 'tag-hot';
    }
    if (tab === 'Live Drafts') {
      return 'tag-live';
    }
    return 'border-primary/45 bg-primary/12 text-primary';
  };

  useEffect(() => {
    const pendingQueryString = pendingQueryStringRef.current;
    if (
      pendingQueryString !== null &&
      searchParamString !== pendingQueryString
    ) {
      return;
    }

    pendingQueryStringRef.current = null;
    queryStateRef.current = queryState;
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
  }, [queryState, searchParamString]);

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

  useEffect(() => {
    writeStoredIdSet(FEED_SAVED_STORAGE_KEY, savedDraftIds);
  }, [savedDraftIds]);

  useEffect(() => {
    writeStoredIdSet(FEED_RATED_STORAGE_KEY, ratedDraftIds);
  }, [ratedDraftIds]);

  useEffect(() => {
    writeStoredIdSet(FEED_FOLLOWED_STORAGE_KEY, followedDraftIds);
  }, [followedDraftIds]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const hasStoredAuthToken = Boolean(
      window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY),
    );
    const authHeader = apiClient.defaults?.headers?.common?.Authorization;
    const hasAuthHeader =
      typeof authHeader === 'string' && authHeader.trim().length > 0;

    if (!(hasStoredAuthToken || hasAuthHeader)) {
      return;
    }

    let active = true;

    const syncObserverState = async () => {
      try {
        const [watchlistResponse, engagementsResponse] = await Promise.all([
          apiClient.get('/observers/watchlist'),
          apiClient.get('/observers/engagements'),
        ]);
        if (!active) {
          return;
        }

        const nextFollowedDraftIds = new Set<string>();
        const nextSavedDraftIds = new Set<string>();
        const nextRatedDraftIds = new Set<string>();

        const watchlistItems = Array.isArray(watchlistResponse.data)
          ? watchlistResponse.data
          : [];
        for (const item of watchlistItems) {
          const draftId = (item as ObserverWatchlistResponseItem).draftId;
          if (typeof draftId === 'string' && draftId.trim().length > 0) {
            nextFollowedDraftIds.add(draftId);
          }
        }

        const engagementItems = Array.isArray(engagementsResponse.data)
          ? engagementsResponse.data
          : [];
        for (const item of engagementItems) {
          const engagement = item as ObserverDraftEngagementResponseItem;
          const draftId = engagement.draftId;
          if (typeof draftId !== 'string' || draftId.trim().length === 0) {
            continue;
          }
          if (engagement.isSaved === true) {
            nextSavedDraftIds.add(draftId);
          }
          if (engagement.isRated === true) {
            nextRatedDraftIds.add(draftId);
          }
        }

        setFollowedDraftIds(nextFollowedDraftIds);
        setSavedDraftIds(nextSavedDraftIds);
        setRatedDraftIds(nextRatedDraftIds);
      } catch (error: unknown) {
        const status = getApiErrorStatus(error);
        if (status === 401 || status === 403) {
          return;
        }
      }
    };

    syncObserverState().catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

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
      const previous = queryStateRef.current;
      const next = {
        tab: updates.tab ?? previous.tab,
        sort: updates.sort ?? previous.sort,
        status: updates.status ?? previous.status,
        range: updates.range ?? previous.range,
        intent: updates.intent ?? previous.intent,
        query: (updates.query ?? previous.query).trim(),
      };

      if (
        next.tab === previous.tab &&
        next.sort === previous.sort &&
        next.status === previous.status &&
        next.range === previous.range &&
        next.intent === previous.intent &&
        next.query === previous.query
      ) {
        return;
      }

      queryStateRef.current = next;

      const params = new URLSearchParams();
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
      pendingQueryStringRef.current = queryString;
      router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [pathname, router],
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
    if (active !== 'Following' || status !== 'pr') {
      return;
    }
    setStatus(DEFAULT_STATUS);
    updateQuery({ status: DEFAULT_STATUS });
  }, [active, status, updateQuery]);

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
      const requestStatus =
        active === 'Following' && status === 'pr' ? DEFAULT_STATUS : status;
      if (normalizedQuery) {
        params.q = normalizedQuery;
      }
      if (active === 'All' || active === 'Following') {
        params.sort = sort;
        if (requestStatus !== DEFAULT_STATUS) {
          params.status = requestStatus;
        }
      }
      if (active === 'All') {
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
    if (hasSearchQuery) {
      return t('feedTabs.empty.search');
    }
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
  }, [active, hasSearchQuery, intent, t]);

  const emptyStateTitle = useMemo(() => {
    if (hasSearchQuery) {
      return t('feedTabs.empty.title.search');
    }
    if (active === 'Battles') {
      return t('feedTabs.empty.title.battles');
    }
    if (intent === 'needs_help') {
      return t('feedTabs.empty.title.needsHelp');
    }
    if (intent === 'seeking_pr') {
      return t('feedTabs.empty.title.seekingPr');
    }
    if (intent === 'ready_for_review') {
      return t('feedTabs.empty.title.readyForReview');
    }
    return t('feedTabs.empty.title');
  }, [active, hasSearchQuery, intent, t]);

  const openLiveDrafts = () => {
    handleTabSelect('Live Drafts');
    sendTelemetry({
      eventType: 'feed_empty_cta',
      action: 'open_live_drafts',
      sourceTab: active,
    });
  };

  const handleOpenAllBattles = useCallback(() => {
    setBattleFilter('all');
    setFiltersOpen(false);
    sendTelemetry({
      eventType: 'feed_empty_cta',
      action: 'open_all_battles',
      sourceTab: active,
    });
  }, [active]);

  const handleQueryChange = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
  }, []);

  const clearQuery = useCallback(() => {
    setQuery(DEFAULT_QUERY);
  }, []);

  const handleClearSearchFromEmptyState = useCallback(() => {
    setQuery(DEFAULT_QUERY);
    updateQuery({ query: DEFAULT_QUERY });
    sendTelemetry({
      eventType: 'feed_empty_cta',
      action: 'clear_search',
      sourceTab: active,
    });
  }, [active, updateQuery]);

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

  const handleResetBattleFilterQuick = useCallback(() => {
    setBattleFilter('all');
    sendTelemetry({
      eventType: 'feed_battle_filter',
      filter: 'all',
    });
  }, []);
  const handleResetStatusFilterQuick = useCallback(() => {
    setStatus(DEFAULT_STATUS);
    updateQuery({ status: DEFAULT_STATUS });
    sendTelemetry({
      eventType: 'feed_filter_change',
      sort,
      status: DEFAULT_STATUS,
      intent,
      range,
    });
  }, [intent, range, sort, updateQuery]);
  const handleResetSortFilterQuick = useCallback(() => {
    setSort(DEFAULT_SORT);
    updateQuery({ sort: DEFAULT_SORT });
    sendTelemetry({
      eventType: 'feed_filter_change',
      sort: DEFAULT_SORT,
      status,
      intent,
      range,
    });
  }, [intent, range, status, updateQuery]);
  const handleResetRangeFilterQuick = useCallback(() => {
    setRange(DEFAULT_RANGE);
    updateQuery({ range: DEFAULT_RANGE });
    sendTelemetry({
      eventType: 'feed_filter_change',
      sort,
      status,
      intent,
      range: DEFAULT_RANGE,
    });
  }, [intent, sort, status, updateQuery]);

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
  const handleDensityChange = useCallback(
    (next: FeedDensity) => {
      if (next === density) {
        return;
      }
      setDensity(next);
      sendTelemetry({
        eventType: 'feed_density_change',
        density: next,
        previousDensity: density,
        sourceTab: active,
      });
    },
    [active, density],
  );
  const handleProgressCardOpen = useCallback((draftId: string) => {
    sendTelemetry({
      eventType: 'feed_card_open',
      draftId,
      source: 'feed',
    });
  }, []);

  const handleBattlePredict = useCallback(
    async (
      draftId: string,
      outcome: BattlePredictionOutcome,
      stakePoints: number,
    ) => {
      if (!draftId) {
        return;
      }

      const roundedStake = Math.round(stakePoints);
      setBattlePredictions((current) => ({
        ...current,
        [draftId]: {
          ...current[draftId],
          error: null,
          pullRequestId: current[draftId]?.pullRequestId ?? null,
          marketPoolPoints: current[draftId]?.marketPoolPoints ?? null,
          mergeOdds: current[draftId]?.mergeOdds ?? null,
          pending: true,
          potentialMergePayout: current[draftId]?.potentialMergePayout ?? null,
          potentialRejectPayout:
            current[draftId]?.potentialRejectPayout ?? null,
          predictedOutcome: current[draftId]?.predictedOutcome ?? null,
          rejectOdds: current[draftId]?.rejectOdds ?? null,
          stakePoints:
            roundedStake > 0
              ? roundedStake
              : (current[draftId]?.stakePoints ?? 10),
        },
      }));

      try {
        const response = await apiClient.post(`/drafts/${draftId}/predict`, {
          predictedOutcome: outcome,
          stakePoints: roundedStake,
        });
        const pullRequestId =
          typeof response.data?.pullRequestId === 'string'
            ? response.data.pullRequestId
            : null;
        let marketSnapshot: ReturnType<typeof parseBattlePredictionMarket> = {
          pullRequestId,
          marketPoolPoints: null,
          mergeOdds: null,
          rejectOdds: null,
          potentialMergePayout: null,
          potentialRejectPayout: null,
        };

        if (pullRequestId) {
          try {
            const summaryResponse = await apiClient.get(
              `/pull-requests/${pullRequestId}/predictions`,
            );
            marketSnapshot = parseBattlePredictionMarket(
              summaryResponse.data,
              roundedStake,
              pullRequestId,
            );
          } catch (_summaryError) {
            // Keep successful prediction response even if summary refresh fails.
          }
        }

        setBattlePredictions((current) => ({
          ...current,
          [draftId]: {
            error: null,
            pending: false,
            predictedOutcome: outcome,
            ...marketSnapshot,
            stakePoints: roundedStake,
          },
        }));
        sendTelemetry({
          eventType: 'pr_prediction_submit',
          source: 'feed_battle_card',
          sourceTab: active,
          draftId,
          pullRequestId,
          predictedOutcome: outcome,
          stakePoints: roundedStake,
        });
      } catch (error: unknown) {
        const status = getApiErrorStatus(error);
        const message =
          status === 401 || status === 403
            ? t('prediction.signInRequired')
            : getApiErrorMessage(
                error,
                t('draftDetail.errors.submitPrediction'),
              );
        setBattlePredictions((current) => ({
          ...current,
          [draftId]: {
            ...current[draftId],
            error: message,
            pending: false,
            predictedOutcome: current[draftId]?.predictedOutcome ?? null,
            pullRequestId: current[draftId]?.pullRequestId ?? null,
            marketPoolPoints: current[draftId]?.marketPoolPoints ?? null,
            mergeOdds: current[draftId]?.mergeOdds ?? null,
            rejectOdds: current[draftId]?.rejectOdds ?? null,
            potentialMergePayout:
              current[draftId]?.potentialMergePayout ?? null,
            potentialRejectPayout:
              current[draftId]?.potentialRejectPayout ?? null,
            stakePoints: current[draftId]?.stakePoints ?? roundedStake,
          },
        }));
      }
    },
    [active, t],
  );

  const handleObserverAction = useCallback(
    async (action: ObserverActionType, draftId: string) => {
      if (!draftId) {
        return;
      }

      const clearObserverAuthRequiredNotice = () => {
        setObserverActionAuthRequiredByDraftId((current) => {
          if (!(draftId in current)) {
            return current;
          }
          const { [draftId]: _removed, ...rest } = current;
          return rest;
        });
      };

      if (action === 'watch' || action === 'compare') {
        if (typeof window !== 'undefined') {
          const targetUrl =
            action === 'compare'
              ? `/drafts/${draftId}?view=compare`
              : `/drafts/${draftId}`;
          window.location.assign(targetUrl);
        }
        sendTelemetry({
          eventType: 'feed_card_open',
          draftId,
          source: 'feed',
          action,
          sourceTab: active,
        });
        return;
      }

      if (action === 'save') {
        if (pendingSaveDraftIds.has(draftId)) {
          return;
        }

        clearObserverAuthRequiredNotice();
        const wasSaved = savedDraftIds.has(draftId);
        const nextSaved = !wasSaved;
        setSavedDraftIds((current) => toggleIdInSet(current, draftId));
        setPendingSaveDraftIds((current) => {
          const next = new Set(current);
          next.add(draftId);
          return next;
        });

        let shouldPersistToggle = true;
        let authRequired = false;
        try {
          if (nextSaved) {
            await apiClient.post(`/observers/engagements/${draftId}/save`);
          } else {
            await apiClient.delete(`/observers/engagements/${draftId}/save`);
          }
        } catch (error: unknown) {
          const status = getApiErrorStatus(error);
          authRequired = status === 401 || status === 403;
          shouldPersistToggle = authRequired;
          if (authRequired) {
            setObserverActionAuthRequiredByDraftId((current) => ({
              ...current,
              [draftId]: t('observerAction.authRequired'),
            }));
          }
        } finally {
          setPendingSaveDraftIds((current) => {
            const next = new Set(current);
            next.delete(draftId);
            return next;
          });
        }

        if (!shouldPersistToggle) {
          if (wasSaved !== nextSaved) {
            setSavedDraftIds((current) => toggleIdInSet(current, draftId));
          }
          clearObserverAuthRequiredNotice();
          return;
        }

        if (!authRequired) {
          clearObserverAuthRequiredNotice();
        }

        sendTelemetry({
          eventType: 'feed_card_open',
          draftId,
          source: 'feed',
          action: nextSaved ? 'save_on' : 'save_off',
          sourceTab: active,
        });
        return;
      }

      if (action === 'rate') {
        if (pendingRateDraftIds.has(draftId)) {
          return;
        }

        clearObserverAuthRequiredNotice();
        const wasRated = ratedDraftIds.has(draftId);
        const nextRated = !wasRated;
        setRatedDraftIds((current) => toggleIdInSet(current, draftId));
        setPendingRateDraftIds((current) => {
          const next = new Set(current);
          next.add(draftId);
          return next;
        });

        let shouldPersistToggle = true;
        let authRequired = false;
        try {
          if (nextRated) {
            await apiClient.post(`/observers/engagements/${draftId}/rate`);
          } else {
            await apiClient.delete(`/observers/engagements/${draftId}/rate`);
          }
        } catch (error: unknown) {
          const status = getApiErrorStatus(error);
          authRequired = status === 401 || status === 403;
          shouldPersistToggle = authRequired;
          if (authRequired) {
            setObserverActionAuthRequiredByDraftId((current) => ({
              ...current,
              [draftId]: t('observerAction.authRequired'),
            }));
          }
        } finally {
          setPendingRateDraftIds((current) => {
            const next = new Set(current);
            next.delete(draftId);
            return next;
          });
        }

        if (!shouldPersistToggle) {
          if (wasRated !== nextRated) {
            setRatedDraftIds((current) => toggleIdInSet(current, draftId));
          }
          clearObserverAuthRequiredNotice();
          return;
        }

        if (!authRequired) {
          clearObserverAuthRequiredNotice();
        }

        sendTelemetry({
          eventType: 'feed_card_open',
          draftId,
          source: 'feed',
          action: nextRated ? 'rate_on' : 'rate_off',
          sourceTab: active,
        });
        return;
      }

      if (pendingFollowDraftIds.has(draftId)) {
        return;
      }

      clearObserverAuthRequiredNotice();
      const wasFollowed = followedDraftIds.has(draftId);
      const nextFollowed = !wasFollowed;
      setFollowedDraftIds((current) => toggleIdInSet(current, draftId));
      setPendingFollowDraftIds((current) => {
        const next = new Set(current);
        next.add(draftId);
        return next;
      });

      let shouldPersistToggle = true;
      let authRequired = false;
      try {
        if (nextFollowed) {
          await apiClient.post(`/observers/watchlist/${draftId}`);
        } else {
          await apiClient.delete(`/observers/watchlist/${draftId}`);
        }
      } catch (error: unknown) {
        const status = getApiErrorStatus(error);
        authRequired = status === 401 || status === 403;
        shouldPersistToggle = authRequired;
        if (authRequired) {
          setObserverActionAuthRequiredByDraftId((current) => ({
            ...current,
            [draftId]: t('observerAction.authRequired'),
          }));
        }
      } finally {
        setPendingFollowDraftIds((current) => {
          const next = new Set(current);
          next.delete(draftId);
          return next;
        });
      }

      if (!shouldPersistToggle) {
        setFollowedDraftIds((current) => toggleIdInSet(current, draftId));
        clearObserverAuthRequiredNotice();
        return;
      }

      if (!authRequired) {
        clearObserverAuthRequiredNotice();
      }

      sendTelemetry({
        eventType: nextFollowed ? 'watchlist_follow' : 'watchlist_unfollow',
        draftId,
        source: 'feed',
        sourceTab: active,
      });
    },
    [
      active,
      followedDraftIds,
      pendingFollowDraftIds,
      pendingRateDraftIds,
      pendingSaveDraftIds,
      ratedDraftIds,
      savedDraftIds,
      t,
    ],
  );

  const handleStudioFollowToggle = useCallback(
    async (studioId: string, isFollowing: boolean) => {
      if (!studioId || pendingStudioFollowIds.has(studioId)) {
        return;
      }

      const nextFollowing = !isFollowing;
      const delta = nextFollowing ? 1 : -1;

      setPendingStudioFollowIds((current) => {
        const next = new Set(current);
        next.add(studioId);
        return next;
      });
      setItems((previous) =>
        previous.map((item) => {
          if (item.kind !== 'studio' || item.id !== studioId) {
            return item;
          }
          const nextFollowerCount = Math.max(
            0,
            (item.followerCount ?? 0) + delta,
          );
          return {
            ...item,
            isFollowing: nextFollowing,
            followerCount: nextFollowerCount,
          };
        }),
      );

      let succeeded = true;
      try {
        if (nextFollowing) {
          await apiClient.post(`/studios/${studioId}/follow`);
        } else {
          await apiClient.delete(`/studios/${studioId}/follow`);
        }
      } catch (_error) {
        succeeded = false;
      } finally {
        setPendingStudioFollowIds((current) => {
          const next = new Set(current);
          next.delete(studioId);
          return next;
        });
      }

      if (!succeeded) {
        setItems((previous) =>
          previous.map((item) => {
            if (item.kind !== 'studio' || item.id !== studioId) {
              return item;
            }
            const revertedFollowerCount = Math.max(
              0,
              (item.followerCount ?? 0) - delta,
            );
            return {
              ...item,
              isFollowing,
              followerCount: revertedFollowerCount,
            };
          }),
        );
        return;
      }

      if (active === 'Following' && !nextFollowing) {
        setItems((previous) =>
          previous.filter(
            (item) => item.kind !== 'studio' || item.id !== studioId,
          ),
        );
      }
    },
    [active, pendingStudioFollowIds],
  );

  const pendingObserverActionForDraft = useCallback(
    (draftId: string): ObserverActionType | null => {
      if (pendingFollowDraftIds.has(draftId)) {
        return 'follow';
      }
      if (pendingSaveDraftIds.has(draftId)) {
        return 'save';
      }
      if (pendingRateDraftIds.has(draftId)) {
        return 'rate';
      }
      return null;
    },
    [pendingFollowDraftIds, pendingRateDraftIds, pendingSaveDraftIds],
  );

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
              isFollowPending={pendingStudioFollowIds.has(item.id)}
              key={item.id ?? `studio-${index}`}
              onToggleFollow={() =>
                handleStudioFollowToggle(item.id, item.isFollowing ?? false)
              }
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
              fromFollowingStudio={active === 'Following'}
              glowUpScore={item.glowUpScore}
              hotScore={item.hotScore}
              id={item.id}
              key={item.id ?? `hot-${index}`}
              observerActionPending={pendingObserverActionForDraft(item.id)}
              observerActionState={{
                follow: followedDraftIds.has(item.id),
                rate: ratedDraftIds.has(item.id),
                save: savedDraftIds.has(item.id),
              }}
              observerAuthRequiredMessage={
                observerActionAuthRequiredByDraftId[item.id] ?? null
              }
              onObserverAction={(action) =>
                handleObserverAction(action, item.id)
              }
              provenance={item.provenance}
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
              observerActionPending={pendingObserverActionForDraft(
                item.draftId,
              )}
              observerActionState={{
                follow: followedDraftIds.has(item.draftId),
                rate: ratedDraftIds.has(item.draftId),
                save: savedDraftIds.has(item.draftId),
              }}
              observerAuthRequiredMessage={
                observerActionAuthRequiredByDraftId[item.draftId] ?? null
              }
              onObserverAction={(action) =>
                handleObserverAction(action, item.draftId)
              }
              onOpen={() => handleProgressCardOpen(item.draftId)}
            />
          );
        }
        if (item.kind === 'battle') {
          const battlePrediction = battlePredictions[item.id] ?? {
            error: null,
            marketPoolPoints: null,
            mergeOdds: null,
            pending: false,
            potentialMergePayout: null,
            potentialRejectPayout: null,
            predictedOutcome: null,
            pullRequestId: null,
            rejectOdds: null,
            stakePoints: 10,
          };
          return (
            <BattleCard
              compact={isCompactDensity}
              key={item.id ?? `battle-${index}`}
              observerActionPending={pendingObserverActionForDraft(item.id)}
              observerActionState={{
                follow: followedDraftIds.has(item.id),
                rate: ratedDraftIds.has(item.id),
                save: savedDraftIds.has(item.id),
              }}
              observerAuthRequiredMessage={
                observerActionAuthRequiredByDraftId[item.id] ?? null
              }
              onObserverAction={(action) =>
                handleObserverAction(action, item.id)
              }
              onPredict={(outcome, stakePoints) =>
                handleBattlePredict(item.id, outcome, stakePoints)
              }
              predictionState={{
                error: battlePrediction.error,
                latestOutcome: battlePrediction.predictedOutcome,
                marketPoolPoints: battlePrediction.marketPoolPoints,
                mergeOdds: battlePrediction.mergeOdds,
                latestStakePoints: battlePrediction.stakePoints,
                pending: battlePrediction.pending,
                potentialMergePayout: battlePrediction.potentialMergePayout,
                potentialRejectPayout: battlePrediction.potentialRejectPayout,
                rejectOdds: battlePrediction.rejectOdds,
              }}
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
            fromFollowingStudio={active === 'Following'}
            key={item.id ?? `draft-${index}`}
            observerActionPending={pendingObserverActionForDraft(item.id)}
            observerActionState={{
              follow: followedDraftIds.has(item.id),
              rate: ratedDraftIds.has(item.id),
              save: savedDraftIds.has(item.id),
            }}
            observerAuthRequiredMessage={
              observerActionAuthRequiredByDraftId[item.id] ?? null
            }
            onObserverAction={(action) => handleObserverAction(action, item.id)}
            {...item}
          />
        );
      }),
    [
      active,
      battlePredictions,
      followedDraftIds,
      handleBattlePredict,
      handleStudioFollowToggle,
      handleObserverAction,
      handleProgressCardOpen,
      isCompactDensity,
      observerActionAuthRequiredByDraftId,
      pendingObserverActionForDraft,
      pendingStudioFollowIds,
      ratedDraftIds,
      savedDraftIds,
      visibleItems,
    ],
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

    if (active === 'Following') {
      return (
        <FollowingFilters
          labels={filterLabels}
          onSortChange={handleSortChange}
          onStatusChange={handleStatusChange}
          sort={sort}
          sortOptions={localizedSortOptions}
          status={status}
          statusOptions={localizedFollowingStatusOptions}
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
    localizedFollowingStatusOptions,
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
    const supportsSortAndStatusFilters =
      active === 'All' || active === 'Following';

    if (supportsSortAndStatusFilters) {
      if (sort !== DEFAULT_SORT) {
        pills.push(`${filterLabels.sort}: ${sortLabel(sort)}`);
      }
      if (status !== DEFAULT_STATUS) {
        pills.push(`${filterLabels.status}: ${statusLabel(status)}`);
      }
    }

    if (active === 'All') {
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

  const hasFilterPanel =
    active === 'All' || active === 'Battles' || active === 'Following';
  const supportsSortAndStatusFilters =
    active === 'All' || active === 'Following';
  const hasBattleFilterApplied = active === 'Battles' && battleFilter !== 'all';
  const hasIntentFilterApplied = active === 'All' && intent !== DEFAULT_INTENT;
  const hasStatusFilterApplied =
    supportsSortAndStatusFilters && status !== DEFAULT_STATUS;
  const hasSortFilterApplied =
    supportsSortAndStatusFilters && sort !== DEFAULT_SORT;
  const hasRangeFilterApplied = active === 'All' && range !== DEFAULT_RANGE;
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

  useEffect(() => {
    const wasOpen = previousMoreOpenRef.current;
    if (!isMobileViewport) {
      previousMoreOpenRef.current = moreOpen;
      return;
    }

    if (moreOpen && !wasOpen) {
      window.requestAnimationFrame(() => {
        mobileMoreCloseButtonRef.current?.focus();
      });
    }

    if (!moreOpen && wasOpen) {
      window.requestAnimationFrame(() => {
        mobileMoreButtonRef.current?.focus();
      });
    }

    previousMoreOpenRef.current = moreOpen;
  }, [isMobileViewport, moreOpen]);

  useEffect(() => {
    const wasOpen = previousFiltersOpenRef.current;
    if (!isMobileViewport) {
      previousFiltersOpenRef.current = filtersOpen;
      return;
    }

    if (filtersOpen && !wasOpen) {
      window.requestAnimationFrame(() => {
        mobileFiltersCloseButtonRef.current?.focus();
      });
    }

    if (!filtersOpen && wasOpen) {
      window.requestAnimationFrame(() => {
        mobileFiltersButtonRef.current?.focus();
      });
    }

    previousFiltersOpenRef.current = filtersOpen;
  }, [filtersOpen, isMobileViewport]);

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
            className={`rounded-lg px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              active === tab
                ? 'border border-primary/35 bg-primary/15 text-primary'
                : 'border border-transparent bg-background/56 text-muted-foreground hover:bg-background/74 hover:text-foreground'
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
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <span
          className="rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-[11px] text-muted-foreground"
          title={activeFilterPills.join(' | ')}
        >
          {activeFilterLabels.activeFilters}: {activeFilterCount}
        </span>
        {hasActiveFilters ? (
          <button
            className="min-h-8 rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:bg-background/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
    <section className="grid gap-2.5 sm:gap-3">
      <div className="grid gap-2 sm:gap-2.5">
        <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="no-scrollbar flex min-w-0 snap-x snap-mandatory items-center gap-1.5 overflow-x-auto rounded-2xl bg-card/48 p-0.5 pr-1 sm:snap-none sm:p-1 sm:pr-1.5">
            {PRIMARY_TABS.map((tab) => (
              <button
                aria-pressed={active === tab}
                className={`min-h-8 flex-shrink-0 snap-start rounded-full border px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:px-4 sm:py-2 sm:text-xs ${tabClass(
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
                aria-controls={mobileMorePanelId}
                aria-expanded={moreOpen}
                className={`inline-flex min-h-8 flex-shrink-0 snap-start items-center gap-1 rounded-full border px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:px-4 sm:py-2 sm:text-xs ${
                  MORE_TABS.includes(active)
                    ? 'border-primary/45 bg-primary/12 text-primary'
                    : 'border-transparent bg-card/48 text-muted-foreground hover:bg-card/68 hover:text-foreground'
                }`}
                onClick={() => {
                  setMoreOpen((previous) => !previous);
                  setFiltersOpen(false);
                }}
                ref={mobileMoreButtonRef}
                type="button"
              >
                {moreLabel}
                <ChevronDown
                  aria-hidden="true"
                  className={`h-3 w-3 transition-transform motion-reduce:transform-none motion-reduce:transition-none ${
                    moreOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            ) : null}
          </div>
          {isMobileViewport ? null : (
            <div className="flex justify-end">
              <details
                className="relative"
                data-testid="feed-more-details"
                onToggle={(event) => {
                  setDesktopMoreOpen(event.currentTarget.open);
                }}
                ref={desktopMoreDetailsRef}
              >
                <summary
                  aria-controls={desktopMorePanelId}
                  className={`inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-full border px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:px-4 sm:py-2 sm:text-xs [&::-webkit-details-marker]:hidden ${
                    MORE_TABS.includes(active)
                      ? 'border-primary/45 bg-primary/12 text-primary'
                      : 'border-transparent bg-card/48 text-muted-foreground hover:bg-card/68 hover:text-foreground'
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
                <div
                  className="absolute right-0 z-20 mt-2 grid min-w-[16rem] gap-2 rounded-2xl border border-border/25 bg-card/95 p-2 sm:p-2.5"
                  id={desktopMorePanelId}
                >
                  {morePanelContent}
                </div>
              </details>
            </div>
          )}
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-border/25 bg-card/68 p-2 sm:gap-2 sm:p-2.5">
          <div className="grid gap-1.5 min-[360px]:grid-cols-[minmax(0,1fr)_auto] min-[360px]:items-center">
            <label className="group relative flex min-h-9 w-full min-w-0 items-center gap-2 rounded-full border border-border/25 bg-background/70 px-3 py-2 text-muted-foreground text-xs transition focus-within:border-primary/35 focus-within:bg-background hover:border-border/45 hover:bg-background/74 sm:px-3.5 sm:py-2.5">
              <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <input
                aria-keyshortcuts="/"
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
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground transition hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={clearQuery}
                  type="button"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="hidden rounded-md bg-background/75 px-1.5 py-0.5 font-semibold text-[10px] text-muted-foreground uppercase transition group-focus-within:inline sm:inline">
                  Esc
                </span>
              )}
            </label>
            {isMobileViewport ? null : (
              <fieldset className="inline-flex w-fit items-center gap-1 rounded-full border border-transparent bg-background/42 p-0.5 min-[360px]:justify-self-end">
                <legend className="sr-only">{densityLabel}</legend>
                <button
                  aria-pressed={density === 'comfort'}
                  className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:px-3.5 sm:py-2 ${
                    density === 'comfort'
                      ? 'border border-primary/35 bg-primary/10 text-primary'
                      : 'border border-transparent bg-background/34 text-muted-foreground hover:bg-background/56 hover:text-foreground'
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
                  className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:px-3.5 sm:py-2 ${
                    density === 'compact'
                      ? 'border border-primary/35 bg-primary/10 text-primary'
                      : 'border border-transparent bg-background/34 text-muted-foreground hover:bg-background/56 hover:text-foreground'
                  }`}
                  onClick={() => handleDensityChange('compact')}
                  type="button"
                >
                  <Rows3 aria-hidden="true" className="h-3 w-3" />
                  <span className="hidden sm:inline">{compactLabel}</span>
                  <span className="sr-only sm:hidden">{compactLabel}</span>
                </button>
              </fieldset>
            )}
          </div>
          <ActiveFilterChips
            activeFilterCount={activeFilterCount}
            activeFilterPills={activeFilterPills}
            filtersButtonRef={mobileFiltersButtonRef}
            filtersOpen={filtersOpen}
            filtersPanelId={
              isMobileViewport ? mobileFilterPanelId : desktopFilterPanelId
            }
            hasActiveFilters={hasActiveFilters}
            hasBattleFilterApplied={hasBattleFilterApplied}
            hasFilterPanel={hasFilterPanel}
            hasIntentFilterApplied={hasIntentFilterApplied}
            hasRangeFilterApplied={hasRangeFilterApplied}
            hasSortFilterApplied={hasSortFilterApplied}
            hasStatusFilterApplied={hasStatusFilterApplied}
            labels={activeFilterLabels}
            onResetBattleFilterQuick={handleResetBattleFilterQuick}
            onResetFilters={handleResetFilters}
            onResetIntentFilterQuick={() => handleIntentChange(DEFAULT_INTENT)}
            onResetRangeFilterQuick={handleResetRangeFilterQuick}
            onResetSortFilterQuick={handleResetSortFilterQuick}
            onResetStatusFilterQuick={handleResetStatusFilterQuick}
            onToggleFilters={() => {
              setFiltersOpen((previous) => !previous);
              if (isMobileViewport) {
                setMoreOpen(false);
              }
            }}
            showFiltersLabel={showFiltersLabel}
            shownLabel={shownLabel}
            shownValue={shownValue}
          />
        </div>
        {hasFilterPanel && filtersOpen && !isMobileViewport ? (
          <div id={desktopFilterPanelId}>{filterPanel}</div>
        ) : null}
      </div>
      {hasFilterPanel && filtersOpen && isMobileViewport ? (
        <div
          aria-labelledby="feed-mobile-filters-title"
          aria-modal="true"
          className="overlay-backdrop fixed inset-0 z-[70] flex items-end p-3 backdrop-blur-sm lg:hidden"
          role="dialog"
        >
          <button
            aria-hidden="true"
            aria-label={t('common.close')}
            className="absolute inset-0"
            onClick={() => setFiltersOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <section
            className="relative z-10 max-h-[78vh] w-full overflow-y-auto rounded-2xl border border-border/25 bg-card p-2.5 sm:p-3"
            id={mobileFilterPanelId}
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-2 h-1 w-12 rounded-full bg-border/55"
            />
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h3
                className="font-semibold text-foreground text-sm"
                id="feed-mobile-filters-title"
              >
                {showFiltersLabel}
              </h3>
              <div className="flex items-center gap-1.5">
                {hasActiveFilters ? (
                  <button
                    className="rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:bg-background/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    onClick={handleResetFilters}
                    type="button"
                  >
                    {t('search.actions.resetFilters')}
                  </button>
                ) : null}
                <button
                  className="rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition hover:bg-background/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={() => setFiltersOpen(false)}
                  ref={mobileFiltersCloseButtonRef}
                  type="button"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
            <div className="grid gap-2">{filterPanel}</div>
          </section>
        </div>
      ) : null}
      {moreOpen && isMobileViewport ? (
        <div
          aria-labelledby="feed-mobile-more-title"
          aria-modal="true"
          className="overlay-backdrop fixed inset-0 z-[70] flex items-end p-3 backdrop-blur-sm lg:hidden"
          role="dialog"
        >
          <button
            aria-hidden="true"
            aria-label={t('common.close')}
            className="absolute inset-0"
            onClick={() => setMoreOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <section
            className="relative z-10 max-h-[78vh] w-full overflow-y-auto rounded-2xl border border-border/25 bg-card p-2.5 sm:p-3"
            id={mobileMorePanelId}
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-2 h-1 w-12 rounded-full bg-border/55"
            />
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h3
                className="font-semibold text-foreground text-sm"
                id="feed-mobile-more-title"
              >
                {moreLabel}
              </h3>
              <button
                className="rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition hover:bg-background/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => setMoreOpen(false)}
                ref={mobileMoreCloseButtonRef}
                type="button"
              >
                {t('common.close')}
              </button>
            </div>
            <div className="mb-2.5 grid gap-1.5 rounded-xl border border-border/25 bg-background/58 p-2">
              <p className="px-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
                {densityLabel}
              </p>
              <fieldset className="inline-flex w-fit items-center gap-1 rounded-full border border-transparent bg-background/42 p-0.5">
                <legend className="sr-only">{densityLabel}</legend>
                <button
                  aria-pressed={density === 'comfort'}
                  className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    density === 'comfort'
                      ? 'border border-primary/35 bg-primary/10 text-primary'
                      : 'border border-transparent bg-background/34 text-muted-foreground hover:bg-background/56 hover:text-foreground'
                  }`}
                  onClick={() => handleDensityChange('comfort')}
                  type="button"
                >
                  <LayoutGrid aria-hidden="true" className="h-3 w-3" />
                  {comfortLabel}
                </button>
                <button
                  aria-pressed={density === 'compact'}
                  className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    density === 'compact'
                      ? 'border border-primary/35 bg-primary/10 text-primary'
                      : 'border border-transparent bg-background/34 text-muted-foreground hover:bg-background/56 hover:text-foreground'
                  }`}
                  onClick={() => handleDensityChange('compact')}
                  type="button"
                >
                  <Rows3 aria-hidden="true" className="h-3 w-3" />
                  {compactLabel}
                </button>
              </fieldset>
            </div>
            <div className="grid gap-2">{morePanelContent}</div>
          </section>
        </div>
      ) : null}
      <div
        aria-live="polite"
        className="flex flex-wrap items-center gap-2.5 text-muted-foreground text-xs"
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
                  className="card grid gap-2.5 p-3 motion-safe:animate-pulse motion-reduce:animate-none sm:p-4"
                  key={`feed-skeleton-${index + 1}`}
                >
                  <div className="h-3 w-24 rounded bg-muted/85" />
                  <div className="h-32 rounded-lg bg-muted/75 sm:h-36" />
                  <div className="h-2.5 w-2/3 rounded bg-muted/85" />
                  <div className="h-2.5 w-1/2 rounded bg-muted/80" />
                </article>
              ))}
            </div>
          );
        }

        if (visibleItems.length === 0) {
          return (
            <div className="card grid gap-3 p-4 text-sm sm:gap-3.5 sm:p-5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/25 bg-background/58 text-muted-foreground">
                <Inbox aria-hidden="true" className="h-5 w-5" />
              </div>
              <div className="grid gap-1">
                <p className="font-semibold text-base text-foreground">
                  {emptyStateTitle}
                </p>
                <p>{emptyMessage}</p>
              </div>
              {hasActiveFilters ? (
                <div className="grid gap-2 rounded-xl border border-border/25 bg-background/52 p-2.5 sm:p-3">
                  <p className="font-semibold text-foreground text-xs uppercase tracking-wide">
                    {t('feedTabs.activeFilters')}: {activeFilterCount}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {activeFilterPills.map((pill) => (
                      <span
                        className="rounded-full border border-border/25 bg-background/60 px-2 py-1 text-[11px] text-muted-foreground"
                        key={pill}
                      >
                        {pill}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {hasSearchQuery ? (
                      <button
                        className="rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:bg-background/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        onClick={handleClearSearchFromEmptyState}
                        type="button"
                      >
                        {t('feedTabs.emptyAction.clearSearch')}
                      </button>
                    ) : null}
                    <button
                      className="rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-[11px] text-foreground transition hover:bg-background/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      onClick={handleResetFilters}
                      type="button"
                    >
                      {t('search.actions.resetFilters')}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {active === 'Battles' ? (
                  <>
                    {hasBattleFilterApplied ? (
                      <button
                        className="rounded-full border border-primary/35 bg-primary/10 px-4 py-2 font-semibold text-primary text-xs transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        onClick={handleOpenAllBattles}
                        type="button"
                      >
                        {t('feedTabs.emptyAction.openAllBattles')}
                      </button>
                    ) : null}
                    <button
                      className="rounded-full border border-primary/35 bg-primary/10 px-4 py-2 font-semibold text-primary text-xs transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      onClick={openLiveDrafts}
                      type="button"
                    >
                      {t('feedTabs.emptyAction.openLiveDrafts')}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      className="rounded-full border border-primary/35 bg-primary/10 px-4 py-2 font-semibold text-primary text-xs transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      href="/demo"
                    >
                      {t('feedTabs.emptyAction.runDemo')}
                    </Link>
                    <Link
                      className="rounded-full border border-transparent bg-background/58 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          <div className={feedGridClass} data-testid="feed-items-grid">
            {renderedItems}
          </div>
        );
      })()}
      {!fallbackUsed && hasMore && (
        <button
          className="rounded-full border border-transparent bg-background/58 px-4 py-2 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
          type="button"
        >
          {t('feedTabs.loadMore')}
        </button>
      )}
      {!(loading || fallbackUsed || hasMore) && visibleItems.length > 0 ? (
        <div
          className="inline-flex w-fit items-center rounded-full border border-border/25 bg-background/60 px-3 py-1.5 text-muted-foreground text-xs"
          data-testid="feed-end-indicator"
        >
          {shownLabel}: {shownValue}
        </div>
      ) : null}
      {showBackToTop && (
        <button
          className="fixed right-4 bottom-4 z-30 rounded-full border border-primary/35 bg-card px-4 py-2 font-semibold text-primary text-xs transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:right-[22rem]"
          data-testid="feed-back-to-top"
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
