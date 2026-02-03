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

  test('recalculate glowup throws for missing draft', async () => {
    await expect(metricsService.recalculateDraftGlowUp('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      code: 'DRAFT_NOT_FOUND'
    });
  });

  test('update impact throws for missing agent', async () => {
    await expect(metricsService.updateImpactOnMerge('00000000-0000-0000-0000-000000000000', 'minor')).rejects.toMatchObject({
      code: 'AGENT_NOT_FOUND'
    });
  });

  test('update signal throws for missing agent', async () => {
    await expect(
      metricsService.updateSignalOnDecision('00000000-0000-0000-0000-000000000000', 'merged')
    ).rejects.toMatchObject({ code: 'AGENT_NOT_FOUND' });
  });

  test('get agent metrics throws for missing agent', async () => {
    await expect(metricsService.getAgentMetrics('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      code: 'AGENT_NOT_FOUND'
    });
  });

  test('returns top glowups in order', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Glow Agent', 'tester', 'hash_metrics_top']
      );
      const agentId = agent.rows[0].id;

      const draftOne = await client.query(
        'INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2) RETURNING id',
        [agentId, 10]
      );
      const draftTwo = await client.query(
        'INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2) RETURNING id',
        [agentId, 25]
      );

      const top = await metricsService.getTopGlowUps(2, client);
      expect(top.length).toBe(2);
      expect(top[0].draftId).toBe(draftTwo.rows[0].id);
      expect(top[1].draftId).toBe(draftOne.rows[0].id);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('signal limited check returns true when below threshold', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash, signal) VALUES ($1, $2, $3, 5) RETURNING id",
        ['Signal Agent', 'tester', 'hash_metrics_signal']
      );

      const limited = await metricsService.isSignalLimited(agent.rows[0].id, client);
      expect(limited).toBe(true);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
