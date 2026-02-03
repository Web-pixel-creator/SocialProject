import crypto from 'crypto';
import { Pool } from 'pg';
import { ServiceError } from '../common/errors';
import type { DbClient } from '../auth/types';
import type { PaymentEventInput, PaymentService } from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

export class PaymentServiceImpl implements PaymentService {
  constructor(private readonly pool: Pool) {}

  async createPaymentIntent(commissionId: string, client?: DbClient): Promise<{ paymentIntentId: string }> {
    const db = getDb(this.pool, client);
    const paymentIntentId = `pi_${crypto.randomBytes(8).toString('hex')}`;

    const updated = await db.query(
      'UPDATE commissions SET payment_status = $1, payment_intent_id = $2 WHERE id = $3 RETURNING id',
      ['pending', paymentIntentId, commissionId]
    );

    if (updated.rows.length === 0) {
      throw new ServiceError('COMMISSION_NOT_FOUND', 'Commission not found.', 404);
    }

    return { paymentIntentId };
  }

  async markEscrowed(commissionId: string, client?: DbClient): Promise<void> {
    const db = getDb(this.pool, client);
    const updated = await db.query(
      "UPDATE commissions SET payment_status = 'escrowed', escrowed_at = NOW() WHERE id = $1 RETURNING id",
      [commissionId]
    );

    if (updated.rows.length === 0) {
      throw new ServiceError('COMMISSION_NOT_FOUND', 'Commission not found.', 404);
    }
  }

  async payoutWinner(commissionId: string, client?: DbClient): Promise<void> {
    const db = getDb(this.pool, client);
    const updated = await db.query(
      "UPDATE commissions SET payment_status = 'paid_out', paid_out_at = NOW() WHERE id = $1 RETURNING id",
      [commissionId]
    );

    if (updated.rows.length === 0) {
      throw new ServiceError('COMMISSION_NOT_FOUND', 'Commission not found.', 404);
    }
  }

  async refundCommission(commissionId: string, client?: DbClient): Promise<void> {
    const db = getDb(this.pool, client);
    const updated = await db.query(
      "UPDATE commissions SET payment_status = 'refunded', refunded_at = NOW() WHERE id = $1 RETURNING id",
      [commissionId]
    );

    if (updated.rows.length === 0) {
      throw new ServiceError('COMMISSION_NOT_FOUND', 'Commission not found.', 404);
    }
  }

  async recordWebhookEvent(input: PaymentEventInput, client?: DbClient): Promise<boolean> {
    const db = getDb(this.pool, client);
    try {
      await db.query(
        'INSERT INTO payment_events (provider, provider_event_id, commission_id, event_type) VALUES ($1, $2, $3, $4)',
        [input.provider, input.providerEventId, input.commissionId ?? null, input.eventType]
      );
      return true;
    } catch (error: any) {
      if (error?.code === '23505') {
        return false;
      }
      throw error;
    }
  }
}
