import type { DbClient } from '../auth/types';

export type DraftArcState = 'needs_help' | 'in_progress' | 'ready_for_review' | 'released';

export type DraftArcSummary = {
  draftId: string;
  state: DraftArcState;
  latestMilestone: string;
  fixOpenCount: number;
  prPendingCount: number;
  lastMergeAt: Date | null;
  updatedAt: Date;
};

export type DraftRecap24h = {
  fixRequests: number;
  prSubmitted: number;
  prMerged: number;
  prRejected: number;
  glowUpDelta: number | null;
  hasChanges: boolean;
};

export type DraftArcView = {
  summary: DraftArcSummary;
  recap24h: DraftRecap24h;
};

export type ObserverDigestEntry = {
  id: string;
  observerId: string;
  draftId: string;
  title: string;
  summary: string;
  latestMilestone: string;
  isSeen: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ObserverWatchlistItem = {
  observerId: string;
  draftId: string;
  createdAt: Date;
};

export type DigestListOptions = {
  unseenOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type DraftEventType =
  | 'fix_request'
  | 'pull_request'
  | 'pull_request_decision'
  | 'draft_released'
  | 'manual';

export type PredictionOutcome = 'merge' | 'reject';

export type ObserverPrediction = {
  id: string;
  observerId: string;
  pullRequestId: string;
  predictedOutcome: PredictionOutcome;
  resolvedOutcome: PredictionOutcome | null;
  isCorrect: boolean | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

export type PullRequestPredictionSummary = {
  pullRequestId: string;
  pullRequestStatus: 'pending' | 'merged' | 'rejected' | 'changes_requested';
  consensus: {
    merge: number;
    reject: number;
    total: number;
  };
  observerPrediction: ObserverPrediction | null;
  accuracy: {
    correct: number;
    total: number;
    rate: number;
  };
};

export type DraftArcService = {
  getDraftArc(draftId: string, client?: DbClient): Promise<DraftArcView>;
  recomputeDraftArcSummary(draftId: string, client?: DbClient): Promise<DraftArcSummary>;
  recordDraftEvent(draftId: string, eventType: DraftEventType, client?: DbClient): Promise<void>;
  submitPrediction(
    observerId: string,
    pullRequestId: string,
    predictedOutcome: PredictionOutcome,
    client?: DbClient
  ): Promise<ObserverPrediction>;
  getPredictionSummary(
    observerId: string,
    pullRequestId: string,
    client?: DbClient
  ): Promise<PullRequestPredictionSummary>;
  followDraft(observerId: string, draftId: string, client?: DbClient): Promise<ObserverWatchlistItem>;
  unfollowDraft(observerId: string, draftId: string, client?: DbClient): Promise<{ removed: boolean }>;
  listWatchlist(observerId: string, client?: DbClient): Promise<ObserverWatchlistItem[]>;
  listDigest(
    observerId: string,
    options?: DigestListOptions,
    client?: DbClient
  ): Promise<ObserverDigestEntry[]>;
  markDigestSeen(observerId: string, entryId: string, client?: DbClient): Promise<ObserverDigestEntry>;
};
