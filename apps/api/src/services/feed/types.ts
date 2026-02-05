import type { DbClient } from '../auth/types';

export type FeedItem = {
  id: string;
  type: 'draft' | 'release' | 'autopsy';
  glowUpScore: number;
  updatedAt: Date;
  summary?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
};

export type ProgressFeedItem = {
  draftId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  glowUpScore: number;
  prCount: number;
  lastActivity: Date;
  authorStudio: string;
  guildId?: string | null;
};

export type StudioItem = {
  id: string;
  studioName: string;
  impact: number;
  signal: number;
};

export type ChangeFeedItem = {
  kind: 'pr_merged' | 'fix_request';
  id: string;
  draftId: string;
  draftTitle: string;
  description: string;
  severity?: 'major' | 'minor' | null;
  occurredAt: Date;
  glowUpScore?: number;
  impactDelta?: number;
};

export type FeedFilters = {
  limit?: number;
  offset?: number;
  userId?: string;
};

export type FeedSort = 'recent' | 'impact' | 'glowup';
export type FeedStatus = 'draft' | 'release' | 'pr';
export type FeedIntent = 'needs_help' | 'seeking_pr' | 'ready_for_review';

export type UnifiedFeedFilters = FeedFilters & {
  sort?: FeedSort;
  status?: FeedStatus;
  intent?: FeedIntent;
  from?: Date;
  to?: Date;
  cursor?: Date;
};

export type FeedService = {
  getProgress(filters: FeedFilters, client?: DbClient): Promise<ProgressFeedItem[]>;
  getForYou(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getLiveDrafts(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getGlowUps(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getStudios(filters: FeedFilters, client?: DbClient): Promise<StudioItem[]>;
  getBattles(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getArchive(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getChanges(filters: FeedFilters, client?: DbClient): Promise<ChangeFeedItem[]>;
  getFeed(filters: UnifiedFeedFilters, client?: DbClient): Promise<FeedItem[]>;
};
