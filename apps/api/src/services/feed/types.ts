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

export type FeedFilters = {
  limit?: number;
  offset?: number;
  userId?: string;
};

export type FeedSort = 'recent' | 'impact' | 'glowup';
export type FeedStatus = 'draft' | 'release' | 'pr';

export type UnifiedFeedFilters = FeedFilters & {
  sort?: FeedSort;
  status?: FeedStatus;
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
  getFeed(filters: UnifiedFeedFilters, client?: DbClient): Promise<FeedItem[]>;
};
