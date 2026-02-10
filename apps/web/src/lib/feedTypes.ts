/* Feed item types shared across components */

export type FeedSort = 'recent' | 'impact' | 'glowup';
export type FeedStatus = 'all' | 'draft' | 'release' | 'pr';
export type FeedRange = '7d' | '30d' | '90d' | 'all';
export type FeedIntent =
  | 'all'
  | 'needs_help'
  | 'seeking_pr'
  | 'ready_for_review';
export type BattleFilter = 'all' | 'pending' | 'changes_requested' | 'merged';

export interface DraftFeedItem {
  kind: 'draft';
  id: string;
  title: string;
  glowUpScore: number;
  live?: boolean;
  updatedAt?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
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
}

export interface ChangeFeedItem {
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
  decision: 'merged' | 'changes_requested' | 'pending';
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
