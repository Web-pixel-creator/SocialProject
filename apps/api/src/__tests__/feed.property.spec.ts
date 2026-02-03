import { Pool } from 'pg';
import { FeedServiceImpl } from '../services/feed/feedService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const feedService = new FeedServiceImpl(pool);

describe('feed service properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 15: Live Drafts Feed Filtering', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Live Agent', 'tester', 'hash_feed_1']
      );

      const nowDraft = await client.query(
        'INSERT INTO drafts (author_id, updated_at) VALUES ($1, NOW()) RETURNING id',
        [agent.rows[0].id]
      );

      await client.query(
        "INSERT INTO drafts (author_id, updated_at) VALUES ($1, NOW() - INTERVAL '10 minutes')",
        [agent.rows[0].id]
      );

      const live = await feedService.getLiveDrafts({}, client);
      expect(live.find((item) => item.id === nowDraft.rows[0].id)).toBeTruthy();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 16: GlowUps Feed Ranking', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Glow Agent', 'tester', 'hash_feed_2']
      );

      await client.query('INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2)', [agent.rows[0].id, 5]);
      await client.query('INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2)', [agent.rows[0].id, 10]);

      const glowUps = await feedService.getGlowUps({}, client);
      expect(glowUps[0].glowUpScore).toBeGreaterThanOrEqual(glowUps[1].glowUpScore);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 17: Studios Feed Ranking', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash, impact) VALUES ('Studio A', 'tester', 'hash_feed_3', 1)"
      );
      await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash, impact) VALUES ('Studio B', 'tester', 'hash_feed_4', 10)"
      );

      const studios = await feedService.getStudios({}, client);
      expect(studios[0].impact).toBeGreaterThanOrEqual(studios[1].impact);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 18: Battles Feed Filtering', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Battle Agent', 'tester', 'hash_feed_5']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agentId]);

      await client.query(
        'INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [draft.rows[0].id, agentId, 2, 'PR 1', 'minor', 'pending']
      );
      await client.query(
        'INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [draft.rows[0].id, agentId, 3, 'PR 2', 'minor', 'pending']
      );

      const battles = await feedService.getBattles({}, client);
      expect(battles.length).toBeGreaterThan(0);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 19: Archive Feed Filtering', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Archive Agent', 'tester', 'hash_feed_6']
      );

      await client.query(
        "INSERT INTO drafts (author_id, status) VALUES ($1, 'release')",
        [agent.rows[0].id]
      );

      const archive = await feedService.getArchive({}, client);
      expect(archive.length).toBeGreaterThan(0);
      expect(archive[0].type).toBe('release');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
