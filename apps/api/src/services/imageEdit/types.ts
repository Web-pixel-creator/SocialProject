import type { DbClient } from '../auth/types';
import type { PullRequest, PullRequestSeverity } from '../pullRequest/types';
import type { ProviderLaneResolvedRoute } from '../providerRouting/types';

export const IMAGE_EDIT_JOB_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;

export type ImageEditJobStatus = (typeof IMAGE_EDIT_JOB_STATUSES)[number];

export const IMAGE_EDIT_ASPECT_RATIOS = [
  'auto',
  '21:9',
  '16:9',
  '3:2',
  '4:3',
  '5:4',
  '1:1',
  '4:5',
  '3:4',
  '2:3',
  '9:16',
] as const;

export type ImageEditAspectRatio = (typeof IMAGE_EDIT_ASPECT_RATIOS)[number];

export interface ImageEditCandidate {
  id: string;
  jobId: string;
  draftId: string;
  position: number;
  provider: string;
  model: string;
  sourceArtifactUrl: string;
  imageUrl: string;
  thumbnailUrl: string;
  imageStorageKey: string | null;
  thumbnailStorageKey: string | null;
  promotedPullRequestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  promotedAt: Date | null;
}

export interface ImageEditJob {
  id: string;
  draftId: string;
  sourceVersionId: string;
  sourceVersionNumber: number;
  prompt: string;
  numImages: number;
  aspectRatio: ImageEditAspectRatio | null;
  referenceImageUrls: string[];
  provider: string;
  model: string;
  providerRequestId: string;
  providerStatus: string | null;
  status: ImageEditJobStatus;
  failureCode: string | null;
  failureMessage: string | null;
  requestedByType: 'admin' | 'agent' | 'observer' | 'system';
  requestedById: string | null;
  route: ProviderLaneResolvedRoute | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date | null;
  completedAt: Date | null;
  candidates: ImageEditCandidate[];
}

export interface CreateImageEditJobInput {
  draftId: string;
  prompt: string;
  sourceVersionNumber?: number;
  numImages?: number;
  aspectRatio?: ImageEditAspectRatio;
  referenceImageUrls?: string[];
  preferredProviders?: string[];
  requestedByType?: 'admin' | 'agent' | 'observer' | 'system';
  requestedById?: string | null;
}

export interface ListImageEditJobsOptions {
  refreshActive?: boolean;
}

export interface PromoteImageEditCandidateInput {
  draftId: string;
  candidateId: string;
  makerId: string;
  description: string;
  severity: PullRequestSeverity;
  addressedFixRequests?: string[];
}

export interface PromoteImageEditCandidateResult {
  candidate: ImageEditCandidate;
  pullRequest: PullRequest;
}

export interface ImageEditService {
  createJob(input: CreateImageEditJobInput): Promise<ImageEditJob>;
  listJobsByDraft(draftId: string, options?: ListImageEditJobsOptions): Promise<ImageEditJob[]>;
  promoteCandidateToPullRequest(
    input: PromoteImageEditCandidateInput,
    client?: DbClient,
  ): Promise<PromoteImageEditCandidateResult>;
}
