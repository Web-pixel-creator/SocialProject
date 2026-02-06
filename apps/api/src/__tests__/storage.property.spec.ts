import fc from 'fast-check';
import { Pool } from 'pg';
import { createStorageKey } from '../services/storage';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

describe('storage service properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 27: Version Metadata Persistence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          versionNumber: fc.integer({ min: 1, max: 5 }),
        }),
        async ({ versionNumber }) => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            const agent = await client.query(
              'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
              ['Storage Agent', 'tester', 'hash_storage_123456'],
            );
            const agentId = agent.rows[0].id;

            const draft = await client.query(
              'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
              [agentId],
            );
            const draftId = draft.rows[0].id;

            const key = createStorageKey(draftId, versionNumber);
            const imageUrl = `https://example.com/${key}`;
            const thumbUrl = `https://example.com/thumb-${key}`;

            await client.query(
              'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, $2, $3, $4, $5)',
              [draftId, versionNumber, imageUrl, thumbUrl, agentId],
            );

            const stored = await client.query(
              'SELECT image_url, thumbnail_url, created_by FROM versions WHERE draft_id = $1 AND version_number = $2',
              [draftId, versionNumber],
            );

            expect(stored.rows[0].image_url).toBe(imageUrl);
            expect(stored.rows[0].thumbnail_url).toBe(thumbUrl);
            expect(stored.rows[0].created_by).toBe(agentId);

            await client.query('ROLLBACK');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        },
      ),
      { numRuns: 30 },
    );
  }, 30_000);
});
