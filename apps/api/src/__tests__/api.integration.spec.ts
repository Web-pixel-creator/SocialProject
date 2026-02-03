import request from 'supertest';
import { db } from '../db/pool';
import { redis } from '../redis/client';
import { createApp, initInfra } from '../server';

const app = createApp();

const resetDb = async () => {
  await db.query('TRUNCATE TABLE commission_responses RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE commissions RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE payment_events RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE viewing_history RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE fix_requests RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE pull_requests RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE versions RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE drafts RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE forks RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE deletion_requests RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE data_exports RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE glowup_reels RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE autopsy_reports RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE agents RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
};

const registerAgent = async (studioName = 'Agent Studio') => {
  const response = await request(app).post('/api/agents/register').send({
    studioName,
    personality: 'Tester'
  });
  return response.body;
};

const registerHuman = async (email = 'human@example.com') => {
  const response = await request(app).post('/api/auth/register').send({
    email,
    password: 'password123',
    consent: { termsAccepted: true, privacyAccepted: true }
  });
  return response.body;
};

describe('API integration', () => {
  beforeAll(async () => {
    await initInfra();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    if (redis.isOpen) {
      await redis.quit();
    }
    await db.end();
  });

  test('registration requires consent', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: 'human@example.com',
      password: 'password123',
      consent: { termsAccepted: false, privacyAccepted: false }
    });

    expect(response.status).toBe(400);
  });

  test('draft workflow: create -> fix -> PR -> merge', async () => {
    const { agentId, apiKey } = await registerAgent();

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png'
      });

    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id;

    const fixRes = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        category: 'Focus',
        description: 'Fix this'
      });

    expect(fixRes.status).toBe(200);

    const prRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Improvement',
        severity: 'minor',
        imageUrl: 'https://example.com/v2.png',
        thumbnailUrl: 'https://example.com/v2-thumb.png'
      });

    expect(prRes.status).toBe(200);

    const decisionRes = await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        decision: 'merge'
      });

    expect(decisionRes.status).toBe(200);

    const draftGet = await request(app).get(`/api/drafts/${draftId}`);
    expect(draftGet.body.draft.currentVersion).toBeGreaterThan(1);
  }, 30000);

  test('budget enforcement for fix requests', async () => {
    const { agentId, apiKey } = await registerAgent();

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png'
      });

    const draftId = draftRes.body.draft.id;

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post(`/api/drafts/${draftId}/fix-requests`)
        .set('x-agent-id', agentId)
        .set('x-api-key', apiKey)
        .send({
          category: 'Focus',
          description: `Fix ${i}`
        });
      expect(res.status).toBe(200);
    }

    const blocked = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        category: 'Focus',
        description: 'Too many'
      });

    expect(blocked.status).toBe(429);
  });

  test('data export and deletion flows', async () => {
    const register = await request(app).post('/api/auth/register').send({
      email: 'export@example.com',
      password: 'password123',
      consent: { termsAccepted: true, privacyAccepted: true }
    });

    const token = register.body.tokens.accessToken;

    const exportRes = await request(app)
      .post('/api/account/export')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(exportRes.status).toBe(200);
    expect(exportRes.body.export.status).toBe('ready');

    const deleteRes = await request(app)
      .post('/api/account/delete')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.status).toBe('completed');
  });

  test('feeds endpoints return data', async () => {
    const { agentId, apiKey } = await registerAgent();
    const human = await registerHuman('viewer@example.com');
    const token = human.tokens.accessToken;

    const draftOne = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
        metadata: { title: 'Coffee App' }
      });

    const draftTwo = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v2.png',
        thumbnailUrl: 'https://example.com/v2-thumb.png',
        metadata: { title: 'Battle App' }
      });

    const draftOneId = draftOne.body.draft.id;
    const draftTwoId = draftTwo.body.draft.id;

    await db.query('INSERT INTO viewing_history (user_id, draft_id) VALUES ($1, $2)', [
      human.userId,
      draftTwoId
    ]);

    await request(app)
      .post(`/api/drafts/${draftOneId}/release`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();

    await db.query(
      `INSERT INTO autopsy_reports (share_slug, summary, data, published_at)
       VALUES ($1, $2, $3, NOW())`,
      ['auto-1', 'Autopsy summary', {}]
    );

    await request(app)
      .post(`/api/drafts/${draftTwoId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'First PR',
        severity: 'minor',
        imageUrl: 'https://example.com/v2-pr1.png',
        thumbnailUrl: 'https://example.com/v2-pr1-thumb.png'
      });

    await request(app)
      .post(`/api/drafts/${draftTwoId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Second PR',
        severity: 'minor',
        imageUrl: 'https://example.com/v2-pr2.png',
        thumbnailUrl: 'https://example.com/v2-pr2-thumb.png'
      });

    const forYou = await request(app)
      .get('/api/feeds/for-you?limit=5')
      .set('Authorization', `Bearer ${token}`);
    expect(forYou.status).toBe(200);
    expect(Array.isArray(forYou.body)).toBe(true);

    const live = await request(app).get('/api/feeds/live-drafts?limit=5');
    expect(live.status).toBe(200);
    expect(Array.isArray(live.body)).toBe(true);

    const glowups = await request(app).get('/api/feeds/glowups?limit=5');
    expect(glowups.status).toBe(200);
    expect(Array.isArray(glowups.body)).toBe(true);

    const studios = await request(app).get('/api/feeds/studios?limit=5');
    expect(studios.status).toBe(200);
    expect(Array.isArray(studios.body)).toBe(true);

    const battles = await request(app).get('/api/feeds/battles?limit=5');
    expect(battles.status).toBe(200);
    expect(Array.isArray(battles.body)).toBe(true);

    const archive = await request(app).get('/api/feeds/archive?limit=5');
    expect(archive.status).toBe(200);
    expect(Array.isArray(archive.body)).toBe(true);
  });

  test('search endpoint returns drafts and studios', async () => {
    const { agentId, apiKey } = await registerAgent();

    await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
        metadata: { title: 'Coffee Builder' }
      });

    const all = await request(app).get('/api/search?q=Coffee&type=all&sort=recency');
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThan(0);

    const studios = await request(app).get('/api/search?q=Agent&type=studio&sort=impact');
    expect(studios.status).toBe(200);
    expect(studios.body.length).toBeGreaterThan(0);
  });

  test('studios endpoints handle not found and updates', async () => {
    const { agentId, apiKey } = await registerAgent('Agent Studio Primary');
    const { agentId: otherAgentId, apiKey: otherApiKey } = await registerAgent('Agent Studio Secondary');

    const notFound = await request(app).get('/api/studios/00000000-0000-0000-0000-000000000000');
    expect(notFound.status).toBe(404);

    const studio = await request(app).get(`/api/studios/${agentId}`);
    expect(studio.status).toBe(200);
    expect(studio.body.id).toBe(agentId);

    const forbidden = await request(app)
      .put(`/api/studios/${agentId}`)
      .set('x-agent-id', otherAgentId)
      .set('x-api-key', otherApiKey)
      .send({ studioName: 'Hack Attempt' });
    expect(forbidden.status).toBe(403);

    const updated = await request(app)
      .put(`/api/studios/${agentId}`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ studioName: 'Updated Studio' });
    expect(updated.status).toBe(200);
    expect(updated.body.studio_name).toBe('Updated Studio');

    const metrics = await request(app).get(`/api/studios/${agentId}/metrics`);
    expect(metrics.status).toBe(200);
    expect(metrics.body).toHaveProperty('impact');
    expect(metrics.body).toHaveProperty('signal');
  });
});
