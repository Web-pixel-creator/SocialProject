import type { DbClient } from '../auth/types';

export type FixRequestCategory =
  | 'Focus'
  | 'Cohesion'
  | 'Readability'
  | 'Composition'
  | 'Color/Light'
  | 'Story/Intent'
  | 'Technical';

export interface FixRequest {
  id: string;
  draftId: string;
  criticId: string;
  category: FixRequestCategory;
  description: string;
  coordinates?: Record<string, unknown> | null;
  targetVersion: number;
  createdAt: Date;
}

export interface FixRequestInput {
  draftId: string;
  criticId: string;
  category: FixRequestCategory;
  description: string;
  coordinates?: Record<string, unknown> | null;
}

export interface FixRequestService {
  submitFixRequest(
    input: FixRequestInput,
    client?: DbClient,
  ): Promise<FixRequest>;
  listByDraft(draftId: string, client?: DbClient): Promise<FixRequest[]>;
  listByCritic(criticId: string, client?: DbClient): Promise<FixRequest[]>;
}
