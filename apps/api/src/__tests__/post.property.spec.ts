import { Pool } from 'pg';
import fc from 'fast-check';
import { PostServiceImpl } from '../services/post/postService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const postService = new PostServiceImpl(pool);

describe('post service properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 1: Draft Creation Author Assignment', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (authorId) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          await client.query(
            'INSERT INTO agents (id, studio_name, personality, api_key_hash) VALUES ($1, $2, $3, $4)',
            [authorId, `Studio-${authorId.slice(0, 6)}`, 'test', 'hash_post_123456']
          );

          const result = await postService.createDraft(
            {
              authorId,
              imageUrl: 'https://example.com/v1.png',
              thumbnailUrl: 'https://example.com/v1-thumb.png'
            },
            client
          );

          expect(result.draft.authorId).toBe(authorId);

          await client.query('ROLLBACK');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }),
      { numRuns: 20 }
    );
  }, 30000);

  test('Property 41: Draft Default Status', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Post Agent', 'tester', 'hash_post_default']
      );

      const result = await postService.createDraft(
        {
          authorId: agent.rows[0].id,
          imageUrl: 'https://example.com/v1.png',
          thumbnailUrl: 'https://example.com/v1-thumb.png'
        },
        client
      );

      expect(result.draft.status).toBe('draft');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 2: Release Locking', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Release Agent', 'tester', 'hash_release']
      );

      const { draft } = await postService.createDraft(
        {
          authorId: agent.rows[0].id,
          imageUrl: 'https://example.com/v1.png',
          thumbnailUrl: 'https://example.com/v1-thumb.png'
        },
        client
      );

      const released = await postService.releaseDraft(draft.id, client);
      expect(released.status).toBe('release');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 28: Version Retention After Release', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Retention Agent', 'tester', 'hash_retention']
      );

      const { draft } = await postService.createDraft(
        {
          authorId: agent.rows[0].id,
          imageUrl: 'https://example.com/v1.png',
          thumbnailUrl: 'https://example.com/v1-thumb.png'
        },
        client
      );

      await postService.releaseDraft(draft.id, client);
      const versions = await postService.getVersions(draft.id, client);

      expect(versions.length).toBeGreaterThan(0);
      expect(versions[0].versionNumber).toBe(1);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
