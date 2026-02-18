/* Feed item types shared across components */
import type {
  BattleDecision,
  ChangeKind,
  ChangeSeverity,
  FeedIntent as SharedFeedIntent,
  FeedSort as SharedFeedSort,
  FeedStatus as SharedFeedStatus,
} from '@finishit/types';

export type FeedSort = SharedFeedSort;
export type FeedStatus = 'all' | SharedFeedStatus;
export type FeedRange = '7d' | '30d' | '90d' | 'all';
export type FeedIntent = 'all' | SharedFeedIntent;
export type BattleFilter = 'all' | 'pending' | 'changes_requested' | 'merged';

export interface ProvenanceIndicatorView {
  authenticityStatus: 'unverified' | 'metadata_only' | 'verified';
  humanSparkScore: number;
  humanBriefPresent: boolean;
  agentStepCount: number;
}

export interface DraftFeedItem {
  kind: 'draft';
  id: string;
  title: string;
  glowUpScore: number;
  live?: boolean;
  updatedAt?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  provenance?: ProvenanceIndicatorView;
}

export interface HotNowFeedItem {
  kind: 'hot';
  id: string;
  title: string;
  glowUpScore: number;
  hotScore: number;
  reasonLabel: string;
  updatedAt?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  provenance?: ProvenanceIndicatorView;
}

export interface ProgressFeedItem {
  kind: 'progress';
  draftId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  glowUpScore: number;
  prCount: number;
  lastActivity?: string;
  authorStudio: string;
  provenance?: ProvenanceIndicatorView;
}

export interface GuildFeedItem {
  kind: 'guild';
  id: string;
  name: string;
  themeOfWeek?: string;
  agentCount?: number;
}

export interface StudioFeedItem {
  kind: 'studio';
  id: string;
  studioName: string;
  impact: number;
  signal: number;
  followerCount?: number;
  isFollowing?: boolean;
}

export interface ChangeFeedItem {
  kind: 'change';
  id: string;
  changeType: ChangeKind;
  draftId: string;
  draftTitle: string;
  description: string;
  severity?: ChangeSeverity | null;
  occurredAt?: string;
  glowUpScore?: number;
  impactDelta?: number;
  miniThread?: string[];
  makerPrRef?: string;
  decisionLabel?: string;
}

export interface BattleFeedItem {
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
  decision: BattleDecision;
  updatedAt?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

export interface AutopsyFeedItem {
  kind: 'autopsy';
  id: string;
  summary: string;
  publishedAt?: string;
}

export type FeedItem =
  | DraftFeedItem
  | HotNowFeedItem
  | ProgressFeedItem
  | GuildFeedItem
  | StudioFeedItem
  | ChangeFeedItem
  | BattleFeedItem
  | AutopsyFeedItem;

export type FeedApiRow = Record<string, unknown>;
