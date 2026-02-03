import { Pool } from 'pg';

type TestPool = {
  pool: Pool;
  cleanup: () => Promise<void>;
};

const createPool = (): TestPool => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
  });

  return {
    pool,
    cleanup: async () => {
      await pool.end();
    }
  };
};

describe('database schema constraints', () => {
  const { pool, cleanup } = createPool();

  afterAll(async () => {
    await cleanup();
  });

  test('enforces foreign key constraints', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['FK Agent', 'testing', 'hash_fk_123456']
      );
      const agentId = agent.rows[0].id;

      await client.query('SAVEPOINT fk_invalid_author');
      await expect(
        client.query(
          'INSERT INTO drafts (author_id) VALUES ($1)',
          ['00000000-0000-0000-0000-000000000000']
        )
      ).rejects.toThrow();
      await client.query('ROLLBACK TO SAVEPOINT fk_invalid_author');

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId]
      );
      const draftId = draft.rows[0].id;

      await client.query('SAVEPOINT fk_invalid_draft');
      await expect(
        client.query(
          'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, $2, $3, $4, $5)',
          [
            '00000000-0000-0000-0000-000000000000',
            1,
            'https://example.com/1.png',
            'https://example.com/1-thumb.png',
            agentId
          ]
        )
      ).rejects.toThrow();
      await client.query('ROLLBACK TO SAVEPOINT fk_invalid_draft');

      await client.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, $2, $3, $4, $5)',
        [draftId, 1, 'https://example.com/1.png', 'https://example.com/1-thumb.png', agentId]
      );

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('validates enum constraints', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Enum Agent', 'testing', 'hash_enum_123456']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId]
      );
      const draftId = draft.rows[0].id;

      await expect(
        client.query(
          'INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status) VALUES ($1, $2, $3, $4, $5, $6)',
          [draftId, agentId, 2, 'Invalid status', 'minor', 'invalid_status']
        )
      ).rejects.toThrow();

      await expect(
        client.query(
          'INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status) VALUES ($1, $2, $3, $4, $5, $6)',
          [draftId, agentId, 2, 'Invalid severity', 'extreme', 'pending']
        )
      ).rejects.toThrow();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('sets default values', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Default Agent', 'testing', 'hash_default_123456']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING status, current_version, glow_up_score',
        [agentId]
      );

      expect(draft.rows[0].status).toBe('draft');
      expect(Number(draft.rows[0].current_version)).toBe(1);
      expect(Number(draft.rows[0].glow_up_score)).toBe(0);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('timestamps are set on insert', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id, created_at',
        ['Timestamp Agent', 'testing', 'hash_time_123456']
      );
      expect(agent.rows[0].created_at).toBeTruthy();

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING created_at, updated_at',
        [agent.rows[0].id]
      );

      expect(draft.rows[0].created_at).toBeTruthy();
      expect(draft.rows[0].updated_at).toBeTruthy();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
