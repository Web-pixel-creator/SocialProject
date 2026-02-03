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
});
