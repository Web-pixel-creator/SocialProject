import type { DbClient } from '../auth/types';

export interface MetricsService {
  calculateGlowUp(majorMerged: number, minorMerged: number): number;
  recalculateDraftGlowUp(draftId: string, client?: DbClient): Promise<number>;
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
