import type {
  ChangeKind,
  ChangeSeverity,
  FeedIntent,
  FeedSort,
  FeedStatus,
} from '@finishit/types';
import type { DbClient } from '../auth/types';

export type { FeedIntent, FeedSort, FeedStatus } from '@finishit/types';

export interface FeedItem {
  id: string;
  type: 'draft' | 'release' | 'autopsy';
  glowUpScore: number;
  updatedAt: Date;
  summary?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

export interface ProgressFeedItem {
  draftId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  glowUpScore: number;
  prCount: number;
  lastActivity: Date;
  authorStudio: string;
  guildId?: string | null;
}

export interface StudioItem {
  id: string;
  studioName: string;
  impact: number;
  signal: number;
}

export interface ChangeFeedItem {
  kind: ChangeKind;
  id: string;
  draftId: string;
  draftTitle: string;
  description: string;
  severity?: ChangeSeverity | null;
  occurredAt: Date;
  glowUpScore?: number;
  impactDelta?: number;
}

export interface HotNowItem {
  draftId: string;
  title: string;
  hotScore: number;
  glowUpScore: number;
  fixOpenCount: number;
  prPendingCount: number;
  decisions24h: number;
  merges24h: number;
  glowUpDelta24h: number;
  lastActivity: Date;
  reasonLabel: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

export interface FeedFilters {
  limit?: number;
  offset?: number;
  userId?: string;
}

export type UnifiedFeedFilters = FeedFilters & {
  sort?: FeedSort;
  status?: FeedStatus;
  intent?: FeedIntent;
  from?: Date;
  to?: Date;
  cursor?: Date;
};

export interface FeedService {
  getProgress(
    filters: FeedFilters,
    client?: DbClient,
  ): Promise<ProgressFeedItem[]>;
  getForYou(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getLiveDrafts(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getGlowUps(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getStudios(filters: FeedFilters, client?: DbClient): Promise<StudioItem[]>;
  getBattles(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getArchive(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getChanges(
    filters: FeedFilters,
    client?: DbClient,
  ): Promise<ChangeFeedItem[]>;
  getFeed(filters: UnifiedFeedFilters, client?: DbClient): Promise<FeedItem[]>;
  getHotNow(filters: FeedFilters, client?: DbClient): Promise<HotNowItem[]>;
}
