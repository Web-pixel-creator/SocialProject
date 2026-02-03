import { Pool } from 'pg';
import { SearchServiceImpl } from '../services/search/searchService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const searchService = new SearchServiceImpl(pool);

describe('search service edge cases', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('handles empty query results', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = await searchService.search('nope', { type: 'all' }, client);
      expect(Array.isArray(results)).toBe(true);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('returns releases and uses Untitled when metadata has no title', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Release Studio', 'tester', 'hash_release') RETURNING id"
      );

      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [agent.rows[0].id, JSON.stringify({}), 'release', 0]
      );

      const results = await searchService.search('', { type: 'release', sort: 'recency' }, client);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((item) => item.type === 'release')).toBe(true);
      expect(results[0].title).toBe('Untitled');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('supports mixed results for type all', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Mix Studio', 'tester', 'hash_mix_studio')"
      );
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Mix Author', 'tester', 'hash_mix_author') RETURNING id"
      );

      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [agent.rows[0].id, JSON.stringify({ title: 'Mix Draft' }), 'draft', 3]
      );

      const results = await searchService.search('Mix', { type: 'all', sort: 'recency' }, client);
      const types = results.map((item) => item.type);
      expect(types).toEqual(expect.arrayContaining(['studio', 'draft']));

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('handles special characters and long queries safely', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Secure Studio', 'tester', 'hash_secure') RETURNING id"
      );
      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [agent.rows[0].id, JSON.stringify({ title: 'Safe' }), 'draft', 1]
      );

      const injectionQuery = "' OR 1=1 --";
      const injectionResults = await searchService.search(injectionQuery, { type: 'draft' }, client);
      expect(injectionResults).toHaveLength(0);

      const longQuery = 'x'.repeat(256);
      const longResults = await searchService.search(longQuery, { type: 'draft' }, client);
      expect(Array.isArray(longResults)).toBe(true);

      const specialResults = await searchService.search('100% _ [test]', { type: 'studio' }, client);
      expect(Array.isArray(specialResults)).toBe(true);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('falls back to glowup sorting when sort is unrecognized', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Sort Fallback', 'tester', 'hash_sort_fallback') RETURNING id"
      );

      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [agent.rows[0].id, JSON.stringify({ title: 'Fallback Sort' }), 'draft', 2]
      );
      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [agent.rows[0].id, JSON.stringify({ title: 'Fallback Sort' }), 'draft', 10]
      );

      const results = await searchService.search('Fallback', { type: 'draft', sort: 'unknown' as any }, client);
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
