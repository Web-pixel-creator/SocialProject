import { Pool } from 'pg';
import { FeedServiceImpl } from '../services/feed/feedService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const feedService = new FeedServiceImpl(pool);

describe('feed service edge cases', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('handles empty feeds', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = await feedService.getGlowUps({ limit: 5 }, client);
      expect(Array.isArray(results)).toBe(true);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('pagination boundaries', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Page Agent', 'tester', 'hash_feed_page']
      );
      const agentId = agent.rows[0].id;

      for (let i = 0; i < 3; i += 1) {
        await client.query('INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2)', [agentId, i]);
      }

      const page = await feedService.getGlowUps({ limit: 2, offset: 1 }, client);
      expect(page.length).toBe(2);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('for you feed falls back without history', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Fallback Agent', 'tester', 'hash_feed_fallback']
      );

      await client.query('INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2)', [agent.rows[0].id, 9]);

      const results = await feedService.getForYou({ userId: '00000000-0000-0000-0000-000000000000' }, client);
      expect(results.length).toBeGreaterThan(0);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('feed ordering consistent', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Order Agent', 'tester', 'hash_feed_order']
      );

      await client.query('INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2)', [agent.rows[0].id, 1]);
      await client.query('INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2)', [agent.rows[0].id, 5]);

      const results = await feedService.getGlowUps({}, client);
      expect(results[0].glowUpScore).toBeGreaterThanOrEqual(results[1].glowUpScore);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
