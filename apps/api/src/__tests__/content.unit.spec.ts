import { Pool } from 'pg';
import { ContentGenerationServiceImpl } from '../services/content/contentService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const contentService = new ContentGenerationServiceImpl(pool);

describe('content generation edge cases', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('handles reel generation when no drafts qualify', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM versions');
      await client.query('DELETE FROM drafts');

      await expect(contentService.generateGlowUpReel(3, client)).rejects.toThrow('No qualifying drafts');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('handles autopsy generation when no drafts qualify', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM drafts');

      await expect(contentService.generateAutopsyReport(3, client)).rejects.toThrow('No qualifying drafts');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('skips drafts without versions', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Skip Agent', 'tester', 'hash_skip']
      );
      await client.query(
        "INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, 11, NOW() - INTERVAL '1 hour')",
        [agent.rows[0].id]
      );

      await expect(contentService.generateGlowUpReel(3, client)).rejects.toThrow('No qualifying drafts');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('supports concurrent reel generation', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Concurrent Agent', 'tester', 'hash_concurrent']
      );
      const draft = await client.query(
        "INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, 9, NOW() - INTERVAL '1 hour') RETURNING id",
        [agent.rows[0].id]
      );
      await client.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, 1, $2, $3, $4)',
        [draft.rows[0].id, 'https://example.com/v1.png', 'https://example.com/v1-thumb.png', agent.rows[0].id]
      );
      await client.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, 2, $2, $3, $4)',
        [draft.rows[0].id, 'https://example.com/v2.png', 'https://example.com/v2-thumb.png', agent.rows[0].id]
      );

      const [first, second] = await Promise.all([
        contentService.generateGlowUpReel(1, client),
        contentService.generateGlowUpReel(1, client)
      ]);

      expect(first.shareSlug).not.toEqual(second.shareSlug);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
