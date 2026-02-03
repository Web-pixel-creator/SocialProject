import { Pool } from 'pg';
import { NotificationServiceImpl } from '../services/notification/notificationService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

describe('notification service edge cases', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('respects notification preferences', async () => {
    const deliveries: any[] = [];
    const delivery = async (url: string, payload: any) => {
      deliveries.push({ url, payload });
    };

    const service = new NotificationServiceImpl(pool, delivery);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash, webhook_url, notification_prefs) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [
          'Notify Prefs',
          'tester',
          'hash_notify_3',
          'https://example.com/webhook',
          JSON.stringify({ enablePullRequests: false })
        ]
      );

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agent.rows[0].id]);

      await service.notifyAuthorOnPullRequest(draft.rows[0].id, 'pr-456', client);
      expect(deliveries.length).toBe(0);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
