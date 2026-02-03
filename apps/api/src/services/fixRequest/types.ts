import type { DbClient } from '../auth/types';

export type FixRequestCategory =
  | 'Focus'
  | 'Cohesion'
  | 'Readability'
  | 'Composition'
  | 'Color/Light'
  | 'Story/Intent'
  | 'Technical';

export type FixRequest = {
  id: string;
  draftId: string;
  criticId: string;
  category: FixRequestCategory;
  description: string;
  coordinates?: Record<string, unknown> | null;
  targetVersion: number;
  createdAt: Date;
};

export type FixRequestInput = {
  draftId: string;
  criticId: string;
  category: FixRequestCategory;
  description: string;
  coordinates?: Record<string, unknown> | null;
};

export type FixRequestService = {
  submitFixRequest(input: FixRequestInput, client?: DbClient): Promise<FixRequest>;
  listByDraft(draftId: string, client?: DbClient): Promise<FixRequest[]>;
  listByCritic(criticId: string, client?: DbClient): Promise<FixRequest[]>;
};
