import fc from 'fast-check';
import { Pool } from 'pg';
import {
  GLOWUP_MAJOR_WEIGHT,
  GLOWUP_MINOR_WEIGHT,
} from '../services/metrics/constants';
import { MetricsServiceImpl } from '../services/metrics/metricsService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

const metricsService = new MetricsServiceImpl(pool);

describe('metrics service properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 10: GlowUp Calculation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        (major, minor) => {
          const prCount = major + minor;
          const expected =
            prCount === 0
              ? 0
              : (major * GLOWUP_MAJOR_WEIGHT + minor * GLOWUP_MINOR_WEIGHT) *
                (1 + Math.log(prCount + 1));

          const result = metricsService.calculateGlowUp(major, minor);
          expect(result).toBeCloseTo(expected, 6);
        },
      ),
      { numRuns: 50 },
    );
  });

  test('Property 11: Impact Increase on Merge', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id, impact',
        ['Impact Agent', 'tester', 'hash_metrics_1'],
      );
      const agentId = agent.rows[0].id;
      const initial = Number(agent.rows[0].impact);

      const updated = await metricsService.updateImpactOnMerge(
        agentId,
        'major',
        client,
      );
      expect(updated).toBeGreaterThan(initial);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 12: Signal Decrease on Rejection', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id, signal',
        ['Signal Agent', 'tester', 'hash_metrics_2'],
      );
      const agentId = agent.rows[0].id;
      const initial = Number(agent.rows[0].signal);

      const updated = await metricsService.updateSignalOnDecision(
        agentId,
        'rejected',
        client,
      );
      expect(updated).toBeLessThanOrEqual(initial);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 13: Signal Increase on Merge', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id, signal',
        ['Signal Merge', 'tester', 'hash_metrics_3'],
      );
      const agentId = agent.rows[0].id;
      const initial = Number(agent.rows[0].signal);

      const updated = await metricsService.updateSignalOnDecision(
        agentId,
        'merged',
        client,
      );
      expect(updated).toBeGreaterThanOrEqual(initial);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 14: Signal Rate Limiting', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash, signal) VALUES ($1, $2, $3, 5) RETURNING id',
        ['Limited Agent', 'tester', 'hash_metrics_4'],
      );
      const limited = await metricsService.isSignalLimited(
        agent.rows[0].id,
        client,
      );
      expect(limited).toBe(true);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 43: Agent Initial Impact', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING impact',
        ['Initial Impact', 'tester', 'hash_metrics_5'],
      );
      expect(Number(agent.rows[0].impact)).toBe(0);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 44: Agent Initial Signal', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING signal',
        ['Initial Signal', 'tester', 'hash_metrics_6'],
      );
      expect(Number(agent.rows[0].signal)).toBe(50);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
