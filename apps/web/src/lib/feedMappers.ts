/* Mapper functions: transform API responses into typed feed items */

import {
  demoAutopsies,
  demoBattles,
  demoChanges,
  demoDrafts,
  demoGuilds,
  demoHotNow,
  demoProgress,
  demoStudios,
} from './feedDemoData';
import type {
  BattleFeedItem,
  ChangeFeedItem,
  DraftFeedItem,
  FeedApiRow,
  FeedItem,
  GuildFeedItem,
  HotNowFeedItem,
  ProgressFeedItem,
  ProvenanceIndicatorView,
  StudioFeedItem,
} from './feedTypes';

/* ── parsing helpers ── */

export const asFeedRows = (data: unknown): FeedApiRow[] =>
  Array.isArray(data)
    ? data.filter(
        (item): item is FeedApiRow => typeof item === 'object' && item !== null,
      )
    : [];

export const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return entries.length > 0 ? entries : undefined;
};

export const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asProvenanceStatus = (
  value: unknown,
): ProvenanceIndicatorView['authenticityStatus'] => {
  if (value === 'verified' || value === 'metadata_only') {
    return value;
  }
  return 'unverified';
};

const asProvenance = (
  item: FeedApiRow,
): ProvenanceIndicatorView | undefined => {
  const nested = item.provenance;
  if (nested && typeof nested === 'object') {
    const row = nested as Record<string, unknown>;
    return {
      authenticityStatus: asProvenanceStatus(
        row.authenticityStatus ?? row.authenticity_status,
      ),
      humanSparkScore: asNumber(row.humanSparkScore ?? row.human_spark_score),
      humanBriefPresent: Boolean(
        row.humanBriefPresent ?? row.human_brief_present,
      ),
      agentStepCount: asNumber(row.agentStepCount ?? row.agent_step_count),
    };
  }

  const hasFlat =
    item.authenticityStatus !== undefined ||
    item.authenticity_status !== undefined ||
    item.humanSparkScore !== undefined ||
    item.human_spark_score !== undefined ||
    item.agentStepCount !== undefined ||
    item.agent_step_count !== undefined;

  if (!hasFlat) {
    return undefined;
  }

  return {
    authenticityStatus: asProvenanceStatus(
      item.authenticityStatus ?? item.authenticity_status,
    ),
    humanSparkScore: asNumber(item.humanSparkScore ?? item.human_spark_score),
    humanBriefPresent: Boolean(
      item.humanBriefPresent ?? item.human_brief_present,
    ),
    agentStepCount: asNumber(item.agentStepCount ?? item.agent_step_count),
  };
};

export const firstString = (...values: unknown[]): string | undefined => {
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

/* ── tab → endpoint mapping ── */

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
    case 'Following':
      return '/feeds/following';
    case 'Battles':
      return '/feeds/battles';
    case 'Archive':
      return '/feeds/archive';
    default:
      return '/feeds/glowups';
  }
};

/* ── per-tab mappers ── */

export const mapDraftItems = (
  data: FeedApiRow[],
  live: boolean,
): DraftFeedItem[] =>
  data
    .filter((item) => asString(item.type) !== 'autopsy')
    .map((item) => ({
      kind: 'draft',
      id: asString(item.id) ?? '',
      title: `${asString(item.type) === 'release' ? 'Release' : 'Draft'} ${String(item.id ?? '').slice(0, 8)}`,
      glowUpScore: asNumber(item.glowUpScore ?? item.glow_up_score),
      authorStudioId:
        asString(item.authorStudioId) ??
        asString(item.author_studio_id) ??
        asString(item.authorId) ??
        asString(item.author_id),
      authorStudioName:
        asString(item.authorStudioName) ??
        asString(item.author_studio_name) ??
        asString(item.studioName) ??
        asString(item.studio_name),
      live,
      updatedAt: asString(item.updatedAt) ?? asString(item.updated_at),
      beforeImageUrl:
        asString(item.beforeImageUrl) ?? asString(item.before_image_url),
      afterImageUrl:
        asString(item.afterImageUrl) ?? asString(item.after_image_url),
      provenance: asProvenance(item),
    }));

export const mapArchiveItems = (data: FeedApiRow[]): FeedItem[] =>
  data.map((item) => {
    if (asString(item.type) === 'autopsy' || asString(item.summary)) {
      return {
        kind: 'autopsy' as const,
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
      kind: 'draft' as const,
      id: asString(item.id) ?? '',
      title: `${asString(item.type) === 'release' ? 'Release' : 'Draft'} ${String(item.id ?? '').slice(0, 8)}`,
      glowUpScore: asNumber(item.glowUpScore ?? item.glow_up_score),
      updatedAt: asString(item.updatedAt) ?? asString(item.updated_at),
      provenance: asProvenance(item),
    };
  });

export const mapStudios = (data: FeedApiRow[]): StudioFeedItem[] =>
  data.map((item) => ({
    kind: 'studio',
    id: asString(item.id) ?? '',
    studioName:
      asString(item.studioName) ?? asString(item.studio_name) ?? 'Studio',
    impact: asNumber(item.impact),
    signal: asNumber(item.signal),
    followerCount: asNumber(item.followerCount ?? item.follower_count),
    isFollowing: Boolean(item.isFollowing ?? item.is_following),
  }));

export const mapChanges = (data: FeedApiRow[]): ChangeFeedItem[] =>
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
    provenance: asProvenance(item),
  }));

export const mapBattles = (data: FeedApiRow[]): BattleFeedItem[] =>
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
      provenance: asProvenance(item),
    };
  });

export const mapProgress = (data: FeedApiRow[]): ProgressFeedItem[] =>
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
    provenance: asProvenance(item),
  }));

export const mapHotNow = (data: FeedApiRow[]): HotNowFeedItem[] =>
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
    provenance: asProvenance(item),
  }));

export const mapGuilds = (data: FeedApiRow[]): GuildFeedItem[] =>
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

/* ── composite helpers ── */

export const mapItemsForTab = (tab: string, data: unknown): FeedItem[] => {
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
    case 'Following':
      return mapDraftItems(rows, false);
    case 'Archive':
      return mapArchiveItems(rows);
    default:
      return mapDraftItems(rows, tab === 'Live Drafts');
  }
};

export const fallbackItemsFor = (tab: string): FeedItem[] => {
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
  if (tab === 'Following') {
    return demoDrafts.map((draft) => ({ ...draft, kind: 'draft' as const }));
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
