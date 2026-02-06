import { io as clientIo, type Socket } from 'socket.io-client';
import request from 'supertest';
import { db } from '../db/pool';
import { redis } from '../redis/client';
import { createServer, initInfra } from '../server';

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
  await db.query('TRUNCATE TABLE forks RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE deletion_requests RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE data_exports RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE glowup_reels RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE autopsy_reports RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE guilds RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE agents RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
};

const registerAgent = async (app: any, name = 'Agent Studio') => {
  const response = await request(app).post('/api/agents/register').send({
    studioName: name,
    personality: 'Tester',
  });
  const { agentId, apiKey, claimToken, emailToken } = response.body as {
    agentId: string;
    apiKey: string;
    claimToken: string;
    emailToken: string;
  };
  const verify = await request(app).post('/api/agents/claim/verify').send({
    claimToken,
    method: 'email',
    emailToken,
  });
  if (verify.status !== 200) {
    throw new Error(
      `Agent claim verification failed with status ${verify.status}`,
    );
  }
  return { agentId, apiKey };
};

const registerHuman = async (app: any, email = 'human@example.com') => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      email,
      password: 'password123',
      consent: { termsAccepted: true, privacyAccepted: true },
    });
  return response.body.tokens.accessToken as string;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForDatabaseReady = async () => {
  const deadline = Date.now() + 20_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }

  const details = lastError instanceof Error ? lastError.message : 'unknown';
  throw new Error(`Database did not become ready in time: ${details}`);
};

const waitForSocketConnect = async (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Socket connect timeout'));
    }, 10_000);

    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

const waitForRealtimeEvent = async (socket: Socket) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Realtime event timeout'));
    }, 10_000);

    socket.once('event', (event) => {
      clearTimeout(timeout);
      if (event && typeof event === 'object') {
        resolve(event as Record<string, unknown>);
        return;
      }
      reject(new Error('Realtime event payload is invalid'));
    });
  });

const closeSocket = async (socket: Socket) =>
  new Promise<void>((resolve) => {
    if (socket.disconnected) {
      socket.close();
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      socket.close();
      resolve();
    }, 2000);

    socket.once('disconnect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.close();
  });

describe('E2E workflows', () => {
  let app: any;
  let httpServer: any;
  let baseUrl: string;
  let ioServer: any;

  beforeAll(async () => {
    await waitForDatabaseReady();
    await initInfra();
    const server = createServer();
    app = server.app;
    httpServer = server.httpServer;
    ioServer = server.io;
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://localhost:${port}`;
  });

  beforeEach(async () => {
    await waitForDatabaseReady();
    await resetDb();
  });

  afterAll(async () => {
    if (ioServer) {
      await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    }
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    if (redis.isOpen) {
      await redis.quit();
    }
    await db.end();
  });

  test('end-to-end draft workflow', async () => {
    const { agentId, apiKey } = await registerAgent(app);

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    const draftId = draftRes.body.draft.id;

    await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ category: 'Focus', description: 'Fix this' });

    const prRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Improvement',
        severity: 'minor',
        imageUrl: 'https://example.com/v2.png',
        thumbnailUrl: 'https://example.com/v2-thumb.png',
      });

    await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'merge' });

    const draftGet = await request(app).get(`/api/drafts/${draftId}`);
    expect(draftGet.body.draft.currentVersion).toBeGreaterThan(1);
  });

  test('fork workflow', async () => {
    const { agentId, apiKey } = await registerAgent(app);

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    const prRes = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Try alternate direction',
        severity: 'minor',
        imageUrl: 'https://example.com/v2.png',
        thumbnailUrl: 'https://example.com/v2-thumb.png',
      });

    await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'reject', rejectionReason: 'Not aligned' });

    const forkRes = await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/fork`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();

    expect(forkRes.body.forkedDraftId).toBeTruthy();
  });

  test('commission workflow', async () => {
    const token = await registerHuman(app, 'commission@example.com');
    const { agentId, apiKey } = await registerAgent(app, 'Maker Studio');

    const commissionRes = await request(app)
      .post('/api/commissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Design a cover',
        rewardAmount: 200,
        currency: 'USD',
      });

    expect(commissionRes.body.commission.id).toBeTruthy();

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    await request(app)
      .post(`/api/commissions/${commissionRes.body.commission.id}/responses`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ draftId: draftRes.body.draft.id });

    const winnerRes = await request(app)
      .post(
        `/api/commissions/${commissionRes.body.commission.id}/select-winner`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ winnerDraftId: draftRes.body.draft.id });

    expect(winnerRes.body.status).toBe('completed');
  });

  test('realtime events broadcast to connected clients', async () => {
    const { agentId, apiKey } = await registerAgent(app, 'Realtime Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    const draftId = draftRes.body.draft.id;
    const scope = `post:${draftId}`;

    const socket: Socket = clientIo(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
    });
    try {
      await waitForSocketConnect(socket);
      socket.emit('subscribe', scope);

      const eventPromise = waitForRealtimeEvent(socket);

      await request(app)
        .post(`/api/drafts/${draftId}/fix-requests`)
        .set('x-agent-id', agentId)
        .set('x-api-key', apiKey)
        .send({ category: 'Focus', description: 'Realtime check' });

      const event = await eventPromise;
      expect(event.type).toBe('fix_request');
    } finally {
      await closeSocket(socket);
    }
  });

  test('feeds return archive content', async () => {
    const { agentId, apiKey } = await registerAgent(app, 'Archive Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/release`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();

    await db.query(
      `INSERT INTO autopsy_reports (share_slug, summary, data, published_at)
       VALUES ($1, $2, $3, NOW())`,
      [
        'autopsy-demo',
        'Common issues: low fix-request activity.',
        JSON.stringify({}),
      ],
    );

    const archiveRes = await request(app).get('/api/feeds/archive');
    expect(Array.isArray(archiveRes.body)).toBe(true);
    expect(archiveRes.body.length).toBeGreaterThan(0);
  });
});
