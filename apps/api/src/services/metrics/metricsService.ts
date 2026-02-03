import { Pool } from 'pg';
import { ServiceError } from '../common/errors';
import type { DbClient } from '../auth/types';
import type { MetricsService } from './types';
import {
  GLOWUP_MAJOR_WEIGHT,
  GLOWUP_MINOR_WEIGHT,
  IMPACT_MAJOR_INCREMENT,
  IMPACT_MINOR_INCREMENT,
  SIGNAL_LOWER_THRESHOLD,
  SIGNAL_MAX,
  SIGNAL_MIN
} from './constants';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

export class MetricsServiceImpl implements MetricsService {
  constructor(private readonly pool: Pool) {}

  calculateGlowUp(majorMerged: number, minorMerged: number): number {
    const prCount = majorMerged + minorMerged;
    if (prCount === 0) {
      return 0;
    }
    const weighted = majorMerged * GLOWUP_MAJOR_WEIGHT + minorMerged * GLOWUP_MINOR_WEIGHT;
    return weighted * (1 + Math.log(prCount + 1));
  }

  async recalculateDraftGlowUp(draftId: string, client?: DbClient): Promise<number> {
    const db = getDb(this.pool, client);

    const counts = await db.query(
      `SELECT
        SUM(CASE WHEN severity = 'major' THEN 1 ELSE 0 END) AS major_count,
        SUM(CASE WHEN severity = 'minor' THEN 1 ELSE 0 END) AS minor_count
       FROM pull_requests
       WHERE draft_id = $1 AND status = 'merged'`,
      [draftId]
    );

    const major = Number(counts.rows[0].major_count ?? 0);
    const minor = Number(counts.rows[0].minor_count ?? 0);

    const glowUp = this.calculateGlowUp(major, minor);

    const updated = await db.query(
      'UPDATE drafts SET glow_up_score = $1, updated_at = NOW() WHERE id = $2 RETURNING glow_up_score',
      [glowUp, draftId]
    );

    if (updated.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }

    return Number(updated.rows[0].glow_up_score);
  }

  async updateImpactOnMerge(agentId: string, severity: 'major' | 'minor', client?: DbClient): Promise<number> {
    const db = getDb(this.pool, client);
    const increment = severity === 'major' ? IMPACT_MAJOR_INCREMENT : IMPACT_MINOR_INCREMENT;

    const result = await db.query(
      'UPDATE agents SET impact = impact + $1 WHERE id = $2 RETURNING impact',
      [increment, agentId]
    );

    if (result.rows.length === 0) {
      throw new ServiceError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    return Number(result.rows[0].impact);
  }

  async updateSignalOnDecision(agentId: string, decision: 'merged' | 'rejected', client?: DbClient): Promise<number> {
    const db = getDb(this.pool, client);
    const result = await db.query('SELECT signal FROM agents WHERE id = $1', [agentId]);

    if (result.rows.length === 0) {
      throw new ServiceError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    const current = Number(result.rows[0].signal);
    const updatedSignal = decision === 'merged'
      ? Math.min(SIGNAL_MAX, current * 1.1)
      : Math.max(SIGNAL_MIN, current * 0.9);

    const updated = await db.query('UPDATE agents SET signal = $1 WHERE id = $2 RETURNING signal', [
      updatedSignal,
      agentId
    ]);

    return Number(updated.rows[0].signal);
  }

  async getAgentMetrics(agentId: string, client?: DbClient): Promise<{ impact: number; signal: number }> {
    const db = getDb(this.pool, client);
    const result = await db.query('SELECT impact, signal FROM agents WHERE id = $1', [agentId]);

    if (result.rows.length === 0) {
      throw new ServiceError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    return {
      impact: Number(result.rows[0].impact),
      signal: Number(result.rows[0].signal)
    };
  }

  async getTopGlowUps(limit: number, client?: DbClient): Promise<{ draftId: string; glowUpScore: number }[]> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      'SELECT id, glow_up_score FROM drafts ORDER BY glow_up_score DESC LIMIT $1',
      [limit]
    );

    return result.rows.map((row: any) => ({
      draftId: row.id,
      glowUpScore: Number(row.glow_up_score)
    }));
  }

  async isSignalLimited(agentId: string, client?: DbClient): Promise<boolean> {
    const metrics = await this.getAgentMetrics(agentId, client);
    return metrics.signal < SIGNAL_LOWER_THRESHOLD;
  }
}
