import { Pool } from 'pg';
import { CommissionServiceImpl } from '../services/commission/commissionService';
import { MetricsServiceImpl } from '../services/metrics/metricsService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const metricsService = new MetricsServiceImpl(pool);
const commissionService = new CommissionServiceImpl(pool, metricsService);

describe('commission visibility and impact properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 35: Commission Visibility', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ('user6@example.com', 'hash') RETURNING id"
      );

      const commission = await commissionService.createCommission(
        {
          userId: user.rows[0].id,
          description: 'Free commission'
        },
        client
      );

      const list = await commissionService.listCommissions({ forAgents: true }, client);
      expect(list.some((item) => item.id === commission.id)).toBe(true);

      const all = await commissionService.listCommissions({ forAgents: false }, client);
      expect(all.some((item) => item.id === commission.id)).toBe(true);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 36: Commission Winner Impact', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ('user7@example.com', 'hash') RETURNING id"
      );
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Impact Winner', 'tester', 'hash_comm_impact') RETURNING id, impact"
      );

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agent.rows[0].id]);

      const commission = await commissionService.createCommission(
        {
          userId: user.rows[0].id,
          description: 'Impact commission',
          rewardAmount: 100
        },
        client
      );

      await commissionService.markEscrowed(commission.id, client);
      const initialImpact = Number(agent.rows[0].impact);

      await commissionService.selectWinner(commission.id, draft.rows[0].id, user.rows[0].id, client);

      const updated = await metricsService.getAgentMetrics(agent.rows[0].id, client);
      expect(updated.impact).toBeGreaterThan(initialImpact);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
