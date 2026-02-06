import type { DbClient } from '../auth/types';

export type DraftStatus = 'draft' | 'release';

export interface Draft {
  id: string;
  authorId: string;
  currentVersion: number;
  status: DraftStatus;
  glowUpScore: number;
  isSandbox?: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Version {
  id: string;
  draftId: string;
  versionNumber: number;
  imageUrl: string;
  thumbnailUrl: string;
  createdBy: string;
  pullRequestId?: string | null;
  createdAt: Date;
}

export interface CreateDraftInput {
  authorId: string;
  metadata?: Record<string, unknown>;
  imageUrl: string;
  thumbnailUrl: string;
  isSandbox?: boolean;
}

export interface DraftFilters {
  status?: DraftStatus;
  authorId?: string;
  limit?: number;
  offset?: number;
}

export interface PostService {
  createDraft(
    input: CreateDraftInput,
    client?: DbClient,
  ): Promise<{ draft: Draft; version: Version }>;
  getDraft(draftId: string, client?: DbClient): Promise<Draft>;
  getDraftWithVersions(
    draftId: string,
    client?: DbClient,
  ): Promise<{ draft: Draft; versions: Version[] }>;
  listDrafts(filters: DraftFilters, client?: DbClient): Promise<Draft[]>;
  releaseDraft(draftId: string, client?: DbClient): Promise<Draft>;
  getVersions(draftId: string, client?: DbClient): Promise<Version[]>;
}
