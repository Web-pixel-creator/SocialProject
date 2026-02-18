import type { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import {
  GLOWUP_MAJOR_WEIGHT,
  GLOWUP_MINOR_WEIGHT,
  IMPACT_MAJOR_INCREMENT,
  IMPACT_MINOR_INCREMENT,
  SIGNAL_LOWER_THRESHOLD,
  SIGNAL_MAX,
  SIGNAL_MIN,
} from './constants';
import type {
  MetricsService,
  MultimodalGlowUpBreakdown,
  MultimodalGlowUpInput,
  MultimodalGlowUpScore,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const ROUND_PRECISION = 1000;
const MODALITY_KEYS = ['visual', 'narrative', 'audio', 'video'] as const;
type ModalityKey = (typeof MODALITY_KEYS)[number];
type ModalityScoreMap = Partial<Record<ModalityKey, number>>;

const MODALITY_BASE_WEIGHTS: Record<ModalityKey, number> = {
  visual: 0.45,
  narrative: 0.35,
  audio: 0.1,
  video: 0.1,
};

interface ProviderProfile {
  reliability: number;
  multipliers: Record<ModalityKey, number>;
}

const DEFAULT_PROVIDER_PROFILE: ProviderProfile = {
  reliability: 0.85,
  multipliers: {
    visual: 1,
    narrative: 1,
    audio: 1,
    video: 1,
  },
};

const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
  'gemini-2': {
    reliability: 0.91,
    multipliers: {
      visual: 1,
      narrative: 0.98,
      audio: 1.01,
      video: 1.01,
    },
  },
  'gpt-4.1': {
    reliability: 0.9,
    multipliers: {
      visual: 0.99,
      narrative: 1,
      audio: 0.98,
      video: 0.99,
    },
  },
  'claude-4': {
    reliability: 0.88,
    multipliers: {
      visual: 0.98,
      narrative: 1.01,
      audio: 0.97,
      video: 0.98,
    },
  },
};

interface MultimodalGlowUpRow {
  id: string;
  draft_id: string;
  provider: string;
  score: number | string;
  confidence: number | string;
  visual_score: number | string | null;
  narrative_score: number | string | null;
  audio_score: number | string | null;
  video_score: number | string | null;
  breakdown: MultimodalGlowUpBreakdown;
  created_at: Date;
  updated_at: Date;
}

const round3 = (value: number): number =>
  Math.round(value * ROUND_PRECISION) / ROUND_PRECISION;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toNullableNumber = (value: number | string | null): number | null =>
  value == null ? null : Number(value);

const mapMultimodalRow = (row: MultimodalGlowUpRow): MultimodalGlowUpScore => ({
  id: row.id,
  draftId: row.draft_id,
  provider: row.provider,
  score: Number(row.score),
  confidence: Number(row.confidence),
  visualScore: toNullableNumber(row.visual_score),
  narrativeScore: toNullableNumber(row.narrative_score),
  audioScore: toNullableNumber(row.audio_score),
  videoScore: toNullableNumber(row.video_score),
  breakdown: row.breakdown,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizeProvider = (provider: string | undefined): string =>
  provider?.trim().toLowerCase() || 'custom';

const pickProviderProfile = (provider: string): ProviderProfile =>
  PROVIDER_PROFILES[provider] ?? DEFAULT_PROVIDER_PROFILE;

const ensureValidModalityScore = (
  score: number | undefined,
  fieldName: string,
): void => {
  if (score === undefined) {
    return;
  }
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new ServiceError(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
      `${fieldName} must be a finite value in range 0..100.`,
      400,
    );
  }
};

const stdDev = (values: number[]): number => {
  if (values.length <= 1) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

export class MetricsServiceImpl implements MetricsService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  calculateGlowUp(majorMerged: number, minorMerged: number): number {
    const prCount = majorMerged + minorMerged;
    if (prCount === 0) {
      return 0;
    }
    const weighted =
      majorMerged * GLOWUP_MAJOR_WEIGHT + minorMerged * GLOWUP_MINOR_WEIGHT;
    return weighted * (1 + Math.log(prCount + 1));
  }

  async recalculateDraftGlowUp(
    draftId: string,
    client?: DbClient,
  ): Promise<number> {
    const db = getDb(this.pool, client);

    const counts = await db.query(
      `SELECT
        SUM(CASE WHEN severity = 'major' THEN 1 ELSE 0 END) AS major_count,
        SUM(CASE WHEN severity = 'minor' THEN 1 ELSE 0 END) AS minor_count
       FROM pull_requests
       WHERE draft_id = $1 AND status = 'merged'`,
      [draftId],
    );

    const major = Number(counts.rows[0].major_count ?? 0);
    const minor = Number(counts.rows[0].minor_count ?? 0);

    const glowUp = this.calculateGlowUp(major, minor);

    const updated = await db.query(
      'UPDATE drafts SET glow_up_score = $1, updated_at = NOW() WHERE id = $2 RETURNING glow_up_score',
      [glowUp, draftId],
    );

    if (updated.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }

    return Number(updated.rows[0].glow_up_score);
  }

  calculateMultimodalGlowUp(
    input: MultimodalGlowUpInput,
  ): Omit<MultimodalGlowUpScore, 'id' | 'draftId' | 'createdAt' | 'updatedAt'> {
    ensureValidModalityScore(input.visualScore, 'visualScore');
    ensureValidModalityScore(input.narrativeScore, 'narrativeScore');
    ensureValidModalityScore(input.audioScore, 'audioScore');
    ensureValidModalityScore(input.videoScore, 'videoScore');

    const provider = normalizeProvider(input.provider);
    const profile = pickProviderProfile(provider);

    const rawScores: ModalityScoreMap = {
      visual: input.visualScore,
      narrative: input.narrativeScore,
      audio: input.audioScore,
      video: input.videoScore,
    };

    const activeModalities = MODALITY_KEYS.filter(
      (key) => rawScores[key] !== undefined,
    );
    if (activeModalities.length === 0) {
      throw new ServiceError(
        'MULTIMODAL_GLOWUP_INVALID_INPUT',
        'At least one modality score must be provided.',
        400,
      );
    }

    const totalWeight = activeModalities.reduce(
      (sum, key) => sum + MODALITY_BASE_WEIGHTS[key],
      0,
    );

    const normalizedValues: number[] = [];
    const breakdownModalities: NonNullable<
      MultimodalGlowUpBreakdown['modalities']
    > = {};
    let weightedScore = 0;

    for (const modality of activeModalities) {
      const rawScore = rawScores[modality] as number;
      const normalized = clamp(
        rawScore * profile.multipliers[modality],
        0,
        100,
      );
      normalizedValues.push(normalized);

      const normalizedWeight = MODALITY_BASE_WEIGHTS[modality] / totalWeight;
      const contribution = normalized * normalizedWeight;
      weightedScore += contribution;

      const drift = Math.abs(normalized - rawScore);
      const modalityConfidence = clamp(
        0.55 + profile.reliability * 0.35 + (1 - drift / 100) * 0.1,
        0,
        1,
      );

      breakdownModalities[modality] = {
        rawScore: round3(rawScore),
        normalizedScore: round3(normalized),
        normalizedWeight: round3(normalizedWeight),
        weightedContribution: round3(contribution),
        confidence: round3(modalityConfidence),
      };
    }

    const coverage = activeModalities.length / MODALITY_KEYS.length;
    const consistency = clamp(1 - stdDev(normalizedValues) / 50, 0, 1);
    const confidence = clamp(
      0.4 * coverage + 0.35 * consistency + 0.25 * profile.reliability,
      0,
      1,
    );

    const score = round3(weightedScore);
    const roundedConfidence = round3(confidence);

    return {
      provider,
      score,
      confidence: roundedConfidence,
      visualScore: rawScores.visual ?? null,
      narrativeScore: rawScores.narrative ?? null,
      audioScore: rawScores.audio ?? null,
      videoScore: rawScores.video ?? null,
      breakdown: {
        provider,
        providerReliability: round3(profile.reliability),
        coverage: round3(coverage),
        consistency: round3(consistency),
        modalities: breakdownModalities,
      },
    };
  }

  async upsertMultimodalGlowUpScore(
    draftId: string,
    input: MultimodalGlowUpInput,
    client?: DbClient,
  ): Promise<MultimodalGlowUpScore> {
    const db = getDb(this.pool, client);

    const draftResult = await db.query('SELECT id FROM drafts WHERE id = $1', [
      draftId,
    ]);
    if (draftResult.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }

    const computed = this.calculateMultimodalGlowUp(input);

    const result = await db.query(
      `INSERT INTO multimodal_glowup_scores (
         draft_id,
         provider,
         score,
         confidence,
         visual_score,
         narrative_score,
         audio_score,
         video_score,
         breakdown
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (draft_id, provider)
       DO UPDATE SET
         score = EXCLUDED.score,
         confidence = EXCLUDED.confidence,
         visual_score = EXCLUDED.visual_score,
         narrative_score = EXCLUDED.narrative_score,
         audio_score = EXCLUDED.audio_score,
         video_score = EXCLUDED.video_score,
         breakdown = EXCLUDED.breakdown,
         updated_at = NOW()
       RETURNING *`,
      [
        draftId,
        computed.provider,
        computed.score,
        computed.confidence,
        computed.visualScore,
        computed.narrativeScore,
        computed.audioScore,
        computed.videoScore,
        JSON.stringify(computed.breakdown),
      ],
    );

    return mapMultimodalRow(result.rows[0] as MultimodalGlowUpRow);
  }

  async getMultimodalGlowUpScore(
    draftId: string,
    provider?: string,
    client?: DbClient,
  ): Promise<MultimodalGlowUpScore | null> {
    const db = getDb(this.pool, client);
    const normalizedProvider =
      typeof provider === 'string' && provider.trim().length > 0
        ? normalizeProvider(provider)
        : null;

    const result = normalizedProvider
      ? await db.query(
          `SELECT *
           FROM multimodal_glowup_scores
           WHERE draft_id = $1
             AND provider = $2
           ORDER BY updated_at DESC
           LIMIT 1`,
          [draftId, normalizedProvider],
        )
      : await db.query(
          `SELECT *
           FROM multimodal_glowup_scores
           WHERE draft_id = $1
           ORDER BY updated_at DESC
           LIMIT 1`,
          [draftId],
        );

    if (result.rows.length === 0) {
      return null;
    }

    return mapMultimodalRow(result.rows[0] as MultimodalGlowUpRow);
  }

  async updateImpactOnMerge(
    agentId: string,
    severity: 'major' | 'minor',
    client?: DbClient,
  ): Promise<number> {
    const db = getDb(this.pool, client);
    const increment =
      severity === 'major' ? IMPACT_MAJOR_INCREMENT : IMPACT_MINOR_INCREMENT;

    const result = await db.query(
      'UPDATE agents SET impact = impact + $1 WHERE id = $2 RETURNING impact',
      [increment, agentId],
    );

    if (result.rows.length === 0) {
      throw new ServiceError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    return Number(result.rows[0].impact);
  }

  async updateSignalOnDecision(
    agentId: string,
    decision: 'merged' | 'rejected',
    client?: DbClient,
  ): Promise<number> {
    const db = getDb(this.pool, client);
    const result = await db.query('SELECT signal FROM agents WHERE id = $1', [
      agentId,
    ]);

    if (result.rows.length === 0) {
      throw new ServiceError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    const current = Number(result.rows[0].signal);
    const updatedSignal =
      decision === 'merged'
        ? Math.min(SIGNAL_MAX, current * 1.1)
        : Math.max(SIGNAL_MIN, current * 0.9);

    const updated = await db.query(
      'UPDATE agents SET signal = $1 WHERE id = $2 RETURNING signal',
      [updatedSignal, agentId],
    );

    return Number(updated.rows[0].signal);
  }

  async getAgentMetrics(
    agentId: string,
    client?: DbClient,
  ): Promise<{ impact: number; signal: number }> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      'SELECT impact, signal FROM agents WHERE id = $1',
      [agentId],
    );

    if (result.rows.length === 0) {
      throw new ServiceError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    return {
      impact: Number(result.rows[0].impact),
      signal: Number(result.rows[0].signal),
    };
  }

  async getTopGlowUps(
    limit: number,
    client?: DbClient,
  ): Promise<{ draftId: string; glowUpScore: number }[]> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      'SELECT id, glow_up_score FROM drafts ORDER BY glow_up_score DESC LIMIT $1',
      [limit],
    );

    return result.rows.map((row) => ({
      draftId: (row as { id: string }).id,
      glowUpScore: Number((row as { glow_up_score: number }).glow_up_score),
    }));
  }

  async isSignalLimited(agentId: string, client?: DbClient): Promise<boolean> {
    const metrics = await this.getAgentMetrics(agentId, client);
    return metrics.signal < SIGNAL_LOWER_THRESHOLD;
  }
}
