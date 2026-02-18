import type { DbClient } from '../auth/types';

export type CreatorStudioStatus = 'draft' | 'active' | 'paused';
export type CreatorOnboardingStep =
  | 'profile'
  | 'governance'
  | 'billing'
  | 'ready';
export type CreatorStylePreset =
  | 'balanced'
  | 'bold'
  | 'minimal'
  | 'experimental';
export type CreatorModerationMode = 'strict' | 'balanced' | 'open';

export type CreatorStudioEventType =
  | 'created'
  | 'profile_completed'
  | 'governance_configured'
  | 'billing_connected'
  | 'activated'
  | 'retention_ping';

export interface CreatorGovernance {
  autoApproveThreshold: number;
  majorPrRequiresHuman: boolean;
  allowForks: boolean;
  moderationMode: CreatorModerationMode;
}

export interface CreatorStudio {
  id: string;
  ownerUserId: string;
  studioName: string;
  tagline: string;
  stylePreset: CreatorStylePreset;
  governance: CreatorGovernance;
  revenueSharePercent: number;
  status: CreatorStudioStatus;
  onboardingStep: CreatorOnboardingStep;
  onboardingCompletedAt: Date | null;
  retentionScore: number;
  createdAt: Date;
  updatedAt: Date;
  lastEventAt: Date | null;
}

export interface CreatorStudioEvent {
  id: string;
  studioId: string;
  ownerUserId: string;
  eventType: CreatorStudioEventType;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateCreatorStudioInput {
  studioName: string;
  tagline?: string;
  stylePreset?: CreatorStylePreset;
  revenueSharePercent?: number;
}

export interface UpdateCreatorGovernanceInput {
  governance?: Partial<CreatorGovernance>;
  revenueSharePercent?: number;
}

export interface CreatorStudioListFilters {
  status?: CreatorStudioStatus;
  ownerUserId?: string;
  limit?: number;
  offset?: number;
}

export interface CreatorFunnelSummary {
  windowDays: number;
  created: number;
  profileCompleted: number;
  governanceConfigured: number;
  billingConnected: number;
  activated: number;
  retentionPing: number;
  activationRatePercent: number;
}

export interface CreatorStudioService {
  createStudio(
    ownerUserId: string,
    input: CreateCreatorStudioInput,
    client?: DbClient,
  ): Promise<CreatorStudio>;
  listStudios(
    filters?: CreatorStudioListFilters,
    client?: DbClient,
  ): Promise<CreatorStudio[]>;
  getStudio(id: string, client?: DbClient): Promise<CreatorStudio | null>;
  updateGovernance(
    id: string,
    ownerUserId: string,
    input: UpdateCreatorGovernanceInput,
    client?: DbClient,
  ): Promise<CreatorStudio>;
  connectBilling(
    id: string,
    ownerUserId: string,
    providerAccountId?: string,
    client?: DbClient,
  ): Promise<CreatorStudio>;
  retentionPing(
    id: string,
    ownerUserId: string,
    client?: DbClient,
  ): Promise<CreatorStudio>;
  getFunnelSummary(
    ownerUserId: string,
    windowDays?: number,
    client?: DbClient,
  ): Promise<CreatorFunnelSummary>;
}
