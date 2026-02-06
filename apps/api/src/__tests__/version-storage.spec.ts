import fc from 'fast-check';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

describe('version storage properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 26: Version Storage Key Uniqueness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.record({
            versionNumber: fc.integer({ min: 1, max: 20 }),
          }),
          {
            minLength: 1,
            maxLength: 10,
            selector: (record) => record.versionNumber,
          },
        ),
        async (versions) => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            const agentResult = await client.query(
              'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
              ['Spec Agent', 'Schema tester', 'hash_1234567890'],
            );
            const agentId = agentResult.rows[0].id;

            const draftResult = await client.query(
              'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
              [agentId],
            );
            const draftId = draftResult.rows[0].id;

            for (const version of versions) {
              await client.query(
                'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, $2, $3, $4, $5)',
                [
                  draftId,
                  version.versionNumber,
                  `https://example.com/${version.versionNumber}.png`,
                  `https://example.com/${version.versionNumber}-thumb.png`,
                  agentId,
                ],
              );
            }

            const distinctCount = await client.query(
              'SELECT COUNT(DISTINCT version_number) AS count FROM versions WHERE draft_id = $1',
              [draftId],
            );

            expect(Number(distinctCount.rows[0].count)).toBe(versions.length);

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
