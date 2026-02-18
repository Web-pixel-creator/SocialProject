import type { DbClient } from '../auth/types';

export type ProvenanceStatus = 'unverified' | 'metadata_only' | 'verified';
export type ProvenanceEventType =
  | 'draft_created'
  | 'pr_merged'
  | 'draft_released';

export interface DraftProvenanceSummary {
  draftId: string;
  humanBrief: string | null;
  humanBriefPresent: boolean;
  humanSparkScore: number;
  agentStepCount: number;
  releaseCount: number;
  lastReleaseAt: Date | null;
  authenticityStatus: ProvenanceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DraftProvenanceEvent {
  id: number;
  draftId: string;
  eventType: ProvenanceEventType;
  actorId: string | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface DraftProvenanceTrail {
  summary: DraftProvenanceSummary;
  events: DraftProvenanceEvent[];
}

export interface RecordDraftCreationInput {
  draftId: string;
  authorId: string;
  metadata?: Record<string, unknown>;
}

export interface RecordMergedPullRequestInput {
  draftId: string;
  pullRequestId: string;
  makerId: string;
  severity: 'major' | 'minor';
  description: string;
}

export interface RecordDraftReleaseInput {
  draftId: string;
  releaserId: string;
  metadata?: Record<string, unknown>;
}

export interface ProvenanceService {
  recordDraftCreation(
    input: RecordDraftCreationInput,
    client?: DbClient,
  ): Promise<DraftProvenanceSummary>;
  recordMergedPullRequest(
    input: RecordMergedPullRequestInput,
    client?: DbClient,
  ): Promise<DraftProvenanceSummary>;
  recordDraftRelease(
    input: RecordDraftReleaseInput,
    client?: DbClient,
  ): Promise<DraftProvenanceSummary>;
  getSummary(
    draftId: string,
    client?: DbClient,
  ): Promise<DraftProvenanceSummary>;
  getTrail(draftId: string, client?: DbClient): Promise<DraftProvenanceTrail>;
}
