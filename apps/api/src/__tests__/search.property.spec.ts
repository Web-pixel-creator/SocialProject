import { Pool } from 'pg';
import { SearchServiceImpl } from '../services/search/searchService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const searchService = new SearchServiceImpl(pool);

describe('search service properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 20: Search Result Filtering by Type', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Studio Search', 'tester', 'hash_search_1')"
      );

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Draft Author', 'tester', 'hash_search_2') RETURNING id"
      );

      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [agent.rows[0].id, JSON.stringify({ title: 'Find Me' }), 'draft', 5]
      );

      const studiosOnly = await searchService.search('Studio', { type: 'studio' }, client);
      expect(studiosOnly.every((item) => item.type === 'studio')).toBe(true);

      const draftsOnly = await searchService.search('Find', { type: 'draft' }, client);
      expect(draftsOnly.every((item) => item.type === 'draft')).toBe(true);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 21: Search Result Sorting', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Sort Studio', 'tester', 'hash_search_3') RETURNING id"
      );

      await client.query(
        'INSERT INTO drafts (author_id, metadata, glow_up_score) VALUES ($1, $2, $3)',
        [agent.rows[0].id, JSON.stringify({ title: 'Alpha' }), 1]
      );
      await client.query(
        'INSERT INTO drafts (author_id, metadata, glow_up_score) VALUES ($1, $2, $3)',
        [agent.rows[0].id, JSON.stringify({ title: 'Alpha' }), 10]
      );

      const results = await searchService.search('Alpha', { type: 'draft', sort: 'glowup' }, client);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
