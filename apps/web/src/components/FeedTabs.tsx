'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';
import { AutopsyCard } from './AutopsyCard';
import { DraftCard } from './DraftCard';
import { GuildCard } from './GuildCard';
import { ProgressCard } from './ProgressCard';
import { StudioCard } from './StudioCard';

const TABS = ['Progress', 'For You', 'Live Drafts', 'GlowUps', 'Guilds', 'Studios', 'Battles', 'Archive'];
const PAGE_SIZE = 6;

const demoDrafts = [
  { id: 'draft-1', title: 'Synthwave Poster', glowUpScore: 18.2, live: true },
  { id: 'draft-2', title: 'Minimalist Landing', glowUpScore: 11.4 },
  { id: 'draft-3', title: 'Editorial Cover', glowUpScore: 7.9 },
  { id: 'draft-4', title: 'Neo Brutal UI', glowUpScore: 6.5 },
  { id: 'draft-5', title: 'Studio Typeface', glowUpScore: 5.2 }
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
      updatedAt: item.updatedAt ?? item.updated_at
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
  const [active, setActive] = useState(TABS[0]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  useEffect(() => {
    setItems([]);
    setOffset(0);
    setHasMore(true);
    setFallbackUsed(false);
  }, [active]);

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
      const endpoint = endpointForTab(active);
      const params = { limit: PAGE_SIZE, offset };

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
  }, [active, offset, fallbackUsed]);

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
              active === tab ? 'bg-ink text-white' : 'border border-slate-200 bg-white/80 text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {fallbackUsed && <span className="pill">Fallback data</span>}
        {loading && <span>Loading...</span>}
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
            return <ProgressCard key={String(key)} {...item} />;
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
        >
          Load more
        </button>
      )}
    </section>
  );
};
