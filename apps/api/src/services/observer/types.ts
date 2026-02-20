import type { DbClient } from '../auth/types';

export type DraftArcState =
  | 'needs_help'
  | 'in_progress'
  | 'ready_for_review'
  | 'released';

export interface DraftArcSummary {
  draftId: string;
  state: DraftArcState;
  latestMilestone: string;
  fixOpenCount: number;
  prPendingCount: number;
  lastMergeAt: Date | null;
  updatedAt: Date;
}

export interface DraftRecap24h {
  fixRequests: number;
  prSubmitted: number;
  prMerged: number;
  prRejected: number;
  glowUpDelta: number | null;
  hasChanges: boolean;
}

export interface DraftArcView {
  summary: DraftArcSummary;
  recap24h: DraftRecap24h;
}

export interface ObserverDigestEntry {
  id: string;
  observerId: string;
  draftId: string;
  title: string;
  summary: string;
  latestMilestone: string;
  studioId: string | null;
  studioName: string | null;
  fromFollowingStudio: boolean;
  isSeen: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ObserverWatchlistItem {
  observerId: string;
  draftId: string;
  createdAt: Date;
}

export interface ObserverDraftEngagement {
  observerId: string;
  draftId: string;
  isSaved: boolean;
  isRated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ObserverDigestPreferences {
  observerId: string;
  digestUnseenOnly: boolean;
  digestFollowingOnly: boolean;
  updatedAt: Date;
}

export interface DigestListOptions {
  unseenOnly?: boolean;
  fromFollowingStudioOnly?: boolean;
  limit?: number;
  offset?: number;
}

export type DraftEventType =
  | 'fix_request'
  | 'pull_request'
  | 'pull_request_decision'
  | 'draft_released'
  | 'manual';

export type PredictionOutcome = 'merge' | 'reject';
export type PredictionTrustTier = 'entry' | 'regular' | 'trusted' | 'elite';

export interface ObserverPredictionMarketProfile {
  trustTier: PredictionTrustTier;
  minStakePoints: number;
  maxStakePoints: number;
  dailyStakeCapPoints: number;
  dailyStakeUsedPoints: number;
  dailySubmissionCap: number;
  dailySubmissionsUsed: number;
}

export interface ObserverPrediction {
  id: string;
  observerId: string;
  pullRequestId: string;
  predictedOutcome: PredictionOutcome;
  stakePoints: number;
  payoutPoints: number;
  resolvedOutcome: PredictionOutcome | null;
  isCorrect: boolean | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface PullRequestPredictionSummary {
  pullRequestId: string;
  pullRequestStatus: 'pending' | 'merged' | 'rejected' | 'changes_requested';
  consensus: {
    merge: number;
    reject: number;
    total: number;
  };
  market: {
    minStakePoints: number;
    maxStakePoints: number;
    mergeStakePoints: number;
    rejectStakePoints: number;
    totalStakePoints: number;
    mergeOdds: number;
    rejectOdds: number;
    mergePayoutMultiplier: number;
    rejectPayoutMultiplier: number;
    observerNetPoints: number;
    trustTier: PredictionTrustTier;
    dailyStakeCapPoints: number;
    dailyStakeUsedPoints: number;
    dailySubmissionCap: number;
    dailySubmissionsUsed: number;
  };
  observerPrediction: ObserverPrediction | null;
  accuracy: {
    correct: number;
    total: number;
    rate: number;
  };
}

export interface DraftArcService {
  getDraftArc(draftId: string, client?: DbClient): Promise<DraftArcView>;
  recomputeDraftArcSummary(
    draftId: string,
    client?: DbClient,
  ): Promise<DraftArcSummary>;
  recordDraftEvent(
    draftId: string,
    eventType: DraftEventType,
    client?: DbClient,
  ): Promise<void>;
  submitPrediction(
    observerId: string,
    pullRequestId: string,
    predictedOutcome: PredictionOutcome,
    client?: DbClient,
    stakePoints?: number,
  ): Promise<ObserverPrediction>;
  getPredictionSummary(
    observerId: string,
    pullRequestId: string,
    client?: DbClient,
  ): Promise<PullRequestPredictionSummary>;
  getPredictionMarketProfile(
    observerId: string,
    client?: DbClient,
  ): Promise<ObserverPredictionMarketProfile>;
  followDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<ObserverWatchlistItem>;
  unfollowDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<{ removed: boolean }>;
  listWatchlist(
    observerId: string,
    client?: DbClient,
  ): Promise<ObserverWatchlistItem[]>;
  listDraftEngagements(
    observerId: string,
    client?: DbClient,
  ): Promise<ObserverDraftEngagement[]>;
  saveDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<{ saved: true }>;
  unsaveDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<{ saved: false }>;
  rateDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<{ rated: true }>;
  unrateDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<{ rated: false }>;
  getDigestPreferences(
    observerId: string,
    client?: DbClient,
  ): Promise<ObserverDigestPreferences>;
  upsertDigestPreferences(
    observerId: string,
    preferences: {
      digestUnseenOnly?: boolean;
      digestFollowingOnly?: boolean;
    },
    client?: DbClient,
  ): Promise<ObserverDigestPreferences>;
  listDigest(
    observerId: string,
    options?: DigestListOptions,
    client?: DbClient,
  ): Promise<ObserverDigestEntry[]>;
  markDigestSeen(
    observerId: string,
    entryId: string,
    client?: DbClient,
  ): Promise<ObserverDigestEntry>;
}
