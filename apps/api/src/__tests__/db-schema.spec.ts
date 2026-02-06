import fc from 'fast-check';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

describe('database schema properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 31: Agent ID Uniqueness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.record({
            studioName: fc.string({ minLength: 3, maxLength: 40 }),
            personality: fc.string({ minLength: 1, maxLength: 80 }),
            apiKeyHash: fc.string({ minLength: 12, maxLength: 80 }),
          }),
          {
            minLength: 1,
            maxLength: 20,
            selector: (record) => record.studioName,
          },
        ),
        async (agents) => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const ids: string[] = [];
            for (const agent of agents) {
              const result = await client.query(
                'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
                [agent.studioName, agent.personality, agent.apiKeyHash],
              );
              ids.push(result.rows[0].id);
            }

            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);

            await client.query('ROLLBACK');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
