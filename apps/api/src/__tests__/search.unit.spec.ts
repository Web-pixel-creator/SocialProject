import { Pool } from 'pg';
import { SearchServiceImpl } from '../services/search/searchService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
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
      const results = await searchService.search(
        'nope',
        { type: 'all' },
        client,
      );
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
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Release Studio', 'tester', 'hash_release') RETURNING id",
      );

      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [agent.rows[0].id, JSON.stringify({}), 'release', 0],
      );

      const results = await searchService.search(
        '',
        { type: 'release', sort: 'recency' },
        client,
      );
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
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Mix Studio', 'tester', 'hash_mix_studio')",
      );
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Mix Author', 'tester', 'hash_mix_author') RETURNING id",
      );

      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [agent.rows[0].id, JSON.stringify({ title: 'Mix Draft' }), 'draft', 3],
      );

      const results = await searchService.search(
        'Mix',
        { type: 'all', sort: 'recency' },
        client,
      );
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
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Secure Studio', 'tester', 'hash_secure') RETURNING id",
      );
      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [agent.rows[0].id, JSON.stringify({ title: 'Safe' }), 'draft', 1],
      );

      const injectionQuery = "' OR 1=1 --";
      const injectionResults = await searchService.search(
        injectionQuery,
        { type: 'draft' },
        client,
      );
      expect(injectionResults).toHaveLength(0);

      const longQuery = 'x'.repeat(256);
      const longResults = await searchService.search(
        longQuery,
        { type: 'draft' },
        client,
      );
      expect(Array.isArray(longResults)).toBe(true);

      const specialResults = await searchService.search(
        '100% _ [test]',
        { type: 'studio' },
        client,
      );
      expect(Array.isArray(specialResults)).toBe(true);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('applies range filter for recent drafts', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Range Studio', 'tester', 'hash_range') RETURNING id",
      );

      const recent = await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4) RETURNING id',
        [
          agent.rows[0].id,
          JSON.stringify({ title: 'Range Draft' }),
          'draft',
          1,
        ],
      );
      const old = await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4) RETURNING id',
        [
          agent.rows[0].id,
          JSON.stringify({ title: 'Range Draft' }),
          'draft',
          1,
        ],
      );

      await client.query(
        `UPDATE drafts SET updated_at = NOW() - INTERVAL '40 days' WHERE id = $1`,
        [old.rows[0].id],
      );

      const results = await searchService.search(
        'Range Draft',
        { type: 'draft', range: '7d' },
        client,
      );
      const ids = results.map((item) => item.id);
      expect(ids).toContain(recent.rows[0].id);
      expect(ids).not.toContain(old.rows[0].id);

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
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Sort Fallback', 'tester', 'hash_sort_fallback') RETURNING id",
      );

      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [
          agent.rows[0].id,
          JSON.stringify({ title: 'Fallback Sort' }),
          'draft',
          2,
        ],
      );
      await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4)',
        [
          agent.rows[0].id,
          JSON.stringify({ title: 'Fallback Sort' }),
          'draft',
          10,
        ],
      );

      const results = await searchService.search(
        'Fallback',
        { type: 'draft', sort: 'unknown' as any },
        client,
      );
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('visual search ranks by similarity', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Visual Studio', 'tester', 'hash_visual') RETURNING id",
      );

      const draftA = await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4) RETURNING id',
        [agent.rows[0].id, JSON.stringify({ title: 'Visual A' }), 'draft', 5],
      );
      const draftB = await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4) RETURNING id',
        [agent.rows[0].id, JSON.stringify({ title: 'Visual B' }), 'draft', 1],
      );

      await client.query(
        'INSERT INTO draft_embeddings (draft_id, embedding) VALUES ($1, $2)',
        [draftA.rows[0].id, JSON.stringify([0.9, 0.1, 0])],
      );
      await client.query(
        'INSERT INTO draft_embeddings (draft_id, embedding) VALUES ($1, $2)',
        [draftB.rows[0].id, JSON.stringify([0.1, 0.9, 0])],
      );

      const results = await searchService.searchVisual(
        { embedding: [1, 0, 0], filters: { type: 'draft' } },
        client,
      );

      expect(results[0].id).toBe(draftA.rows[0].id);
      expect(results[0].score).toBeGreaterThan(results[1].score);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('visual search supports tag filtering', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Tag Studio', 'tester', 'hash_tag') RETURNING id",
      );

      const taggedDraft = await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4) RETURNING id',
        [
          agent.rows[0].id,
          JSON.stringify({ title: 'Tagged', tags: ['neon'] }),
          'draft',
          2,
        ],
      );
      const otherDraft = await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4) RETURNING id',
        [
          agent.rows[0].id,
          JSON.stringify({ title: 'Plain', tags: ['plain'] }),
          'draft',
          1,
        ],
      );

      await client.query(
        'INSERT INTO draft_embeddings (draft_id, embedding) VALUES ($1, $2)',
        [taggedDraft.rows[0].id, JSON.stringify([0.8, 0.2, 0])],
      );
      await client.query(
        'INSERT INTO draft_embeddings (draft_id, embedding) VALUES ($1, $2)',
        [otherDraft.rows[0].id, JSON.stringify([0.8, 0.2, 0])],
      );

      const results = await searchService.searchVisual(
        { embedding: [0.8, 0.2, 0], filters: { tags: ['neon'] } },
        client,
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(taggedDraft.rows[0].id);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('searchSimilar excludes self and sandbox drafts', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Similar Studio', 'tester', 'hash_similar') RETURNING id",
      );

      const target = await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4) RETURNING id',
        [
          agent.rows[0].id,
          JSON.stringify({ title: 'Target Draft' }),
          'draft',
          2,
        ],
      );
      const other = await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score) VALUES ($1, $2, $3, $4) RETURNING id',
        [
          agent.rows[0].id,
          JSON.stringify({ title: 'Other Draft' }),
          'draft',
          5,
        ],
      );
      const sandbox = await client.query(
        'INSERT INTO drafts (author_id, metadata, status, glow_up_score, is_sandbox) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [
          agent.rows[0].id,
          JSON.stringify({ title: 'Sandbox Draft' }),
          'draft',
          1,
          true,
        ],
      );

      await client.query(
        'INSERT INTO draft_embeddings (draft_id, embedding) VALUES ($1, $2)',
        [target.rows[0].id, JSON.stringify([0.9, 0.1, 0])],
      );
      await client.query(
        'INSERT INTO draft_embeddings (draft_id, embedding) VALUES ($1, $2)',
        [other.rows[0].id, JSON.stringify([0.85, 0.15, 0])],
      );
      await client.query(
        'INSERT INTO draft_embeddings (draft_id, embedding) VALUES ($1, $2)',
        [sandbox.rows[0].id, JSON.stringify([0.8, 0.2, 0])],
      );

      const results = await searchService.searchSimilar(
        target.rows[0].id,
        { type: 'draft' },
        client,
      );
      const ids = results.map((item) => item.id);
      expect(ids).toContain(other.rows[0].id);
      expect(ids).not.toContain(target.rows[0].id);
      expect(ids).not.toContain(sandbox.rows[0].id);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
