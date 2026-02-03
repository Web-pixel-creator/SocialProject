import { Pool } from 'pg';
import fc from 'fast-check';
import { FixRequestServiceImpl } from '../services/fixRequest/fixRequestService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const fixService = new FixRequestServiceImpl(pool);

const categories = ['Focus', 'Cohesion', 'Readability', 'Composition', 'Color/Light', 'Story/Intent', 'Technical'] as const;

describe('fix request properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 3: Diagnosis Category Validation', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Fix Agent', 'tester', 'hash_fix']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId]
      );

      await expect(
        fixService.submitFixRequest(
          {
            draftId: draft.rows[0].id,
            criticId: agentId,
            category: 'Invalid' as any,
            description: 'bad category'
          },
          client
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

  test('Property 37: Fix Request Version Association', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...categories), async (category) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const agent = await client.query(
            'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
            ['Fix Agent', 'tester', 'hash_fix_2']
          );
          const agentId = agent.rows[0].id;

          const draft = await client.query(
            'INSERT INTO drafts (author_id, current_version) VALUES ($1, $2) RETURNING id, current_version',
            [agentId, 2]
          );

          const fix = await fixService.submitFixRequest(
            {
              draftId: draft.rows[0].id,
              criticId: agentId,
              category,
              description: 'check version association'
            },
            client
          );

          expect(fix.targetVersion).toBe(2);

          await client.query('ROLLBACK');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }),
      { numRuns: 10 }
    );
  }, 30000);

  test('Property 38: Fix Request Chronological Display', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Chrono Agent', 'tester', 'hash_fix_3']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId]
      );

      await fixService.submitFixRequest(
        {
          draftId: draft.rows[0].id,
          criticId: agentId,
          category: 'Focus',
          description: 'first'
        },
        client
      );

      await fixService.submitFixRequest(
        {
          draftId: draft.rows[0].id,
          criticId: agentId,
          category: 'Cohesion',
          description: 'second'
        },
        client
      );

      const list = await fixService.listByDraft(draft.rows[0].id, client);
      expect(list.map((item) => item.description)).toEqual(['first', 'second']);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 39: Heat Map Coordinate Storage', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Heat Agent', 'tester', 'hash_fix_4']
      );
      const agentId = agent.rows[0].id;
      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId]
      );

      const coordinates = { x: 0.5, y: 0.25, width: 0.1, height: 0.2 };
      const fix = await fixService.submitFixRequest(
        {
          draftId: draft.rows[0].id,
          criticId: agentId,
          category: 'Composition',
          description: 'heat map',
          coordinates
        },
        client
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

  test('Property 45: Fix Request Required Fields', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Req Agent', 'tester', 'hash_fix_5']
      );

      await expect(
        fixService.submitFixRequest(
          {
            draftId: '',
            criticId: agent.rows[0].id,
            category: 'Focus',
            description: ''
          },
          client
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
});
