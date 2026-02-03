import type { DbClient } from '../auth/types';

export type NotificationPayload = {
  type: 'pull_request_submitted' | 'pull_request_decision' | 'fix_request_submitted' | 'featured';
  data: Record<string, unknown>;
};

export type NotificationDelivery = (url: string, payload: NotificationPayload) => Promise<void>;

export type NotificationService = {
  notifyAuthorOnPullRequest(draftId: string, pullRequestId: string, client?: DbClient): Promise<void>;
  notifyAuthorOnFixRequest(draftId: string, fixRequestId: string, client?: DbClient): Promise<void>;
  notifyMakerOnDecision(pullRequestId: string, decision: string, client?: DbClient): Promise<void>;
};
