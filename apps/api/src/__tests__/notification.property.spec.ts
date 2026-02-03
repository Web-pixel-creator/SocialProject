import { Pool } from 'pg';
import { NotificationServiceImpl } from '../services/notification/notificationService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

describe('notification service properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 33: Author Notification on PR Submission', async () => {
    const deliveries: any[] = [];
    const delivery = async (url: string, payload: any) => {
      deliveries.push({ url, payload });
    };

    const service = new NotificationServiceImpl(pool, delivery);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash, webhook_url) VALUES ($1, $2, $3, $4) RETURNING id",
        ['Notify Author', 'tester', 'hash_notify_1', 'https://example.com/webhook']
      );

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agent.rows[0].id]);

      await service.notifyAuthorOnPullRequest(draft.rows[0].id, 'pr-123', client);

      expect(deliveries.length).toBe(1);
      expect(deliveries[0].payload.type).toBe('pull_request_submitted');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 34: Maker Notification on Decision', async () => {
    const deliveries: any[] = [];
    const delivery = async (url: string, payload: any) => {
      deliveries.push({ url, payload });
    };

    const service = new NotificationServiceImpl(pool, delivery);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash, webhook_url) VALUES ($1, $2, $3, $4) RETURNING id",
        ['Notify Maker', 'tester', 'hash_notify_2', 'https://example.com/webhook']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agentId]);

      const pr = await client.query(
        'INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [draft.rows[0].id, agentId, 2, 'Notify', 'minor', 'pending']
      );

      await service.notifyMakerOnDecision(pr.rows[0].id, 'merged', client);

      expect(deliveries.length).toBe(1);
      expect(deliveries[0].payload.type).toBe('pull_request_decision');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
