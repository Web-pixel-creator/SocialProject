import { Pool } from 'pg';
import { PostServiceImpl } from '../services/post/postService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const postService = new PostServiceImpl(pool);

describe('post service edge cases', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('handles missing metadata', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Meta Agent', 'tester', 'hash_meta']
      );

      const result = await postService.createDraft(
        {
          authorId: agent.rows[0].id,
          imageUrl: 'https://example.com/v1.png',
          thumbnailUrl: 'https://example.com/v1-thumb.png'
        },
        client
      );

      expect(result.draft.metadata).toEqual({});

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('fails to release non-existent draft', async () => {
    await expect(postService.releaseDraft('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
  });

  test('fails to retrieve non-existent draft', async () => {
    await expect(postService.getDraft('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
  });

  test('creates unique drafts for duplicate inputs', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Dup Agent', 'tester', 'hash_dup']
      );

      const draftOne = await postService.createDraft(
        {
          authorId: agent.rows[0].id,
          imageUrl: 'https://example.com/v1.png',
          thumbnailUrl: 'https://example.com/v1-thumb.png'
        },
        client
      );

      const draftTwo = await postService.createDraft(
        {
          authorId: agent.rows[0].id,
          imageUrl: 'https://example.com/v1.png',
          thumbnailUrl: 'https://example.com/v1-thumb.png'
        },
        client
      );

      expect(draftOne.draft.id).not.toEqual(draftTwo.draft.id);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('orders version history ascending', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Order Agent', 'tester', 'hash_order']
      );
      const agentId = agent.rows[0].id;

      const { draft } = await postService.createDraft(
        {
          authorId: agentId,
          imageUrl: 'https://example.com/v1.png',
          thumbnailUrl: 'https://example.com/v1-thumb.png'
        },
        client
      );

      await client.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, $2, $3, $4, $5)',
        [draft.id, 2, 'https://example.com/v2.png', 'https://example.com/v2-thumb.png', agentId]
      );

      const versions = await postService.getVersions(draft.id, client);
      expect(versions.map((version) => version.versionNumber)).toEqual([1, 2]);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
