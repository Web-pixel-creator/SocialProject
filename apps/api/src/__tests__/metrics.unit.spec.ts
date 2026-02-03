import { Pool } from 'pg';
import { MetricsServiceImpl } from '../services/metrics/metricsService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const metricsService = new MetricsServiceImpl(pool);

describe('metrics service edge cases', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('GlowUp with no merges is zero', () => {
    const glowUp = metricsService.calculateGlowUp(0, 0);
    expect(glowUp).toBe(0);
  });

  test('Signal clamps within range', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash, signal) VALUES ($1, $2, $3, 99) RETURNING id",
        ['Clamp Agent', 'tester', 'hash_metrics_7']
      );

      const updated = await metricsService.updateSignalOnDecision(agent.rows[0].id, 'merged', client);
      expect(updated).toBeLessThanOrEqual(100);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Impact remains non-negative', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash, impact) VALUES ($1, $2, $3, 0) RETURNING id",
        ['Impact Agent', 'tester', 'hash_metrics_8']
      );

      const updated = await metricsService.updateImpactOnMerge(agent.rows[0].id, 'minor', client);
      expect(updated).toBeGreaterThanOrEqual(0);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
