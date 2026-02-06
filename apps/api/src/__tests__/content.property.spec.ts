import { Pool } from 'pg';
import { ContentGenerationServiceImpl } from '../services/content/contentService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

const contentService = new ContentGenerationServiceImpl(pool);

describe('content generation properties', () => {
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'TRUNCATE TABLE pull_requests RESTART IDENTITY CASCADE',
      );
      await client.query(
        'TRUNCATE TABLE fix_requests RESTART IDENTITY CASCADE',
      );
      await client.query('TRUNCATE TABLE versions RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE drafts RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE agents RESTART IDENTITY CASCADE');
      await client.query(
        'TRUNCATE TABLE glowup_reels RESTART IDENTITY CASCADE',
      );
      await client.query(
        'TRUNCATE TABLE autopsy_reports RESTART IDENTITY CASCADE',
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  test('Property 50: Daily GlowUp Reel Selection', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Reel Agent', 'tester', 'hash_reel'],
      );
      const authorId = agent.rows[0].id;

      const recent = await client.query(
        "INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, 42, NOW() - INTERVAL '1 hour') RETURNING id",
        [authorId],
      );
      const old = await client.query(
        "INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, 99, NOW() - INTERVAL '2 days') RETURNING id",
        [authorId],
      );

      await client.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, 1, $2, $3, $4)',
        [
          recent.rows[0].id,
          'https://example.com/recent-v1.png',
          'https://example.com/recent-v1-thumb.png',
          authorId,
        ],
      );
      await client.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, 2, $2, $3, $4)',
        [
          recent.rows[0].id,
          'https://example.com/recent-v2.png',
          'https://example.com/recent-v2-thumb.png',
          authorId,
        ],
      );
      await client.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, 1, $2, $3, $4)',
        [
          old.rows[0].id,
          'https://example.com/old-v1.png',
          'https://example.com/old-v1-thumb.png',
          authorId,
        ],
      );

      const reel = await contentService.generateGlowUpReel(1, client);
      expect(reel.items[0].draftId).toBe(recent.rows[0].id);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 51: GlowUp Reel Credits', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const author = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id, studio_name',
        ['Author Agent', 'tester', 'hash_author'],
      );
      const maker = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id, studio_name',
        ['Maker Agent', 'tester', 'hash_maker'],
      );

      const draft = await client.query(
        "INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, 12, NOW() - INTERVAL '1 hour') RETURNING id",
        [author.rows[0].id],
      );

      await client.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, 1, $2, $3, $4)',
        [
          draft.rows[0].id,
          'https://example.com/v1.png',
          'https://example.com/v1-thumb.png',
          author.rows[0].id,
        ],
      );
      await client.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, 2, $2, $3, $4)',
        [
          draft.rows[0].id,
          'https://example.com/v2.png',
          'https://example.com/v2-thumb.png',
          maker.rows[0].id,
        ],
      );

      await client.query(
        `INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status)
         VALUES ($1, $2, 2, 'Improve', 'minor', 'merged')`,
        [draft.rows[0].id, maker.rows[0].id],
      );

      const reel = await contentService.generateGlowUpReel(1, client);
      expect(reel.items[0].credits.author.id).toBe(author.rows[0].id);
      expect(reel.items[0].credits.makers.map((item) => item.id)).toContain(
        maker.rows[0].id,
      );

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 52: Daily Autopsy Selection', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Autopsy Agent', 'tester', 'hash_autopsy'],
      );

      const low = await client.query(
        "INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, 1, NOW() - INTERVAL '2 hours') RETURNING id",
        [agent.rows[0].id],
      );
      await client.query(
        "INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, 50, NOW() - INTERVAL '2 hours') RETURNING id",
        [agent.rows[0].id],
      );

      const report = await contentService.generateAutopsyReport(1, client);
      expect(report.patterns[0].draftId).toBe(low.rows[0].id);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
