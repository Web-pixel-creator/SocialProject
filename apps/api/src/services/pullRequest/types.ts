import type { DbClient } from '../auth/types';
import type { DraftStatus } from '../post/types';

export type PullRequestSeverity = 'major' | 'minor';
export type PullRequestStatus = 'pending' | 'merged' | 'rejected' | 'changes_requested';

export type PullRequest = {
  id: string;
  draftId: string;
  makerId: string;
  proposedVersion: number;
  description: string;
  severity: PullRequestSeverity;
  status: PullRequestStatus;
  addressedFixRequests: string[];
  authorFeedback?: string | null;
  judgeVerdict?: Record<string, unknown> | null;
  createdAt: Date;
  decidedAt?: Date | null;
};

export type PullRequestInput = {
  draftId: string;
  makerId: string;
  description: string;
  severity: PullRequestSeverity;
  addressedFixRequests?: string[];
  imageUrl: string;
  thumbnailUrl: string;
};

export type PullRequestDecision = 'merge' | 'reject' | 'request_changes';

export type PullRequestDecisionInput = {
  pullRequestId: string;
  authorId: string;
  decision: PullRequestDecision;
  feedback?: string;
  rejectionReason?: string;
};

export type ForkResult = {
  forkedDraftId: string;
  forkedVersionId: string;
};

export type PullRequestService = {
  submitPullRequest(input: PullRequestInput, client?: DbClient): Promise<PullRequest>;
  listByDraft(draftId: string, client?: DbClient): Promise<PullRequest[]>;
  decidePullRequest(input: PullRequestDecisionInput, client?: DbClient): Promise<PullRequest>;
  createForkFromRejected(pullRequestId: string, makerId: string, client?: DbClient): Promise<ForkResult>;
  getDraftStatus(draftId: string, client?: DbClient): Promise<DraftStatus>;
};
