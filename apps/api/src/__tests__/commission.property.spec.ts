import { Pool } from 'pg';
import { MAX_OPEN_COMMISSIONS_PER_24H, MAX_REWARD } from '../config/commission';
import { CommissionServiceImpl } from '../services/commission/commissionService';
import { PaymentServiceImpl } from '../services/payment/paymentService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

const commissionService = new CommissionServiceImpl(pool);
const paymentService = new PaymentServiceImpl(pool);

describe('commission/payment properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 57: Commission Escrow Visibility', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const user = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ('user1@example.com', 'hash') RETURNING id",
      );
      const userId = user.rows[0].id;

      const commission = await commissionService.createCommission(
        {
          userId,
          description: 'Escrow test',
          rewardAmount: 100,
        },
        client,
      );

      await commissionService.markEscrowed(commission.id, client);

      const list = await commissionService.listCommissions(
        { forAgents: true },
        client,
      );
      expect(list.some((item) => item.id === commission.id)).toBe(true);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 58: Commission Payout on Winner', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ('user2@example.com', 'hash') RETURNING id",
      );
      const userId = user.rows[0].id;

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Winner Agent', 'tester', 'hash_comm_1') RETURNING id",
      );

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agent.rows[0].id],
      );

      const commission = await commissionService.createCommission(
        {
          userId,
          description: 'Winner',
          rewardAmount: 100,
        },
        client,
      );

      await commissionService.markEscrowed(commission.id, client);

      const updated = await commissionService.selectWinner(
        commission.id,
        draft.rows[0].id,
        userId,
        client,
      );
      expect(updated.paymentStatus).toBe('paid_out');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 59: Commission Refund on Cancel', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ('user3@example.com', 'hash') RETURNING id",
      );
      const commission = await commissionService.createCommission(
        {
          userId: user.rows[0].id,
          description: 'Refund',
          rewardAmount: 100,
        },
        client,
      );

      await commissionService.markEscrowed(commission.id, client);
      const cancelled = await commissionService.cancelCommission(
        commission.id,
        user.rows[0].id,
        client,
      );
      expect(cancelled.paymentStatus).toBe('refunded');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 60: Payment Webhook Idempotency', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const first = await paymentService.recordWebhookEvent(
        { provider: 'stripe', providerEventId: 'evt_1', eventType: 'payment' },
        client,
      );
      const second = await paymentService.recordWebhookEvent(
        { provider: 'stripe', providerEventId: 'evt_1', eventType: 'payment' },
        client,
      );

      expect(first).toBe(true);
      expect(second).toBe(false);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 61: Commission Reward Cap', async () => {
    await expect(
      commissionService.createCommission({
        userId: 'user-cap',
        description: 'Too much',
        rewardAmount: MAX_REWARD + 10,
      }),
    ).rejects.toThrow();
  });

  test('Property 62: Commission Rate Limit', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ('user4@example.com', 'hash') RETURNING id",
      );
      const userId = user.rows[0].id;

      for (let i = 0; i < MAX_OPEN_COMMISSIONS_PER_24H; i += 1) {
        await commissionService.createCommission(
          { userId, description: `Commission ${i}` },
          client,
        );
      }

      await expect(
        commissionService.createCommission(
          { userId, description: 'Overflow' },
          client,
        ),
      ).rejects.toThrow();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 63: Commission Cancel Window', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ('user5@example.com', 'hash') RETURNING id",
      );
      const commission = await commissionService.createCommission(
        {
          userId: user.rows[0].id,
          description: 'Cancel window',
          rewardAmount: 100,
        },
        client,
      );

      await client.query(
        "UPDATE commissions SET payment_status = 'escrowed', escrowed_at = NOW() - INTERVAL '30 hours' WHERE id = $1",
        [commission.id],
      );

      await expect(
        commissionService.cancelCommission(
          commission.id,
          user.rows[0].id,
          client,
        ),
      ).rejects.toThrow();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
