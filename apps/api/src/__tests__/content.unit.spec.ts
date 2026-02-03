import { Pool } from 'pg';
import { ContentGenerationServiceImpl } from '../services/content/contentService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const contentService = new ContentGenerationServiceImpl(pool);

describe('content generation edge cases', () => {
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE TABLE pull_requests RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE fix_requests RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE versions RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE drafts RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE agents RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE glowup_reels RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE autopsy_reports RESTART IDENTITY CASCADE');
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

  test('builds autopsy summary with no dominant pattern', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Neutral Agent', 'tester', 'hash_neutral']
      );
      const draft = await client.query(
        "INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, 13, NOW() - INTERVAL '1 hour') RETURNING id",
        [agent.rows[0].id]
      );

      await client.query(
        'INSERT INTO fix_requests (draft_id, critic_id, category, description, coordinates, target_version) VALUES ($1, $2, $3, $4, $5, $6)',
        [draft.rows[0].id, agent.rows[0].id, 'Focus', 'Improve focus', JSON.stringify({ x: 12, y: 8 }), 1]
      );
      await client.query(
        `INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status)
         VALUES ($1, $2, 2, 'Small tweak', 'minor', 'merged')`,
        [draft.rows[0].id, agent.rows[0].id]
      );

      const report = await contentService.generateAutopsyReport(1, client);
      expect(report.summary).toContain('No dominant pattern detected');
      expect(report.patterns[0].budgetExhausted).toBe(false);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('autopsy summary includes rejection and budget exhaustion patterns', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Exhausted Agent', 'tester', 'hash_exhausted']
      );
      const draft = await client.query(
        "INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, 3, NOW() - INTERVAL '1 hour') RETURNING id",
        [agent.rows[0].id]
      );

      await client.query(
        'INSERT INTO fix_requests (draft_id, critic_id, category, description, coordinates, target_version) VALUES ($1, $2, $3, $4, $5, $6)',
        [draft.rows[0].id, agent.rows[0].id, 'Cohesion', 'Fix cohesion', JSON.stringify({ x: 20, y: 14 }), 1]
      );
      await client.query(
        'INSERT INTO fix_requests (draft_id, critic_id, category, description, coordinates, target_version) VALUES ($1, $2, $3, $4, $5, $6)',
        [draft.rows[0].id, agent.rows[0].id, 'Readability', 'Improve readability', JSON.stringify({ x: 4, y: 2 }), 1]
      );
      await client.query(
        'INSERT INTO fix_requests (draft_id, critic_id, category, description, coordinates, target_version) VALUES ($1, $2, $3, $4, $5, $6)',
        [draft.rows[0].id, agent.rows[0].id, 'Color/Light', 'Adjust lighting', JSON.stringify({ x: 9, y: 6 }), 1]
      );
      await client.query(
        `INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status)
         VALUES ($1, $2, 2, 'Needs rework', 'major', 'rejected')`,
        [draft.rows[0].id, agent.rows[0].id]
      );

      const report = await contentService.generateAutopsyReport(1, client);
      expect(report.summary).toContain('high rejection ratios');
      expect(report.summary).toContain('budget exhaustion patterns');
      expect(report.patterns[0].budgetExhausted).toBe(true);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('uses fallback values in reel generation when optional fields are missing', async () => {
    const responses = [
      { rows: [{ id: 'draft-1', author_id: 'author-1', glow_up_score: null }] },
      { rows: [{ version_number: 1, image_url: 'before.png' }, { version_number: 2, image_url: 'after.png' }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: 'reel-1', created_at: '2020-01-01T00:00:00.000Z', published_at: null }] }
    ];

    const stubPool = {
      query: jest.fn(async () => responses.shift() ?? { rows: [] })
    } as any;

    const stubService = new ContentGenerationServiceImpl(stubPool as Pool);
    const reel = await stubService.generateGlowUpReel(1);

    expect(reel.items[0].glowUpScore).toBe(0);
    expect(reel.items[0].credits.author.id).toBe('author-1');
    expect(reel.items[0].credits.author.studioName).toBe('Unknown');
    expect(reel.publishedAt).toBeNull();
  });

  test('uses fallback values in autopsy generation when counts are missing', async () => {
    const responses = [
      { rows: [{ id: 'draft-2', glow_up_score: null }] },
      { rows: [{ count: null }] },
      { rows: [{ count: null }] },
      { rows: [{ count: null }] },
      { rows: [{ id: 'report-1', created_at: '2020-01-02T00:00:00.000Z', published_at: null }] }
    ];

    const stubPool = {
      query: jest.fn(async () => responses.shift() ?? { rows: [] })
    } as any;

    const stubService = new ContentGenerationServiceImpl(stubPool as Pool);
    const report = await stubService.generateAutopsyReport(1);

    expect(report.patterns[0].glowUpScore).toBe(0);
    expect(report.publishedAt).toBeNull();
    expect(report.summary).toContain('Common issues');
  });
});
