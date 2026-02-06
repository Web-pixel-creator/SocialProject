import { Pool } from 'pg';
import { FixRequestServiceImpl } from '../services/fixRequest/fixRequestService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

const fixService = new FixRequestServiceImpl(pool);

describe('fix request edge cases', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('rejects invalid category strings', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Invalid Agent', 'tester', 'hash_fix_invalid'],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId],
      );

      await expect(
        fixService.submitFixRequest(
          {
            draftId: draft.rows[0].id,
            criticId: agentId,
            category: 'Bad' as any,
            description: 'invalid category',
          },
          client,
        ),
      ).rejects.toThrow();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects missing required fields', async () => {
    await expect(
      fixService.submitFixRequest({
        draftId: '',
        criticId: '',
        category: 'Focus',
        description: '',
      }),
    ).rejects.toThrow();
  });

  test('allows boundary coordinates', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Boundary Agent', 'tester', 'hash_fix_boundary'],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId],
      );

      const coordinates = { x: 0, y: 0, width: 1, height: 1 };
      const fix = await fixService.submitFixRequest(
        {
          draftId: draft.rows[0].id,
          criticId: agentId,
          category: 'Focus',
          description: 'boundary test',
          coordinates,
        },
        client,
      );

      expect(fix.coordinates).toEqual(coordinates);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects fix request on released draft', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Release Fix Agent', 'tester', 'hash_fix_release'],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        "INSERT INTO drafts (author_id, status) VALUES ($1, 'release') RETURNING id",
        [agentId],
      );

      await expect(
        fixService.submitFixRequest(
          {
            draftId: draft.rows[0].id,
            criticId: agentId,
            category: 'Focus',
            description: 'should fail',
          },
          client,
        ),
      ).rejects.toThrow();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('allows duplicate fix requests', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Dup Fix Agent', 'tester', 'hash_fix_dup'],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId],
      );

      await fixService.submitFixRequest(
        {
          draftId: draft.rows[0].id,
          criticId: agentId,
          category: 'Focus',
          description: 'duplicate',
        },
        client,
      );

      await fixService.submitFixRequest(
        {
          draftId: draft.rows[0].id,
          criticId: agentId,
          category: 'Focus',
          description: 'duplicate',
        },
        client,
      );

      const list = await fixService.listByDraft(draft.rows[0].id, client);
      expect(list.length).toBe(2);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects fix request for missing draft', async () => {
    await expect(
      fixService.submitFixRequest({
        draftId: '00000000-0000-0000-0000-000000000000',
        criticId: '00000000-0000-0000-0000-000000000000',
        category: 'Focus',
        description: 'missing draft',
      }),
    ).rejects.toMatchObject({ code: 'DRAFT_NOT_FOUND' });
  });

  test('lists fix requests by critic', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Critic Agent', 'tester', 'hash_fix_critic'],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId],
      );

      await fixService.submitFixRequest(
        {
          draftId: draft.rows[0].id,
          criticId: agentId,
          category: 'Focus',
          description: 'first',
        },
        client,
      );

      const list = await fixService.listByCritic(agentId, client);
      expect(list.length).toBe(1);
      expect(list[0].criticId).toBe(agentId);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
