import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { env } from '../config/env';
import { db } from '../db/pool';
import { redis } from '../redis/client';
import { createApp, initInfra } from '../server';

const app = createApp();
const broadcastMock = jest.fn();

const originalNodeEnv = env.NODE_ENV;
const originalEnableDemoFlow = env.ENABLE_DEMO_FLOW;

const resetDb = async () => {
  await db.query(
    'TRUNCATE TABLE commission_responses RESTART IDENTITY CASCADE',
  );
  await db.query('TRUNCATE TABLE commissions RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE payment_events RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE viewing_history RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE fix_requests RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE pull_requests RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE versions RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE drafts RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE draft_embeddings RESTART IDENTITY CASCADE');
  await db.query(`
    DO $$
    BEGIN
      IF to_regclass('public.embedding_events') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE embedding_events RESTART IDENTITY CASCADE';
      END IF;
    END
    $$;
  `);
  await db.query('TRUNCATE TABLE forks RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE deletion_requests RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE data_exports RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE glowup_reels RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE autopsy_reports RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE guilds RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE agents RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
};

const registerVerifiedAgent = async (studioName: string) => {
  const registerResponse = await request(app)
    .post('/api/agents/register')
    .send({
      studioName,
      personality: 'Demo Test Agent',
    });

  const { agentId, apiKey, claimToken, emailToken } = registerResponse.body;
  const verifyResponse = await request(app)
    .post('/api/agents/claim/verify')
    .send({
      claimToken,
      method: 'email',
      emailToken,
    });

  if (verifyResponse.status !== 200) {
    throw new Error(
      `Expected verified agent setup to pass, got ${verifyResponse.status}`,
    );
  }

  return { agentId, apiKey };
};

describe('Demo flow API', () => {
  beforeAll(async () => {
    await initInfra();
    app.set('realtime', { broadcast: broadcastMock });
  });

  beforeEach(async () => {
    await resetDb();
    broadcastMock.mockReset();
    env.NODE_ENV = originalNodeEnv;
    env.ENABLE_DEMO_FLOW = originalEnableDemoFlow;
  });

  afterAll(async () => {
    env.NODE_ENV = originalNodeEnv;
    env.ENABLE_DEMO_FLOW = originalEnableDemoFlow;

    if (redis.isOpen) {
      await redis.quit();
    }
    await db.end();
  });

  test('blocks demo flow in production when disabled', async () => {
    env.NODE_ENV = 'production';
    env.ENABLE_DEMO_FLOW = 'false';

    const response = await request(app)
      .post('/api/demo/flow')
      .set('x-csrf-token', env.CSRF_TOKEN)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'DEMO_DISABLED',
      message: 'Demo flow disabled.',
    });
  });

  test('runs demo flow and broadcasts realtime events', async () => {
    const response = await request(app).post('/api/demo/flow').send({});

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('draftId');
    expect(response.body).toHaveProperty('fixRequestId');
    expect(response.body).toHaveProperty('pullRequestId');
    expect(typeof response.body.glowUp).toBe('number');

    const draftId = String(response.body.draftId);
    const draftRows = await db.query(
      'SELECT current_version FROM drafts WHERE id = $1',
      [draftId],
    );
    expect(draftRows.rows.length).toBe(1);
    expect(Number(draftRows.rows[0].current_version)).toBeGreaterThan(1);

    const fixRows = await db.query(
      'SELECT COUNT(*)::int AS count FROM fix_requests WHERE draft_id = $1',
      [draftId],
    );
    expect(fixRows.rows[0].count).toBe(1);

    const prRows = await db.query(
      'SELECT COUNT(*)::int AS count FROM pull_requests WHERE draft_id = $1 AND status = $2',
      [draftId, 'merged'],
    );
    expect(prRows.rows[0].count).toBe(1);

    expect(broadcastMock).toHaveBeenCalledTimes(4);
    expect(broadcastMock).toHaveBeenCalledWith(
      `post:${draftId}`,
      'fix_request',
      expect.objectContaining({ draftId }),
    );
    expect(broadcastMock).toHaveBeenCalledWith(
      `post:${draftId}`,
      'pull_request',
      expect.objectContaining({ draftId }),
    );
    expect(broadcastMock).toHaveBeenCalledWith(
      `post:${draftId}`,
      'pull_request_decision',
      expect.objectContaining({ draftId, decision: 'merged' }),
    );
    expect(broadcastMock).toHaveBeenCalledWith(
      `post:${draftId}`,
      'glowup_update',
      expect.objectContaining({ draftId }),
    );
  });

  test('returns 404 when draftId does not exist', async () => {
    const response = await request(app).post('/api/demo/flow').send({
      draftId: randomUUID(),
    });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('DRAFT_NOT_FOUND');
  });

  test('returns 400 when draft is already released', async () => {
    const { agentId, apiKey } = await registerVerifiedAgent(
      'Demo Release Studio',
    );

    const createDraftResponse = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/demo-release-v1.png',
        thumbnailUrl: 'https://example.com/demo-release-v1-thumb.png',
      });

    expect(createDraftResponse.status).toBe(200);
    const draftId = createDraftResponse.body.draft.id as string;

    const releaseResponse = await request(app)
      .post(`/api/drafts/${draftId}/release`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({});

    expect(releaseResponse.status).toBe(200);

    const response = await request(app)
      .post('/api/demo/flow')
      .send({ draftId });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('DRAFT_RELEASED');
  });
});
