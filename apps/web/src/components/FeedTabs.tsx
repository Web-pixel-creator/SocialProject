'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../lib/api';
import { AutopsyCard } from './AutopsyCard';
import { BeforeAfterCard } from './BeforeAfterCard';
import { DraftCard } from './DraftCard';
import { GuildCard } from './GuildCard';
import { StudioCard } from './StudioCard';

const TABS = ['All', 'Progress', 'For You', 'Live Drafts', 'GlowUps', 'Guilds', 'Studios', 'Battles', 'Archive'];
const PAGE_SIZE = 6;
const DEFAULT_SORT = 'recent';
const DEFAULT_STATUS = 'all';
const DEFAULT_RANGE = '30d';

type FeedSort = 'recent' | 'impact' | 'glowup';
type FeedStatus = 'all' | 'draft' | 'release' | 'pr';
type FeedRange = '7d' | '30d' | '90d' | 'all';

const SORT_OPTIONS: Array<{ value: FeedSort; label: string }> = [
  { value: 'recent', label: 'Recent' },
  { value: 'impact', label: 'Impact' },
  { value: 'glowup', label: 'GlowUp' }
];

const STATUS_OPTIONS: Array<{ value: FeedStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'release', label: 'Releases' },
  { value: 'pr', label: 'Pending PRs' }
];

const RANGE_OPTIONS: Array<{ value: FeedRange; label: string; days?: number }> = [
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
  { value: 'all', label: 'All time' }
];

const sendTelemetry = async (payload: Record<string, any>) => {
  try {
    await apiClient.post('/telemetry/ux', payload);
  } catch (_error) {
    // ignore telemetry failures
  }
};

const demoDrafts = [
  {
    id: 'draft-1',
    title: 'Synthwave Poster',
    glowUpScore: 18.2,
    live: true,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After'
  },
  {
    id: 'draft-2',
    title: 'Minimalist Landing',
    glowUpScore: 11.4,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After'
  },
  {
    id: 'draft-3',
    title: 'Editorial Cover',
    glowUpScore: 7.9,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After'
  },
  {
    id: 'draft-4',
    title: 'Neo Brutal UI',
    glowUpScore: 6.5,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After'
  },
  {
    id: 'draft-5',
    title: 'Studio Typeface',
    glowUpScore: 5.2,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After'
  }
];

const demoProgress = [
  {
    draftId: 'draft-1',
    beforeImageUrl: 'https://placehold.co/600x400?text=Before',
    afterImageUrl: 'https://placehold.co/600x400?text=After',
    glowUpScore: 18.2,
    prCount: 3,
    lastActivity: new Date().toISOString(),
    authorStudio: 'Studio Nova'
  }
];

const demoGuilds = [
  { id: 'guild-1', name: 'Guild Arc', themeOfWeek: 'Futuristic UI', agentCount: 12 }
];

const demoStudios = [
  { id: 'studio-1', studioName: 'Studio Nova', impact: 22, signal: 74 },
  { id: 'studio-2', studioName: 'Studio Flux', impact: 18, signal: 68 }
];

const demoAutopsies = [
  { id: 'autopsy-1', summary: 'Common issues: low fix-request activity.', publishedAt: new Date().toISOString() }
];

type DraftFeedItem = {
  kind: 'draft';
  id: string;
  title: string;
  glowUpScore: number;
  live?: boolean;
  updatedAt?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
};

type ProgressFeedItem = {
  kind: 'progress';
  draftId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  glowUpScore: number;
  prCount: number;
  lastActivity?: string;
  authorStudio: string;
};

type GuildFeedItem = {
  kind: 'guild';
  id: string;
  name: string;
  themeOfWeek?: string;
  agentCount?: number;
};

type StudioFeedItem = {
  kind: 'studio';
  id: string;
  studioName: string;
  impact: number;
  signal: number;
};

type AutopsyFeedItem = {
  kind: 'autopsy';
  id: string;
  summary: string;
  publishedAt?: string;
};

type FeedItem = DraftFeedItem | ProgressFeedItem | GuildFeedItem | StudioFeedItem | AutopsyFeedItem;

export const endpointForTab = (tab: string) => {
  switch (tab) {
    case 'All':
      return '/feed';
    case 'Progress':
      return '/feeds/progress';
    case 'For You':
      return '/feeds/for-you';
    case 'Live Drafts':
      return '/feeds/live-drafts';
    case 'GlowUps':
      return '/feeds/glowups';
    case 'Guilds':
      return '/guilds';
    case 'Studios':
      return '/feeds/studios';
    case 'Battles':
      return '/feeds/battles';
    case 'Archive':
      return '/feeds/archive';
    default:
      return '/feeds/glowups';
  }
};

const mapDraftItems = (data: any[], live: boolean): DraftFeedItem[] =>
  data
    .filter((item) => item.type !== 'autopsy')
    .map((item) => ({
      kind: 'draft',
      id: item.id,
      title: `${item.type === 'release' ? 'Release' : 'Draft'} ${String(item.id).slice(0, 8)}`,
      glowUpScore: Number(item.glowUpScore ?? item.glow_up_score ?? 0),
      live,
      updatedAt: item.updatedAt ?? item.updated_at,
      beforeImageUrl: item.beforeImageUrl ?? item.before_image_url,
      afterImageUrl: item.afterImageUrl ?? item.after_image_url
    }));

const mapArchiveItems = (data: any[]): FeedItem[] =>
  data.map((item) => {
    if (item.type === 'autopsy' || item.summary) {
      return {
        kind: 'autopsy',
        id: item.id,
        summary: item.summary ?? 'Autopsy report',
        publishedAt: item.publishedAt ?? item.published_at ?? item.updatedAt ?? item.updated_at
      };
    }
    return {
      kind: 'draft',
      id: item.id,
      title: `${item.type === 'release' ? 'Release' : 'Draft'} ${String(item.id).slice(0, 8)}`,
      glowUpScore: Number(item.glowUpScore ?? item.glow_up_score ?? 0),
      updatedAt: item.updatedAt ?? item.updated_at
    };
  });

const mapStudios = (data: any[]): StudioFeedItem[] =>
  data.map((item) => ({
    kind: 'studio',
    id: item.id,
    studioName: item.studioName ?? item.studio_name ?? 'Studio',
    impact: Number(item.impact ?? 0),
    signal: Number(item.signal ?? 0)
  }));

const mapProgress = (data: any[]): ProgressFeedItem[] =>
  data.map((item) => ({
    kind: 'progress',
    draftId: item.draftId ?? item.draft_id,
    beforeImageUrl: item.beforeImageUrl ?? item.before_image_url,
    afterImageUrl: item.afterImageUrl ?? item.after_image_url,
    glowUpScore: Number(item.glowUpScore ?? item.glow_up_score ?? 0),
    prCount: Number(item.prCount ?? item.pr_count ?? 0),
    lastActivity: item.lastActivity ?? item.last_activity,
    authorStudio: item.authorStudio ?? item.studio_name ?? 'Studio'
  }));

const mapGuilds = (data: any[]): GuildFeedItem[] =>
  data.map((item) => ({
    kind: 'guild',
    id: item.id,
    name: item.name ?? 'Guild',
    themeOfWeek: item.themeOfWeek ?? item.theme_of_week ?? 'Theme of the week',
    agentCount: Number(item.agentCount ?? item.agent_count ?? 0)
  }));

const fallbackItemsFor = (tab: string): FeedItem[] => {
  if (tab === 'Progress') {
    return demoProgress.map((item) => ({ ...item, kind: 'progress' as const }));
  }
  if (tab === 'Guilds') {
    return demoGuilds.map((item) => ({ ...item, kind: 'guild' as const }));
  }
  if (tab === 'Studios') {
    return demoStudios.map((studio) => ({ ...studio, kind: 'studio' as const }));
  }
  if (tab === 'Archive') {
    return demoAutopsies.map((item) => ({ ...item, kind: 'autopsy' as const }));
  }
  return demoDrafts.map((draft) => ({ ...draft, kind: 'draft' as const }));
};

export const FeedTabs = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const readParam = (key: string, fallback: string) => searchParams.get(key) ?? fallback;
  const initialTab = TABS.includes(readParam('tab', TABS[0])) ? readParam('tab', TABS[0]) : TABS[0];
  const initialSort = readParam('sort', DEFAULT_SORT) as FeedSort;
  const initialStatus = readParam('status', DEFAULT_STATUS) as FeedStatus;
  const initialRange = readParam('range', DEFAULT_RANGE) as FeedRange;

  const [active, setActive] = useState(initialTab);
  const [sort, setSort] = useState<FeedSort>(initialSort);
  const [status, setStatus] = useState<FeedStatus>(initialStatus);
  const [range, setRange] = useState<FeedRange>(initialRange);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  useEffect(() => {
    const nextTab = TABS.includes(readParam('tab', TABS[0])) ? readParam('tab', TABS[0]) : TABS[0];
    const nextSort = readParam('sort', DEFAULT_SORT) as FeedSort;
    const nextStatus = readParam('status', DEFAULT_STATUS) as FeedStatus;
    const nextRange = readParam('range', DEFAULT_RANGE) as FeedRange;
    setActive(nextTab);
    setSort(nextSort);
    setStatus(nextStatus);
    setRange(nextRange);
  }, [searchParams]);

  const updateQuery = (updates: Partial<{ tab: string; sort: FeedSort; status: FeedStatus; range: FeedRange }>) => {
    const params = new URLSearchParams(searchParams.toString());
    const next = {
      tab: updates.tab ?? active,
      sort: updates.sort ?? sort,
      status: updates.status ?? status,
      range: updates.range ?? range
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

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  useEffect(() => {
    setItems([]);
    setOffset(0);
    setHasMore(true);
    setFallbackUsed(false);
  }, [active, sort, status, range]);

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
      if (loading || !hasMore || fallbackUsed) return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
        setOffset((prev) => prev + PAGE_SIZE);
      }
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [loading, hasMore, fallbackUsed]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (fallbackUsed) return;
      setLoading(true);
      const startedAt = performance.now();
      const endpoint = endpointForTab(active);
      const params: Record<string, any> = { limit: PAGE_SIZE, offset };
      if (active === 'All') {
        params.sort = sort;
        if (status !== 'all') {
          params.status = status;
        }
        if (rangeFrom) {
          params.from = rangeFrom;
        }
      }

      try {
        const response = await apiClient.get(endpoint, { params });
        const nextItems =
          active === 'Progress'
            ? mapProgress(response.data)
            : active === 'Guilds'
              ? mapGuilds(response.data)
              : active === 'Studios'
                ? mapStudios(response.data)
                : active === 'Archive'
                  ? mapArchiveItems(response.data)
                  : mapDraftItems(response.data, active === 'Live Drafts');
        if (!cancelled) {
          setItems((prev) => (offset === 0 ? nextItems : [...prev, ...nextItems]));
          setHasMore(nextItems.length >= PAGE_SIZE);
          if (active === 'All' && offset === 0) {
            const timingMs = Math.round(performance.now() - startedAt);
            sendTelemetry({
              eventType: 'feed_load_timing',
              sort,
              status: status === 'all' ? undefined : status,
              range,
              timingMs
            });
          }
        }
      } catch (_error) {
        if (active === 'For You') {
          try {
            const response = await apiClient.get('/feeds/glowups', { params });
            const nextItems = mapDraftItems(response.data, false);
            if (!cancelled) {
              setItems((prev) => (offset === 0 ? nextItems : [...prev, ...nextItems]));
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
  }, [active, offset, fallbackUsed, sort, status, rangeFrom, range]);

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActive(tab);
              updateQuery({ tab });
            }}
            aria-pressed={active === tab}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
              active === tab ? 'bg-ink text-white' : 'border border-slate-200 bg-white/80 text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      {active === 'All' ? (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 text-xs text-slate-600 md:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sort</span>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              value={sort}
              onChange={(event) => {
                const next = event.target.value as FeedSort;
                setSort(next);
                updateQuery({ sort: next });
                sendTelemetry({ eventType: 'feed_filter_change', sort: next, status, range });
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              value={status}
              onChange={(event) => {
                const next = event.target.value as FeedStatus;
                setStatus(next);
                updateQuery({ status: next });
                sendTelemetry({ eventType: 'feed_filter_change', sort, status: next, range });
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Time range</span>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              value={range}
              onChange={(event) => {
                const next = event.target.value as FeedRange;
                setRange(next);
                updateQuery({ range: next });
                sendTelemetry({ eventType: 'feed_filter_change', sort, status, range: next });
              }}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Filters available in the All feed.</p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500" aria-live="polite">
        {fallbackUsed && <span className="pill">Fallback data</span>}
        {loading && <span role="status">Loading...</span>}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item, index) => {
          if (item.kind === 'studio') {
            return <StudioCard key={item.id ?? `studio-${index}`} {...item} />;
          }
          if (item.kind === 'guild') {
            return <GuildCard key={item.id ?? `guild-${index}`} {...item} />;
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
                  sendTelemetry({ eventType: 'feed_card_open', draftId: item.draftId, source: 'feed' })
                }
              />
            );
          }
          if (item.kind === 'autopsy') {
            return <AutopsyCard key={item.id ?? `autopsy-${index}`} {...item} />;
          }
          return <DraftCard key={item.id ?? `draft-${index}`} {...item} />;
        })}
      </div>
      {!fallbackUsed && hasMore && (
        <button
          className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
          onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
          type="button"
        >
          Load more
        </button>
      )}
    </section>
  );
};
