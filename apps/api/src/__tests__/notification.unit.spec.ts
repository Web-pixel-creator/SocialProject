import { Pool } from 'pg';
import { NotificationServiceImpl } from '../services/notification/notificationService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

describe('notification service edge cases', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('respects notification preferences', async () => {
    const deliveries: any[] = [];
    const delivery = (url: string, payload: any): Promise<void> => {
      deliveries.push({ url, payload });
      return Promise.resolve();
    };

    const service = new NotificationServiceImpl(pool, delivery);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash, webhook_url, notification_prefs) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [
          'Notify Prefs',
          'tester',
          'hash_notify_3',
          'https://example.com/webhook',
          JSON.stringify({ enablePullRequests: false }),
        ],
      );

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agent.rows[0].id],
      );

      await service.notifyAuthorOnPullRequest(
        draft.rows[0].id,
        'pr-456',
        client,
      );
      expect(deliveries.length).toBe(0);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('uses default delivery and parses prefs strings', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    try {
      const fakeClient = {
        query: jest.fn().mockResolvedValue({
          rows: [
            {
              webhook_url: 'https://example.com/webhook',
              notification_prefs: '{"enablePullRequests":true}',
            },
          ],
        }),
      };

      const service = new NotificationServiceImpl(pool);
      await service.notifyAuthorOnPullRequest(
        'draft-1',
        'pr-1',
        fakeClient as any,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch as any;
    }
  });

  test('defaults invalid prefs JSON to allow delivery', async () => {
    const deliveries: any[] = [];
    const delivery = (url: string, payload: any): Promise<void> => {
      deliveries.push({ url, payload });
      return Promise.resolve();
    };

    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            webhook_url: 'https://example.com/webhook',
            notification_prefs: 'not-json',
          },
        ],
      }),
    };

    const service = new NotificationServiceImpl(pool, delivery);
    await service.notifyAuthorOnFixRequest(
      'draft-2',
      'fix-1',
      fakeClient as any,
    );
    expect(deliveries.length).toBe(1);
  });

  test('skips delivery when webhook is missing', async () => {
    const delivery = jest.fn();
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            webhook_url: null,
            notification_prefs: { enableFixRequests: true },
          },
        ],
      }),
    };

    const service = new NotificationServiceImpl(pool, delivery);
    await service.notifyAuthorOnFixRequest(
      'draft-4',
      'fix-4',
      fakeClient as any,
    );

    expect(delivery).not.toHaveBeenCalled();
  });

  test('throws when author is missing', async () => {
    const fakeClient = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new NotificationServiceImpl(pool);
    await expect(
      service.notifyAuthorOnPullRequest(
        'draft-missing',
        'pr-missing',
        fakeClient as any,
      ),
    ).rejects.toMatchObject({
      code: 'AUTHOR_NOT_FOUND',
    });
  });

  test('throws when author is missing for fix requests', async () => {
    const fakeClient = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new NotificationServiceImpl(pool);
    await expect(
      service.notifyAuthorOnFixRequest(
        'draft-missing',
        'fix-missing',
        fakeClient as any,
      ),
    ).rejects.toMatchObject({
      code: 'AUTHOR_NOT_FOUND',
    });
  });

  test('throws when maker is missing', async () => {
    const fakeClient = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new NotificationServiceImpl(pool);
    await expect(
      service.notifyMakerOnDecision('pr-missing', 'merged', fakeClient as any),
    ).rejects.toMatchObject({
      code: 'MAKER_NOT_FOUND',
    });
  });

  test('skips decision delivery when disabled by prefs', async () => {
    const delivery = jest.fn();
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            webhook_url: 'https://example.com/webhook',
            notification_prefs: { enableDecisions: false },
            draft_id: 'draft-1',
          },
        ],
      }),
    };

    const service = new NotificationServiceImpl(pool, delivery);
    await service.notifyMakerOnDecision('pr-1', 'merged', fakeClient as any);

    expect(delivery).not.toHaveBeenCalled();
  });

  test('propagates delivery failures', async () => {
    const delivery = jest.fn().mockRejectedValue(new Error('network failed'));
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            webhook_url: 'https://example.com/webhook',
            notification_prefs: null,
          },
        ],
      }),
    };

    const service = new NotificationServiceImpl(pool, delivery);
    await expect(
      service.notifyAuthorOnFixRequest('draft-3', 'fix-3', fakeClient as any),
    ).rejects.toThrow('network failed');
  });

  test('propagates delivery failures for pull request and decision', async () => {
    const delivery = jest.fn().mockRejectedValue(new Error('webhook down'));
    const pullRequestClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            webhook_url: 'https://example.com/webhook',
            notification_prefs: { enablePullRequests: true },
          },
        ],
      }),
    };
    const decisionClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            webhook_url: 'https://example.com/webhook',
            notification_prefs: { enableDecisions: true },
            draft_id: 'draft-9',
          },
        ],
      }),
    };

    const service = new NotificationServiceImpl(pool, delivery);
    await expect(
      service.notifyAuthorOnPullRequest(
        'draft-9',
        'pr-9',
        pullRequestClient as any,
      ),
    ).rejects.toThrow('webhook down');
    await expect(
      service.notifyMakerOnDecision('pr-9', 'merged', decisionClient as any),
    ).rejects.toThrow('webhook down');
  });
});
