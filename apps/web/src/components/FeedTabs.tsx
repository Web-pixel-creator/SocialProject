'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../lib/api';
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

type FeedSort = 'recent' | 'impact' | 'glowup';
type FeedStatus = 'all' | 'draft' | 'release' | 'pr';
type FeedRange = '7d' | '30d' | '90d' | 'all';
type FeedIntent = 'all' | 'needs_help' | 'seeking_pr' | 'ready_for_review';
type BattleFilter = 'all' | 'pending' | 'changes_requested' | 'merged';

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

const demoDrafts = [
  {
    id: 'draft-1',
    title: 'Synthwave Poster',
    glowUpScore: 18.2,
    live: true,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
  },
  {
    id: 'draft-2',
    title: 'Minimalist Landing',
    glowUpScore: 11.4,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
  },
  {
    id: 'draft-3',
    title: 'Editorial Cover',
    glowUpScore: 7.9,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
  },
  {
    id: 'draft-4',
    title: 'Neo Brutal UI',
    glowUpScore: 6.5,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
  },
  {
    id: 'draft-5',
    title: 'Studio Typeface',
    glowUpScore: 5.2,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
  },
];

const demoHotNow = [
  {
    id: 'draft-1',
    title: 'Synthwave Poster',
    glowUpScore: 18.2,
    hotScore: 2.6,
    reasonLabel: '3 PR pending, 2 open fix',
  },
  {
    id: 'draft-2',
    title: 'Minimalist Landing',
    glowUpScore: 11.4,
    hotScore: 2.1,
    reasonLabel: '1 merge in 24h, 2 decisions in 24h',
  },
  {
    id: 'draft-3',
    title: 'Editorial Cover',
    glowUpScore: 7.9,
    hotScore: 1.5,
    reasonLabel: '1 PR pending',
  },
];

const demoProgress = [
  {
    draftId: 'draft-1',
    beforeImageUrl: 'https://placehold.co/600x400?text=Before',
    afterImageUrl: 'https://placehold.co/600x400?text=After',
    glowUpScore: 18.2,
    prCount: 3,
    lastActivity: new Date().toISOString(),
    authorStudio: 'Studio Nova',
  },
];

const demoGuilds = [
  {
    id: 'guild-1',
    name: 'Guild Arc',
    themeOfWeek: 'Futuristic UI',
    agentCount: 12,
  },
];

const demoStudios = [
  { id: 'studio-1', studioName: 'Studio Nova', impact: 22, signal: 74 },
  { id: 'studio-2', studioName: 'Studio Flux', impact: 18, signal: 68 },
];

const demoBattles = [
  {
    id: 'battle-302',
    title: 'PR Battle: DesignFlow vs LogicForm',
    leftLabel: 'DesignFlow',
    rightLabel: 'LogicForm',
    leftVote: 45,
    rightVote: 55,
    glowUpScore: 18.2,
    prCount: 6,
    fixCount: 14,
    decision: 'changes_requested',
    beforeImageUrl: 'https://placehold.co/600x360?text=Studio+A',
    afterImageUrl: 'https://placehold.co/600x360?text=Studio+B',
  },
  {
    id: 'battle-305',
    title: 'PR Battle: CodeGenX vs SynthArt',
    leftLabel: 'CodeGenX',
    rightLabel: 'SynthArt',
    leftVote: 52,
    rightVote: 48,
    glowUpScore: 14.6,
    prCount: 5,
    fixCount: 8,
    decision: 'merged',
    beforeImageUrl: 'https://placehold.co/600x360?text=Version+A',
    afterImageUrl: 'https://placehold.co/600x360?text=Version+B',
  },
];

const demoChanges = [
  {
    id: 'change-1',
    kind: 'pr_merged',
    draftId: 'draft-1',
    draftTitle: 'Synthwave Poster',
    description: 'Hero composition refresh',
    severity: 'major',
    occurredAt: new Date().toISOString(),
    glowUpScore: 18.2,
    miniThread: [
      'Fix Request: composition -> tighten framing',
      'Maker PR: #184 improved hierarchy',
      'Author decision: merged',
    ],
  },
  {
    id: 'change-2',
    kind: 'fix_request',
    draftId: 'draft-2',
    draftTitle: 'Minimalist Landing',
    description: 'Improve visual hierarchy in CTA block',
    severity: null,
    occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    glowUpScore: 11.4,
    miniThread: [
      'Fix Request: improve CTA hierarchy',
      'Author decision: awaiting changes',
      'Auto-update: GlowUp recalculated to 11.4',
    ],
  },
];

const demoAutopsies = [
  {
    id: 'autopsy-1',
    summary: 'Common issues: low fix-request activity.',
    publishedAt: new Date().toISOString(),
  },
];

interface DraftFeedItem {
  kind: 'draft';
  id: string;
  title: string;
  glowUpScore: number;
  live?: boolean;
  updatedAt?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

interface HotNowFeedItem {
  kind: 'hot';
  id: string;
  title: string;
  glowUpScore: number;
  hotScore: number;
  reasonLabel: string;
  updatedAt?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

interface ProgressFeedItem {
  kind: 'progress';
  draftId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  glowUpScore: number;
  prCount: number;
  lastActivity?: string;
  authorStudio: string;
}

interface GuildFeedItem {
  kind: 'guild';
  id: string;
  name: string;
  themeOfWeek?: string;
  agentCount?: number;
}

interface StudioFeedItem {
  kind: 'studio';
  id: string;
  studioName: string;
  impact: number;
  signal: number;
}

interface ChangeFeedItem {
  kind: 'change';
  id: string;
  changeType: 'pr_merged' | 'fix_request';
  draftId: string;
  draftTitle: string;
  description: string;
  severity?: 'major' | 'minor' | null;
  occurredAt?: string;
  glowUpScore?: number;
  impactDelta?: number;
  miniThread?: string[];
  makerPrRef?: string;
  decisionLabel?: string;
}

interface BattleFeedItem {
  kind: 'battle';
  id: string;
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftVote: number;
  rightVote: number;
  glowUpScore: number;
  prCount: number;
  fixCount: number;
  decision: 'merged' | 'changes_requested' | 'pending';
  updatedAt?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

interface AutopsyFeedItem {
  kind: 'autopsy';
  id: string;
  summary: string;
  publishedAt?: string;
}

type FeedItem =
  | DraftFeedItem
  | HotNowFeedItem
  | ProgressFeedItem
  | GuildFeedItem
  | StudioFeedItem
  | ChangeFeedItem
  | BattleFeedItem
  | AutopsyFeedItem;

type FeedApiRow = Record<string, unknown>;

export const endpointForTab = (tab: string) => {
  switch (tab) {
    case 'All':
      return '/feed';
    case 'Progress':
      return '/feeds/progress';
    case 'Changes':
      return '/feeds/changes';
    case 'For You':
      return '/feeds/for-you';
    case 'Hot Now':
      return '/feeds/hot-now';
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

const asFeedRows = (data: unknown): FeedApiRow[] =>
  Array.isArray(data)
    ? data.filter(
        (item): item is FeedApiRow => typeof item === 'object' && item !== null,
      )
    : [];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return entries.length > 0 ? entries : undefined;
};

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return undefined;
};

const asChangeType = (value: unknown): 'pr_merged' | 'fix_request' =>
  value === 'fix_request' ? 'fix_request' : 'pr_merged';

const asSeverity = (value: unknown): 'major' | 'minor' | null => {
  if (value === 'major' || value === 'minor') {
    return value;
  }
  return null;
};

const asBattleDecision = (
  value: unknown,
): 'merged' | 'changes_requested' | 'pending' => {
  if (typeof value !== 'string') {
    return 'pending';
  }
  const normalized = value.toLowerCase();
  if (normalized.includes('merge')) {
    return 'merged';
  }
  if (normalized.includes('change') || normalized.includes('request')) {
    return 'changes_requested';
  }
  return 'pending';
};

const mapDraftItems = (data: FeedApiRow[], live: boolean): DraftFeedItem[] =>
  data
    .filter((item) => asString(item.type) !== 'autopsy')
    .map((item) => ({
      kind: 'draft',
      id: asString(item.id) ?? '',
      title: `${asString(item.type) === 'release' ? 'Release' : 'Draft'} ${String(item.id ?? '').slice(0, 8)}`,
      glowUpScore: asNumber(item.glowUpScore ?? item.glow_up_score),
      live,
      updatedAt: asString(item.updatedAt) ?? asString(item.updated_at),
      beforeImageUrl:
        asString(item.beforeImageUrl) ?? asString(item.before_image_url),
      afterImageUrl:
        asString(item.afterImageUrl) ?? asString(item.after_image_url),
    }));

const mapArchiveItems = (data: FeedApiRow[]): FeedItem[] =>
  data.map((item) => {
    if (asString(item.type) === 'autopsy' || asString(item.summary)) {
      return {
        kind: 'autopsy',
        id: asString(item.id) ?? '',
        summary: asString(item.summary) ?? 'Autopsy report',
        publishedAt:
          asString(item.publishedAt) ??
          asString(item.published_at) ??
          asString(item.updatedAt) ??
          asString(item.updated_at),
      };
    }
    return {
      kind: 'draft',
      id: asString(item.id) ?? '',
      title: `${asString(item.type) === 'release' ? 'Release' : 'Draft'} ${String(item.id ?? '').slice(0, 8)}`,
      glowUpScore: asNumber(item.glowUpScore ?? item.glow_up_score),
      updatedAt: asString(item.updatedAt) ?? asString(item.updated_at),
    };
  });

const mapStudios = (data: FeedApiRow[]): StudioFeedItem[] =>
  data.map((item) => ({
    kind: 'studio',
    id: asString(item.id) ?? '',
    studioName:
      asString(item.studioName) ?? asString(item.studio_name) ?? 'Studio',
    impact: asNumber(item.impact),
    signal: asNumber(item.signal),
  }));

const mapChanges = (data: FeedApiRow[]): ChangeFeedItem[] =>
  data.map((item) => ({
    kind: 'change',
    id: asString(item.id) ?? '',
    changeType: asChangeType(item.kind ?? item.changeType),
    draftId: asString(item.draftId) ?? asString(item.draft_id) ?? '',
    draftTitle:
      asString(item.draftTitle) ?? asString(item.draft_title) ?? 'Untitled',
    description: asString(item.description) ?? '',
    severity: asSeverity(item.severity),
    occurredAt: asString(item.occurredAt) ?? asString(item.occurred_at),
    glowUpScore: asNumber(item.glowUpScore ?? item.glow_up_score),
    impactDelta: asNumber(item.impactDelta ?? item.impact_delta),
    miniThread: asStringArray(
      item.miniThread ?? item.mini_thread ?? item.thread ?? item.events,
    ),
    makerPrRef: firstString(
      item.makerPrRef,
      item.maker_pr_ref,
      item.makerPrId,
      item.maker_pr_id,
      item.prRef,
      item.pr_ref,
    ),
    decisionLabel: firstString(
      item.decisionLabel,
      item.decision_label,
      item.authorDecision,
      item.author_decision,
      item.status,
    ),
  }));

const mapBattles = (data: FeedApiRow[]): BattleFeedItem[] =>
  data.map((item, index) => {
    const id = asString(item.id) ?? `battle-${index}`;
    const title =
      firstString(item.title, item.battleTitle, item.battle_title) ??
      'PR Battle: Studio A vs Studio B';
    const leftLabel =
      firstString(
        item.leftLabel,
        item.left_label,
        item.studioA,
        item.studio_a,
        item.contenderA,
        item.contender_a,
        item.firstStudio,
        item.first_studio,
      ) ?? 'Studio A';
    const rightLabel =
      firstString(
        item.rightLabel,
        item.right_label,
        item.studioB,
        item.studio_b,
        item.contenderB,
        item.contender_b,
        item.secondStudio,
        item.second_studio,
      ) ?? 'Studio B';
    const glowUpScore = asNumber(item.glowUpScore ?? item.glow_up_score);
    const fallbackLeftVote = Math.max(
      40,
      Math.min(60, Math.round(50 + (glowUpScore - 10) * 1.5)),
    );
    const leftVote = asNumber(
      item.leftVote ??
        item.left_vote ??
        item.votesA ??
        item.votes_a ??
        item.vote_a ??
        fallbackLeftVote,
    );
    const rightVote = asNumber(
      item.rightVote ??
        item.right_vote ??
        item.votesB ??
        item.votes_b ??
        item.vote_b ??
        100 - fallbackLeftVote,
    );

    return {
      kind: 'battle',
      id,
      title,
      leftLabel,
      rightLabel,
      leftVote,
      rightVote,
      glowUpScore,
      prCount: Math.max(
        2,
        Math.round(asNumber(item.prCount ?? item.pr_count) || glowUpScore / 2),
      ),
      fixCount: Math.max(
        1,
        Math.round(
          asNumber(item.fixCount ?? item.fix_count) || Math.max(1, glowUpScore),
        ),
      ),
      decision: asBattleDecision(
        item.decision ?? item.decision_status ?? item.status,
      ),
      updatedAt: asString(item.updatedAt) ?? asString(item.updated_at),
      beforeImageUrl:
        asString(item.beforeImageUrl) ?? asString(item.before_image_url),
      afterImageUrl:
        asString(item.afterImageUrl) ?? asString(item.after_image_url),
    };
  });

const mapProgress = (data: FeedApiRow[]): ProgressFeedItem[] =>
  data.map((item) => ({
    kind: 'progress',
    draftId: asString(item.draftId) ?? asString(item.draft_id) ?? '',
    beforeImageUrl:
      asString(item.beforeImageUrl) ?? asString(item.before_image_url) ?? '',
    afterImageUrl:
      asString(item.afterImageUrl) ?? asString(item.after_image_url) ?? '',
    glowUpScore: asNumber(item.glowUpScore ?? item.glow_up_score),
    prCount: asNumber(item.prCount ?? item.pr_count),
    lastActivity: asString(item.lastActivity) ?? asString(item.last_activity),
    authorStudio:
      asString(item.authorStudio) ?? asString(item.studio_name) ?? 'Studio',
  }));

const mapHotNow = (data: FeedApiRow[]): HotNowFeedItem[] =>
  data.map((item) => ({
    kind: 'hot',
    id: asString(item.draftId) ?? asString(item.draft_id) ?? '',
    title: asString(item.title) ?? asString(item.draft_title) ?? 'Untitled',
    glowUpScore: asNumber(item.glowUpScore ?? item.glow_up_score),
    hotScore: asNumber(item.hotScore ?? item.hot_score),
    reasonLabel:
      asString(item.reasonLabel) ??
      asString(item.reason_label) ??
      'Low activity',
    updatedAt:
      asString(item.lastActivity) ??
      asString(item.last_activity) ??
      asString(item.updatedAt) ??
      asString(item.updated_at),
    beforeImageUrl:
      asString(item.beforeImageUrl) ?? asString(item.before_image_url),
    afterImageUrl:
      asString(item.afterImageUrl) ?? asString(item.after_image_url),
  }));

const mapGuilds = (data: FeedApiRow[]): GuildFeedItem[] =>
  data.map((item) => ({
    kind: 'guild',
    id: asString(item.id) ?? '',
    name: asString(item.name) ?? 'Guild',
    themeOfWeek:
      asString(item.themeOfWeek) ??
      asString(item.theme_of_week) ??
      'Theme of the week',
    agentCount: asNumber(item.agentCount ?? item.agent_count),
  }));

const mapItemsForTab = (tab: string, data: unknown): FeedItem[] => {
  const rows = asFeedRows(data);
  switch (tab) {
    case 'Progress':
      return mapProgress(rows);
    case 'Changes':
      return mapChanges(rows);
    case 'Battles':
      return mapBattles(rows);
    case 'Hot Now':
      return mapHotNow(rows);
    case 'Guilds':
      return mapGuilds(rows);
    case 'Studios':
      return mapStudios(rows);
    case 'Archive':
      return mapArchiveItems(rows);
    default:
      return mapDraftItems(rows, tab === 'Live Drafts');
  }
};

const fallbackItemsFor = (tab: string): FeedItem[] => {
  if (tab === 'Progress') {
    return demoProgress.map((item) => ({ ...item, kind: 'progress' as const }));
  }
  if (tab === 'Hot Now') {
    return demoHotNow.map((item) => ({ ...item, kind: 'hot' as const }));
  }
  if (tab === 'Guilds') {
    return demoGuilds.map((item) => ({ ...item, kind: 'guild' as const }));
  }
  if (tab === 'Studios') {
    return demoStudios.map((studio) => ({
      ...studio,
      kind: 'studio' as const,
    }));
  }
  if (tab === 'Changes') {
    return demoChanges.map((item) => ({
      kind: 'change' as const,
      id: item.id,
      changeType: item.kind as 'pr_merged' | 'fix_request',
      draftId: item.draftId,
      draftTitle: item.draftTitle,
      description: item.description,
      severity: item.severity as 'major' | 'minor' | null,
      occurredAt: item.occurredAt,
      glowUpScore: item.glowUpScore,
      miniThread: item.miniThread,
    }));
  }
  if (tab === 'Battles') {
    return demoBattles.map((item) => ({ ...item, kind: 'battle' as const }));
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

  let filterPanel = (
    <p className="text-muted-foreground text-xs">
      Filters available in the All feed.
    </p>
  );

  if (active === 'All') {
    filterPanel = (
      <div className="grid gap-3 rounded-2xl border border-border bg-muted/60 p-4 text-foreground/85 text-xs md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1">
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Sort
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
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Status
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
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Time range
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
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Intent
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
                {option.label}
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
          Battle status
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
              {option.label}
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
              {scope.label}
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
                    {option.label}
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
              {tab}
            </button>
          ))}
        </div>
      </div>
      {filterPanel}
      <div
        aria-live="polite"
        className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs"
      >
        {fallbackUsed && <span className="pill">Fallback data</span>}
        {loading && <span>Loading...</span>}
      </div>
      {visibleItems.length === 0 && !loading ? (
        <div className="card p-6 text-foreground/85 text-sm">
          {active === 'Battles' &&
            'No battles for this status yet. Switch to All battles or check Live Drafts.'}
          {active !== 'Battles' &&
            intent === 'needs_help' &&
            'No drafts need help right now. Try Seeking PR or run a demo flow.'}
          {active !== 'Battles' &&
            intent === 'seeking_pr' &&
            'No drafts are waiting for PRs. Try Needs help or check Live Drafts.'}
          {active !== 'Battles' &&
            intent === 'ready_for_review' &&
            'No pending PRs to review right now. Check GlowUps or Archive.'}
          {active !== 'Battles' &&
            intent === 'all' &&
            'No feed items yet. Start by running a demo flow.'}
        </div>
      ) : (
        <div className={feedGridClass}>
          {visibleItems.map((item, index) => {
            if (item.kind === 'studio') {
              return (
                <StudioCard key={item.id ?? `studio-${index}`} {...item} />
              );
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
      )}
      {!fallbackUsed && hasMore && (
        <button
          className="rounded-full border border-border bg-muted/70 px-4 py-2 font-semibold text-foreground text-xs transition hover:border-primary/45 hover:text-primary"
          onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
          type="button"
        >
          Load more
        </button>
      )}
    </section>
  );
};
