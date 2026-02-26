import request from 'supertest';
import { env } from '../config/env';
import { db } from '../db/pool';
import { redis } from '../redis/client';
import { createApp, initInfra } from '../server';
import { AuthServiceImpl } from '../services/auth/authService';
import {
  BudgetServiceImpl,
  getUtcDateKey,
} from '../services/budget/budgetService';
import { CommissionServiceImpl } from '../services/commission/commissionService';
import { FeedServiceImpl } from '../services/feed/feedService';
import { FixRequestServiceImpl } from '../services/fixRequest/fixRequestService';
import {
  IMPACT_MAJOR_INCREMENT,
  IMPACT_MINOR_INCREMENT,
} from '../services/metrics/constants';
import { MetricsServiceImpl } from '../services/metrics/metricsService';
import { DraftArcServiceImpl } from '../services/observer/draftArcService';
import { PaymentServiceImpl } from '../services/payment/paymentService';
import { PostServiceImpl } from '../services/post/postService';
import { PrivacyServiceImpl } from '../services/privacy/privacyService';
import { PullRequestServiceImpl } from '../services/pullRequest/pullRequestService';
import { SearchServiceImpl } from '../services/search/searchService';

const app = createApp();
jest.setTimeout(30_000);

const resetDb = async () => {
  if (redis.isOpen) {
    await redis.flushAll();
  }
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

const registerAgent = async (studioName = 'Agent Studio') => {
  const authService = new AuthServiceImpl(db);
  const registered = await authService.registerAgent({
    studioName,
    personality: 'Tester',
  });
  await db.query('UPDATE agents SET trust_tier = 1 WHERE id = $1', [
    registered.agentId,
  ]);
  return { agentId: registered.agentId, apiKey: registered.apiKey };
};

const registerUnverifiedAgent = async (studioName = 'Sandbox Studio') => {
  const authService = new AuthServiceImpl(db);
  const registered = await authService.registerAgent({
    studioName,
    personality: 'Tester',
  });
  return { agentId: registered.agentId, apiKey: registered.apiKey };
};

const registerHuman = async (email = 'human@example.com') => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      email,
      password: 'password123',
      consent: { termsAccepted: true, privacyAccepted: true },
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
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'human@example.com',
        password: 'password123',
        consent: { termsAccepted: false, privacyAccepted: false },
      });

    expect(response.status).toBe(400);
  });

  test('auth login, oauth, and rotate key endpoints', async () => {
    await registerHuman('login@example.com');

    const login = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'password123',
    });
    expect(login.status).toBe(200);
    expect(login.body.tokens.accessToken).toBeTruthy();

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.tokens.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(login.body.userId);
    expect(me.body.user.email).toBe('login@example.com');

    const missingAuth = await request(app).get('/api/auth/me');
    expect(missingAuth.status).toBe(401);
    expect(missingAuth.body.error).toBe('AUTH_REQUIRED');

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

  test('agent heartbeat updates status', async () => {
    const { agentId, apiKey } = await registerAgent('Heartbeat Studio');
    const heartbeat = await request(app)
      .post('/api/agents/heartbeat')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ status: 'active', message: 'checking in' });

    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.agentId).toBe(agentId);
    expect(heartbeat.body.status).toBe('active');
    expect(heartbeat.body.isActive).toBe(true);

    const studio = await request(app).get(`/api/studios/${agentId}`);
    expect(studio.status).toBe(200);
    expect(studio.body.heartbeat?.status).toBe('active');
  });

  test('unverified agents are sandbox-limited on draft creation', async () => {
    const { agentId, apiKey } = await registerUnverifiedAgent(
      'Sandbox Draft Studio',
    );
    const sandboxKey = `sandbox:draft:${agentId}:${getUtcDateKey(new Date())}`;
    await redis.del(sandboxKey);

    const first = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/sandbox-v1.png',
        thumbnailUrl: 'https://example.com/sandbox-thumb.png',
      });

    expect(first.status).toBe(200);
    expect(first.body.draft?.isSandbox).toBe(true);

    const second = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/sandbox-v2.png',
        thumbnailUrl: 'https://example.com/sandbox-thumb-2.png',
      });

    expect(second.status).toBe(429);
    expect(second.body?.error).toBe('SANDBOX_LIMIT_EXCEEDED');

    await redis.del(sandboxKey);
  });

  test('draft create validates query and payload boundaries', async () => {
    const { agentId, apiKey } = await registerAgent('Draft Boundary Studio');

    const invalidQuery = await request(app)
      .post('/api/drafts?extra=true')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/draft-boundary-v1.png',
        thumbnailUrl: 'https://example.com/draft-boundary-v1-thumb.png',
      });
    expect(invalidQuery.status).toBe(400);
    expect(invalidQuery.body.error).toBe('DRAFT_CREATE_INVALID_QUERY_FIELDS');

    const invalidFields = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/draft-boundary-v1.png',
        thumbnailUrl: 'https://example.com/draft-boundary-v1-thumb.png',
        extra: true,
      });
    expect(invalidFields.status).toBe(400);
    expect(invalidFields.body.error).toBe('DRAFT_CREATE_INVALID_FIELDS');

    const invalidImageType = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 42,
        thumbnailUrl: 'https://example.com/draft-boundary-v1-thumb.png',
      });
    expect(invalidImageType.status).toBe(400);
    expect(invalidImageType.body.error).toBe('DRAFT_CREATE_INVALID');

    const invalidThumbnailUrl = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/draft-boundary-v1.png',
        thumbnailUrl: 'ftp://example.com/draft-boundary-v1-thumb.png',
      });
    expect(invalidThumbnailUrl.status).toBe(400);
    expect(invalidThumbnailUrl.body.error).toBe('DRAFT_CREATE_INVALID');

    const invalidMetadata = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/draft-boundary-v1.png',
        thumbnailUrl: 'https://example.com/draft-boundary-v1-thumb.png',
        metadata: ['invalid'],
      });
    expect(invalidMetadata.status).toBe(400);
    expect(invalidMetadata.body.error).toBe('DRAFT_CREATE_INVALID');
  });

  test('draft workflow: create -> fix -> PR -> merge', async () => {
    const { agentId, apiKey } = await registerAgent();

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id;

    const fixRes = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        category: 'Focus',
        description: 'Fix this',
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
        thumbnailUrl: 'https://example.com/v2-thumb.png',
      });

    expect(prRes.status).toBe(200);

    const decisionRes = await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        decision: 'merge',
      });

    expect(decisionRes.status).toBe(200);

    const draftGet = await request(app).get(`/api/drafts/${draftId}`);
    expect(draftGet.body.draft.currentVersion).toBeGreaterThan(1);
  }, 30_000);

  test('draft arc endpoint returns summary and 24h recap', async () => {
    const { agentId, apiKey } = await registerAgent('Arc API Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/arc-v1.png',
        thumbnailUrl: 'https://example.com/arc-v1-thumb.png',
      });

    const draftId = draftRes.body.draft.id;

    const fixRes = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        category: 'Focus',
        description: 'Improve hierarchy',
      });
    expect(fixRes.status).toBe(200);

    const prRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Apply hierarchy changes',
        severity: 'minor',
        imageUrl: 'https://example.com/arc-v2.png',
        thumbnailUrl: 'https://example.com/arc-v2-thumb.png',
      });
    expect(prRes.status).toBe(200);

    const arcRes = await request(app).get(`/api/drafts/${draftId}/arc`);
    expect(arcRes.status).toBe(200);
    expect(arcRes.body.summary.draftId).toBe(draftId);
    expect(arcRes.body.summary.state).toBe('ready_for_review');
    expect(arcRes.body.recap24h.fixRequests).toBeGreaterThanOrEqual(1);
    expect(arcRes.body.recap24h.prSubmitted).toBeGreaterThanOrEqual(1);
    expect(typeof arcRes.body.recap24h.hasChanges).toBe('boolean');
  });

  test('draft read endpoints validate query boundaries', async () => {
    const { agentId, apiKey } = await registerAgent('Draft Read Boundary');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/draft-read-v1.png',
        thumbnailUrl: 'https://example.com/draft-read-v1-thumb.png',
      });
    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id as string;

    const invalidDetailQuery = await request(app).get(
      `/api/drafts/${draftId}?extra=true`,
    );
    expect(invalidDetailQuery.status).toBe(400);
    expect(invalidDetailQuery.body.error).toBe(
      'DRAFT_DETAIL_INVALID_QUERY_FIELDS',
    );

    const invalidProvenanceQuery = await request(app).get(
      `/api/drafts/${draftId}/provenance?extra=true`,
    );
    expect(invalidProvenanceQuery.status).toBe(400);
    expect(invalidProvenanceQuery.body.error).toBe(
      'DRAFT_PROVENANCE_INVALID_QUERY_FIELDS',
    );

    const invalidProvenanceExportQuery = await request(app).get(
      `/api/drafts/${draftId}/provenance/export?extra=true`,
    );
    expect(invalidProvenanceExportQuery.status).toBe(400);
    expect(invalidProvenanceExportQuery.body.error).toBe(
      'DRAFT_PROVENANCE_EXPORT_INVALID_QUERY_FIELDS',
    );

    const invalidArcQuery = await request(app).get(
      `/api/drafts/${draftId}/arc?extra=true`,
    );
    expect(invalidArcQuery.status).toBe(400);
    expect(invalidArcQuery.body.error).toBe('DRAFT_ARC_INVALID_QUERY_FIELDS');
  });

  test('observer watchlist and digest lifecycle', async () => {
    const human = await registerHuman('observer-lifecycle@example.com');
    const token = human.tokens.accessToken;
    const { agentId, apiKey } = await registerAgent('Digest Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/digest-v1.png',
        thumbnailUrl: 'https://example.com/digest-v1-thumb.png',
      });
    const draftId = draftRes.body.draft.id;

    const followRes = await request(app)
      .post(`/api/observers/watchlist/${draftId}`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(followRes.status).toBe(201);
    expect(followRes.body.draftId).toBe(draftId);

    const saveRes = await request(app)
      .post(`/api/observers/engagements/${draftId}/save`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.saved).toBe(true);

    const rateRes = await request(app)
      .post(`/api/observers/engagements/${draftId}/rate`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(rateRes.status).toBe(200);
    expect(rateRes.body.rated).toBe(true);

    const engagementListRes = await request(app)
      .get('/api/observers/engagements')
      .set('Authorization', `Bearer ${token}`);
    expect(engagementListRes.status).toBe(200);
    expect(engagementListRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          draftId,
          isSaved: true,
          isRated: true,
        }),
      ]),
    );

    const fixRes = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        category: 'Focus',
        description: 'Digest trigger',
      });
    expect(fixRes.status).toBe(200);

    const digestRes = await request(app)
      .get('/api/observers/digest?unseenOnly=true')
      .set('Authorization', `Bearer ${token}`);
    expect(digestRes.status).toBe(200);
    expect(digestRes.body.length).toBeGreaterThan(0);
    expect(digestRes.body[0].draftId).toBe(draftId);

    const seenRes = await request(app)
      .post(`/api/observers/digest/${digestRes.body[0].id}/seen`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(seenRes.status).toBe(200);
    expect(seenRes.body.isSeen).toBe(true);

    const unseenAfterSeen = await request(app)
      .get('/api/observers/digest?unseenOnly=true')
      .set('Authorization', `Bearer ${token}`);
    expect(unseenAfterSeen.status).toBe(200);
    expect(unseenAfterSeen.body).toHaveLength(0);

    const unfollowRes = await request(app)
      .delete(`/api/observers/watchlist/${draftId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(unfollowRes.status).toBe(200);
    expect(unfollowRes.body.removed).toBe(true);

    const unsaveRes = await request(app)
      .delete(`/api/observers/engagements/${draftId}/save`)
      .set('Authorization', `Bearer ${token}`);
    expect(unsaveRes.status).toBe(200);
    expect(unsaveRes.body.saved).toBe(false);

    const unrateRes = await request(app)
      .delete(`/api/observers/engagements/${draftId}/rate`)
      .set('Authorization', `Bearer ${token}`);
    expect(unrateRes.status).toBe(200);
    expect(unrateRes.body.rated).toBe(false);

    const engagementListAfterResetRes = await request(app)
      .get('/api/observers/engagements')
      .set('Authorization', `Bearer ${token}`);
    expect(engagementListAfterResetRes.status).toBe(200);
    expect(engagementListAfterResetRes.body).toHaveLength(0);
  });

  test('observer digest preferences apply as default digest filters', async () => {
    const human = await registerHuman('observer-preferences@example.com');
    const token = human.tokens.accessToken;
    const { agentId, apiKey } = await registerAgent('Digest Prefs Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/digest-prefs-v1.png',
        thumbnailUrl: 'https://example.com/digest-prefs-v1-thumb.png',
      });
    const draftId = draftRes.body.draft.id as string;

    const followStudioRes = await request(app)
      .post(`/api/studios/${agentId}/follow`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(followStudioRes.status).toBe(201);

    const defaultPrefsRes = await request(app)
      .get('/api/observers/me/preferences')
      .set('Authorization', `Bearer ${token}`);
    expect(defaultPrefsRes.status).toBe(200);
    expect(defaultPrefsRes.body.digest.unseenOnly).toBe(false);
    expect(defaultPrefsRes.body.digest.followingOnly).toBe(false);

    const fixRes = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        category: 'Focus',
        description: 'Trigger digest with preferences',
      });
    expect(fixRes.status).toBe(200);

    const updatePrefsRes = await request(app)
      .put('/api/observers/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        digest: {
          unseenOnly: true,
          followingOnly: true,
        },
      });
    expect(updatePrefsRes.status).toBe(200);
    expect(updatePrefsRes.body.digest.unseenOnly).toBe(true);
    expect(updatePrefsRes.body.digest.followingOnly).toBe(true);

    const digestWithDefaultsRes = await request(app)
      .get('/api/observers/digest')
      .set('Authorization', `Bearer ${token}`);
    expect(digestWithDefaultsRes.status).toBe(200);
    expect(digestWithDefaultsRes.body.length).toBeGreaterThan(0);
    expect(digestWithDefaultsRes.body[0].fromFollowingStudio).toBe(true);
    expect(digestWithDefaultsRes.body[0].isSeen).toBe(false);

    const seenRes = await request(app)
      .post(`/api/observers/digest/${digestWithDefaultsRes.body[0].id}/seen`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(seenRes.status).toBe(200);
    expect(seenRes.body.isSeen).toBe(true);

    const digestAfterSeenRes = await request(app)
      .get('/api/observers/digest')
      .set('Authorization', `Bearer ${token}`);
    expect(digestAfterSeenRes.status).toBe(200);
    expect(digestAfterSeenRes.body).toHaveLength(0);

    const digestWithQueryOverrideRes = await request(app)
      .get('/api/observers/digest?unseenOnly=false')
      .set('Authorization', `Bearer ${token}`);
    expect(digestWithQueryOverrideRes.status).toBe(200);
    expect(digestWithQueryOverrideRes.body.length).toBeGreaterThan(0);
  });

  test('observer digest prioritizes followed studios before other watchlist entries', async () => {
    const human = await registerHuman('observer-digest-priority@example.com');
    const token = human.tokens.accessToken;
    const followedStudio = await registerAgent('Digest Priority Followed');
    const otherStudio = await registerAgent('Digest Priority Other');

    const followedDraftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', followedStudio.agentId)
      .set('x-api-key', followedStudio.apiKey)
      .send({
        imageUrl: 'https://example.com/digest-priority-followed-v1.png',
        thumbnailUrl:
          'https://example.com/digest-priority-followed-v1-thumb.png',
      });
    expect(followedDraftRes.status).toBe(200);
    const followedDraftId = followedDraftRes.body.draft.id as string;

    const otherDraftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', otherStudio.agentId)
      .set('x-api-key', otherStudio.apiKey)
      .send({
        imageUrl: 'https://example.com/digest-priority-other-v1.png',
        thumbnailUrl: 'https://example.com/digest-priority-other-v1-thumb.png',
      });
    expect(otherDraftRes.status).toBe(200);
    const otherDraftId = otherDraftRes.body.draft.id as string;

    const watchlistFollowedRes = await request(app)
      .post(`/api/observers/watchlist/${followedDraftId}`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(watchlistFollowedRes.status).toBe(201);

    const watchlistOtherRes = await request(app)
      .post(`/api/observers/watchlist/${otherDraftId}`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(watchlistOtherRes.status).toBe(201);

    const followStudioRes = await request(app)
      .post(`/api/studios/${followedStudio.agentId}/follow`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(followStudioRes.status).toBe(201);

    const followedFixRes = await request(app)
      .post(`/api/drafts/${followedDraftId}/fix-requests`)
      .set('x-agent-id', followedStudio.agentId)
      .set('x-api-key', followedStudio.apiKey)
      .send({
        category: 'Focus',
        description: 'Followed studio digest signal',
      });
    expect(followedFixRes.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const otherFixRes = await request(app)
      .post(`/api/drafts/${otherDraftId}/fix-requests`)
      .set('x-agent-id', otherStudio.agentId)
      .set('x-api-key', otherStudio.apiKey)
      .send({
        category: 'Focus',
        description: 'Other studio digest signal',
      });
    expect(otherFixRes.status).toBe(200);

    const digestRes = await request(app)
      .get('/api/observers/digest?unseenOnly=true&limit=10')
      .set('Authorization', `Bearer ${token}`);
    expect(digestRes.status).toBe(200);

    const followedIndex = digestRes.body.findIndex(
      (entry: { draftId: string }) => entry.draftId === followedDraftId,
    );
    const otherIndex = digestRes.body.findIndex(
      (entry: { draftId: string }) => entry.draftId === otherDraftId,
    );

    expect(followedIndex).toBeGreaterThanOrEqual(0);
    expect(otherIndex).toBeGreaterThanOrEqual(0);
    expect(followedIndex).toBeLessThan(otherIndex);
    expect(digestRes.body[0].fromFollowingStudio).toBe(true);
  });

  test('studio follow lifecycle returns follower counts and following feed', async () => {
    const human = await registerHuman('studio-follow@example.com');
    const token = human.tokens.accessToken;
    const { agentId, apiKey } = await registerAgent('Follow Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/following-v1.png',
        thumbnailUrl: 'https://example.com/following-v1-thumb.png',
        metadata: { title: 'Following Feed Draft' },
      });
    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id as string;

    const followRes = await request(app)
      .post(`/api/studios/${agentId}/follow`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(followRes.status).toBe(201);
    expect(followRes.body.studioId).toBe(agentId);
    expect(followRes.body.isFollowing).toBe(true);
    expect(followRes.body.followerCount).toBe(1);

    const listFollowingRes = await request(app)
      .get('/api/me/following')
      .set('Authorization', `Bearer ${token}`);
    expect(listFollowingRes.status).toBe(200);
    expect(listFollowingRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: agentId,
          isFollowing: true,
          followerCount: 1,
        }),
      ]),
    );

    const studioProfileRes = await request(app)
      .get(`/api/studios/${agentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(studioProfileRes.status).toBe(200);
    expect(studioProfileRes.body.follower_count).toBe(1);
    expect(studioProfileRes.body.is_following).toBe(true);

    const studiosRes = await request(app)
      .get('/api/feeds/studios?limit=10')
      .set('Authorization', `Bearer ${token}`);
    expect(studiosRes.status).toBe(200);
    expect(studiosRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: agentId,
          followerCount: 1,
          isFollowing: true,
        }),
      ]),
    );

    const followingFeedRes = await request(app)
      .get('/api/feeds/following?limit=10')
      .set('Authorization', `Bearer ${token}`);
    expect(followingFeedRes.status).toBe(200);
    expect(followingFeedRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: draftId,
          type: 'draft',
          authorStudioId: agentId,
        }),
      ]),
    );

    const unfollowRes = await request(app)
      .delete(`/api/studios/${agentId}/follow`)
      .set('Authorization', `Bearer ${token}`);
    expect(unfollowRes.status).toBe(200);
    expect(unfollowRes.body.removed).toBe(true);
    expect(unfollowRes.body.followerCount).toBe(0);

    const followTelemetry = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'studio_follow')::int AS follow_count,
         COUNT(*) FILTER (WHERE event_type = 'studio_unfollow')::int AS unfollow_count
       FROM ux_events
       WHERE user_id = $1`,
      [human.userId],
    );
    expect(followTelemetry.rows[0].follow_count).toBeGreaterThanOrEqual(1);
    expect(followTelemetry.rows[0].unfollow_count).toBeGreaterThanOrEqual(1);

    const followingAfterUnfollow = await request(app)
      .get('/api/me/following')
      .set('Authorization', `Bearer ${token}`);
    expect(followingAfterUnfollow.status).toBe(200);
    expect(followingAfterUnfollow.body).toHaveLength(0);
  });

  test('following feed validates sort/status and filters release items', async () => {
    const human = await registerHuman('following-filters@example.com');
    const token = human.tokens.accessToken;
    const { agentId, apiKey } = await registerAgent('Following Filter Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/following-filter-draft.png',
        thumbnailUrl: 'https://example.com/following-filter-draft-thumb.png',
        metadata: { title: 'Following Filter Draft' },
      });
    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id as string;

    const releaseRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/following-filter-release.png',
        thumbnailUrl: 'https://example.com/following-filter-release-thumb.png',
        metadata: { title: 'Following Filter Release' },
      });
    expect(releaseRes.status).toBe(200);
    const releaseId = releaseRes.body.draft.id as string;

    await db.query(`UPDATE drafts SET status = 'release' WHERE id = $1`, [
      releaseId,
    ]);

    const followRes = await request(app)
      .post(`/api/studios/${agentId}/follow`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(followRes.status).toBe(201);

    const followingReleaseRes = await request(app)
      .get('/api/feeds/following?status=release&sort=impact&limit=20')
      .set('Authorization', `Bearer ${token}`);
    expect(followingReleaseRes.status).toBe(200);
    expect(followingReleaseRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: releaseId,
          type: 'release',
          authorStudioId: agentId,
        }),
      ]),
    );
    expect(followingReleaseRes.body).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: draftId,
        }),
      ]),
    );

    const invalidStatusRes = await request(app)
      .get('/api/feeds/following?status=pr')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidStatusRes.status).toBe(400);
    expect(invalidStatusRes.body.error).toMatch(/Invalid status/i);

    const invalidSortRes = await request(app)
      .get('/api/feeds/following?sort=unknown')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidSortRes.status).toBe(400);
    expect(invalidSortRes.body.error).toMatch(/Invalid sort/i);
  });

  test('observer profile summary returns follow, watchlist, digest, and prediction stats', async () => {
    const human = await registerHuman('observer-profile@example.com');
    const token = human.tokens.accessToken;
    const { agentId, apiKey } = await registerAgent('Profile Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/profile-v1.png',
        thumbnailUrl: 'https://example.com/profile-v1-thumb.png',
        metadata: { title: 'Observer Profile Draft' },
      });
    const draftId = draftRes.body.draft.id as string;

    const followStudioRes = await request(app)
      .post(`/api/studios/${agentId}/follow`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(followStudioRes.status).toBe(201);

    const followDraftRes = await request(app)
      .post(`/api/observers/watchlist/${draftId}`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(followDraftRes.status).toBe(201);

    const prRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Profile PR',
        severity: 'minor',
        imageUrl: 'https://example.com/profile-v2.png',
        thumbnailUrl: 'https://example.com/profile-v2-thumb.png',
      });
    expect(prRes.status).toBe(200);
    const pullRequestId = prRes.body.id as string;

    const predictionRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${token}`)
      .send({ predictedOutcome: 'merge', stakePoints: 20 });
    expect(predictionRes.status).toBe(200);

    const decideRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'merge' });
    expect(decideRes.status).toBe(200);

    const digestRes = await request(app)
      .get('/api/observers/digest?limit=10')
      .set('Authorization', `Bearer ${token}`);
    expect(digestRes.status).toBe(200);
    expect(digestRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          draftId,
          studioId: agentId,
          studioName: 'Profile Studio',
          fromFollowingStudio: true,
        }),
      ]),
    );

    const profileRes = await request(app)
      .get('/api/observers/me/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.observer.id).toBe(human.userId);
    expect(profileRes.body.counts.followingStudios).toBeGreaterThanOrEqual(1);
    expect(profileRes.body.counts.watchlistDrafts).toBeGreaterThanOrEqual(1);
    expect(profileRes.body.counts.digestUnseen).toBeGreaterThanOrEqual(1);
    expect(profileRes.body.predictions.correct).toBeGreaterThanOrEqual(1);
    expect(profileRes.body.predictions.total).toBeGreaterThanOrEqual(1);
    expect(profileRes.body.predictions.rate).toBeGreaterThan(0);
    expect(profileRes.body.predictions.market).toEqual(
      expect.objectContaining({
        trustTier: expect.any(String),
        minStakePoints: 5,
        maxStakePoints: expect.any(Number),
        dailyStakeCapPoints: expect.any(Number),
        dailyStakeUsedPoints: expect.any(Number),
        dailyStakeRemainingPoints: expect.any(Number),
        dailySubmissionCap: expect.any(Number),
        dailySubmissionsUsed: expect.any(Number),
        dailySubmissionsRemaining: expect.any(Number),
      }),
    );
    expect(profileRes.body.predictions.streak).toEqual(
      expect.objectContaining({
        current: 1,
        best: 1,
      }),
    );
    expect(profileRes.body.predictions.recentWindow).toEqual(
      expect.objectContaining({
        size: 10,
        resolved: 1,
        correct: 1,
        rate: 1,
      }),
    );
    expect(profileRes.body.predictions.timeWindows).toEqual(
      expect.objectContaining({
        d7: expect.objectContaining({
          days: 7,
          resolved: expect.any(Number),
          correct: expect.any(Number),
          rate: expect.any(Number),
          netPoints: expect.any(Number),
          riskLevel: expect.stringMatching(
            /^(healthy|watch|critical|unknown)$/,
          ),
        }),
        d30: expect.objectContaining({
          days: 30,
          resolved: expect.any(Number),
          correct: expect.any(Number),
          rate: expect.any(Number),
          netPoints: expect.any(Number),
          riskLevel: expect.stringMatching(
            /^(healthy|watch|critical|unknown)$/,
          ),
        }),
      }),
    );
    expect(profileRes.body.predictions.thresholds).toEqual(
      expect.objectContaining({
        resolutionWindows: expect.objectContaining({
          accuracyRate: expect.objectContaining({
            criticalBelow: 0.45,
            watchBelow: 0.6,
          }),
          minResolvedPredictions: 3,
        }),
      }),
    );
    expect(profileRes.body.predictions.lastResolved).toEqual(
      expect.objectContaining({
        pullRequestId,
        draftId,
        draftTitle: 'Observer Profile Draft',
        predictedOutcome: 'merge',
        resolvedOutcome: 'merge',
        isCorrect: true,
        stakePoints: 20,
        payoutPoints: expect.any(Number),
        netPoints: expect.any(Number),
      }),
    );
    expect(profileRes.body.followingStudios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: agentId,
          studioName: 'Profile Studio',
        }),
      ]),
    );
    expect(profileRes.body.watchlistHighlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          draftId,
          draftTitle: 'Observer Profile Draft',
          studioId: agentId,
          studioName: 'Profile Studio',
        }),
      ]),
    );
    expect(profileRes.body.recentPredictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pullRequestId,
          draftId,
          predictedOutcome: 'merge',
          resolvedOutcome: 'merge',
          isCorrect: true,
          stakePoints: 20,
        }),
      ]),
    );
  });

  test('public observer profile returns sanitized summary without auth', async () => {
    const human = await registerHuman('observer-public-profile@example.com');
    const { agentId, apiKey } = await registerAgent('Public Profile Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/public-profile-v1.png',
        thumbnailUrl: 'https://example.com/public-profile-v1-thumb.png',
        metadata: { title: 'Public Observer Profile Draft' },
      });
    const draftId = draftRes.body.draft.id as string;

    const followStudioRes = await request(app)
      .post(`/api/studios/${agentId}/follow`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send();
    expect(followStudioRes.status).toBe(201);

    const followDraftRes = await request(app)
      .post(`/api/observers/watchlist/${draftId}`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send();
    expect(followDraftRes.status).toBe(201);

    const prRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Public profile PR',
        severity: 'minor',
        imageUrl: 'https://example.com/public-profile-v2.png',
        thumbnailUrl: 'https://example.com/public-profile-v2-thumb.png',
      });
    expect(prRes.status).toBe(200);
    const pullRequestId = prRes.body.id as string;

    const predictionRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({ predictedOutcome: 'merge', stakePoints: 12 });
    expect(predictionRes.status).toBe(200);

    const decideRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'merge' });
    expect(decideRes.status).toBe(200);

    const publicProfileRes = await request(app).get(
      `/api/observers/${human.userId}/profile`,
    );
    expect(publicProfileRes.status).toBe(200);
    expect(publicProfileRes.body.observer.id).toBe(human.userId);
    expect(publicProfileRes.body.observer.email).toBeUndefined();
    expect(publicProfileRes.body.observer.handle).toMatch(/^observer-/);
    expect(publicProfileRes.body.counts.followingStudios).toBeGreaterThan(0);
    expect(publicProfileRes.body.counts.watchlistDrafts).toBeGreaterThan(0);
    expect(publicProfileRes.body.predictions.total).toBeGreaterThan(0);
    expect(publicProfileRes.body.predictions.market).toEqual(
      expect.objectContaining({
        trustTier: expect.any(String),
        minStakePoints: 5,
        maxStakePoints: expect.any(Number),
        dailyStakeCapPoints: expect.any(Number),
      }),
    );
    expect(publicProfileRes.body.predictions.streak).toEqual(
      expect.objectContaining({
        current: 1,
        best: 1,
      }),
    );
    expect(publicProfileRes.body.predictions.recentWindow).toEqual(
      expect.objectContaining({
        size: 10,
        resolved: 1,
        correct: 1,
        rate: 1,
      }),
    );
    expect(publicProfileRes.body.predictions.timeWindows).toEqual(
      expect.objectContaining({
        d7: expect.objectContaining({
          days: 7,
          resolved: expect.any(Number),
          correct: expect.any(Number),
          rate: expect.any(Number),
          netPoints: expect.any(Number),
          riskLevel: expect.stringMatching(
            /^(healthy|watch|critical|unknown)$/,
          ),
        }),
        d30: expect.objectContaining({
          days: 30,
          resolved: expect.any(Number),
          correct: expect.any(Number),
          rate: expect.any(Number),
          netPoints: expect.any(Number),
          riskLevel: expect.stringMatching(
            /^(healthy|watch|critical|unknown)$/,
          ),
        }),
      }),
    );
    expect(publicProfileRes.body.predictions.thresholds).toEqual(
      expect.objectContaining({
        resolutionWindows: expect.objectContaining({
          accuracyRate: expect.objectContaining({
            criticalBelow: 0.45,
            watchBelow: 0.6,
          }),
          minResolvedPredictions: 3,
        }),
      }),
    );
    expect(publicProfileRes.body.predictions.lastResolved).toEqual(
      expect.objectContaining({
        pullRequestId,
        draftId,
        draftTitle: 'Public Observer Profile Draft',
        predictedOutcome: 'merge',
        resolvedOutcome: 'merge',
        isCorrect: true,
        stakePoints: 12,
        payoutPoints: expect.any(Number),
        netPoints: expect.any(Number),
      }),
    );
    expect(publicProfileRes.body.followingStudios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: agentId,
          studioName: 'Public Profile Studio',
        }),
      ]),
    );
    expect(publicProfileRes.body.watchlistHighlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          draftId,
          draftTitle: 'Public Observer Profile Draft',
        }),
      ]),
    );
    expect(publicProfileRes.body.recentPredictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pullRequestId,
          predictedOutcome: 'merge',
          resolvedOutcome: 'merge',
          isCorrect: true,
          stakePoints: 12,
        }),
      ]),
    );
  });

  test('studio follow endpoints validate studio id and auth', async () => {
    const human = await registerHuman('studio-follow-validation@example.com');
    const token = human.tokens.accessToken;

    const missingAuth = await request(app)
      .post('/api/studios/not-a-uuid/follow')
      .send();
    expect(missingAuth.status).toBe(401);
    expect(missingAuth.body.error).toBe('AUTH_REQUIRED');

    const invalidFollow = await request(app)
      .post('/api/studios/not-a-uuid/follow')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(invalidFollow.status).toBe(400);
    expect(invalidFollow.body.error).toBe('STUDIO_ID_INVALID');

    const invalidFollowQuery = await request(app)
      .post(
        '/api/studios/00000000-0000-0000-0000-000000000001/follow?extra=true',
      )
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(invalidFollowQuery.status).toBe(400);
    expect(invalidFollowQuery.body.error).toBe(
      'STUDIO_FOLLOW_INVALID_QUERY_FIELDS',
    );

    const invalidFollowBody = await request(app)
      .post('/api/studios/00000000-0000-0000-0000-000000000001/follow')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'unexpected' });
    expect(invalidFollowBody.status).toBe(400);
    expect(invalidFollowBody.body.error).toBe('STUDIO_FOLLOW_INVALID_FIELDS');

    const invalidUnfollow = await request(app)
      .delete('/api/studios/not-a-uuid/follow')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidUnfollow.status).toBe(400);
    expect(invalidUnfollow.body.error).toBe('STUDIO_ID_INVALID');

    const invalidUnfollowQuery = await request(app)
      .delete(
        '/api/studios/00000000-0000-0000-0000-000000000001/follow?extra=true',
      )
      .set('Authorization', `Bearer ${token}`);
    expect(invalidUnfollowQuery.status).toBe(400);
    expect(invalidUnfollowQuery.body.error).toBe(
      'STUDIO_FOLLOW_INVALID_QUERY_FIELDS',
    );

    const invalidUnfollowBody = await request(app)
      .delete('/api/studios/00000000-0000-0000-0000-000000000001/follow')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'unexpected' });
    expect(invalidUnfollowBody.status).toBe(400);
    expect(invalidUnfollowBody.body.error).toBe('STUDIO_FOLLOW_INVALID_FIELDS');

    const notFoundFollow = await request(app)
      .post('/api/studios/00000000-0000-0000-0000-000000000000/follow')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(notFoundFollow.status).toBe(404);
    expect(notFoundFollow.body.error).toBe('STUDIO_NOT_FOUND');
  });

  test('observer endpoints validate uuid params', async () => {
    const human = await registerHuman('observer-uuid@example.com');
    const token = human.tokens.accessToken;

    const invalidFollow = await request(app)
      .post('/api/observers/watchlist/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(invalidFollow.status).toBe(400);
    expect(invalidFollow.body.error).toBe('DRAFT_ID_INVALID');

    const invalidUnfollow = await request(app)
      .delete('/api/observers/watchlist/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(invalidUnfollow.status).toBe(400);
    expect(invalidUnfollow.body.error).toBe('DRAFT_ID_INVALID');

    const invalidSave = await request(app)
      .post('/api/observers/engagements/not-a-uuid/save')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(invalidSave.status).toBe(400);
    expect(invalidSave.body.error).toBe('DRAFT_ID_INVALID');

    const invalidRate = await request(app)
      .delete('/api/observers/engagements/not-a-uuid/rate')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(invalidRate.status).toBe(400);
    expect(invalidRate.body.error).toBe('DRAFT_ID_INVALID');

    const invalidSeen = await request(app)
      .post('/api/observers/digest/not-a-uuid/seen')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(invalidSeen.status).toBe(400);
    expect(invalidSeen.body.error).toBe('DIGEST_ENTRY_INVALID');

    const invalidPublicProfile = await request(app).get(
      '/api/observers/not-a-uuid/profile',
    );
    expect(invalidPublicProfile.status).toBe(400);
    expect(invalidPublicProfile.body.error).toBe('OBSERVER_ID_INVALID');

    const missingPublicProfile = await request(app).get(
      '/api/observers/00000000-0000-0000-0000-000000000000/profile',
    );
    expect(missingPublicProfile.status).toBe(404);
    expect(missingPublicProfile.body.error).toBe('OBSERVER_NOT_FOUND');
  });

  test('observer read endpoints validate query fields and pagination', async () => {
    const human = await registerHuman('observer-query-validation@example.com');
    const token = human.tokens.accessToken;
    const validObserverId = '00000000-0000-0000-0000-000000000001';

    const invalidMeProfileQueryField = await request(app)
      .get('/api/observers/me/profile?extra=true')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidMeProfileQueryField.status).toBe(400);
    expect(invalidMeProfileQueryField.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidMeProfileLimit = await request(app)
      .get('/api/observers/me/profile?followingLimit=oops')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidMeProfileLimit.status).toBe(400);
    expect(invalidMeProfileLimit.body.error).toBe(
      'OBSERVER_PAGINATION_INVALID',
    );

    const invalidMeProfileLimitFloat = await request(app)
      .get('/api/observers/me/profile?followingLimit=1.5')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidMeProfileLimitFloat.status).toBe(400);
    expect(invalidMeProfileLimitFloat.body.error).toBe(
      'OBSERVER_PAGINATION_INVALID',
    );

    const invalidMeProfileLimitRange = await request(app)
      .get('/api/observers/me/profile?followingLimit=0')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidMeProfileLimitRange.status).toBe(400);
    expect(invalidMeProfileLimitRange.body.error).toBe(
      'OBSERVER_PAGINATION_INVALID',
    );

    const invalidMeProfileLimitMulti = await request(app)
      .get('/api/observers/me/profile?followingLimit=1&followingLimit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidMeProfileLimitMulti.status).toBe(400);
    expect(invalidMeProfileLimitMulti.body.error).toBe(
      'OBSERVER_PAGINATION_INVALID',
    );

    const invalidPublicProfileQueryField = await request(app).get(
      `/api/observers/${validObserverId}/profile?extra=true`,
    );
    expect(invalidPublicProfileQueryField.status).toBe(400);
    expect(invalidPublicProfileQueryField.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidFollowingQueryField = await request(app)
      .get('/api/me/following?extra=true')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidFollowingQueryField.status).toBe(400);
    expect(invalidFollowingQueryField.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidFollowingLimit = await request(app)
      .get('/api/me/following?limit=oops')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidFollowingLimit.status).toBe(400);
    expect(invalidFollowingLimit.body.error).toBe(
      'OBSERVER_PAGINATION_INVALID',
    );

    const invalidFollowingOffset = await request(app)
      .get('/api/me/following?offset=-1')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidFollowingOffset.status).toBe(400);
    expect(invalidFollowingOffset.body.error).toBe(
      'OBSERVER_PAGINATION_INVALID',
    );

    const invalidFollowingLimitMulti = await request(app)
      .get('/api/me/following?limit=1&limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidFollowingLimitMulti.status).toBe(400);
    expect(invalidFollowingLimitMulti.body.error).toBe(
      'OBSERVER_PAGINATION_INVALID',
    );

    const invalidPreferencesQueryField = await request(app)
      .get('/api/observers/me/preferences?extra=true')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidPreferencesQueryField.status).toBe(400);
    expect(invalidPreferencesQueryField.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidWatchlistQueryField = await request(app)
      .get('/api/observers/watchlist?extra=true')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidWatchlistQueryField.status).toBe(400);
    expect(invalidWatchlistQueryField.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidEngagementsQueryField = await request(app)
      .get('/api/observers/engagements?extra=true')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidEngagementsQueryField.status).toBe(400);
    expect(invalidEngagementsQueryField.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidDigestQueryField = await request(app)
      .get('/api/observers/digest?extra=true')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidDigestQueryField.status).toBe(400);
    expect(invalidDigestQueryField.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidDigestLimit = await request(app)
      .get('/api/observers/digest?limit=oops')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidDigestLimit.status).toBe(400);
    expect(invalidDigestLimit.body.error).toBe('OBSERVER_PAGINATION_INVALID');

    const invalidDigestOffset = await request(app)
      .get('/api/observers/digest?offset=-1')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidDigestOffset.status).toBe(400);
    expect(invalidDigestOffset.body.error).toBe('OBSERVER_PAGINATION_INVALID');

    const invalidDigestLimitMulti = await request(app)
      .get('/api/observers/digest?limit=1&limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidDigestLimitMulti.status).toBe(400);
    expect(invalidDigestLimitMulti.body.error).toBe(
      'OBSERVER_PAGINATION_INVALID',
    );

    const invalidDigestBooleanMulti = await request(app)
      .get('/api/observers/digest?unseenOnly=true&unseenOnly=false')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidDigestBooleanMulti.status).toBe(400);
    expect(invalidDigestBooleanMulti.body.error).toBe(
      'OBSERVER_PREFERENCES_INVALID',
    );
  });

  test('observer mutation endpoints validate query and body fields', async () => {
    const human = await registerHuman('observer-mutation-guards@example.com');
    const token = human.tokens.accessToken;
    const validDraftId = '00000000-0000-0000-0000-000000000001';
    const validDigestEntryId = '00000000-0000-0000-0000-000000000002';

    const invalidPreferencesQuery = await request(app)
      .put('/api/observers/me/preferences?extra=true')
      .set('Authorization', `Bearer ${token}`)
      .send({ digest: { unseenOnly: true } });
    expect(invalidPreferencesQuery.status).toBe(400);
    expect(invalidPreferencesQuery.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidPreferencesBody = await request(app)
      .put('/api/observers/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ unknown: true });
    expect(invalidPreferencesBody.status).toBe(400);
    expect(invalidPreferencesBody.body.error).toBe(
      'OBSERVER_PREFERENCES_INVALID',
    );

    const invalidPreferencesDigestBody = await request(app)
      .put('/api/observers/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ digest: { unknown: true } });
    expect(invalidPreferencesDigestBody.status).toBe(400);
    expect(invalidPreferencesDigestBody.body.error).toBe(
      'OBSERVER_PREFERENCES_INVALID',
    );

    const invalidWatchlistMutationQuery = await request(app)
      .post(`/api/observers/watchlist/${validDraftId}?extra=true`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(invalidWatchlistMutationQuery.status).toBe(400);
    expect(invalidWatchlistMutationQuery.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidWatchlistMutationBody = await request(app)
      .post(`/api/observers/watchlist/${validDraftId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'unexpected' });
    expect(invalidWatchlistMutationBody.status).toBe(400);
    expect(invalidWatchlistMutationBody.body.error).toBe(
      'OBSERVER_INVALID_BODY_FIELDS',
    );

    const invalidEngagementMutationQuery = await request(app)
      .post(`/api/observers/engagements/${validDraftId}/save?extra=true`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(invalidEngagementMutationQuery.status).toBe(400);
    expect(invalidEngagementMutationQuery.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidEngagementMutationBody = await request(app)
      .post(`/api/observers/engagements/${validDraftId}/save`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'unexpected' });
    expect(invalidEngagementMutationBody.status).toBe(400);
    expect(invalidEngagementMutationBody.body.error).toBe(
      'OBSERVER_INVALID_BODY_FIELDS',
    );

    const invalidDigestSeenQuery = await request(app)
      .post(`/api/observers/digest/${validDigestEntryId}/seen?extra=true`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(invalidDigestSeenQuery.status).toBe(400);
    expect(invalidDigestSeenQuery.body.error).toBe(
      'OBSERVER_INVALID_QUERY_FIELDS',
    );

    const invalidDigestSeenBody = await request(app)
      .post(`/api/observers/digest/${validDigestEntryId}/seen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'unexpected' });
    expect(invalidDigestSeenBody.status).toBe(400);
    expect(invalidDigestSeenBody.body.error).toBe(
      'OBSERVER_INVALID_BODY_FIELDS',
    );
  });

  test('observer routes propagate service errors for list endpoints', async () => {
    const human = await registerHuman('observer-errors@example.com');
    const token = human.tokens.accessToken;

    const watchlistSpy = jest
      .spyOn(DraftArcServiceImpl.prototype, 'listWatchlist')
      .mockRejectedValueOnce(new Error('watchlist fail'));
    const watchlistRes = await request(app)
      .get('/api/observers/watchlist')
      .set('Authorization', `Bearer ${token}`);
    expect(watchlistRes.status).toBe(500);
    watchlistSpy.mockRestore();

    const digestSpy = jest
      .spyOn(DraftArcServiceImpl.prototype, 'listDigest')
      .mockRejectedValueOnce(new Error('digest fail'));
    const digestRes = await request(app)
      .get('/api/observers/digest?unseenOnly=TRUE&limit=2&offset=1')
      .set('Authorization', `Bearer ${token}`);
    expect(digestRes.status).toBe(500);
    digestSpy.mockRestore();

    const engagementSpy = jest
      .spyOn(DraftArcServiceImpl.prototype, 'listDraftEngagements')
      .mockRejectedValueOnce(new Error('engagement fail'));
    const engagementRes = await request(app)
      .get('/api/observers/engagements')
      .set('Authorization', `Bearer ${token}`);
    expect(engagementRes.status).toBe(500);
    engagementSpy.mockRestore();
  });

  test('observer predict mode lifecycle', async () => {
    const human = await registerHuman('observer-predict@example.com');
    const observerToken = human.tokens.accessToken;
    const { agentId: authorId, apiKey: authorKey } =
      await registerAgent('Predict Author');
    const { agentId: makerId, apiKey: makerKey } =
      await registerAgent('Predict Maker');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        imageUrl: 'https://example.com/predict-v1.png',
        thumbnailUrl: 'https://example.com/predict-v1-thumb.png',
      });
    expect(draftRes.status).toBe(200);

    const draftId = draftRes.body.draft.id;
    const prRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Predictable PR',
        severity: 'minor',
        imageUrl: 'https://example.com/predict-v2.png',
        thumbnailUrl: 'https://example.com/predict-v2-thumb.png',
      });
    expect(prRes.status).toBe(200);
    const pullRequestId = prRes.body.id;

    const draftPredictRes = await request(app)
      .post(`/api/drafts/${draftId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({ predictedOutcome: 'merge', stakePoints: 25 });
    expect(draftPredictRes.status).toBe(200);
    expect(draftPredictRes.body.pullRequestId).toBe(pullRequestId);
    expect(draftPredictRes.body.predictedOutcome).toBe('merge');
    expect(draftPredictRes.body.stakePoints).toBe(25);
    expect(draftPredictRes.body.draftId).toBe(draftId);

    const predictRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({ predictedOutcome: 'merge', stakePoints: 30 });
    expect(predictRes.status).toBe(200);
    expect(predictRes.body.pullRequestId).toBe(pullRequestId);
    expect(predictRes.body.predictedOutcome).toBe('merge');
    expect(predictRes.body.stakePoints).toBe(30);

    const preDecision = await request(app)
      .get(`/api/pull-requests/${pullRequestId}/predictions`)
      .set('Authorization', `Bearer ${observerToken}`);
    expect(preDecision.status).toBe(200);
    expect(preDecision.body.pullRequestStatus).toBe('pending');
    expect(preDecision.body.consensus.total).toBeGreaterThanOrEqual(1);
    expect(preDecision.body.market.totalStakePoints).toBeGreaterThanOrEqual(30);
    expect(preDecision.body.observerPrediction.predictedOutcome).toBe('merge');
    expect(preDecision.body.observerPrediction.stakePoints).toBe(30);
    expect(preDecision.body.observerPrediction.resolvedOutcome).toBeNull();

    const decideRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/decide`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({ decision: 'reject', rejectionReason: 'Not aligned with brief' });
    expect(decideRes.status).toBe(200);
    expect(decideRes.body.status).toBe('rejected');

    const postDecision = await request(app)
      .get(`/api/pull-requests/${pullRequestId}/predictions`)
      .set('Authorization', `Bearer ${observerToken}`);
    expect(postDecision.status).toBe(200);
    expect(postDecision.body.pullRequestStatus).toBe('rejected');
    expect(postDecision.body.observerPrediction.predictedOutcome).toBe('merge');
    expect(postDecision.body.observerPrediction.resolvedOutcome).toBe('reject');
    expect(postDecision.body.observerPrediction.isCorrect).toBe(false);
    expect(postDecision.body.observerPrediction.payoutPoints).toBe(0);
    expect(postDecision.body.accuracy.total).toBeGreaterThanOrEqual(1);

    const predictionTelemetry = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'pr_prediction_submit')::int AS submit_count,
         COUNT(*) FILTER (WHERE event_type = 'pr_prediction_result_view')::int AS result_view_count,
         COUNT(*) FILTER (WHERE event_type = 'pr_prediction_settle')::int AS settle_count
       FROM ux_events
       WHERE user_id = $1`,
      [human.userId],
    );
    expect(predictionTelemetry.rows[0].submit_count).toBeGreaterThanOrEqual(2);
    expect(
      predictionTelemetry.rows[0].result_view_count,
    ).toBeGreaterThanOrEqual(2);
    expect(predictionTelemetry.rows[0].settle_count).toBeGreaterThanOrEqual(1);

    const settlementEvent = await db.query(
      `SELECT status, metadata
       FROM ux_events
       WHERE event_type = 'pr_prediction_settle'
         AND user_id = $1
         AND pr_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [human.userId, pullRequestId],
    );
    expect(settlementEvent.rows).toHaveLength(1);
    expect(settlementEvent.rows[0].status).toBe('reject');
    expect((settlementEvent.rows[0].metadata as any).predictedOutcome).toBe(
      'merge',
    );
    expect((settlementEvent.rows[0].metadata as any).resolvedOutcome).toBe(
      'reject',
    );
    expect((settlementEvent.rows[0].metadata as any).isCorrect).toBe(false);
  });

  test('draft prediction endpoint validates pending pull request state', async () => {
    const human = await registerHuman('observer-draft-predict@example.com');
    const observerToken = human.tokens.accessToken;
    const { agentId: authorId, apiKey: authorKey } = await registerAgent(
      'Predict Pending Author',
    );

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        imageUrl: 'https://example.com/predict-pending-v1.png',
        thumbnailUrl: 'https://example.com/predict-pending-v1-thumb.png',
      });
    expect(draftRes.status).toBe(200);

    const draftId = draftRes.body.draft.id;
    const noPendingRes = await request(app)
      .post(`/api/drafts/${draftId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({ predictedOutcome: 'merge', stakePoints: 25 });
    expect(noPendingRes.status).toBe(409);
    expect(noPendingRes.body.error).toBe('PREDICTION_NO_PENDING_PR');
  });

  test('prediction endpoints reject unsupported fields and conflicting aliases', async () => {
    const human = await registerHuman('observer-predict-payload@example.com');
    const observerToken = human.tokens.accessToken;
    const { agentId: authorId, apiKey: authorKey } = await registerAgent(
      'Predict Payload Author',
    );
    const { agentId: makerId, apiKey: makerKey } = await registerAgent(
      'Predict Payload Maker',
    );

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        imageUrl: 'https://example.com/predict-payload-v1.png',
        thumbnailUrl: 'https://example.com/predict-payload-v1-thumb.png',
      });
    expect(draftRes.status).toBe(200);

    const draftId = draftRes.body.draft.id;
    const pullRequestRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Payload validation PR',
        severity: 'minor',
        imageUrl: 'https://example.com/predict-payload-v2.png',
        thumbnailUrl: 'https://example.com/predict-payload-v2-thumb.png',
      });
    expect(pullRequestRes.status).toBe(200);
    const pullRequestId = pullRequestRes.body.id as string;

    const invalidDraftStakeRes = await request(app)
      .post(`/api/drafts/${draftId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        predictedOutcome: 'merge',
        stakePoints: 2,
      });
    expect(invalidDraftStakeRes.status).toBe(400);
    expect(invalidDraftStakeRes.body.error).toBe('PREDICTION_STAKE_INVALID');

    const invalidDraftPayloadRes = await request(app)
      .post(`/api/drafts/${draftId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        predictedOutcome: 'merge',
        stakePoints: 25,
        unsupported: true,
      });
    expect(invalidDraftPayloadRes.status).toBe(400);
    expect(invalidDraftPayloadRes.body.error).toBe('PREDICTION_INVALID_FIELDS');

    const invalidDraftShapeRes = await request(app)
      .post(`/api/drafts/${draftId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send([]);
    expect(invalidDraftShapeRes.status).toBe(400);
    expect(invalidDraftShapeRes.body.error).toBe('PREDICTION_INVALID_FIELDS');

    const invalidPrPayloadRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        predictedOutcome: 'merge',
        stakePoints: 25,
        extra: 'noise',
      });
    expect(invalidPrPayloadRes.status).toBe(400);
    expect(invalidPrPayloadRes.body.error).toBe('PREDICTION_INVALID_FIELDS');

    const conflictingOutcomeRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        predictedOutcome: 'merge',
        outcome: 'reject',
        stakePoints: 25,
      });
    expect(conflictingOutcomeRes.status).toBe(400);
    expect(conflictingOutcomeRes.body.error).toBe(
      'PREDICTION_PAYLOAD_CONFLICT',
    );

    const conflictingStakeRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        predictedOutcome: 'merge',
        stakePoints: 25,
        points: 30,
      });
    expect(conflictingStakeRes.status).toBe(400);
    expect(conflictingStakeRes.body.error).toBe('PREDICTION_PAYLOAD_CONFLICT');

    const missingOutcomeRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        stakePoints: 25,
      });
    expect(missingOutcomeRes.status).toBe(400);
    expect(missingOutcomeRes.body.error).toBe('PREDICTION_INVALID');

    const invalidStakeTypeRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        predictedOutcome: 'merge',
        stakePoints: '25',
      });
    expect(invalidStakeTypeRes.status).toBe(400);
    expect(invalidStakeTypeRes.body.error).toBe('PREDICTION_STAKE_INVALID');

    const invalidStakeFractionRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        predictedOutcome: 'merge',
        points: 25.5,
      });
    expect(invalidStakeFractionRes.status).toBe(400);
    expect(invalidStakeFractionRes.body.error).toBe('PREDICTION_STAKE_INVALID');

    const invalidStakeLowRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        predictedOutcome: 'merge',
        stakePoints: 4,
      });
    expect(invalidStakeLowRes.status).toBe(400);
    expect(invalidStakeLowRes.body.error).toBe('PREDICTION_STAKE_INVALID');

    const invalidStakeHighRes = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        predictedOutcome: 'merge',
        stakePoints: 501,
      });
    expect(invalidStakeHighRes.status).toBe(400);
    expect(invalidStakeHighRes.body.error).toBe('PREDICTION_STAKE_INVALID');
  });

  test('multimodal glowup endpoint rejects unsupported fields and invalid provider', async () => {
    const { agentId, apiKey } = await registerAgent('Multimodal Validation');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/multimodal-validation-v1.png',
        thumbnailUrl: 'https://example.com/multimodal-validation-v1-thumb.png',
      });
    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id as string;

    const invalidFieldsRes = await request(app)
      .post(`/api/drafts/${draftId}/glowup/multimodal`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        provider: 'gpt-4.1',
        visualScore: 50,
        unknown: 'noise',
      });
    expect(invalidFieldsRes.status).toBe(400);
    expect(invalidFieldsRes.body.error).toBe(
      'MULTIMODAL_GLOWUP_INVALID_FIELDS',
    );

    const invalidProviderRes = await request(app)
      .post(`/api/drafts/${draftId}/glowup/multimodal`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        provider: 'bad provider!',
        visualScore: 50,
      });
    expect(invalidProviderRes.status).toBe(400);
    expect(invalidProviderRes.body.error).toBe(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
    );

    const invalidWriteQueryRes = await request(app)
      .post(`/api/drafts/${draftId}/glowup/multimodal?extra=true`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        provider: 'gemini-2',
        visualScore: 50,
      });
    expect(invalidWriteQueryRes.status).toBe(400);
    expect(invalidWriteQueryRes.body.error).toBe(
      'MULTIMODAL_GLOWUP_INVALID_QUERY_FIELDS',
    );

    const invalidScoreTypeRes = await request(app)
      .post(`/api/drafts/${draftId}/glowup/multimodal`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        provider: 'gemini-2',
        visualScore: '50',
      });
    expect(invalidScoreTypeRes.status).toBe(400);
    expect(invalidScoreTypeRes.body.error).toBe(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
    );

    const invalidScoreRangeRes = await request(app)
      .post(`/api/drafts/${draftId}/glowup/multimodal`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        provider: 'gemini-2',
        visualScore: 120,
      });
    expect(invalidScoreRangeRes.status).toBe(400);
    expect(invalidScoreRangeRes.body.error).toBe(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
    );

    const missingModalitiesRes = await request(app)
      .post(`/api/drafts/${draftId}/glowup/multimodal`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        provider: 'gemini-2',
      });
    expect(missingModalitiesRes.status).toBe(400);
    expect(missingModalitiesRes.body.error).toBe(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
    );

    const validRes = await request(app)
      .post(`/api/drafts/${draftId}/glowup/multimodal`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        provider: 'GEMINI-2',
        visualScore: 62,
        narrativeScore: 57,
      });
    expect(validRes.status).toBe(200);
    expect(validRes.body.provider).toBe('gemini-2');
  });

  test('multimodal glowup read endpoint validates query fields and records invalid-query telemetry', async () => {
    const { agentId, apiKey } = await registerAgent('Multimodal Query Guard');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/multimodal-query-v1.png',
        thumbnailUrl: 'https://example.com/multimodal-query-v1-thumb.png',
      });
    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id as string;

    const seedScoreRes = await request(app)
      .post(`/api/drafts/${draftId}/glowup/multimodal`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        provider: 'gpt-4.1',
        visualScore: 63,
        narrativeScore: 58,
      });
    expect(seedScoreRes.status).toBe(200);

    const invalidProviderRes = await request(app).get(
      `/api/drafts/${draftId}/glowup/multimodal?provider=bad%20provider`,
    );
    expect(invalidProviderRes.status).toBe(400);
    expect(invalidProviderRes.body.error).toBe(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
    );

    const invalidQueryFieldRes = await request(app).get(
      `/api/drafts/${draftId}/glowup/multimodal?provider=gpt-4.1&extra=1`,
    );
    expect(invalidQueryFieldRes.status).toBe(400);
    expect(invalidQueryFieldRes.body.error).toBe(
      'MULTIMODAL_GLOWUP_INVALID_QUERY_FIELDS',
    );

    const validReadRes = await request(app).get(
      `/api/drafts/${draftId}/glowup/multimodal?provider=gpt-4.1`,
    );
    expect(validReadRes.status).toBe(200);
    expect(validReadRes.body.provider).toBe('gpt-4.1');

    const invalidTelemetry = await db.query(
      `SELECT metadata
       FROM ux_events
       WHERE event_type = 'draft_multimodal_glowup_error'
         AND user_type = 'system'
         AND draft_id = $1
         AND metadata->>'reason' = 'invalid_query'
       ORDER BY created_at DESC`,
      [draftId],
    );
    expect(invalidTelemetry.rows.length).toBeGreaterThanOrEqual(2);
    expect((invalidTelemetry.rows[0].metadata as any).errorCode).toMatch(
      /MULTIMODAL_GLOWUP_INVALID_(INPUT|QUERY_FIELDS)/,
    );
  });

  test('budget enforcement for fix requests', async () => {
    const { agentId, apiKey } = await registerAgent();

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    const draftId = draftRes.body.draft.id;

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post(`/api/drafts/${draftId}/fix-requests`)
        .set('x-agent-id', agentId)
        .set('x-api-key', apiKey)
        .send({
          category: 'Focus',
          description: `Fix ${i}`,
        });
      expect(res.status).toBe(200);
    }

    const blocked = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        category: 'Focus',
        description: 'Too many',
      });

    expect(blocked.status).toBe(429);
  });

  test('data export and deletion flows', async () => {
    const register = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'export@example.com',
        password: 'password123',
        consent: { termsAccepted: true, privacyAccepted: true },
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

    const invalidExportId = await request(app)
      .get('/api/account/exports/not-a-uuid')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidExportId.status).toBe(400);
    expect(invalidExportId.body.error).toBe('EXPORT_ID_INVALID');

    await db.query(
      "INSERT INTO deletion_requests (user_id, status) VALUES ($1, 'pending')",
      [human.userId],
    );

    const pendingDelete = await request(app)
      .post('/api/account/delete')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(pendingDelete.status).toBe(400);
    expect(pendingDelete.body.error).toBe('DELETION_PENDING');
  });

  test('draft listing and release authorization', async () => {
    const { agentId, apiKey } = await registerAgent('Release Owner');
    const { agentId: otherAgentId, apiKey: otherApiKey } =
      await registerAgent('Release Intruder');

    const draftOne = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    const draftTwo = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v2.png',
        thumbnailUrl: 'https://example.com/v2-thumb.png',
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

    const invalidReleaseQuery = await request(app)
      .post(`/api/drafts/${draftTwo.body.draft.id}/release?extra=true`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(invalidReleaseQuery.status).toBe(400);
    expect(invalidReleaseQuery.body.error).toBe(
      'DRAFT_RELEASE_INVALID_QUERY_FIELDS',
    );

    const invalidReleaseId = await request(app)
      .post('/api/drafts/not-a-uuid/release')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(invalidReleaseId.status).toBe(400);
    expect(invalidReleaseId.body.error).toBe('DRAFT_ID_INVALID');

    const invalidReleaseBody = await request(app)
      .post(`/api/drafts/${draftTwo.body.draft.id}/release`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ reason: 'force release' });
    expect(invalidReleaseBody.status).toBe(400);
    expect(invalidReleaseBody.body.error).toBe('DRAFT_RELEASE_INVALID_FIELDS');

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

    const invalidQueryField = await request(app).get('/api/drafts?extra=true');
    expect(invalidQueryField.status).toBe(400);
    expect(invalidQueryField.body.error).toBe(
      'DRAFT_LIST_INVALID_QUERY_FIELDS',
    );

    const invalidStatus = await request(app).get('/api/drafts?status=invalid');
    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.error).toBe('DRAFT_LIST_INVALID_STATUS');

    const invalidLimit = await request(app).get('/api/drafts?limit=oops');
    expect(invalidLimit.status).toBe(400);
    expect(invalidLimit.body.error).toBe('DRAFT_LIST_PAGINATION_INVALID');

    const invalidAuthorId = await request(app).get('/api/drafts?authorId=oops');
    expect(invalidAuthorId.status).toBe(400);
    expect(invalidAuthorId.body.error).toBe('DRAFT_LIST_AUTHOR_ID_INVALID');

    const invalidOffset = await request(app).get('/api/drafts?offset=-1');
    expect(invalidOffset.status).toBe(400);
    expect(invalidOffset.body.error).toBe('DRAFT_LIST_PAGINATION_INVALID');

    const invalidFloatLimit = await request(app).get('/api/drafts?limit=1.5');
    expect(invalidFloatLimit.status).toBe(400);
    expect(invalidFloatLimit.body.error).toBe('DRAFT_LIST_PAGINATION_INVALID');

    expect(draftTwo.status).toBe(200);
  });

  test('pull request decisions, listings, and fork flow', async () => {
    const { agentId: authorId, apiKey: authorKey } =
      await registerAgent('Author Studio');
    const { agentId: makerId, apiKey: makerKey } =
      await registerAgent('Maker Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    const draftId = draftRes.body.draft.id;

    const invalidFixCreateId = await request(app)
      .post('/api/drafts/not-a-uuid/fix-requests')
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        category: 'Focus',
        description: 'Fix details',
      });
    expect(invalidFixCreateId.status).toBe(400);
    expect(invalidFixCreateId.body.error).toBe('DRAFT_ID_INVALID');

    const fixRes = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        category: 'Focus',
        description: 'Fix details',
      });
    expect(fixRes.status).toBe(200);

    const invalidFixCreateQuery = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests?extra=true`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        category: 'Focus',
        description: 'Fix details',
      });
    expect(invalidFixCreateQuery.status).toBe(400);
    expect(invalidFixCreateQuery.body.error).toBe(
      'FIX_REQUEST_CREATE_INVALID_QUERY_FIELDS',
    );

    const invalidFixCreateFields = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        category: 'Focus',
        description: 'Fix details',
        extra: true,
      });
    expect(invalidFixCreateFields.status).toBe(400);
    expect(invalidFixCreateFields.body.error).toBe(
      'FIX_REQUEST_CREATE_INVALID_FIELDS',
    );

    const invalidFixCreatePayload = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        category: 'Unknown',
        description: 123,
      });
    expect(invalidFixCreatePayload.status).toBe(400);
    expect(invalidFixCreatePayload.body.error).toBe(
      'FIX_REQUEST_CREATE_INVALID',
    );

    const invalidFixCoordinates = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        category: 'Focus',
        description: 'Fix details',
        coordinates: ['x', 'y'],
      });
    expect(invalidFixCoordinates.status).toBe(400);
    expect(invalidFixCoordinates.body.error).toBe('FIX_REQUEST_CREATE_INVALID');

    const fixList = await request(app).get(
      `/api/drafts/${draftId}/fix-requests`,
    );
    expect(fixList.status).toBe(200);
    expect(fixList.body.length).toBe(1);

    const invalidFixListQuery = await request(app).get(
      `/api/drafts/${draftId}/fix-requests?extra=true`,
    );
    expect(invalidFixListQuery.status).toBe(400);
    expect(invalidFixListQuery.body.error).toBe(
      'FIX_REQUEST_LIST_INVALID_QUERY_FIELDS',
    );

    const prOne = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Initial changes',
        severity: 'minor',
        imageUrl: 'https://example.com/pr1.png',
        thumbnailUrl: 'https://example.com/pr1-thumb.png',
      });
    expect(prOne.status).toBe(200);

    const invalidPrCreateId = await request(app)
      .post('/api/drafts/not-a-uuid/pull-requests')
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Invalid PR',
        severity: 'minor',
        imageUrl: 'https://example.com/pr-invalid.png',
        thumbnailUrl: 'https://example.com/pr-invalid-thumb.png',
      });
    expect(invalidPrCreateId.status).toBe(400);
    expect(invalidPrCreateId.body.error).toBe('DRAFT_ID_INVALID');

    const invalidPrCreateQuery = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests?extra=true`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Query PR',
        severity: 'minor',
        imageUrl: 'https://example.com/pr-query.png',
        thumbnailUrl: 'https://example.com/pr-query-thumb.png',
      });
    expect(invalidPrCreateQuery.status).toBe(400);
    expect(invalidPrCreateQuery.body.error).toBe(
      'PULL_REQUEST_CREATE_INVALID_QUERY_FIELDS',
    );

    const invalidPrCreateFields = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Invalid fields',
        severity: 'minor',
        imageUrl: 'https://example.com/pr-fields.png',
        thumbnailUrl: 'https://example.com/pr-fields-thumb.png',
        extra: true,
      });
    expect(invalidPrCreateFields.status).toBe(400);
    expect(invalidPrCreateFields.body.error).toBe(
      'PULL_REQUEST_CREATE_INVALID_FIELDS',
    );

    const invalidPrCreatePayload = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 123,
        severity: 'critical',
        imageUrl: 'invalid-url',
        thumbnailUrl: 'https://example.com/pr-invalid-thumb.png',
      });
    expect(invalidPrCreatePayload.status).toBe(400);
    expect(invalidPrCreatePayload.body.error).toBe(
      'PULL_REQUEST_CREATE_INVALID',
    );

    const invalidAddressedFixRequests = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Invalid addressed fix requests',
        severity: 'minor',
        addressedFixRequests: ['not-a-uuid'],
        imageUrl: 'https://example.com/pr-addressed.png',
        thumbnailUrl: 'https://example.com/pr-addressed-thumb.png',
      });
    expect(invalidAddressedFixRequests.status).toBe(400);
    expect(invalidAddressedFixRequests.body.error).toBe(
      'PULL_REQUEST_CREATE_INVALID',
    );

    const requestChanges = await request(app)
      .post(`/api/pull-requests/${prOne.body.id}/decide`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        decision: 'request_changes',
        feedback: 'Need more work',
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
        thumbnailUrl: 'https://example.com/pr2-thumb.png',
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
        thumbnailUrl: 'https://example.com/pr3-thumb.png',
      });
    expect(prThree.status).toBe(200);

    const reject = await request(app)
      .post(`/api/pull-requests/${prTwo.body.id}/decide`)
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        decision: 'reject',
        rejectionReason: 'Not aligned',
      });
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('rejected');

    const listPrs = await request(app).get(
      `/api/drafts/${draftId}/pull-requests`,
    );
    expect(listPrs.status).toBe(200);
    expect(listPrs.body.length).toBe(3);

    const invalidPrListQuery = await request(app).get(
      `/api/drafts/${draftId}/pull-requests?extra=true`,
    );
    expect(invalidPrListQuery.status).toBe(400);
    expect(invalidPrListQuery.body.error).toBe(
      'PULL_REQUEST_LIST_INVALID_QUERY_FIELDS',
    );

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
        metadata: { title: 'Coffee App' },
      });

    const draftTwo = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v2.png',
        thumbnailUrl: 'https://example.com/v2-thumb.png',
        metadata: { title: 'Battle App' },
      });

    const draftOneId = draftOne.body.draft.id;
    const draftTwoId = draftTwo.body.draft.id;

    await db.query(
      'INSERT INTO viewing_history (user_id, draft_id) VALUES ($1, $2)',
      [human.userId, draftTwoId],
    );

    await request(app)
      .post(`/api/drafts/${draftOneId}/release`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();

    await db.query(
      `INSERT INTO autopsy_reports (share_slug, summary, data, published_at)
       VALUES ($1, $2, $3, NOW())`,
      ['auto-1', 'Autopsy summary', {}],
    );

    await request(app)
      .post(`/api/drafts/${draftTwoId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'First PR',
        severity: 'minor',
        imageUrl: 'https://example.com/v2-pr1.png',
        thumbnailUrl: 'https://example.com/v2-pr1-thumb.png',
      });

    await request(app)
      .post(`/api/drafts/${draftTwoId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Second PR',
        severity: 'minor',
        imageUrl: 'https://example.com/v2-pr2.png',
        thumbnailUrl: 'https://example.com/v2-pr2-thumb.png',
      });

    await request(app)
      .post(`/api/drafts/${draftTwoId}/fix-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        category: 'Focus',
        description: 'Increase hero contrast',
      });

    const forYou = await request(app)
      .get('/api/feeds/for-you?limit=5')
      .set('Authorization', `Bearer ${token}`);
    expect(forYou.status).toBe(200);
    expect(Array.isArray(forYou.body)).toBe(true);

    const live = await request(app).get('/api/feeds/live-drafts?limit=5');
    expect(live.status).toBe(200);
    expect(Array.isArray(live.body)).toBe(true);

    const hotNow = await request(app).get('/api/feeds/hot-now?limit=5');
    expect(hotNow.status).toBe(200);
    expect(Array.isArray(hotNow.body)).toBe(true);
    if (hotNow.body.length > 0) {
      expect(hotNow.body[0]).toHaveProperty('reasonLabel');
      expect(hotNow.body[0]).toHaveProperty('hotScore');
    }

    const glowups = await request(app).get('/api/feeds/glowups?limit=5');
    expect(glowups.status).toBe(200);
    expect(Array.isArray(glowups.body)).toBe(true);

    const studios = await request(app).get('/api/feeds/studios?limit=5');
    expect(studios.status).toBe(200);
    expect(Array.isArray(studios.body)).toBe(true);

    const battles = await request(app).get('/api/feeds/battles?limit=5');
    expect(battles.status).toBe(200);
    expect(Array.isArray(battles.body)).toBe(true);
    if (battles.body.length > 0) {
      expect(battles.body[0]).toHaveProperty('provenance');
      expect(battles.body[0].provenance).toHaveProperty('authenticityStatus');
      expect(battles.body[0].provenance).toHaveProperty('humanSparkScore');
    }

    const changes = await request(app).get('/api/feeds/changes?limit=5');
    expect(changes.status).toBe(200);
    expect(Array.isArray(changes.body)).toBe(true);
    if (changes.body.length > 0) {
      expect(changes.body[0]).toHaveProperty('provenance');
      expect(changes.body[0].provenance).toHaveProperty('authenticityStatus');
      expect(changes.body[0].provenance).toHaveProperty('humanSparkScore');
    }

    const archive = await request(app).get('/api/feeds/archive?limit=5');
    expect(archive.status).toBe(200);
    expect(Array.isArray(archive.body)).toBe(true);

    const unified = await request(app).get('/api/feed?limit=5&sort=recent');
    expect(unified.status).toBe(200);
    expect(Array.isArray(unified.body)).toBe(true);
  });

  test('progress feed returns before/after entries', async () => {
    const { agentId, apiKey } = await registerAgent('Progress Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Progress update',
        severity: 'minor',
        imageUrl: 'https://example.com/v2.png',
        thumbnailUrl: 'https://example.com/v2-thumb.png',
      });

    const progress = await request(app).get('/api/feeds/progress?limit=5');
    expect(progress.status).toBe(200);
    expect(progress.body.length).toBeGreaterThan(0);
    expect(progress.body[0]).toHaveProperty('beforeImageUrl');
    expect(progress.body[0]).toHaveProperty('afterImageUrl');
  });

  test('pull request review endpoint returns context', async () => {
    const { agentId, apiKey } = await registerAgent('Review Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/review-v1.png',
        thumbnailUrl: 'https://example.com/review-v1-thumb.png',
      });

    const prRes = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Review PR',
        severity: 'minor',
        imageUrl: 'https://example.com/review-v2.png',
        thumbnailUrl: 'https://example.com/review-v2-thumb.png',
      });

    const review = await request(app).get(
      `/api/pull-requests/${prRes.body.id}`,
    );
    expect(review.status).toBe(200);
    expect(review.body.pullRequest).toBeTruthy();
    expect(review.body.draft).toBeTruthy();
    expect(review.body.beforeImageUrl).toBeTruthy();
    expect(review.body.afterImageUrl).toBeTruthy();
    expect(review.body.metrics).toBeTruthy();
  });

  test('pull request decisions handle merge and reject', async () => {
    const { agentId, apiKey } = await registerAgent('Decision Studio');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/decision-v1.png',
        thumbnailUrl: 'https://example.com/decision-v1-thumb.png',
      });

    const prMerge = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Merge PR',
        severity: 'minor',
        imageUrl: 'https://example.com/decision-v2.png',
        thumbnailUrl: 'https://example.com/decision-v2-thumb.png',
      });

    const mergeRes = await request(app)
      .post(`/api/pull-requests/${prMerge.body.id}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'merge' });
    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.status).toBe('merged');

    const prReject = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Reject PR',
        severity: 'minor',
        imageUrl: 'https://example.com/decision-v3.png',
        thumbnailUrl: 'https://example.com/decision-v3-thumb.png',
      });

    const rejectRes = await request(app)
      .post(`/api/pull-requests/${prReject.body.id}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'reject', rejectionReason: 'Not aligned' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('rejected');
  });

  test('pull request routes validate ids and decision boundary payloads', async () => {
    const { agentId, apiKey } = await registerAgent('PR Boundary Studio');
    const human = await registerHuman('pr-boundary-observer@example.com');

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/pr-boundary-v1.png',
        thumbnailUrl: 'https://example.com/pr-boundary-v1-thumb.png',
      });

    const prRes = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Boundary PR',
        severity: 'minor',
        imageUrl: 'https://example.com/pr-boundary-v2.png',
        thumbnailUrl: 'https://example.com/pr-boundary-v2-thumb.png',
      });
    expect(prRes.status).toBe(200);

    const invalidReviewId = await request(app).get(
      '/api/pull-requests/not-a-uuid',
    );
    expect(invalidReviewId.status).toBe(400);
    expect(invalidReviewId.body.error).toBe('PR_ID_INVALID');

    const invalidReviewQuery = await request(app).get(
      `/api/pull-requests/${prRes.body.id}?extra=true`,
    );
    expect(invalidReviewQuery.status).toBe(400);
    expect(invalidReviewQuery.body.error).toBe(
      'PR_REVIEW_INVALID_QUERY_FIELDS',
    );

    const invalidDraftPredictQuery = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/predict?extra=true`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({ predictedOutcome: 'merge', stakePoints: 10 });
    expect(invalidDraftPredictQuery.status).toBe(400);
    expect(invalidDraftPredictQuery.body.error).toBe(
      'PREDICTION_INVALID_QUERY_FIELDS',
    );

    const invalidPrPredictQuery = await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/predict?extra=true`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({ predictedOutcome: 'merge', stakePoints: 10 });
    expect(invalidPrPredictQuery.status).toBe(400);
    expect(invalidPrPredictQuery.body.error).toBe(
      'PREDICTION_INVALID_QUERY_FIELDS',
    );

    const invalidPredictionSummaryId = await request(app)
      .get('/api/pull-requests/not-a-uuid/predictions')
      .set('Authorization', `Bearer ${human.tokens.accessToken}`);
    expect(invalidPredictionSummaryId.status).toBe(400);
    expect(invalidPredictionSummaryId.body.error).toBe('PR_ID_INVALID');

    const invalidPredictionSummaryQuery = await request(app)
      .get(`/api/pull-requests/${prRes.body.id}/predictions?extra=true`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`);
    expect(invalidPredictionSummaryQuery.status).toBe(400);
    expect(invalidPredictionSummaryQuery.body.error).toBe(
      'PREDICTION_INVALID_QUERY_FIELDS',
    );

    const invalidDecideId = await request(app)
      .post('/api/pull-requests/not-a-uuid/decide')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'merge' });
    expect(invalidDecideId.status).toBe(400);
    expect(invalidDecideId.body.error).toBe('PR_ID_INVALID');

    const invalidDecideUnknownField = await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'merge', extra: true });
    expect(invalidDecideUnknownField.status).toBe(400);
    expect(invalidDecideUnknownField.body.error).toBe(
      'PR_DECISION_INVALID_FIELDS',
    );

    const invalidDecideQuery = await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/decide?extra=true`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'merge' });
    expect(invalidDecideQuery.status).toBe(400);
    expect(invalidDecideQuery.body.error).toBe(
      'PR_DECISION_INVALID_QUERY_FIELDS',
    );

    const invalidDecideDecision = await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'approve' });
    expect(invalidDecideDecision.status).toBe(400);
    expect(invalidDecideDecision.body.error).toBe('PR_DECISION_INVALID');

    const invalidDecideFeedback = await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'merge', feedback: 42 });
    expect(invalidDecideFeedback.status).toBe(400);
    expect(invalidDecideFeedback.body.error).toBe('PR_DECISION_INVALID');

    const invalidForkId = await request(app)
      .post('/api/pull-requests/not-a-uuid/fork')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(invalidForkId.status).toBe(400);
    expect(invalidForkId.body.error).toBe('PR_ID_INVALID');

    const invalidForkQuery = await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/fork?extra=true`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(invalidForkQuery.status).toBe(400);
    expect(invalidForkQuery.body.error).toBe('PR_FORK_INVALID_QUERY_FIELDS');

    const invalidForkBody = await request(app)
      .post(`/api/pull-requests/${prRes.body.id}/fork`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ source: 'manual' });
    expect(invalidForkBody.status).toBe(400);
    expect(invalidForkBody.body.error).toBe('PR_FORK_INVALID_FIELDS');
  });

  test('telemetry endpoint stores ux events', async () => {
    const response = await request(app).post('/api/telemetry/ux').send({
      eventType: 'feed_filter_change',
      sort: 'recent',
      status: 'draft',
      range: '30d',
      timingMs: 120,
    });

    expect(response.status).toBe(200);
    const result = await db.query(
      'SELECT COUNT(*)::int AS count FROM ux_events',
    );
    expect(result.rows[0].count).toBeGreaterThan(0);
  });

  test('telemetry endpoint accepts observer engagement events and normalizes invalid metadata', async () => {
    const human = await registerHuman('telemetry-observer@example.com');

    const response = await request(app)
      .post('/api/telemetry/ux')
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({
        eventType: 'draft_arc_view',
        userType: 'observer',
        metadata: '{not-json',
      });

    expect(response.status).toBe(200);

    const result = await db.query(
      `SELECT event_type, user_type, user_id, metadata
       FROM ux_events
       WHERE event_type = 'draft_arc_view'
       ORDER BY created_at DESC
       LIMIT 1`,
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].user_type).toBe('observer');
    expect(result.rows[0].user_id).toBe(human.userId);
    expect(result.rows[0].metadata).toEqual({});
  });

  test('telemetry endpoint accepts feed and demo ux events used by web', async () => {
    const eventTypes = [
      'feed_battle_filter',
      'feed_density_change',
      'feed_empty_cta',
      'feed_filter_reset',
      'feed_view_mode_change',
      'feed_view_mode_hint_dismiss',
      'demo_flow_refresh_partial_failure',
      'observer_prediction_filter_change',
      'observer_prediction_sort_change',
      'draft_multimodal_glowup_view',
      'draft_multimodal_glowup_empty',
      'draft_multimodal_glowup_error',
    ];

    for (const eventType of eventTypes) {
      const response = await request(app)
        .post('/api/telemetry/ux')
        .send({
          eventType,
          metadata: { source: 'integration-test' },
        });
      expect(response.status).toBe(200);
    }

    const result = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM ux_events
       WHERE event_type = ANY($1)`,
      [eventTypes],
    );
    expect(result.rows[0].count).toBe(eventTypes.length);
  });

  test('telemetry endpoint stores supplemental metadata for feed preference events', async () => {
    const modeResponse = await request(app).post('/api/telemetry/ux').send({
      eventType: 'feed_view_mode_change',
      mode: 'focus',
      previousMode: 'observer',
      source: 'hint',
    });
    expect(modeResponse.status).toBe(200);

    const densityResponse = await request(app).post('/api/telemetry/ux').send({
      eventType: 'feed_density_change',
      density: 'compact',
      previousDensity: 'comfort',
      sourceTab: 'All',
    });
    expect(densityResponse.status).toBe(200);

    const rows = await db.query(
      `SELECT event_type, source, metadata
       FROM ux_events
       WHERE event_type IN ('feed_view_mode_change', 'feed_density_change')
       ORDER BY created_at ASC`,
    );

    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0].event_type).toBe('feed_view_mode_change');
    expect(rows.rows[0].source).toBe('hint');
    expect(rows.rows[0].metadata).toMatchObject({
      mode: 'focus',
      previousMode: 'observer',
    });

    expect(rows.rows[1].event_type).toBe('feed_density_change');
    expect(rows.rows[1].source).toBe('web');
    expect(rows.rows[1].metadata).toMatchObject({
      density: 'compact',
      previousDensity: 'comfort',
      sourceTab: 'All',
    });
  });

  test('guild endpoints return list and detail', async () => {
    const { agentId } = await registerAgent('Guilded Studio');
    const guild = await db.query(
      "INSERT INTO guilds (name, description, theme_of_week) VALUES ('Guild Arc', 'Core team', 'Futuristic') RETURNING id",
    );
    await db.query('UPDATE agents SET guild_id = $1 WHERE id = $2', [
      guild.rows[0].id,
      agentId,
    ]);

    const list = await request(app).get('/api/guilds?limit=5');
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);

    const detail = await request(app).get(`/api/guilds/${guild.rows[0].id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.guild.name).toBe('Guild Arc');
  });

  test('guild endpoints validate query fields and pagination', async () => {
    const invalidQueryField = await request(app).get('/api/guilds?extra=true');
    expect(invalidQueryField.status).toBe(400);
    expect(invalidQueryField.body.error).toBe('GUILD_INVALID_QUERY_FIELDS');

    const invalidLimit = await request(app).get('/api/guilds?limit=oops');
    expect(invalidLimit.status).toBe(400);
    expect(invalidLimit.body.error).toBe('GUILD_PAGINATION_INVALID');

    const invalidOffset = await request(app).get('/api/guilds?offset=oops');
    expect(invalidOffset.status).toBe(400);
    expect(invalidOffset.body.error).toBe('GUILD_PAGINATION_INVALID');

    const invalidLimitFloat = await request(app).get('/api/guilds?limit=1.5');
    expect(invalidLimitFloat.status).toBe(400);
    expect(invalidLimitFloat.body.error).toBe('GUILD_PAGINATION_INVALID');

    const invalidOffsetNegative = await request(app).get(
      '/api/guilds?offset=-1',
    );
    expect(invalidOffsetNegative.status).toBe(400);
    expect(invalidOffsetNegative.body.error).toBe('GUILD_PAGINATION_INVALID');

    const invalidLimitRange = await request(app).get('/api/guilds?limit=101');
    expect(invalidLimitRange.status).toBe(400);
    expect(invalidLimitRange.body.error).toBe('GUILD_PAGINATION_INVALID');
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

  test('feed endpoints validate query fields and pagination', async () => {
    const invalidFeedListQueryField = await request(app).get(
      '/api/feeds/live-drafts?extra=true',
    );
    expect(invalidFeedListQueryField.status).toBe(400);
    expect(invalidFeedListQueryField.body.error).toBe(
      'FEED_INVALID_QUERY_FIELDS',
    );

    const invalidFeedListPagination = await request(app).get(
      '/api/feeds/live-drafts?limit=oops',
    );
    expect(invalidFeedListPagination.status).toBe(400);
    expect(invalidFeedListPagination.body.error).toBe(
      'FEED_PAGINATION_INVALID',
    );

    const invalidFeedListPaginationFloat = await request(app).get(
      '/api/feeds/live-drafts?limit=1.5',
    );
    expect(invalidFeedListPaginationFloat.status).toBe(400);
    expect(invalidFeedListPaginationFloat.body.error).toBe(
      'FEED_PAGINATION_INVALID',
    );

    const invalidUnifiedFeedQueryField = await request(app).get(
      '/api/feed?extra=true',
    );
    expect(invalidUnifiedFeedQueryField.status).toBe(400);
    expect(invalidUnifiedFeedQueryField.body.error).toBe(
      'FEED_INVALID_QUERY_FIELDS',
    );

    const invalidUnifiedFeedPagination = await request(app).get(
      '/api/feed?offset=oops',
    );
    expect(invalidUnifiedFeedPagination.status).toBe(400);
    expect(invalidUnifiedFeedPagination.body.error).toBe(
      'FEED_PAGINATION_INVALID',
    );

    const invalidUnifiedFeedOffsetNegative = await request(app).get(
      '/api/feed?offset=-1',
    );
    expect(invalidUnifiedFeedOffsetNegative.status).toBe(400);
    expect(invalidUnifiedFeedOffsetNegative.body.error).toBe(
      'FEED_PAGINATION_INVALID',
    );

    const invalidUnifiedFeedLimitRange = await request(app).get(
      '/api/feed?limit=101',
    );
    expect(invalidUnifiedFeedLimitRange.status).toBe(400);
    expect(invalidUnifiedFeedLimitRange.body.error).toBe(
      'FEED_PAGINATION_INVALID',
    );
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
        metadata: { title: 'Coffee Builder' },
      });

    const all = await request(app).get(
      '/api/search?q=Coffee&type=all&sort=recency',
    );
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThan(0);

    const studios = await request(app).get(
      '/api/search?q=Agent&type=studio&sort=impact',
    );
    expect(studios.status).toBe(200);
    expect(studios.body.length).toBeGreaterThan(0);
  });

  test('visual search ranks similar drafts', async () => {
    const { agentId, apiKey } = await registerAgent('Visual Search Studio');
    const draftA = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/va.png',
        thumbnailUrl: 'https://example.com/va-thumb.png',
      });
    const draftB = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/vb.png',
        thumbnailUrl: 'https://example.com/vb-thumb.png',
      });

    await db.query(
      `INSERT INTO draft_embeddings (draft_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT (draft_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [draftA.body.draft.id, JSON.stringify([1, 0, 0])],
    );
    await db.query(
      `INSERT INTO draft_embeddings (draft_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT (draft_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [draftB.body.draft.id, JSON.stringify([0, 1, 0])],
    );

    const results = await request(app)
      .post('/api/search/visual')
      .send({
        embedding: [1, 0.1, 0],
        type: 'draft',
        limit: 5,
      });

    expect(results.status).toBe(200);
    expect(results.body[0].id).toBe(draftA.body.draft.id);
  });

  test('similar search excludes self and sandbox drafts', async () => {
    const { agentId, apiKey } = await registerAgent('Similar Search Studio');
    const target = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/sim-a.png',
        thumbnailUrl: 'https://example.com/sim-a-thumb.png',
        metadata: { title: 'Target Similar' },
      });
    const other = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/sim-b.png',
        thumbnailUrl: 'https://example.com/sim-b-thumb.png',
        metadata: { title: 'Other Similar' },
      });
    const sandbox = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/sim-c.png',
        thumbnailUrl: 'https://example.com/sim-c-thumb.png',
        metadata: { title: 'Sandbox Similar' },
      });

    await db.query('UPDATE drafts SET is_sandbox = true WHERE id = $1', [
      sandbox.body.draft.id,
    ]);

    await db.query(
      `INSERT INTO draft_embeddings (draft_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT (draft_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [target.body.draft.id, JSON.stringify([1, 0, 0])],
    );
    await db.query(
      `INSERT INTO draft_embeddings (draft_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT (draft_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [other.body.draft.id, JSON.stringify([0.9, 0.1, 0])],
    );
    await db.query(
      `INSERT INTO draft_embeddings (draft_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT (draft_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [sandbox.body.draft.id, JSON.stringify([0.8, 0.2, 0])],
    );

    const similar = await request(app).get(
      `/api/search/similar?draftId=${target.body.draft.id}&limit=5`,
    );
    expect(similar.status).toBe(200);
    const ids = similar.body.map((item: any) => item.id);
    expect(ids).toContain(other.body.draft.id);
    expect(ids).not.toContain(target.body.draft.id);
    expect(ids).not.toContain(sandbox.body.draft.id);
  });

  test('style fusion generates directives from similar drafts', async () => {
    const { agentId, apiKey } = await registerAgent('Style Fusion Studio');
    const target = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/fusion-target.png',
        thumbnailUrl: 'https://example.com/fusion-target-thumb.png',
        metadata: { title: 'Fusion Target' },
      });
    const similarA = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/fusion-a.png',
        thumbnailUrl: 'https://example.com/fusion-a-thumb.png',
        metadata: { title: 'Fusion Similar A' },
      });
    const similarB = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/fusion-b.png',
        thumbnailUrl: 'https://example.com/fusion-b-thumb.png',
        metadata: { title: 'Fusion Similar B' },
      });

    await db.query(
      `INSERT INTO draft_embeddings (draft_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT (draft_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [target.body.draft.id, JSON.stringify([1, 0, 0])],
    );
    await db.query(
      `INSERT INTO draft_embeddings (draft_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT (draft_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [similarA.body.draft.id, JSON.stringify([0.92, 0.08, 0])],
    );
    await db.query(
      `INSERT INTO draft_embeddings (draft_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT (draft_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [similarB.body.draft.id, JSON.stringify([0.86, 0.14, 0])],
    );

    const fusion = await request(app).post('/api/search/style-fusion').send({
      draftId: target.body.draft.id,
      limit: 3,
      type: 'draft',
    });

    expect(fusion.status).toBe(200);
    expect(Array.isArray(fusion.body.sample)).toBe(true);
    expect(fusion.body.sample.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(fusion.body.styleDirectives)).toBe(true);
    expect(fusion.body.styleDirectives.length).toBeGreaterThan(0);
    expect(Array.isArray(fusion.body.winningPrHints)).toBe(true);
    expect(fusion.body.winningPrHints.length).toBeGreaterThan(0);
    expect(fusion.body.titleSuggestion).toContain('Fusion:');
    const styleFusionTelemetry = await db.query(
      `SELECT status, metadata
       FROM ux_events
       WHERE event_type = 'style_fusion_generate'
         AND draft_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [target.body.draft.id],
    );
    expect(styleFusionTelemetry.rows).toHaveLength(1);
    expect(styleFusionTelemetry.rows[0].status).toBe('success');
    expect(
      Number((styleFusionTelemetry.rows[0].metadata as any).sampleCount),
    ).toBeGreaterThanOrEqual(2);
  });

  test('style fusion requires at least two similar drafts', async () => {
    const { agentId, apiKey } = await registerAgent(
      'Style Fusion Sparse Studio',
    );
    const target = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/fusion-sparse-target.png',
        thumbnailUrl: 'https://example.com/fusion-sparse-target-thumb.png',
      });

    await db.query(
      `INSERT INTO draft_embeddings (draft_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT (draft_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [target.body.draft.id, JSON.stringify([1, 0, 0])],
    );

    const fusion = await request(app).post('/api/search/style-fusion').send({
      draftId: target.body.draft.id,
      limit: 3,
      type: 'draft',
    });

    expect(fusion.status).toBe(422);
    expect(fusion.body.error).toBe('STYLE_FUSION_NOT_ENOUGH_MATCHES');
    const styleFusionTelemetry = await db.query(
      `SELECT status, metadata
       FROM ux_events
       WHERE event_type = 'style_fusion_generate'
         AND draft_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [target.body.draft.id],
    );
    expect(styleFusionTelemetry.rows).toHaveLength(1);
    expect(styleFusionTelemetry.rows[0].status).toBe('error');
    expect((styleFusionTelemetry.rows[0].metadata as any).errorCode).toBe(
      'STYLE_FUSION_NOT_ENOUGH_MATCHES',
    );
  });

  test('search endpoints validate pagination, ids, and payload fields', async () => {
    const invalidSearchQueryField = await request(app).get(
      '/api/search?q=test&extra=true',
    );
    expect(invalidSearchQueryField.status).toBe(400);
    expect(invalidSearchQueryField.body.error).toBe(
      'SEARCH_INVALID_QUERY_FIELDS',
    );

    const invalidSimilarId = await request(app).get(
      '/api/search/similar?draftId=not-a-uuid',
    );
    expect(invalidSimilarId.status).toBe(400);
    expect(invalidSimilarId.body.error).toBe('DRAFT_ID_INVALID');

    const invalidSimilarQueryField = await request(app).get(
      '/api/search/similar?draftId=00000000-0000-0000-0000-000000000001&extra=true',
    );
    expect(invalidSimilarQueryField.status).toBe(400);
    expect(invalidSimilarQueryField.body.error).toBe(
      'SEARCH_INVALID_QUERY_FIELDS',
    );

    const invalidSimilarLimit = await request(app).get(
      '/api/search/similar?draftId=00000000-0000-0000-0000-000000000001&limit=oops',
    );
    expect(invalidSimilarLimit.status).toBe(400);
    expect(invalidSimilarLimit.body.error).toBe('SEARCH_PAGINATION_INVALID');

    const invalidSearchLimit = await request(app).get(
      '/api/search?q=test&limit=abc',
    );
    expect(invalidSearchLimit.status).toBe(400);
    expect(invalidSearchLimit.body.error).toBe('SEARCH_PAGINATION_INVALID');

    const invalidSearchOffset = await request(app).get(
      '/api/search?q=test&offset=10001',
    );
    expect(invalidSearchOffset.status).toBe(400);
    expect(invalidSearchOffset.body.error).toBe('SEARCH_PAGINATION_INVALID');

    const invalidSimilarOffset = await request(app).get(
      '/api/search/similar?draftId=00000000-0000-0000-0000-000000000001&offset=10001',
    );
    expect(invalidSimilarOffset.status).toBe(400);
    expect(invalidSimilarOffset.body.error).toBe('SEARCH_PAGINATION_INVALID');

    const invalidVisualFields = await request(app)
      .post('/api/search/visual')
      .send({
        draftId: '00000000-0000-0000-0000-000000000001',
        unknownField: true,
      });
    expect(invalidVisualFields.status).toBe(400);
    expect(invalidVisualFields.body.error).toBe('SEARCH_VISUAL_INVALID_FIELDS');

    const invalidVisualQueryField = await request(app)
      .post('/api/search/visual?extra=true')
      .send({
        draftId: '00000000-0000-0000-0000-000000000001',
      });
    expect(invalidVisualQueryField.status).toBe(400);
    expect(invalidVisualQueryField.body.error).toBe(
      'SEARCH_INVALID_QUERY_FIELDS',
    );

    const invalidVisualOffset = await request(app)
      .post('/api/search/visual')
      .send({
        draftId: '00000000-0000-0000-0000-000000000001',
        offset: 10_001,
      });
    expect(invalidVisualOffset.status).toBe(400);
    expect(invalidVisualOffset.body.error).toBe('SEARCH_PAGINATION_INVALID');

    const invalidStyleFusionFields = await request(app)
      .post('/api/search/style-fusion')
      .send({
        draftId: '00000000-0000-0000-0000-000000000001',
        extra: 'unsupported',
      });
    expect(invalidStyleFusionFields.status).toBe(400);
    expect(invalidStyleFusionFields.body.error).toBe(
      'STYLE_FUSION_INVALID_FIELDS',
    );

    const invalidStyleFusionQueryField = await request(app)
      .post('/api/search/style-fusion?extra=true')
      .send({
        draftId: '00000000-0000-0000-0000-000000000001',
      });
    expect(invalidStyleFusionQueryField.status).toBe(400);
    expect(invalidStyleFusionQueryField.body.error).toBe(
      'SEARCH_INVALID_QUERY_FIELDS',
    );
  });

  test('collaboration list endpoints reject unsupported query fields', async () => {
    const funnelHuman = await registerHuman('creator-funnel-guard@example.com');
    const funnelToken = funnelHuman.tokens.accessToken;

    const invalidCreatorStudiosQueryField = await request(app).get(
      '/api/creator-studios?extra=true',
    );
    expect(invalidCreatorStudiosQueryField.status).toBe(400);
    expect(invalidCreatorStudiosQueryField.body.error).toBe(
      'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
    );

    const invalidSwarmsQueryField = await request(app).get(
      '/api/swarms?extra=true',
    );
    expect(invalidSwarmsQueryField.status).toBe(400);
    expect(invalidSwarmsQueryField.body.error).toBe(
      'SWARM_INVALID_QUERY_FIELDS',
    );

    const invalidLiveSessionsQueryField = await request(app).get(
      '/api/live-sessions?extra=true',
    );
    expect(invalidLiveSessionsQueryField.status).toBe(400);
    expect(invalidLiveSessionsQueryField.body.error).toBe(
      'LIVE_SESSION_INVALID_QUERY_FIELDS',
    );

    const invalidCreatorStudiosLimit = await request(app).get(
      '/api/creator-studios?limit=1.5',
    );
    expect(invalidCreatorStudiosLimit.status).toBe(400);
    expect(invalidCreatorStudiosLimit.body.error).toBe('INVALID_LIMIT');

    const invalidCreatorStudiosOffset = await request(app).get(
      '/api/creator-studios?offset=-1',
    );
    expect(invalidCreatorStudiosOffset.status).toBe(400);
    expect(invalidCreatorStudiosOffset.body.error).toBe('INVALID_OFFSET');

    const invalidCreatorStudiosWindowDays = await request(app)
      .get('/api/creator-studios/funnels/summary?windowDays=0')
      .set('Authorization', `Bearer ${funnelToken}`);
    expect(invalidCreatorStudiosWindowDays.status).toBe(400);
    expect(invalidCreatorStudiosWindowDays.body.error).toBe(
      'INVALID_WINDOW_DAYS',
    );

    const invalidSwarmsLimit = await request(app).get('/api/swarms?limit=1.5');
    expect(invalidSwarmsLimit.status).toBe(400);
    expect(invalidSwarmsLimit.body.error).toBe('INVALID_LIMIT');

    const invalidLiveSessionsOffset = await request(app).get(
      '/api/live-sessions?offset=-1',
    );
    expect(invalidLiveSessionsOffset.status).toBe(400);
    expect(invalidLiveSessionsOffset.body.error).toBe('INVALID_OFFSET');
  });

  test('collaboration detail/mutation endpoints validate id params', async () => {
    const human = await registerHuman('collab-id-guard@example.com');
    const token = human.tokens.accessToken;
    const { agentId, apiKey } = await registerAgent('Collab ID Guard Agent');

    const invalidCreatorStudioDetail = await request(app).get(
      '/api/creator-studios/not-a-uuid',
    );
    expect(invalidCreatorStudioDetail.status).toBe(400);
    expect(invalidCreatorStudioDetail.body.error).toBe(
      'CREATOR_STUDIO_ID_INVALID',
    );

    const invalidGuildDetail = await request(app).get('/api/guilds/not-a-uuid');
    expect(invalidGuildDetail.status).toBe(400);
    expect(invalidGuildDetail.body.error).toBe('GUILD_ID_INVALID');

    const invalidSwarmDetail = await request(app).get('/api/swarms/not-a-uuid');
    expect(invalidSwarmDetail.status).toBe(400);
    expect(invalidSwarmDetail.body.error).toBe('SWARM_ID_INVALID');

    const invalidLiveSessionDetail = await request(app).get(
      '/api/live-sessions/not-a-uuid',
    );
    expect(invalidLiveSessionDetail.status).toBe(400);
    expect(invalidLiveSessionDetail.body.error).toBe('LIVE_SESSION_ID_INVALID');

    const invalidCreatorStudioGovernance = await request(app)
      .patch('/api/creator-studios/not-a-uuid/governance')
      .set('Authorization', `Bearer ${token}`)
      .send({
        autoApproveThreshold: 0.8,
      });
    expect(invalidCreatorStudioGovernance.status).toBe(400);
    expect(invalidCreatorStudioGovernance.body.error).toBe(
      'CREATOR_STUDIO_ID_INVALID',
    );

    const invalidSwarmStart = await request(app)
      .post('/api/swarms/not-a-uuid/start')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(invalidSwarmStart.status).toBe(400);
    expect(invalidSwarmStart.body.error).toBe('SWARM_ID_INVALID');

    const invalidLiveSessionStart = await request(app)
      .post('/api/live-sessions/not-a-uuid/start')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(invalidLiveSessionStart.status).toBe(400);
    expect(invalidLiveSessionStart.body.error).toBe('LIVE_SESSION_ID_INVALID');
  });

  test('creator studio mutation endpoints enforce query/body allowlists', async () => {
    const human = await registerHuman('creator-studio-boundary@example.com');
    const token = human.tokens.accessToken;

    const invalidDetailQuery = await request(app).get(
      '/api/creator-studios/00000000-0000-0000-0000-000000000001?extra=true',
    );
    expect(invalidDetailQuery.status).toBe(400);
    expect(invalidDetailQuery.body.error).toBe(
      'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
    );

    const invalidCreateQuery = await request(app)
      .post('/api/creator-studios?extra=true')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studioName: 'Creator Boundary',
      });
    expect(invalidCreateQuery.status).toBe(400);
    expect(invalidCreateQuery.body.error).toBe(
      'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
    );

    const invalidCreateFields = await request(app)
      .post('/api/creator-studios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studioName: 'Creator Boundary',
        extra: true,
      });
    expect(invalidCreateFields.status).toBe(400);
    expect(invalidCreateFields.body.error).toBe(
      'CREATOR_STUDIO_INVALID_FIELDS',
    );

    const createdStudio = await request(app)
      .post('/api/creator-studios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studioName: 'Creator Boundary',
      });
    expect(createdStudio.status).toBe(201);
    const studioId = createdStudio.body.id as string;

    const invalidGovernanceQuery = await request(app)
      .patch(`/api/creator-studios/${studioId}/governance?extra=true`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        governance: {
          allowForks: true,
        },
      });
    expect(invalidGovernanceQuery.status).toBe(400);
    expect(invalidGovernanceQuery.body.error).toBe(
      'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
    );

    const invalidGovernanceFields = await request(app)
      .patch(`/api/creator-studios/${studioId}/governance`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        governance: {
          allowForks: true,
        },
        extra: true,
      });
    expect(invalidGovernanceFields.status).toBe(400);
    expect(invalidGovernanceFields.body.error).toBe(
      'CREATOR_STUDIO_GOVERNANCE_INVALID_FIELDS',
    );

    const invalidBillingQuery = await request(app)
      .post(`/api/creator-studios/${studioId}/billing/connect?extra=true`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        providerAccountId: 'acct_123',
      });
    expect(invalidBillingQuery.status).toBe(400);
    expect(invalidBillingQuery.body.error).toBe(
      'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
    );

    const invalidBillingFields = await request(app)
      .post(`/api/creator-studios/${studioId}/billing/connect`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        providerAccountId: 'acct_123',
        extra: true,
      });
    expect(invalidBillingFields.status).toBe(400);
    expect(invalidBillingFields.body.error).toBe(
      'CREATOR_STUDIO_BILLING_INVALID_FIELDS',
    );

    const invalidRetentionQuery = await request(app)
      .post(`/api/creator-studios/${studioId}/retention/ping?extra=true`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(invalidRetentionQuery.status).toBe(400);
    expect(invalidRetentionQuery.body.error).toBe(
      'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
    );

    const invalidRetentionFields = await request(app)
      .post(`/api/creator-studios/${studioId}/retention/ping`)
      .set('Authorization', `Bearer ${token}`)
      .send({ extra: true });
    expect(invalidRetentionFields.status).toBe(400);
    expect(invalidRetentionFields.body.error).toBe(
      'CREATOR_STUDIO_RETENTION_INVALID_FIELDS',
    );
  });

  test('creator studio mutation endpoints validate payload boundaries', async () => {
    const human = await registerHuman('creator-studio-payload@example.com');
    const token = human.tokens.accessToken;

    const invalidNameType = await request(app)
      .post('/api/creator-studios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studioName: 42,
      });
    expect(invalidNameType.status).toBe(400);
    expect(invalidNameType.body.error).toBe('CREATOR_STUDIO_INVALID_INPUT');

    const invalidStylePreset = await request(app)
      .post('/api/creator-studios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studioName: 'Creator Payload',
        stylePreset: 'retro',
      });
    expect(invalidStylePreset.status).toBe(400);
    expect(invalidStylePreset.body.error).toBe(
      'CREATOR_STUDIO_INVALID_STYLE_PRESET',
    );

    const invalidRevenueShareType = await request(app)
      .post('/api/creator-studios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studioName: 'Creator Payload',
        revenueSharePercent: '25',
      });
    expect(invalidRevenueShareType.status).toBe(400);
    expect(invalidRevenueShareType.body.error).toBe(
      'CREATOR_STUDIO_INVALID_REVENUE_SHARE',
    );

    const createdStudio = await request(app)
      .post('/api/creator-studios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studioName: 'Creator Payload',
      });
    expect(createdStudio.status).toBe(201);
    const studioId = createdStudio.body.id as string;

    const invalidGovernanceThreshold = await request(app)
      .patch(`/api/creator-studios/${studioId}/governance`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        governance: {
          autoApproveThreshold: '0.7',
        },
      });
    expect(invalidGovernanceThreshold.status).toBe(400);
    expect(invalidGovernanceThreshold.body.error).toBe(
      'CREATOR_STUDIO_INVALID_THRESHOLD',
    );

    const invalidGovernanceFlagType = await request(app)
      .patch(`/api/creator-studios/${studioId}/governance`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        governance: {
          majorPrRequiresHuman: 'yes',
        },
      });
    expect(invalidGovernanceFlagType.status).toBe(400);
    expect(invalidGovernanceFlagType.body.error).toBe(
      'CREATOR_STUDIO_INVALID_INPUT',
    );

    const invalidGovernanceMode = await request(app)
      .patch(`/api/creator-studios/${studioId}/governance`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        governance: {
          moderationMode: 'wild',
        },
      });
    expect(invalidGovernanceMode.status).toBe(400);
    expect(invalidGovernanceMode.body.error).toBe(
      'CREATOR_STUDIO_INVALID_MODERATION_MODE',
    );

    const invalidGovernanceRevenueShare = await request(app)
      .patch(`/api/creator-studios/${studioId}/governance`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        revenueSharePercent: 101,
      });
    expect(invalidGovernanceRevenueShare.status).toBe(400);
    expect(invalidGovernanceRevenueShare.body.error).toBe(
      'CREATOR_STUDIO_INVALID_REVENUE_SHARE',
    );

    const invalidBillingAccountType = await request(app)
      .post(`/api/creator-studios/${studioId}/billing/connect`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        providerAccountId: 123,
      });
    expect(invalidBillingAccountType.status).toBe(400);
    expect(invalidBillingAccountType.body.error).toBe(
      'CREATOR_STUDIO_INVALID_INPUT',
    );
  });

  test('swarm endpoints enforce query/body allowlists', async () => {
    const { agentId, apiKey } = await registerAgent('Swarm Boundary Agent');

    const invalidDetailQuery = await request(app).get(
      '/api/swarms/00000000-0000-0000-0000-000000000001?extra=true',
    );
    expect(invalidDetailQuery.status).toBe(400);
    expect(invalidDetailQuery.body.error).toBe('SWARM_INVALID_QUERY_FIELDS');

    const invalidCreateQuery = await request(app)
      .post('/api/swarms?extra=true')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Boundary swarm',
        objective: 'Validate query fields',
        members: [],
      });
    expect(invalidCreateQuery.status).toBe(400);
    expect(invalidCreateQuery.body.error).toBe('SWARM_INVALID_QUERY_FIELDS');

    const invalidCreateFields = await request(app)
      .post('/api/swarms')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Boundary swarm',
        objective: 'Validate body fields',
        members: [],
        extra: true,
      });
    expect(invalidCreateFields.status).toBe(400);
    expect(invalidCreateFields.body.error).toBe('SWARM_INVALID_FIELDS');

    const invalidStartQuery = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/start?extra=true')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(invalidStartQuery.status).toBe(400);
    expect(invalidStartQuery.body.error).toBe('SWARM_INVALID_QUERY_FIELDS');

    const invalidStartBody = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/start')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ extra: true });
    expect(invalidStartBody.status).toBe(400);
    expect(invalidStartBody.body.error).toBe('SWARM_START_INVALID_FIELDS');

    const invalidJudgeQuery = await request(app)
      .post(
        '/api/swarms/00000000-0000-0000-0000-000000000001/judge-events?extra=true',
      )
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        eventType: 'checkpoint',
        notes: 'Boundary check',
      });
    expect(invalidJudgeQuery.status).toBe(400);
    expect(invalidJudgeQuery.body.error).toBe('SWARM_INVALID_QUERY_FIELDS');

    const invalidJudgeFields = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/judge-events')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        eventType: 'checkpoint',
        notes: 'Boundary check',
        extra: true,
      });
    expect(invalidJudgeFields.status).toBe(400);
    expect(invalidJudgeFields.body.error).toBe(
      'SWARM_JUDGE_EVENT_INVALID_FIELDS',
    );

    const invalidCompleteQuery = await request(app)
      .post(
        '/api/swarms/00000000-0000-0000-0000-000000000001/complete?extra=true',
      )
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        judgeSummary: 'Done',
      });
    expect(invalidCompleteQuery.status).toBe(400);
    expect(invalidCompleteQuery.body.error).toBe('SWARM_INVALID_QUERY_FIELDS');

    const invalidCompleteFields = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/complete')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        judgeSummary: 'Done',
        extra: true,
      });
    expect(invalidCompleteFields.status).toBe(400);
    expect(invalidCompleteFields.body.error).toBe(
      'SWARM_COMPLETE_INVALID_FIELDS',
    );
  });

  test('swarm endpoints validate payload boundaries', async () => {
    const { agentId, apiKey } = await registerAgent('Swarm Payload Agent');
    const { agentId: peerAgentId } = await registerAgent('Swarm Payload Peer');

    const invalidDraftIdCreate = await request(app)
      .post('/api/swarms')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        draftId: 'not-a-uuid',
        title: 'Payload swarm',
        objective: 'Validate route-level payload boundaries',
        members: [{ agentId: peerAgentId, role: 'critic' }],
      });
    expect(invalidDraftIdCreate.status).toBe(400);
    expect(invalidDraftIdCreate.body.error).toBe('DRAFT_ID_INVALID');

    const invalidMembersType = await request(app)
      .post('/api/swarms')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Payload swarm',
        objective: 'Validate route-level payload boundaries',
        members: { agentId: peerAgentId, role: 'critic' },
      });
    expect(invalidMembersType.status).toBe(400);
    expect(invalidMembersType.body.error).toBe('SWARM_INVALID_MEMBER');

    const invalidMemberAgentId = await request(app)
      .post('/api/swarms')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Payload swarm',
        objective: 'Validate route-level payload boundaries',
        members: [{ agentId: 'not-a-uuid', role: 'critic' }],
      });
    expect(invalidMemberAgentId.status).toBe(400);
    expect(invalidMemberAgentId.body.error).toBe('SWARM_INVALID_MEMBER');

    const invalidMemberRole = await request(app)
      .post('/api/swarms')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Payload swarm',
        objective: 'Validate route-level payload boundaries',
        members: [{ agentId: peerAgentId, role: 'invalid-role' }],
      });
    expect(invalidMemberRole.status).toBe(400);
    expect(invalidMemberRole.body.error).toBe('SWARM_INVALID_MEMBER');

    const invalidMemberIsLeadType = await request(app)
      .post('/api/swarms')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Payload swarm',
        objective: 'Validate route-level payload boundaries',
        members: [{ agentId: peerAgentId, role: 'critic', isLead: 'yes' }],
      });
    expect(invalidMemberIsLeadType.status).toBe(400);
    expect(invalidMemberIsLeadType.body.error).toBe('SWARM_INVALID_MEMBER');

    const invalidJudgeEventType = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/judge-events')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        eventType: 'invalid',
        notes: 'Boundary check',
      });
    expect(invalidJudgeEventType.status).toBe(400);
    expect(invalidJudgeEventType.body.error).toBe('SWARM_INVALID_EVENT');

    const invalidJudgeScoreType = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/judge-events')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        eventType: 'checkpoint',
        score: '10',
        notes: 'Boundary check',
      });
    expect(invalidJudgeScoreType.status).toBe(400);
    expect(invalidJudgeScoreType.body.error).toBe('SWARM_INVALID_SCORE');

    const invalidJudgeScoreRange = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/judge-events')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        eventType: 'checkpoint',
        score: 101,
        notes: 'Boundary check',
      });
    expect(invalidJudgeScoreRange.status).toBe(400);
    expect(invalidJudgeScoreRange.body.error).toBe('SWARM_INVALID_SCORE');

    const invalidJudgeNotesLength = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/judge-events')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        eventType: 'checkpoint',
        notes: 'x'.repeat(2001),
      });
    expect(invalidJudgeNotesLength.status).toBe(400);
    expect(invalidJudgeNotesLength.body.error).toBe('SWARM_INVALID_EVENT');

    const invalidCompleteSummaryType = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/complete')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        judgeSummary: 42,
      });
    expect(invalidCompleteSummaryType.status).toBe(400);
    expect(invalidCompleteSummaryType.body.error).toBe('SWARM_INVALID_INPUT');

    const invalidCompleteSummaryLength = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/complete')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        judgeSummary: 'x'.repeat(2001),
      });
    expect(invalidCompleteSummaryLength.status).toBe(400);
    expect(invalidCompleteSummaryLength.body.error).toBe('SWARM_INVALID_INPUT');

    const invalidCompleteScoreType = await request(app)
      .post('/api/swarms/00000000-0000-0000-0000-000000000001/complete')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        judgeSummary: 'done',
        judgeScore: '90',
      });
    expect(invalidCompleteScoreType.status).toBe(400);
    expect(invalidCompleteScoreType.body.error).toBe('SWARM_INVALID_SCORE');
  });

  test('live session endpoints enforce query/body allowlists', async () => {
    const { agentId, apiKey } = await registerAgent('Live Boundary Agent');
    const human = await registerHuman('live-boundary-human@example.com');
    const humanToken = human.tokens.accessToken;

    const invalidCreateQuery = await request(app)
      .post('/api/live-sessions?extra=true')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Boundary live session',
        objective: 'Validate query fields',
      });
    expect(invalidCreateQuery.status).toBe(400);
    expect(invalidCreateQuery.body.error).toBe(
      'LIVE_SESSION_INVALID_QUERY_FIELDS',
    );

    const invalidCreateFields = await request(app)
      .post('/api/live-sessions')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Boundary live session',
        objective: 'Validate body fields',
        extra: true,
      });
    expect(invalidCreateFields.status).toBe(400);
    expect(invalidCreateFields.body.error).toBe('LIVE_SESSION_INVALID_FIELDS');

    const created = await request(app)
      .post('/api/live-sessions')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Boundary live session',
        objective: 'Validate mutation boundaries',
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.session.id as string;

    const invalidDetailQuery = await request(app).get(
      `/api/live-sessions/${sessionId}?extra=true`,
    );
    expect(invalidDetailQuery.status).toBe(400);
    expect(invalidDetailQuery.body.error).toBe(
      'LIVE_SESSION_INVALID_QUERY_FIELDS',
    );

    const invalidStartQuery = await request(app)
      .post(`/api/live-sessions/${sessionId}/start?extra=true`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(invalidStartQuery.status).toBe(400);
    expect(invalidStartQuery.body.error).toBe(
      'LIVE_SESSION_INVALID_QUERY_FIELDS',
    );

    const invalidStartBody = await request(app)
      .post(`/api/live-sessions/${sessionId}/start`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ extra: true });
    expect(invalidStartBody.status).toBe(400);
    expect(invalidStartBody.body.error).toBe(
      'LIVE_SESSION_START_INVALID_FIELDS',
    );

    const invalidCompleteQuery = await request(app)
      .post(`/api/live-sessions/${sessionId}/complete?extra=true`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ recapSummary: 'done' });
    expect(invalidCompleteQuery.status).toBe(400);
    expect(invalidCompleteQuery.body.error).toBe(
      'LIVE_SESSION_INVALID_QUERY_FIELDS',
    );

    const invalidCompleteFields = await request(app)
      .post(`/api/live-sessions/${sessionId}/complete`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ recapSummary: 'done', extra: true });
    expect(invalidCompleteFields.status).toBe(400);
    expect(invalidCompleteFields.body.error).toBe(
      'LIVE_SESSION_COMPLETE_INVALID_FIELDS',
    );

    const invalidPresenceQuery = await request(app)
      .post(`/api/live-sessions/${sessionId}/presence/observer?extra=true`)
      .set('Authorization', `Bearer ${humanToken}`)
      .send({ status: 'watching' });
    expect(invalidPresenceQuery.status).toBe(400);
    expect(invalidPresenceQuery.body.error).toBe(
      'LIVE_SESSION_INVALID_QUERY_FIELDS',
    );

    const invalidPresenceFields = await request(app)
      .post(`/api/live-sessions/${sessionId}/presence/observer`)
      .set('Authorization', `Bearer ${humanToken}`)
      .send({ status: 'watching', extra: true });
    expect(invalidPresenceFields.status).toBe(400);
    expect(invalidPresenceFields.body.error).toBe(
      'LIVE_SESSION_PRESENCE_INVALID_FIELDS',
    );

    const invalidPresenceAgentFields = await request(app)
      .post(`/api/live-sessions/${sessionId}/presence/agent`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ status: 'active', extra: true });
    expect(invalidPresenceAgentFields.status).toBe(400);
    expect(invalidPresenceAgentFields.body.error).toBe(
      'LIVE_SESSION_PRESENCE_INVALID_FIELDS',
    );

    const invalidObserverMessageQuery = await request(app)
      .post(`/api/live-sessions/${sessionId}/messages/observer?extra=true`)
      .set('Authorization', `Bearer ${humanToken}`)
      .send({ content: 'hello' });
    expect(invalidObserverMessageQuery.status).toBe(400);
    expect(invalidObserverMessageQuery.body.error).toBe(
      'LIVE_SESSION_INVALID_QUERY_FIELDS',
    );

    const invalidObserverMessageFields = await request(app)
      .post(`/api/live-sessions/${sessionId}/messages/observer`)
      .set('Authorization', `Bearer ${humanToken}`)
      .send({ content: 'hello', extra: true });
    expect(invalidObserverMessageFields.status).toBe(400);
    expect(invalidObserverMessageFields.body.error).toBe(
      'LIVE_SESSION_MESSAGE_INVALID_FIELDS',
    );

    const invalidAgentMessageFields = await request(app)
      .post(`/api/live-sessions/${sessionId}/messages/agent`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ content: 'hello', authorLabel: 'Agent', extra: true });
    expect(invalidAgentMessageFields.status).toBe(400);
    expect(invalidAgentMessageFields.body.error).toBe(
      'LIVE_SESSION_MESSAGE_INVALID_FIELDS',
    );
  });

  test('live session endpoints validate payload boundaries', async () => {
    const { agentId, apiKey } = await registerAgent('Live Payload Agent');
    const human = await registerHuman('live-payload-human@example.com');
    const humanToken = human.tokens.accessToken;

    const invalidDraftIdCreate = await request(app)
      .post('/api/live-sessions')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        draftId: 'not-a-uuid',
        title: 'Boundary live session',
        objective: 'Validate payload',
      });
    expect(invalidDraftIdCreate.status).toBe(400);
    expect(invalidDraftIdCreate.body.error).toBe('DRAFT_ID_INVALID');

    const invalidIsPublic = await request(app)
      .post('/api/live-sessions')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Boundary live session',
        objective: 'Validate payload',
        isPublic: 'yes',
      });
    expect(invalidIsPublic.status).toBe(400);
    expect(invalidIsPublic.body.error).toBe('LIVE_SESSION_INVALID_INPUT');

    const invalidTitleLength = await request(app)
      .post('/api/live-sessions')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'x'.repeat(161),
        objective: 'Validate payload',
      });
    expect(invalidTitleLength.status).toBe(400);
    expect(invalidTitleLength.body.error).toBe('LIVE_SESSION_INVALID_INPUT');

    const created = await request(app)
      .post('/api/live-sessions')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Live payload session',
        objective: 'Validate route-level payload boundaries',
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.session.id as string;

    const invalidCompleteRecapUrl = await request(app)
      .post(`/api/live-sessions/${sessionId}/complete`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        recapClipUrl: 'ftp://example.com/clip.mp4',
      });
    expect(invalidCompleteRecapUrl.status).toBe(400);
    expect(invalidCompleteRecapUrl.body.error).toBe(
      'LIVE_SESSION_INVALID_INPUT',
    );

    const invalidPresenceType = await request(app)
      .post(`/api/live-sessions/${sessionId}/presence/observer`)
      .set('Authorization', `Bearer ${humanToken}`)
      .send({
        status: 1,
      });
    expect(invalidPresenceType.status).toBe(400);
    expect(invalidPresenceType.body.error).toBe('INVALID_PRESENCE_STATUS');

    const invalidMessageType = await request(app)
      .post(`/api/live-sessions/${sessionId}/messages/observer`)
      .set('Authorization', `Bearer ${humanToken}`)
      .send({
        content: 42,
      });
    expect(invalidMessageType.status).toBe(400);
    expect(invalidMessageType.body.error).toBe('LIVE_SESSION_INVALID_MESSAGE');

    const invalidMessageLength = await request(app)
      .post(`/api/live-sessions/${sessionId}/messages/observer`)
      .set('Authorization', `Bearer ${humanToken}`)
      .send({
        content: 'x'.repeat(501),
      });
    expect(invalidMessageLength.status).toBe(400);
    expect(invalidMessageLength.body.error).toBe(
      'LIVE_SESSION_INVALID_MESSAGE',
    );

    const invalidAgentLabelLength = await request(app)
      .post(`/api/live-sessions/${sessionId}/messages/agent`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        content: 'hello',
        authorLabel: 'x'.repeat(81),
      });
    expect(invalidAgentLabelLength.status).toBe(400);
    expect(invalidAgentLabelLength.body.error).toBe(
      'LIVE_SESSION_INVALID_MESSAGE',
    );
  });

  test('live session realtime bootstrap endpoint validates payload boundaries', async () => {
    const { agentId, apiKey } = await registerAgent(
      'Live Realtime Boundary Agent',
    );
    const human = await registerHuman(
      'live-realtime-boundary-human@example.com',
    );

    const created = await request(app)
      .post('/api/live-sessions')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Live realtime boundary',
        objective: 'Validate realtime endpoint boundaries',
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.session.id as string;

    const invalidQuery = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/session?extra=true`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({
        outputModalities: ['audio'],
      });
    expect(invalidQuery.status).toBe(400);
    expect(invalidQuery.body.error).toBe('LIVE_SESSION_INVALID_QUERY_FIELDS');

    const invalidBodyFields = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/session`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({
        outputModalities: ['audio'],
        extra: true,
      });
    expect(invalidBodyFields.status).toBe(400);
    expect(invalidBodyFields.body.error).toBe(
      'LIVE_SESSION_REALTIME_INVALID_FIELDS',
    );

    const invalidVoice = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/session`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({
        outputModalities: ['audio'],
        voice: 'not-a-voice',
      });
    expect(invalidVoice.status).toBe(400);
    expect(invalidVoice.body.error).toBe('LIVE_SESSION_REALTIME_INVALID_INPUT');

    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = '';
    try {
      const notConfigured = await request(app)
        .post(`/api/live-sessions/${sessionId}/realtime/session`)
        .set('Authorization', `Bearer ${human.tokens.accessToken}`)
        .send({
          outputModalities: ['audio'],
        });
      expect(notConfigured.status).toBe(503);
      expect(notConfigured.body.error).toBe('OPENAI_REALTIME_NOT_CONFIGURED');
    } finally {
      if (previousOpenAiKey === undefined) {
        process.env.OPENAI_API_KEY = undefined;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
    }
  });

  test('live session realtime bootstrap endpoint creates OpenAI realtime session', async () => {
    const { agentId, apiKey } = await registerAgent('Live Realtime Agent');
    const human = await registerHuman('live-realtime-human@example.com');

    const created = await request(app)
      .post('/api/live-sessions')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Live realtime session',
        objective: 'Bootstrap realtime observer copilot',
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.session.id as string;

    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    const previousFetch = globalThis.fetch;
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'rt_session_123',
        expires_at: '2026-02-25T12:00:00.000Z',
        client_secret: {
          value: 'rt_secret_123',
          expires_at: '2026-02-25T11:30:00.000Z',
        },
      }),
      text: async () => '',
    } as Response);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    try {
      const bootstrap = await request(app)
        .post(`/api/live-sessions/${sessionId}/realtime/session`)
        .set('Authorization', `Bearer ${human.tokens.accessToken}`)
        .send({
          outputModalities: ['audio'],
          voice: 'marin',
          pushToTalk: true,
          topicHint: 'Keep answers short',
          metadata: {
            source: 'integration-test',
          },
        });

      expect(bootstrap.status).toBe(201);
      expect(bootstrap.body).toEqual(
        expect.objectContaining({
          provider: 'openai',
          sessionId: 'rt_session_123',
          clientSecret: 'rt_secret_123',
          model: 'gpt-realtime',
          outputModalities: ['audio'],
          voice: 'marin',
          transportHints: {
            recommended: 'webrtc',
            websocketSupported: true,
            pushToTalk: true,
          },
        }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toBe('https://api.openai.com/v1/realtime/sessions');
      expect(calledInit.method).toBe('POST');
      expect(calledInit.headers).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer test-openai-key',
          'Content-Type': 'application/json',
        }),
      );
      const parsedBody = JSON.parse(String(calledInit.body)) as {
        audio?: { input?: { turn_detection?: unknown } };
        output_modalities?: string[];
      };
      expect(parsedBody.output_modalities).toEqual(['audio']);
      expect(parsedBody.audio?.input?.turn_detection).toBeNull();
    } finally {
      globalThis.fetch = previousFetch;
      if (previousOpenAiKey === undefined) {
        process.env.OPENAI_API_KEY = undefined;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
    }
  });

  test('live session realtime tool endpoint validates payload boundaries', async () => {
    const { agentId, apiKey } = await registerAgent(
      'Live Realtime Tool Boundary Agent',
    );
    const human = await registerHuman(
      'live-realtime-tool-boundary-human@example.com',
    );

    const created = await request(app)
      .post('/api/live-sessions')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        title: 'Live realtime tool boundary',
        objective: 'Validate realtime tool endpoint boundaries',
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.session.id as string;

    const invalidQuery = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/tool?extra=true`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({
        name: 'follow_studio',
        arguments: {
          studioId: agentId,
        },
      });
    expect(invalidQuery.status).toBe(400);
    expect(invalidQuery.body.error).toBe('LIVE_SESSION_INVALID_QUERY_FIELDS');

    const invalidBodyFields = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/tool`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({
        name: 'follow_studio',
        arguments: {
          studioId: agentId,
        },
        extra: true,
      });
    expect(invalidBodyFields.status).toBe(400);
    expect(invalidBodyFields.body.error).toBe(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_FIELDS',
    );

    const invalidToolName = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/tool`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({
        name: 'unsupported_tool',
        arguments: {},
      });
    expect(invalidToolName.status).toBe(400);
    expect(invalidToolName.body.error).toBe(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
    );

    const invalidToolArgs = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/tool`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({
        name: 'place_prediction',
        arguments: '{"draftId":"invalid"}',
      });
    expect(invalidToolArgs.status).toBe(400);
    expect(invalidToolArgs.body.error).toBe(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
    );

    const invalidCallId = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/tool`)
      .set('Authorization', `Bearer ${human.tokens.accessToken}`)
      .send({
        callId: 'call id with spaces',
        name: 'follow_studio',
        arguments: {
          studioId: agentId,
        },
      });
    expect(invalidCallId.status).toBe(400);
    expect(invalidCallId.body.error).toBe(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
    );
  });

  test('live session realtime tool endpoint executes follow and prediction tools', async () => {
    const { agentId: authorId, apiKey: authorKey } = await registerAgent(
      'Live Realtime Tool Author',
    );
    const { agentId: makerId, apiKey: makerKey } = await registerAgent(
      'Live Realtime Tool Maker',
    );
    const human = await registerHuman('live-realtime-tool-human@example.com');
    const observerToken = human.tokens.accessToken;

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        imageUrl: 'https://example.com/realtime-tool-v1.png',
        thumbnailUrl: 'https://example.com/realtime-tool-v1-thumb.png',
      });
    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id as string;

    const pullRequestRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', makerId)
      .set('x-api-key', makerKey)
      .send({
        description: 'Realtime tool pending PR',
        severity: 'minor',
        imageUrl: 'https://example.com/realtime-tool-v2.png',
        thumbnailUrl: 'https://example.com/realtime-tool-v2-thumb.png',
      });
    expect(pullRequestRes.status).toBe(200);
    const pullRequestId = pullRequestRes.body.id as string;

    const created = await request(app)
      .post('/api/live-sessions')
      .set('x-agent-id', authorId)
      .set('x-api-key', authorKey)
      .send({
        draftId,
        title: 'Live realtime tool execution',
        objective: 'Execute realtime tools against active draft session',
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.session.id as string;

    const followResult = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/tool`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        callId: 'call_follow_1',
        name: 'follow_studio',
        arguments: {
          studioId: makerId,
        },
      });
    expect(followResult.status).toBe(200);
    expect(followResult.body.toolName).toBe('follow_studio');
    expect(followResult.body.callId).toBe('call_follow_1');
    expect(followResult.body.output.studioId).toBe(makerId);
    expect(followResult.body.output.isFollowing).toBe(true);
    expect(followResult.body.output.followerCount).toBe(1);
    expect(followResult.body.deduplicated).toBeUndefined();

    const followDuplicateResult = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/tool`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        callId: 'call_follow_1',
        name: 'follow_studio',
        arguments: {
          studioId: makerId,
        },
      });
    expect(followDuplicateResult.status).toBe(200);
    expect(followDuplicateResult.body.toolName).toBe('follow_studio');
    expect(followDuplicateResult.body.callId).toBe('call_follow_1');
    expect(followDuplicateResult.body.deduplicated).toBe(true);
    expect(followDuplicateResult.body.output).toEqual(followResult.body.output);

    const followConflictResult = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/tool`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        callId: 'call_follow_1',
        name: 'follow_studio',
        arguments: {
          studioId: authorId,
        },
      });
    expect(followConflictResult.status).toBe(409);
    expect(followConflictResult.body.error).toBe(
      'LIVE_SESSION_REALTIME_TOOL_CALL_CONFLICT',
    );

    const callIdToolConflictResult = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/tool`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        callId: 'call_follow_1',
        name: 'place_prediction',
        arguments: {
          draftId,
          outcome: 'merge',
          stakePoints: 25,
        },
      });
    expect(callIdToolConflictResult.status).toBe(409);
    expect(callIdToolConflictResult.body.error).toBe(
      'LIVE_SESSION_REALTIME_TOOL_CALL_CONFLICT',
    );

    const predictionResult = await request(app)
      .post(`/api/live-sessions/${sessionId}/realtime/tool`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send({
        callId: 'call_prediction_1',
        name: 'place_prediction',
        arguments: {
          draftId,
          outcome: 'merge',
          stakePoints: 25,
        },
      });
    expect(predictionResult.status).toBe(200);
    expect(predictionResult.body.toolName).toBe('place_prediction');
    expect(predictionResult.body.callId).toBe('call_prediction_1');
    expect(predictionResult.body.output.draftId).toBe(draftId);
    expect(predictionResult.body.output.pullRequestId).toBe(pullRequestId);
    expect(predictionResult.body.output.prediction.predictedOutcome).toBe(
      'merge',
    );
    expect(predictionResult.body.output.prediction.stakePoints).toBe(25);
    expect(predictionResult.body.output.summary.pullRequestId).toBe(
      pullRequestId,
    );

    const storedPrediction = await db.query(
      `SELECT predicted_outcome, stake_points
       FROM observer_pr_predictions
       WHERE observer_id = $1
         AND pull_request_id = $2`,
      [human.userId, pullRequestId],
    );
    expect(storedPrediction.rows).toHaveLength(1);
    expect(storedPrediction.rows[0].predicted_outcome).toBe('merge');
    expect(Number(storedPrediction.rows[0].stake_points)).toBe(25);

    const followRows = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM observer_studio_follows
       WHERE observer_id = $1
         AND studio_id = $2`,
      [human.userId, makerId],
    );
    expect(Number(followRows.rows[0]?.count ?? 0)).toBe(1);
  });

  test('search compute-heavy endpoints enforce rate limiting', async () => {
    const headers = {
      'x-enforce-rate-limit': 'true',
      'x-rate-limit-override': '1',
      'x-agent-id': 'search-heavy-rate-test',
    };
    const payload = {
      draftId: '00000000-0000-0000-0000-000000000001',
    };

    const first = await request(app)
      .post('/api/search/style-fusion')
      .set(headers)
      .send(payload);
    expect(first.status).toBe(404);

    const second = await request(app)
      .post('/api/search/style-fusion')
      .set(headers)
      .send(payload);
    expect(second.status).toBe(429);
  });

  test('draft creation auto-embeds initial version', async () => {
    const { agentId, apiKey } = await registerAgent('Auto Embed Studio');
    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/auto.png',
        thumbnailUrl: 'https://example.com/auto-thumb.png',
        metadata: { title: 'Auto Embed', tags: ['bold', 'neon'] },
      });

    expect(draftRes.status).toBe(200);
    const stored = await db.query(
      'SELECT embedding, source FROM draft_embeddings WHERE draft_id = $1',
      [draftRes.body.draft.id],
    );
    expect(stored.rows.length).toBe(1);
    expect(stored.rows[0].source).toBe('auto');
    expect(Array.isArray(stored.rows[0].embedding)).toBe(true);
    expect(stored.rows[0].embedding.length).toBeGreaterThan(0);
  });

  test('embedding endpoint stores vectors for author', async () => {
    const { agentId, apiKey } = await registerAgent('Embed Author');
    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/embed.png',
        thumbnailUrl: 'https://example.com/embed-thumb.png',
      });

    const embedRes = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/embedding`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ embedding: [0.25, 0.5, 0.75], source: 'test' });

    expect(embedRes.status).toBe(200);
    const stored = await db.query(
      'SELECT embedding FROM draft_embeddings WHERE draft_id = $1',
      [draftRes.body.draft.id],
    );
    expect(stored.rows.length).toBe(1);

    const invalidEmbeddingQuery = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/embedding?extra=true`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ embedding: [0.25, 0.5, 0.75], source: 'test' });
    expect(invalidEmbeddingQuery.status).toBe(400);
    expect(invalidEmbeddingQuery.body.error).toBe(
      'DRAFT_EMBEDDING_INVALID_QUERY_FIELDS',
    );

    const invalidEmbeddingId = await request(app)
      .post('/api/drafts/not-a-uuid/embedding')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ embedding: [0.25, 0.5, 0.75], source: 'test' });
    expect(invalidEmbeddingId.status).toBe(400);
    expect(invalidEmbeddingId.body.error).toBe('DRAFT_ID_INVALID');

    const invalidEmbeddingFields = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/embedding`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        embedding: [0.25, 0.5, 0.75],
        source: 'test',
        extra: true,
      });
    expect(invalidEmbeddingFields.status).toBe(400);
    expect(invalidEmbeddingFields.body.error).toBe(
      'DRAFT_EMBEDDING_INVALID_FIELDS',
    );

    const invalidEmbeddingType = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/embedding`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        embedding: ['a', 'b'],
        source: 'test',
      });
    expect(invalidEmbeddingType.status).toBe(400);
    expect(invalidEmbeddingType.body.error).toBe('DRAFT_EMBEDDING_INVALID');

    const invalidEmbeddingSource = await request(app)
      .post(`/api/drafts/${draftRes.body.draft.id}/embedding`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        embedding: [0.25, 0.5, 0.75],
        source: 42,
      });
    expect(invalidEmbeddingSource.status).toBe(400);
    expect(invalidEmbeddingSource.body.error).toBe('DRAFT_EMBEDDING_INVALID');
  });

  test('search endpoint supports pagination and empty query', async () => {
    const paged = await request(app).get('/api/search?q=&limit=2&offset=1');
    expect(paged.status).toBe(200);

    const empty = await request(app).get('/api/search');
    expect(empty.status).toBe(200);
  });

  test('studios endpoints handle not found and updates', async () => {
    const { agentId, apiKey } = await registerAgent('Agent Studio Primary');
    const { agentId: otherAgentId, apiKey: otherApiKey } = await registerAgent(
      'Agent Studio Secondary',
    );

    const notFound = await request(app).get(
      '/api/studios/00000000-0000-0000-0000-000000000000',
    );
    expect(notFound.status).toBe(404);

    const studio = await request(app).get(`/api/studios/${agentId}`);
    expect(studio.status).toBe(200);
    expect(studio.body.id).toBe(agentId);

    const invalidStudioQuery = await request(app).get(
      `/api/studios/${agentId}?extra=true`,
    );
    expect(invalidStudioQuery.status).toBe(400);
    expect(invalidStudioQuery.body.error).toBe('STUDIO_INVALID_QUERY_FIELDS');

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
      .send({
        studioName: 'Updated Studio',
        styleTags: [' neon ', 'cinematic', 'neon'],
        skillProfile: {
          tone: 'cinematic',
          preferredPatterns: ['high contrast'],
        },
      });
    expect(updated.status).toBe(200);
    expect(updated.body.studio_name).toBe('Updated Studio');
    expect(updated.body.style_tags).toEqual(['neon', 'cinematic']);
    expect(updated.body.skill_profile).toEqual({
      tone: 'cinematic',
      preferredPatterns: ['high contrast'],
    });

    const invalidStudioUpdateQuery = await request(app)
      .put(`/api/studios/${agentId}?extra=true`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({});
    expect(invalidStudioUpdateQuery.status).toBe(400);
    expect(invalidStudioUpdateQuery.body.error).toBe(
      'STUDIO_UPDATE_INVALID_QUERY_FIELDS',
    );

    const invalidStudioUpdateFields = await request(app)
      .put(`/api/studios/${agentId}`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ unknownField: true });
    expect(invalidStudioUpdateFields.status).toBe(400);
    expect(invalidStudioUpdateFields.body.error).toBe(
      'STUDIO_UPDATE_INVALID_FIELDS',
    );

    const invalidSkillProfile = await request(app)
      .put(`/api/studios/${agentId}`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ skillProfile: ['not-an-object'] });
    expect(invalidSkillProfile.status).toBe(400);
    expect(invalidSkillProfile.body.error).toBe('STUDIO_SKILL_PROFILE_INVALID');

    const invalidRolePersonasViaSkillProfile = await request(app)
      .put(`/api/studios/${agentId}`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        skillProfile: {
          rolePersonas: {
            critic: { focus: 'should-be-array' },
          },
        },
      });
    expect(invalidRolePersonasViaSkillProfile.status).toBe(400);
    expect(invalidRolePersonasViaSkillProfile.body.error).toBe(
      'STUDIO_ROLE_PERSONAS_INVALID',
    );

    const forbiddenPersonasUpdate = await request(app)
      .put(`/api/studios/${agentId}/personas`)
      .set('x-agent-id', otherAgentId)
      .set('x-api-key', otherApiKey)
      .send({
        rolePersonas: {
          critic: { tone: 'Strict reviewer' },
        },
      });
    expect(forbiddenPersonasUpdate.status).toBe(403);

    const personasUpdated = await request(app)
      .put(`/api/studios/${agentId}/personas`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        rolePersonas: {
          author: {
            tone: 'Narrative-first',
            focus: ['coherence', 'arc'],
            signaturePhrase: 'Ship the arc.',
          },
          critic: {
            tone: 'Ruthless but fair',
            boundaries: ['No personal attacks'],
          },
        },
      });
    expect(personasUpdated.status).toBe(200);
    expect(personasUpdated.body.rolePersonas.author).toEqual({
      tone: 'Narrative-first',
      focus: ['coherence', 'arc'],
      signaturePhrase: 'Ship the arc.',
    });
    expect(personasUpdated.body.rolePersonas.critic).toEqual({
      tone: 'Ruthless but fair',
      boundaries: ['No personal attacks'],
    });

    const personasFetched = await request(app).get(
      `/api/studios/${agentId}/personas`,
    );
    expect(personasFetched.status).toBe(200);
    expect(personasFetched.body.rolePersonas.author.tone).toBe(
      'Narrative-first',
    );

    const invalidPersonasReadQuery = await request(app).get(
      `/api/studios/${agentId}/personas?extra=true`,
    );
    expect(invalidPersonasReadQuery.status).toBe(400);
    expect(invalidPersonasReadQuery.body.error).toBe(
      'STUDIO_ROLE_PERSONAS_INVALID_QUERY_FIELDS',
    );

    const invalidPersonasUpdateQuery = await request(app)
      .put(`/api/studios/${agentId}/personas?extra=true`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        rolePersonas: {
          author: { tone: 'Only query should fail first' },
        },
      });
    expect(invalidPersonasUpdateQuery.status).toBe(400);
    expect(invalidPersonasUpdateQuery.body.error).toBe(
      'STUDIO_ROLE_PERSONAS_INVALID_QUERY_FIELDS',
    );

    const invalidPersonasUpdateFields = await request(app)
      .put(`/api/studios/${agentId}/personas`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        rolePersonas: {
          author: { tone: 'strict' },
        },
        extra: true,
      });
    expect(invalidPersonasUpdateFields.status).toBe(400);
    expect(invalidPersonasUpdateFields.body.error).toBe(
      'STUDIO_ROLE_PERSONAS_INVALID_FIELDS',
    );

    const personasTelemetry = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM ux_events
       WHERE event_type = 'studio_personas_update'
         AND user_id = $1`,
      [agentId],
    );
    expect(personasTelemetry.rows[0].count).toBeGreaterThanOrEqual(1);

    const invalidPersonasPayload = await request(app)
      .put(`/api/studios/${agentId}/personas`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        rolePersonas: {
          hacker: { tone: 'malicious' },
        },
      });
    expect(invalidPersonasPayload.status).toBe(400);
    expect(invalidPersonasPayload.body.error).toBe(
      'STUDIO_ROLE_PERSONAS_INVALID',
    );

    const missingPersonasPayload = await request(app)
      .put(`/api/studios/${agentId}/personas`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({});
    expect(missingPersonasPayload.status).toBe(400);
    expect(missingPersonasPayload.body.error).toBe(
      'STUDIO_ROLE_PERSONAS_REQUIRED',
    );

    const metrics = await request(app).get(`/api/studios/${agentId}/metrics`);
    expect(metrics.status).toBe(200);
    expect(metrics.body).toHaveProperty('impact');
    expect(metrics.body).toHaveProperty('signal');

    const invalidMetricsQuery = await request(app).get(
      `/api/studios/${agentId}/metrics?extra=true`,
    );
    expect(invalidMetricsQuery.status).toBe(400);
    expect(invalidMetricsQuery.body.error).toBe(
      'STUDIO_METRICS_INVALID_QUERY_FIELDS',
    );

    const invalidMetricsId = await request(app).get(
      '/api/studios/not-a-uuid/metrics',
    );
    expect(invalidMetricsId.status).toBe(400);
    expect(invalidMetricsId.body.error).toBe('STUDIO_ID_INVALID');
  });

  test('studio ledger maps impact delta for merged and fix entries', async () => {
    const studioId = '00000000-0000-0000-0000-000000000009';
    const occurredAt = new Date().toISOString();
    const querySpy = jest.spyOn(db, 'query') as unknown as jest.Mock;
    querySpy.mockResolvedValueOnce({
      rows: [
        {
          kind: 'pr_merged',
          id: 'pr-major',
          draft_id: 'draft-major',
          draft_title: 'Major Draft',
          description: 'Major merge',
          severity: 'major',
          occurred_at: occurredAt,
        },
        {
          kind: 'pr_merged',
          id: 'pr-minor',
          draft_id: 'draft-minor',
          draft_title: 'Minor Draft',
          description: 'Minor merge',
          severity: 'minor',
          occurred_at: occurredAt,
        },
        {
          kind: 'fix_request',
          id: 'fix-1',
          draft_id: 'draft-fix',
          draft_title: 'Fix Draft',
          description: 'Need more contrast',
          severity: null,
          occurred_at: occurredAt,
        },
      ],
    } as any);

    const ledger = await request(app).get(
      `/api/studios/${studioId}/ledger?limit=3`,
    );
    expect(ledger.status).toBe(200);
    expect(querySpy).toHaveBeenCalledWith(expect.any(String), [studioId, 3]);
    expect(ledger.body).toEqual([
      {
        kind: 'pr_merged',
        id: 'pr-major',
        draftId: 'draft-major',
        draftTitle: 'Major Draft',
        description: 'Major merge',
        severity: 'major',
        occurredAt,
        impactDelta: IMPACT_MAJOR_INCREMENT,
      },
      {
        kind: 'pr_merged',
        id: 'pr-minor',
        draftId: 'draft-minor',
        draftTitle: 'Minor Draft',
        description: 'Minor merge',
        severity: 'minor',
        occurredAt,
        impactDelta: IMPACT_MINOR_INCREMENT,
      },
      {
        kind: 'fix_request',
        id: 'fix-1',
        draftId: 'draft-fix',
        draftTitle: 'Fix Draft',
        description: 'Need more contrast',
        severity: null,
        occurredAt,
        impactDelta: 0,
      },
    ]);
    querySpy.mockRestore();
  });

  test('studio ledger enforces safe limit bounds', async () => {
    const studioId = '00000000-0000-0000-0000-000000000010';
    const querySpy = jest.spyOn(db, 'query') as unknown as jest.Mock;
    querySpy.mockResolvedValue({ rows: [] } as any);

    const capped = await request(app).get(
      `/api/studios/${studioId}/ledger?limit=999`,
    );
    expect(capped.status).toBe(200);
    expect(querySpy).toHaveBeenLastCalledWith(expect.any(String), [
      studioId,
      50,
    ]);

    const floored = await request(app).get(
      `/api/studios/${studioId}/ledger?limit=0`,
    );
    expect(floored.status).toBe(200);
    expect(querySpy).toHaveBeenLastCalledWith(expect.any(String), [
      studioId,
      1,
    ]);

    const fallback = await request(app).get(
      `/api/studios/${studioId}/ledger?limit=abc`,
    );
    expect(fallback.status).toBe(400);
    expect(fallback.body.error).toBe('STUDIO_LEDGER_LIMIT_INVALID');

    const invalidFloatLimit = await request(app).get(
      `/api/studios/${studioId}/ledger?limit=1.5`,
    );
    expect(invalidFloatLimit.status).toBe(400);
    expect(invalidFloatLimit.body.error).toBe('STUDIO_LEDGER_LIMIT_INVALID');

    const invalidQueryField = await request(app).get(
      `/api/studios/${studioId}/ledger?extra=true`,
    );
    expect(invalidQueryField.status).toBe(400);
    expect(invalidQueryField.body.error).toBe(
      'STUDIO_LEDGER_INVALID_QUERY_FIELDS',
    );

    const invalidStudioId = await request(app).get(
      '/api/studios/not-a-uuid/ledger',
    );
    expect(invalidStudioId.status).toBe(400);
    expect(invalidStudioId.body.error).toBe('STUDIO_ID_INVALID');

    querySpy.mockRestore();
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
        referenceImages: [],
      });
    expect(commissionPending.status).toBe(200);
    expect(commissionPending.body.commission.paymentStatus).toBe('pending');
    expect(commissionPending.body.paymentIntentId).toBeTruthy();

    const commissionOpen = await request(app)
      .post('/api/commissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'No reward commission',
      });
    expect(commissionOpen.status).toBe(200);

    const listAll = await request(app).get('/api/commissions');
    expect(listAll.status).toBe(200);
    expect(listAll.body.length).toBeGreaterThan(0);

    const listForAgents = await request(app).get(
      '/api/commissions?forAgents=true',
    );
    expect(listForAgents.status).toBe(200);
    expect(listForAgents.body.length).toBeGreaterThan(0);

    const detail = await request(app).get(
      `/api/commissions/${commissionOpen.body.commission.id}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(commissionOpen.body.commission.id);
    expect(Array.isArray(detail.body.responses)).toBe(true);
    expect(detail.body.responses).toHaveLength(0);

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png',
      });

    const submitResponse = await request(app)
      .post(`/api/commissions/${commissionOpen.body.commission.id}/responses`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ draftId: draftRes.body.draft.id });
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.ok).toBe(true);

    const detailWithResponse = await request(app).get(
      `/api/commissions/${commissionOpen.body.commission.id}`,
    );
    expect(detailWithResponse.status).toBe(200);
    expect(detailWithResponse.body.responses).toHaveLength(1);
    expect(detailWithResponse.body.responses[0].draftId).toBe(
      draftRes.body.draft.id,
    );
    expect(detailWithResponse.body.responses[0].studioId).toBe(agentId);

    const selectWinner = await request(app)
      .post(
        `/api/commissions/${commissionOpen.body.commission.id}/select-winner`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ winnerDraftId: draftRes.body.draft.id });
    expect(selectWinner.status).toBe(200);
    expect(selectWinner.body.status).toBe('completed');

    const payIntent = await request(app)
      .post(
        `/api/commissions/${commissionPending.body.commission.id}/pay-intent`,
      )
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
      eventType: 'payment',
    });
    expect(webhook.status).toBe(200);
    expect(webhook.body.applied).toBe(true);

    const missingDetail = await request(app).get(
      '/api/commissions/00000000-0000-0000-0000-000000000123',
    );
    expect(missingDetail.status).toBe(404);
    expect(missingDetail.body.error).toBe('COMMISSION_NOT_FOUND');
  });

  test('commission endpoints validate commission id params', async () => {
    const human = await registerHuman('commission-id-guard@example.com');
    const token = human.tokens.accessToken;
    const { agentId, apiKey } = await registerAgent('Commission Guard Agent');

    const invalidDetail = await request(app).get('/api/commissions/not-a-uuid');
    expect(invalidDetail.status).toBe(400);
    expect(invalidDetail.body.error).toBe('COMMISSION_ID_INVALID');

    const invalidResponse = await request(app)
      .post('/api/commissions/not-a-uuid/responses')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        draftId: '00000000-0000-0000-0000-000000000001',
      });
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error).toBe('COMMISSION_ID_INVALID');

    const invalidWinner = await request(app)
      .post('/api/commissions/not-a-uuid/select-winner')
      .set('Authorization', `Bearer ${token}`)
      .send({
        winnerDraftId: '00000000-0000-0000-0000-000000000001',
      });
    expect(invalidWinner.status).toBe(400);
    expect(invalidWinner.body.error).toBe('COMMISSION_ID_INVALID');

    const invalidPayIntent = await request(app)
      .post('/api/commissions/not-a-uuid/pay-intent')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(invalidPayIntent.status).toBe(400);
    expect(invalidPayIntent.body.error).toBe('COMMISSION_ID_INVALID');

    const invalidCancel = await request(app)
      .post('/api/commissions/not-a-uuid/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(invalidCancel.status).toBe(400);
    expect(invalidCancel.body.error).toBe('COMMISSION_ID_INVALID');
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

    const invalidQueryField = await request(app).get(
      '/api/commissions?extra=true',
    );
    expect(invalidQueryField.status).toBe(400);
    expect(invalidQueryField.body.error).toBe(
      'COMMISSION_INVALID_QUERY_FIELDS',
    );

    const invalidStatus = await request(app).get(
      '/api/commissions?status=invalid',
    );
    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.error).toBe('INVALID_COMMISSION_STATUS');

    const invalidForAgents = await request(app).get(
      '/api/commissions?forAgents=maybe',
    );
    expect(invalidForAgents.status).toBe(400);
    expect(invalidForAgents.body.error).toBe('INVALID_FOR_AGENTS_FLAG');
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

    const detailSpy = jest
      .spyOn(CommissionServiceImpl.prototype, 'getCommissionById')
      .mockRejectedValueOnce(new Error('detail fail'));
    const detailRes = await request(app).get(
      '/api/commissions/00000000-0000-0000-0000-000000000011',
    );
    expect(detailRes.status).toBe(500);
    detailSpy.mockRestore();

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
      .post(
        '/api/commissions/00000000-0000-0000-0000-000000000003/select-winner',
      )
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
      eventType: 'payment',
    });
    expect(webhookRes.status).toBe(500);
    webhookSpy.mockRestore();
  });

  test('studios routes propagate handler errors', async () => {
    const { agentId, apiKey } = await registerAgent('Studios Error Agent');

    const studioGetSpy = jest.spyOn(db, 'query') as unknown as jest.Mock;
    studioGetSpy.mockRejectedValueOnce(new Error('studio get fail'));
    const getRes = await request(app).get(
      '/api/studios/00000000-0000-0000-0000-000000000008',
    );
    expect(getRes.status).toBe(500);
    studioGetSpy.mockRestore();

    const authSpy = jest
      .spyOn(AuthServiceImpl.prototype, 'validateAgentApiKey')
      .mockResolvedValueOnce(true);
    const studioPutSpy = jest.spyOn(db, 'query') as unknown as jest.Mock;
    studioPutSpy
      .mockResolvedValueOnce({ rows: [{ trust_tier: 1 }] } as any)
      .mockRejectedValueOnce(new Error('studio put fail'));
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
    const metricsRes = await request(app).get(
      `/api/studios/${agentId}/metrics`,
    );
    expect(metricsRes.status).toBe(500);
    metricsSpy.mockRestore();

    const ledgerSpy = jest.spyOn(db, 'query') as unknown as jest.Mock;
    ledgerSpy.mockRejectedValueOnce(new Error('ledger fail'));
    const ledgerRes = await request(app).get(`/api/studios/${agentId}/ledger`);
    expect(ledgerRes.status).toBe(500);
    ledgerSpy.mockRestore();
  });

  test('auth routes propagate handler errors', async () => {
    const { agentId, apiKey } = await registerAgent('Auth Error Agent');

    const registerSpy = jest
      .spyOn(AuthServiceImpl.prototype, 'registerHuman')
      .mockRejectedValueOnce(new Error('register fail'));
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'auth-fail@example.com',
        password: 'password123',
        consent: { termsAccepted: true, privacyAccepted: true },
      });
    expect(registerRes.status).toBe(500);
    registerSpy.mockRestore();

    const loginSpy = jest
      .spyOn(AuthServiceImpl.prototype, 'loginHuman')
      .mockRejectedValueOnce(new Error('login fail'));
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'auth-fail@example.com',
      password: 'password123',
    });
    expect(loginRes.status).toBe(500);
    loginSpy.mockRestore();

    const agentSpy = jest
      .spyOn(AuthServiceImpl.prototype, 'registerAgent')
      .mockRejectedValueOnce(new Error('agent register fail'));
    const agentRes = await request(app).post('/api/agents/register').send({
      studioName: 'Agent Fail Studio',
      personality: 'Tester',
    });
    expect(agentRes.status).toBe(500);
    agentSpy.mockRestore();

    const rotateSpy = jest
      .spyOn(AuthServiceImpl.prototype, 'rotateAgentApiKey')
      .mockRejectedValueOnce(new Error('rotate fail'));
    const rotateRes = await request(app)
      .post('/api/agents/rotate-key')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(rotateRes.status).toBe(500);
    rotateSpy.mockRestore();
  });

  test('draft routes propagate handler errors', async () => {
    const { agentId, apiKey } = await registerAgent('Drafts Error Agent');
    const draftId = '00000000-0000-0000-0000-000000000011';
    const prId = '00000000-0000-0000-0000-000000000012';

    const createSpy = jest
      .spyOn(PostServiceImpl.prototype, 'createDraft')
      .mockRejectedValueOnce(new Error('create draft fail'));
    const createRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/error.png',
        thumbnailUrl: 'https://example.com/error-thumb.png',
      });
    expect(createRes.status).toBe(500);
    createSpy.mockRestore();

    const listSpy = jest
      .spyOn(PostServiceImpl.prototype, 'listDrafts')
      .mockRejectedValueOnce(new Error('list drafts fail'));
    const listRes = await request(app).get('/api/drafts?limit=1');
    expect(listRes.status).toBe(500);
    listSpy.mockRestore();

    const getSpy = jest
      .spyOn(PostServiceImpl.prototype, 'getDraftWithVersions')
      .mockRejectedValueOnce(new Error('get draft fail'));
    const getRes = await request(app).get(`/api/drafts/${draftId}`);
    expect(getRes.status).toBe(500);
    getSpy.mockRestore();

    const releaseSpy = jest
      .spyOn(PostServiceImpl.prototype, 'getDraft')
      .mockRejectedValueOnce(new Error('release fail'));
    const releaseRes = await request(app)
      .post(`/api/drafts/${draftId}/release`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(releaseRes.status).toBe(500);
    releaseSpy.mockRestore();

    const fixBudgetSpy = jest
      .spyOn(BudgetServiceImpl.prototype, 'checkEditBudget')
      .mockRejectedValueOnce(new Error('fix budget fail'));
    const fixRes = await request(app)
      .post(`/api/drafts/${draftId}/fix-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ category: 'Focus', description: 'fail' });
    expect(fixRes.status).toBe(500);
    fixBudgetSpy.mockRestore();

    const fixListSpy = jest
      .spyOn(FixRequestServiceImpl.prototype, 'listByDraft')
      .mockRejectedValueOnce(new Error('fix list fail'));
    const fixListRes = await request(app).get(
      `/api/drafts/${draftId}/fix-requests`,
    );
    expect(fixListRes.status).toBe(500);
    fixListSpy.mockRestore();

    const prBudgetSpy = jest
      .spyOn(BudgetServiceImpl.prototype, 'checkEditBudget')
      .mockRejectedValueOnce(new Error('pr budget fail'));
    const prRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'fail',
        severity: 'minor',
        imageUrl: 'https://example.com/pr.png',
        thumbnailUrl: 'https://example.com/pr-thumb.png',
      });
    expect(prRes.status).toBe(500);
    prBudgetSpy.mockRestore();

    const prListSpy = jest
      .spyOn(PullRequestServiceImpl.prototype, 'listByDraft')
      .mockRejectedValueOnce(new Error('pr list fail'));
    const prListRes = await request(app).get(
      `/api/drafts/${draftId}/pull-requests`,
    );
    expect(prListRes.status).toBe(500);
    prListSpy.mockRestore();

    const decideSpy = jest
      .spyOn(PullRequestServiceImpl.prototype, 'decidePullRequest')
      .mockRejectedValueOnce(new Error('decide fail'));
    const decideRes = await request(app)
      .post(`/api/pull-requests/${prId}/decide`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({ decision: 'merge' });
    expect(decideRes.status).toBe(500);
    decideSpy.mockRestore();

    const forkSpy = jest
      .spyOn(PullRequestServiceImpl.prototype, 'createForkFromRejected')
      .mockRejectedValueOnce(new Error('fork fail'));
    const forkRes = await request(app)
      .post(`/api/pull-requests/${prId}/fork`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send();
    expect(forkRes.status).toBe(500);
    forkSpy.mockRestore();
  });

  test('feed, search, and privacy routes propagate handler errors', async () => {
    const human = await registerHuman('feed-error@example.com');
    const token = human.tokens.accessToken;

    const forYouSpy = jest
      .spyOn(FeedServiceImpl.prototype, 'getForYou')
      .mockRejectedValueOnce(new Error('for you fail'));
    const forYouRes = await request(app)
      .get('/api/feeds/for-you?limit=1')
      .set('Authorization', `Bearer ${token}`);
    expect(forYouRes.status).toBe(500);
    forYouSpy.mockRestore();

    const liveSpy = jest
      .spyOn(FeedServiceImpl.prototype, 'getLiveDrafts')
      .mockRejectedValueOnce(new Error('live fail'));
    const liveRes = await request(app).get('/api/feeds/live-drafts?limit=1');
    expect(liveRes.status).toBe(500);
    liveSpy.mockRestore();

    const glowSpy = jest
      .spyOn(FeedServiceImpl.prototype, 'getGlowUps')
      .mockRejectedValueOnce(new Error('glow fail'));
    const glowRes = await request(app).get('/api/feeds/glowups?limit=1');
    expect(glowRes.status).toBe(500);
    glowSpy.mockRestore();

    const studiosSpy = jest
      .spyOn(FeedServiceImpl.prototype, 'getStudios')
      .mockRejectedValueOnce(new Error('studios feed fail'));
    const studiosRes = await request(app).get('/api/feeds/studios?limit=1');
    expect(studiosRes.status).toBe(500);
    studiosSpy.mockRestore();

    const battlesSpy = jest
      .spyOn(FeedServiceImpl.prototype, 'getBattles')
      .mockRejectedValueOnce(new Error('battles fail'));
    const battlesRes = await request(app).get('/api/feeds/battles?limit=1');
    expect(battlesRes.status).toBe(500);
    battlesSpy.mockRestore();

    const archiveSpy = jest
      .spyOn(FeedServiceImpl.prototype, 'getArchive')
      .mockRejectedValueOnce(new Error('archive fail'));
    const archiveRes = await request(app).get('/api/feeds/archive?limit=1');
    expect(archiveRes.status).toBe(500);
    archiveSpy.mockRestore();

    const searchSpy = jest
      .spyOn(SearchServiceImpl.prototype, 'search')
      .mockRejectedValueOnce(new Error('search fail'));
    const searchRes = await request(app).get('/api/search?q=fail');
    expect(searchRes.status).toBe(500);
    searchSpy.mockRestore();

    const exportSpy = jest
      .spyOn(PrivacyServiceImpl.prototype, 'requestExport')
      .mockRejectedValueOnce(new Error('export fail'));
    const exportRes = await request(app)
      .post('/api/account/export')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(exportRes.status).toBe(500);
    exportSpy.mockRestore();

    const exportStatusSpy = jest
      .spyOn(PrivacyServiceImpl.prototype, 'getExportStatus')
      .mockRejectedValueOnce(new Error('export status fail'));
    const exportStatusRes = await request(app)
      .get('/api/account/exports/00000000-0000-0000-0000-000000000013')
      .set('Authorization', `Bearer ${token}`);
    expect(exportStatusRes.status).toBe(500);
    exportStatusSpy.mockRestore();

    const deleteSpy = jest
      .spyOn(PrivacyServiceImpl.prototype, 'requestDeletion')
      .mockRejectedValueOnce(new Error('delete fail'));
    const deleteRes = await request(app)
      .post('/api/account/delete')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(deleteRes.status).toBe(500);
    deleteSpy.mockRestore();
  });

  test('cors allows frontend origin', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', env.FRONTEND_URL);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      env.FRONTEND_URL,
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('auth endpoints enforce rate limiting', async () => {
    await registerHuman('ratelimit@example.com');

    let hitLimit = false;

    for (let i = 0; i < 65; i += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .set('x-enforce-rate-limit', 'true')
        .send({
          email: 'ratelimit@example.com',
          password: 'password123',
        });

      if (response.status === 429) {
        hitLimit = true;
        break;
      }

      expect(response.status).toBe(200);
    }

    expect(hitLimit).toBe(true);
  }, 30_000);

  test('compute-heavy endpoints enforce rate limiting', async () => {
    const { agentId, apiKey } = await registerAgent('Heavy Rate Studio');
    const headers = {
      'x-agent-id': agentId,
      'x-api-key': apiKey,
      'x-enforce-rate-limit': 'true',
      'x-rate-limit-override': '1',
    };

    const first = await request(app).post('/api/drafts').set(headers).send({
      imageUrl: 'https://example.com/heavy-v1.png',
      thumbnailUrl: 'https://example.com/heavy-thumb.png',
    });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/drafts').set(headers).send({
      imageUrl: 'https://example.com/heavy-v2.png',
      thumbnailUrl: 'https://example.com/heavy-thumb-2.png',
    });
    expect(second.status).toBe(429);
  });

  test('observer engagement endpoints enforce rate limiting', async () => {
    const { agentId, apiKey } = await registerAgent('Observer Rate Studio');
    const humanFollow = await registerHuman(
      'observer-follow-limit@example.com',
    );
    const followHeaders = {
      Authorization: `Bearer ${humanFollow.tokens.accessToken}`,
      'x-enforce-rate-limit': 'true',
      'x-rate-limit-override': '1',
    };

    const followFirst = await request(app)
      .post(`/api/studios/${agentId}/follow`)
      .set(followHeaders)
      .send();
    expect(followFirst.status).toBe(201);

    const followSecond = await request(app)
      .post(`/api/studios/${agentId}/follow`)
      .set(followHeaders)
      .send();
    expect(followSecond.status).toBe(429);

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/observer-limit-v1.png',
        thumbnailUrl: 'https://example.com/observer-limit-v1-thumb.png',
      });
    expect(draftRes.status).toBe(200);

    const draftId = draftRes.body.draft.id as string;
    const prRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Pending PR for observer rate limit',
        severity: 'minor',
        imageUrl: 'https://example.com/observer-limit-v2.png',
        thumbnailUrl: 'https://example.com/observer-limit-v2-thumb.png',
      });
    expect(prRes.status).toBe(200);

    const humanPredict = await registerHuman(
      'observer-predict-limit@example.com',
    );
    const predictHeaders = {
      Authorization: `Bearer ${humanPredict.tokens.accessToken}`,
      'x-enforce-rate-limit': 'true',
      'x-rate-limit-override': '1',
    };

    const predictFirst = await request(app)
      .post(`/api/drafts/${draftId}/predict`)
      .set(predictHeaders)
      .send({ predictedOutcome: 'merge', stakePoints: 12 });
    expect(predictFirst.status).toBe(200);

    const predictSecond = await request(app)
      .post(`/api/drafts/${draftId}/predict`)
      .set(predictHeaders)
      .send({ predictedOutcome: 'reject', stakePoints: 12 });
    expect(predictSecond.status).toBe(429);
  });

  test('prediction, personas, and observer write endpoints enforce observer-action throttling', async () => {
    const { agentId, apiKey } = await registerAgent(
      'Observer Action Throttle Studio',
    );
    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/throttle-v1.png',
        thumbnailUrl: 'https://example.com/throttle-v1-thumb.png',
      });
    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id as string;

    const prRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Throttle pending PR',
        severity: 'minor',
        imageUrl: 'https://example.com/throttle-v2.png',
        thumbnailUrl: 'https://example.com/throttle-v2-thumb.png',
      });
    expect(prRes.status).toBe(200);
    const pullRequestId = prRes.body.id as string;

    const human = await registerHuman('observer-pr-throttle@example.com');
    const predictHeaders = {
      Authorization: `Bearer ${human.tokens.accessToken}`,
      'x-enforce-rate-limit': 'true',
      'x-rate-limit-override': '1',
    };

    const prPredictFirst = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set(predictHeaders)
      .send({ predictedOutcome: 'merge', stakePoints: 10 });
    expect(prPredictFirst.status).toBe(200);

    const prPredictSecond = await request(app)
      .post(`/api/pull-requests/${pullRequestId}/predict`)
      .set(predictHeaders)
      .send({ predictedOutcome: 'reject', stakePoints: 10 });
    expect(prPredictSecond.status).toBe(429);

    const summaryHuman = await registerHuman(
      'observer-prediction-summary-throttle@example.com',
    );
    const summaryHeaders = {
      Authorization: `Bearer ${summaryHuman.tokens.accessToken}`,
      'x-enforce-rate-limit': 'true',
      'x-rate-limit-override': '1',
    };

    const predictionSummaryFirst = await request(app)
      .get(`/api/pull-requests/${pullRequestId}/predictions`)
      .set(summaryHeaders);
    expect(predictionSummaryFirst.status).toBe(200);

    const predictionSummarySecond = await request(app)
      .get(`/api/pull-requests/${pullRequestId}/predictions`)
      .set(summaryHeaders);
    expect(predictionSummarySecond.status).toBe(429);

    const personasHeaders = {
      'x-agent-id': agentId,
      'x-api-key': apiKey,
      'x-enforce-rate-limit': 'true',
      'x-rate-limit-override': '1',
    };

    const personasFirst = await request(app)
      .put(`/api/studios/${agentId}/personas`)
      .set(personasHeaders)
      .send({
        rolePersonas: {
          author: {
            tone: 'Precise and calm',
            focus: ['clarity'],
          },
        },
      });
    expect(personasFirst.status).toBe(200);

    const personasSecond = await request(app)
      .put(`/api/studios/${agentId}/personas`)
      .set(personasHeaders)
      .send({
        rolePersonas: {
          author: {
            tone: 'Still precise',
            focus: ['clarity'],
          },
        },
      });
    expect(personasSecond.status).toBe(429);

    const watchlistHuman = await registerHuman(
      'observer-watchlist-throttle@example.com',
    );
    const watchlistHeaders = {
      Authorization: `Bearer ${watchlistHuman.tokens.accessToken}`,
      'x-enforce-rate-limit': 'true',
      'x-rate-limit-override': '1',
    };

    const watchlistFirst = await request(app)
      .post(`/api/observers/watchlist/${draftId}`)
      .set(watchlistHeaders)
      .send();
    expect(watchlistFirst.status).toBe(201);

    const watchlistSecond = await request(app)
      .post(`/api/observers/watchlist/${draftId}`)
      .set(watchlistHeaders)
      .send();
    expect(watchlistSecond.status).toBe(429);

    const preferencesHuman = await registerHuman(
      'observer-preferences-throttle@example.com',
    );
    const preferencesHeaders = {
      Authorization: `Bearer ${preferencesHuman.tokens.accessToken}`,
      'x-enforce-rate-limit': 'true',
      'x-rate-limit-override': '1',
    };

    const preferencesFirst = await request(app)
      .put('/api/observers/me/preferences')
      .set(preferencesHeaders)
      .send({
        digest: {
          unseenOnly: true,
        },
      });
    expect(preferencesFirst.status).toBe(200);

    const preferencesSecond = await request(app)
      .put('/api/observers/me/preferences')
      .set(preferencesHeaders)
      .send({
        digest: {
          unseenOnly: false,
        },
      });
    expect(preferencesSecond.status).toBe(429);
  });
});
