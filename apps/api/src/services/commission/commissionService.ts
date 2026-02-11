import type { Pool } from 'pg';
import {
  CANCEL_WINDOW_HOURS,
  MAX_OPEN_COMMISSIONS_PER_24H,
  MAX_REWARD,
} from '../../config/commission';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import { MetricsServiceImpl } from '../metrics/metricsService';
import type {
  Commission,
  CommissionFilters,
  CommissionInput,
  CommissionService,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

interface CommissionRow {
  id: string;
  user_id: string;
  description: string;
  reference_images: string[] | null;
  reward_amount: number | null;
  currency: string | null;
  payment_status: Commission['paymentStatus'];
  status: Commission['status'];
  winner_draft_id: string | null;
  created_at: Date;
  completed_at: Date | null;
  escrowed_at: Date | null;
}

const mapCommission = (row: CommissionRow): Commission => ({
  id: row.id,
  userId: row.user_id,
  description: row.description,
  referenceImages: row.reference_images ?? [],
  rewardAmount: row.reward_amount,
  currency: row.currency,
  paymentStatus: row.payment_status,
  status: row.status,
  winnerDraftId: row.winner_draft_id,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  escrowedAt: row.escrowed_at,
});

export class CommissionServiceImpl implements CommissionService {
  private readonly pool: Pool;
  private readonly metricsService: MetricsServiceImpl;

  constructor(pool: Pool, metricsService?: MetricsServiceImpl) {
    this.pool = pool;
    this.metricsService = metricsService ?? new MetricsServiceImpl(pool);
  }

  async createCommission(
    input: CommissionInput,
    client?: DbClient,
  ): Promise<Commission> {
    const db = getDb(this.pool, client);

    if (!(input.userId && input.description)) {
      throw new ServiceError(
        'COMMISSION_REQUIRED_FIELDS',
        'User and description are required.',
      );
    }

    if (input.rewardAmount && input.rewardAmount > MAX_REWARD) {
      throw new ServiceError(
        'COMMISSION_REWARD_CAP',
        `Reward exceeds max ${MAX_REWARD}.`,
      );
    }

    const openCount = await db.query(
      `SELECT COUNT(*)::int AS count FROM commissions
       WHERE user_id = $1 AND status = 'open' AND created_at > NOW() - INTERVAL '24 hours'`,
      [input.userId],
    );

    if (Number(openCount.rows[0].count) >= MAX_OPEN_COMMISSIONS_PER_24H) {
      throw new ServiceError(
        'COMMISSION_RATE_LIMIT',
        'Commission rate limit exceeded.',
      );
    }

    const paymentStatus = input.rewardAmount ? 'pending' : 'unpaid';
    const currency = input.currency ?? 'USD';

    const result = await db.query(
      `INSERT INTO commissions
        (user_id, description, reference_images, reward_amount, currency, payment_status, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open') RETURNING *`,
      [
        input.userId,
        input.description,
        JSON.stringify(input.referenceImages ?? []),
        input.rewardAmount ?? null,
        currency,
        paymentStatus,
      ],
    );

    return mapCommission(result.rows[0] as CommissionRow);
  }

  async listCommissions(
    filters: CommissionFilters,
    client?: DbClient,
  ): Promise<Commission[]> {
    const db = getDb(this.pool, client);
    const { status, forAgents } = filters;

    let query = 'SELECT * FROM commissions WHERE 1=1';
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (forAgents) {
      params.push('escrowed');
      query += ` AND (payment_status = $${params.length} OR reward_amount IS NULL)`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    return result.rows.map((row) => mapCommission(row as CommissionRow));
  }

  async getCommissionById(
    commissionId: string,
    client?: DbClient,
  ): Promise<Commission | null> {
    const db = getDb(this.pool, client);
    const result = await db.query('SELECT * FROM commissions WHERE id = $1', [
      commissionId,
    ]);
    if (result.rows.length === 0) {
      return null;
    }
    return mapCommission(result.rows[0] as CommissionRow);
  }

  async submitResponse(
    commissionId: string,
    draftId: string,
    _agentId: string,
    client?: DbClient,
  ): Promise<void> {
    const db = getDb(this.pool, client);
    await db.query(
      'INSERT INTO commission_responses (commission_id, draft_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [commissionId, draftId],
    );
  }

  async selectWinner(
    commissionId: string,
    winnerDraftId: string,
    userId: string,
    client?: DbClient,
  ): Promise<Commission> {
    const db = getDb(this.pool, client);
    const commission = await db.query(
      'SELECT * FROM commissions WHERE id = $1',
      [commissionId],
    );

    if (commission.rows.length === 0) {
      throw new ServiceError(
        'COMMISSION_NOT_FOUND',
        'Commission not found.',
        404,
      );
    }

    const commissionRow = commission.rows[0] as CommissionRow;
    if (commissionRow.user_id !== userId) {
      throw new ServiceError(
        'COMMISSION_NOT_OWNER',
        'Only the creator can select a winner.',
        403,
      );
    }

    const updated = await db.query(
      `UPDATE commissions
       SET winner_draft_id = $1, status = 'completed', completed_at = NOW(),
           payment_status = CASE WHEN payment_status = 'escrowed' THEN 'paid_out' ELSE payment_status END,
           paid_out_at = CASE WHEN payment_status = 'escrowed' THEN NOW() ELSE paid_out_at END
       WHERE id = $2
       RETURNING *`,
      [winnerDraftId, commissionId],
    );

    const winner = await db.query(
      'SELECT author_id FROM drafts WHERE id = $1',
      [winnerDraftId],
    );
    if (winner.rows.length > 0) {
      await this.metricsService.updateImpactOnMerge(
        winner.rows[0].author_id,
        'minor',
        client,
      );
    }

    return mapCommission(updated.rows[0] as CommissionRow);
  }

  async cancelCommission(
    commissionId: string,
    userId: string,
    client?: DbClient,
  ): Promise<Commission> {
    const db = getDb(this.pool, client);
    const commission = await db.query(
      'SELECT * FROM commissions WHERE id = $1',
      [commissionId],
    );

    if (commission.rows.length === 0) {
      throw new ServiceError(
        'COMMISSION_NOT_FOUND',
        'Commission not found.',
        404,
      );
    }

    const row = commission.rows[0] as CommissionRow;
    if (row.user_id !== userId) {
      throw new ServiceError(
        'COMMISSION_NOT_OWNER',
        'Only the creator can cancel.',
        403,
      );
    }

    if (row.status !== 'open' || row.winner_draft_id) {
      throw new ServiceError(
        'COMMISSION_CANCEL_INVALID',
        'Commission cannot be cancelled.',
        400,
      );
    }

    if (row.payment_status === 'escrowed' && row.escrowed_at) {
      const hours =
        (Date.now() - new Date(row.escrowed_at).getTime()) / (1000 * 60 * 60);
      if (hours > CANCEL_WINDOW_HOURS) {
        throw new ServiceError(
          'COMMISSION_CANCEL_WINDOW',
          'Cancel window expired.',
        );
      }
    }

    const updated = await db.query(
      `UPDATE commissions
       SET status = 'cancelled',
           payment_status = CASE WHEN payment_status = 'escrowed' THEN 'refunded' ELSE payment_status END,
           refunded_at = CASE WHEN payment_status = 'escrowed' THEN NOW() ELSE refunded_at END
       WHERE id = $1 RETURNING *`,
      [commissionId],
    );

    return mapCommission(updated.rows[0] as CommissionRow);
  }

  async markEscrowed(
    commissionId: string,
    client?: DbClient,
  ): Promise<Commission> {
    const db = getDb(this.pool, client);
    const updated = await db.query(
      "UPDATE commissions SET payment_status = 'escrowed', escrowed_at = NOW() WHERE id = $1 RETURNING *",
      [commissionId],
    );

    if (updated.rows.length === 0) {
      throw new ServiceError(
        'COMMISSION_NOT_FOUND',
        'Commission not found.',
        404,
      );
    }

    return mapCommission(updated.rows[0] as CommissionRow);
  }
}
