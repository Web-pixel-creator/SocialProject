import request from 'supertest';
import { db } from '../db/pool';
import { redis } from '../redis/client';
import { AuthServiceImpl } from '../services/auth/authService';
import { CommissionServiceImpl } from '../services/commission/commissionService';
import { PaymentServiceImpl } from '../services/payment/paymentService';
import { MetricsServiceImpl } from '../services/metrics/metricsService';
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

  test('auth login, oauth, and rotate key endpoints', async () => {
    await registerHuman('login@example.com');

    const login = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'password123'
    });
    expect(login.status).toBe(200);
    expect(login.body.tokens.accessToken).toBeTruthy();

    const oauth = await request(app).post('/api/auth/oauth').send({});
    expect(oauth.status).toBe(501);
    expect(oauth.body.error).toBe('NOT_IMPLEMENTED');

    const { agentId, apiKey } = await registerAgent('Rotate Key Studio');
    const rotated = await request(app)
      .post('/api/agents/rotate-key')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();

    expect(rotated.status).toBe(200);
    expect(rotated.body.apiKey).toBeTruthy();
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

  test('privacy errors return service codes', async () => {
    const human = await registerHuman('privacy-errors@example.com');
    const token = human.tokens.accessToken;

    const exportOne = await request(app)
      .post('/api/account/export')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(exportOne.status).toBe(200);

    const exportRateLimit = await request(app)
      .post('/api/account/export')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(exportRateLimit.status).toBe(400);
    expect(exportRateLimit.body.error).toBe('EXPORT_RATE_LIMIT');

    const missingExport = await request(app)
      .get('/api/account/exports/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(missingExport.status).toBe(404);
    expect(missingExport.body.error).toBe('EXPORT_NOT_FOUND');

    await db.query("INSERT INTO deletion_requests (user_id, status) VALUES ($1, 'pending')", [
      human.userId
    ]);

    const pendingDelete = await request(app)
      .post('/api/account/delete')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(pendingDelete.status).toBe(400);
    expect(pendingDelete.body.error).toBe('DELETION_PENDING');
  });

  test('draft listing and release authorization', async () => {
    const { agentId, apiKey } = await registerAgent('Release Owner');
    const { agentId: otherAgentId, apiKey: otherApiKey } = await registerAgent('Release Intruder');

    const draftOne = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png'
      });

    const draftTwo = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v2.png',
        thumbnailUrl: 'https://example.com/v2-thumb.png'
      });

    const forbidden = await request(app)
      .post(`/api/drafts/${draftOne.body.draft.id}/release`)
      .set('x-agent-id', otherAgentId)
      .set('x-api-key', otherApiKey)
      .send();
    expect(forbidden.status).toBe(403);

    const released = await request(app)
      .post(`/api/drafts/${draftOne.body.draft.id}/release`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(released.status).toBe(200);

    const listAll = await request(app).get(`/api/drafts?authorId=${agentId}`);
    expect(listAll.status).toBe(200);
    expect(listAll.body.length).toBe(2);

    const listReleased = await request(app).get('/api/drafts?status=release');
    expect(listReleased.status).toBe(200);
    expect(listReleased.body.length).toBe(1);

    const listDrafts = await request(app).get('/api/drafts?status=draft');
    expect(listDrafts.status).toBe(200);
    expect(listDrafts.body.length).toBe(1);

    const paged = await request(app).get('/api/drafts?limit=1&offset=1');
    expect(paged.status).toBe(200);
    expect(paged.body.length).toBe(1);

    expect(draftTwo.status).toBe(200);
  });

  test('pull request decisions, listings, and fork flow', async () => {
    const { agentId: authorId, apiKey: authorKey } = await registerAgent('Author Studio');
    const { agentId: makerId, apiKey: makerKey } = await registerAgent('Maker Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png'
      });

    const draftId = draftRes.body.draft.id;

    const fixRes = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        category: 'Focus',
        description: 'Fix details'
      });
    expect(fixRes.status).toBe(200);

    const fixList = await request(app).get(`/api/drafts/${draftId}/fix-requests`);
    expect(fixList.status).toBe(200);
    expect(fixList.body.length).toBe(1);

    const prOne = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Initial changes',
        severity: 'minor',
        imageUrl: 'https://example.com/pr1.png',
        thumbnailUrl: 'https://example.com/pr1-thumb.png'
      });
    expect(prOne.status).toBe(200);

    const requestChanges = await request(app)
      .post(`/api/pull-requests/${prOne.body.id}/decide`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        decision: 'request_changes',
        feedback: 'Need more work'
      });
    expect(requestChanges.status).toBe(200);
    expect(requestChanges.body.status).toBe('changes_requested');

    const prTwo = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Second attempt',
        severity: 'minor',
        imageUrl: 'https://example.com/pr2.png',
        thumbnailUrl: 'https://example.com/pr2-thumb.png'
      });
    expect(prTwo.status).toBe(200);

    const prThree = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Major attempt',
        severity: 'major',
        imageUrl: 'https://example.com/pr3.png',
        thumbnailUrl: 'https://example.com/pr3-thumb.png'
      });
    expect(prThree.status).toBe(200);

    const reject = await request(app)
      .post(`/api/pull-requests/${prTwo.body.id}/decide`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        decision: 'reject',
        rejectionReason: 'Not aligned'
      });
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('rejected');

    const listPrs = await request(app).get(`/api/drafts/${draftId}/pull-requests`);
    expect(listPrs.status).toBe(200);
    expect(listPrs.body.length).toBe(3);

    const fork = await request(app)
      .post(`/api/pull-requests/${prTwo.body.id}/fork`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send();
    expect(fork.status).toBe(200);
    expect(fork.body.forkedDraftId).toBeTruthy();
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

  test('feeds endpoints accept offset without limit', async () => {
    const human = await registerHuman('offset-viewer@example.com');
    const token = human.tokens.accessToken;

    const forYou = await request(app)
      .get('/api/feeds/for-you?offset=1')
      .set('Authorization', `Bearer ${token}`);
    expect(forYou.status).toBe(200);

    const live = await request(app).get('/api/feeds/live-drafts?offset=1');
    expect(live.status).toBe(200);

    const glowups = await request(app).get('/api/feeds/glowups?offset=1');
    expect(glowups.status).toBe(200);

    const studios = await request(app).get('/api/feeds/studios?offset=1');
    expect(studios.status).toBe(200);

    const battles = await request(app).get('/api/feeds/battles?offset=1');
    expect(battles.status).toBe(200);

    const archive = await request(app).get('/api/feeds/archive?offset=1');
    expect(archive.status).toBe(200);
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

  test('search endpoint supports pagination and empty query', async () => {
    const paged = await request(app).get('/api/search?q=&limit=2&offset=1');
    expect(paged.status).toBe(200);

    const empty = await request(app).get('/api/search');
    expect(empty.status).toBe(200);
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

  test('commission endpoints cover lifecycle', async () => {
    const human = await registerHuman('commissioner@example.com');
    const token = human.tokens.accessToken;
    const { agentId, apiKey } = await registerAgent('Commission Agent');

    const commissionPending = await request(app)
      .post('/api/commissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Need a logo',
        rewardAmount: 50,
        currency: 'USD',
        referenceImages: []
      });
    expect(commissionPending.status).toBe(200);
    expect(commissionPending.body.commission.paymentStatus).toBe('pending');
    expect(commissionPending.body.paymentIntentId).toBeTruthy();

    const commissionOpen = await request(app)
      .post('/api/commissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'No reward commission'
      });
    expect(commissionOpen.status).toBe(200);

    const listAll = await request(app).get('/api/commissions');
    expect(listAll.status).toBe(200);
    expect(listAll.body.length).toBeGreaterThan(0);

    const listForAgents = await request(app).get('/api/commissions?forAgents=true');
    expect(listForAgents.status).toBe(200);
    expect(listForAgents.body.length).toBeGreaterThan(0);

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png'
      });

    const submitResponse = await request(app)
      .post(`/api/commissions/${commissionOpen.body.commission.id}/responses`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ draftId: draftRes.body.draft.id });
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.ok).toBe(true);

    const selectWinner = await request(app)
      .post(`/api/commissions/${commissionOpen.body.commission.id}/select-winner`)
      .set('Authorization', `Bearer ${token}`)
      .send({ winnerDraftId: draftRes.body.draft.id });
    expect(selectWinner.status).toBe(200);
    expect(selectWinner.body.status).toBe('completed');

    const payIntent = await request(app)
      .post(`/api/commissions/${commissionPending.body.commission.id}/pay-intent`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(payIntent.status).toBe(200);
    expect(payIntent.body.paymentIntentId).toBeTruthy();

    const cancel = await request(app)
      .post(`/api/commissions/${commissionPending.body.commission.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');

    const webhook = await request(app).post('/api/payments/webhook').send({
      provider: 'stripe',
      providerEventId: 'evt_coverage_1',
      commissionId: commissionPending.body.commission.id,
      eventType: 'payment'
    });
    expect(webhook.status).toBe(200);
    expect(webhook.body.applied).toBe(true);
  });

  test('commission validation errors surface as service errors', async () => {
    const human = await registerHuman('commission-errors@example.com');
    const token = human.tokens.accessToken;

    const missingDescription = await request(app)
      .post('/api/commissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ rewardAmount: 25, currency: 'USD' });

    expect(missingDescription.status).toBe(400);
    expect(missingDescription.body.error).toBe('COMMISSION_REQUIRED_FIELDS');
  });

  test('commission routes propagate handler errors', async () => {
    const human = await registerHuman('commission-route-errors@example.com');
    const token = human.tokens.accessToken;
    const { agentId, apiKey } = await registerAgent('Commission Error Agent');

    const listSpy = jest
      .spyOn(CommissionServiceImpl.prototype, 'listCommissions')
      .mockRejectedValueOnce(new Error('list fail'));
    const listRes = await request(app).get('/api/commissions');
    expect(listRes.status).toBe(500);
    listSpy.mockRestore();

    const responseSpy = jest
      .spyOn(CommissionServiceImpl.prototype, 'submitResponse')
      .mockRejectedValueOnce(new Error('response fail'));
    const responseRes = await request(app)
      .post('/api/commissions/00000000-0000-0000-0000-000000000001/responses')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ draftId: '00000000-0000-0000-0000-000000000002' });
    expect(responseRes.status).toBe(500);
    responseSpy.mockRestore();

    const winnerSpy = jest
      .spyOn(CommissionServiceImpl.prototype, 'selectWinner')
      .mockRejectedValueOnce(new Error('winner fail'));
    const winnerRes = await request(app)
      .post('/api/commissions/00000000-0000-0000-0000-000000000003/select-winner')
      .set('Authorization', `Bearer ${token}`)
      .send({ winnerDraftId: '00000000-0000-0000-0000-000000000004' });
    expect(winnerRes.status).toBe(500);
    winnerSpy.mockRestore();

    const paySpy = jest
      .spyOn(PaymentServiceImpl.prototype, 'createPaymentIntent')
      .mockRejectedValueOnce(new Error('pay fail'));
    const payRes = await request(app)
      .post('/api/commissions/00000000-0000-0000-0000-000000000005/pay-intent')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(payRes.status).toBe(500);
    paySpy.mockRestore();

    const cancelSpy = jest
      .spyOn(CommissionServiceImpl.prototype, 'cancelCommission')
      .mockRejectedValueOnce(new Error('cancel fail'));
    const cancelRes = await request(app)
      .post('/api/commissions/00000000-0000-0000-0000-000000000006/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(cancelRes.status).toBe(500);
    cancelSpy.mockRestore();

    const webhookSpy = jest
      .spyOn(PaymentServiceImpl.prototype, 'recordWebhookEvent')
      .mockRejectedValueOnce(new Error('webhook fail'));
    const webhookRes = await request(app).post('/api/payments/webhook').send({
      provider: 'stripe',
      providerEventId: 'evt_fail_1',
      commissionId: '00000000-0000-0000-0000-000000000007',
      eventType: 'payment'
    });
    expect(webhookRes.status).toBe(500);
    webhookSpy.mockRestore();
  });

  test('studios routes propagate handler errors', async () => {
    const { agentId, apiKey } = await registerAgent('Studios Error Agent');

    const studioGetSpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('studio get fail'));
    const getRes = await request(app).get('/api/studios/00000000-0000-0000-0000-000000000008');
    expect(getRes.status).toBe(500);
    studioGetSpy.mockRestore();

    const authSpy = jest
      .spyOn(AuthServiceImpl.prototype, 'validateAgentApiKey')
      .mockResolvedValueOnce(true);
    const studioPutSpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('studio put fail'));
    const putRes = await request(app)
      .put(`/api/studios/${agentId}`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ studioName: 'Fail Update' });
    expect(putRes.status).toBe(500);
    authSpy.mockRestore();
    studioPutSpy.mockRestore();

    const metricsSpy = jest
      .spyOn(MetricsServiceImpl.prototype, 'getAgentMetrics')
      .mockRejectedValueOnce(new Error('metrics fail'));
    const metricsRes = await request(app).get(`/api/studios/${agentId}/metrics`);
    expect(metricsRes.status).toBe(500);
    metricsSpy.mockRestore();
  });
});
