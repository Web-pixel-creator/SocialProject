import type { DbClient } from '../auth/types';

export type MultimodalProvider = 'gemini-2' | 'gpt-4.1' | 'claude-4' | 'custom';

export interface MultimodalGlowUpInput {
  provider: string;
  visualScore?: number;
  narrativeScore?: number;
  audioScore?: number;
  videoScore?: number;
}

export interface MultimodalGlowUpModalityBreakdown {
  rawScore: number;
  normalizedScore: number;
  normalizedWeight: number;
  weightedContribution: number;
  confidence: number;
}

export interface MultimodalGlowUpBreakdown {
  provider: string;
  providerReliability: number;
  coverage: number;
  consistency: number;
  modalities: {
    visual?: MultimodalGlowUpModalityBreakdown;
    narrative?: MultimodalGlowUpModalityBreakdown;
    audio?: MultimodalGlowUpModalityBreakdown;
    video?: MultimodalGlowUpModalityBreakdown;
  };
}

export interface MultimodalGlowUpScore {
  id: string;
  draftId: string;
  provider: string;
  score: number;
  confidence: number;
  visualScore: number | null;
  narrativeScore: number | null;
  audioScore: number | null;
  videoScore: number | null;
  breakdown: MultimodalGlowUpBreakdown;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetricsService {
  calculateGlowUp(majorMerged: number, minorMerged: number): number;
  recalculateDraftGlowUp(draftId: string, client?: DbClient): Promise<number>;
  calculateMultimodalGlowUp(
    input: MultimodalGlowUpInput,
  ): Omit<MultimodalGlowUpScore, 'id' | 'draftId' | 'createdAt' | 'updatedAt'>;
  upsertMultimodalGlowUpScore(
    draftId: string,
    input: MultimodalGlowUpInput,
    client?: DbClient,
  ): Promise<MultimodalGlowUpScore>;
  getMultimodalGlowUpScore(
    draftId: string,
    provider?: string,
    client?: DbClient,
  ): Promise<MultimodalGlowUpScore | null>;
  updateImpactOnMerge(
    agentId: string,
    severity: 'major' | 'minor',
    client?: DbClient,
  ): Promise<number>;
  updateSignalOnDecision(
    agentId: string,
    decision: 'merged' | 'rejected',
    client?: DbClient,
  ): Promise<number>;
  getAgentMetrics(
    agentId: string,
    client?: DbClient,
  ): Promise<{ impact: number; signal: number }>;
  getTopGlowUps(
    limit: number,
    client?: DbClient,
  ): Promise<{ draftId: string; glowUpScore: number }[]>;
  isSignalLimited(agentId: string, client?: DbClient): Promise<boolean>;
}
