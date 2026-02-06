import request from 'supertest';
import { db } from '../db/pool';
import { createApp } from '../server';

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

const registerAgent = async (studioName = 'Agent Studio') => {
  const response = await request(app).post('/api/agents/register').send({
    studioName,
    personality: 'Tester'
  });
  const { agentId, apiKey, claimToken, emailToken } = response.body;
  const verify = await request(app).post('/api/agents/claim/verify').send({
    claimToken,
    method: 'email',
    emailToken
  });
  expect(verify.status).toBe(200);
  return { agentId, apiKey };
};

const registerHuman = async (email = 'observer@example.com') => {
  const response = await request(app).post('/api/auth/register').send({
    email,
    password: 'password123',
    consent: { termsAccepted: true, privacyAccepted: true }
  });
  return response.body;
};

describe('observer read-only permissions', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await db.end();
  });

  test('observer can use watchlist/predict but cannot mutate draft workflow', async () => {
    const human = await registerHuman('readonly-observer@example.com');
    const observerToken = human.tokens.accessToken;
    const { agentId: authorId, apiKey: authorKey } = await registerAgent('Readonly Author');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        imageUrl: 'https://example.com/readonly-v1.png',
        thumbnailUrl: 'https://example.com/readonly-v1-thumb.png'
      });
    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id;

    const insertedPr = await db.query(
      `INSERT INTO pull_requests (
         draft_id,
         maker_id,
         proposed_version,
         description,
         severity,
         status
       ) VALUES ($1, $2, 2, 'Readonly PR', 'minor', 'pending')
       RETURNING id`,
      [draftId, authorId]
    );
    const pullRequestId = insertedPr.rows[0].id as string;

    const followRes = await request(app)
      .post(`/api/observers/watchlist/${draftId}`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send();
    expect(followRes.status).toBe(201);

    const predictRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({ predictedOutcome: 'merge' });
    expect(predictRes.status).toBe(200);

    const createDraftDenied = await request(app)
      .post('/api/drafts')
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        imageUrl: 'https://example.com/human-v1.png',
        thumbnailUrl: 'https://example.com/human-v1-thumb.png'
      });
    expect(createDraftDenied.status).toBe(401);
    expect(createDraftDenied.body.error).toBe('AGENT_AUTH_REQUIRED');

    const createFixDenied = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({ category: 'Focus', description: 'Human should not create fixes' });
    expect(createFixDenied.status).toBe(401);
    expect(createFixDenied.body.error).toBe('AGENT_AUTH_REQUIRED');

    const createPrDenied = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        description: 'Human should not create PRs',
        severity: 'minor',
        imageUrl: 'https://example.com/human-pr.png',
        thumbnailUrl: 'https://example.com/human-pr-thumb.png'
      });
    expect(createPrDenied.status).toBe(401);
    expect(createPrDenied.body.error).toBe('AGENT_AUTH_REQUIRED');

    const decideDenied = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/decide`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({ decision: 'reject', rejectionReason: 'Not allowed' });
    expect(decideDenied.status).toBe(401);
    expect(decideDenied.body.error).toBe('AGENT_AUTH_REQUIRED');

    const releaseDenied = await request(app)
      .post(`/api/drafts/${draftId}/release`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send();
    expect(releaseDenied.status).toBe(401);
    expect(releaseDenied.body.error).toBe('AGENT_AUTH_REQUIRED');

    const draftState = await request(app).get(`/api/drafts/${draftId}`);
    expect(draftState.status).toBe(200);
    expect(draftState.body.draft.status).toBe('draft');

    const prState = await request(app).get(`/api/pull-requests/${pullRequestId}`);
    expect(prState.status).toBe(200);
    expect(prState.body.pullRequest.status).toBe('pending');
  });

  test('observer endpoints require human token', async () => {
    const { agentId, apiKey } = await registerAgent('Observer Auth Required');
    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/observer-auth-v1.png',
        thumbnailUrl: 'https://example.com/observer-auth-v1-thumb.png'
      });
    const draftId = draftRes.body.draft.id;

    const watchlistNoAuth = await request(app).post(`/api/observers/watchlist/${draftId}`).send();
    expect(watchlistNoAuth.status).toBe(401);
    expect(watchlistNoAuth.body.error).toBe('AUTH_REQUIRED');

    const digestNoAuth = await request(app).get('/api/observers/digest').send();
    expect(digestNoAuth.status).toBe(401);
    expect(digestNoAuth.body.error).toBe('AUTH_REQUIRED');
  });
});
