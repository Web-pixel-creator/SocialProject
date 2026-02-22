import request from 'supertest';
import { env } from '../config/env';
import { db } from '../db/pool';
import { redis } from '../redis/client';
import { createApp, initInfra } from '../server';
import {
  BudgetServiceImpl,
  getUtcDateKey,
} from '../services/budget/budgetService';
import { PostServiceImpl } from '../services/post/postService';

env.ADMIN_API_TOKEN = env.ADMIN_API_TOKEN || 'test-admin-token';

const app = createApp();

const resetDb = async () => {
  await db.query(
    'TRUNCATE TABLE agent_gateway_events RESTART IDENTITY CASCADE',
  );
  await db.query(
    'TRUNCATE TABLE agent_gateway_sessions RESTART IDENTITY CASCADE',
  );
  await db.query('TRUNCATE TABLE draft_embeddings RESTART IDENTITY CASCADE');
  await db.query('DELETE FROM embedding_events');
  await db.query('TRUNCATE TABLE ux_events RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE job_runs RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE error_events RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE versions RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE drafts RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE agents RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
};

const registerAgent = async (studioName = 'Admin Test Studio') => {
  const response = await request(app).post('/api/agents/register').send({
    studioName,
    personality: 'Tester',
  });
  const { agentId, apiKey } = response.body;
  await db.query('UPDATE agents SET trust_tier = 1 WHERE id = $1', [agentId]);
  return { agentId, apiKey };
};

describe('Admin API routes', () => {
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

  test('rejects missing or invalid admin token', async () => {
    const missing = await request(app).get('/api/admin/system/metrics');
    expect(missing.status).toBe(403);

    const invalid = await request(app)
      .get('/api/admin/system/metrics')
      .set('x-admin-token', 'nope');
    expect(invalid.status).toBe(403);
  });

  test('system metrics returns health snapshot', async () => {
    const response = await request(app)
      .get('/api/admin/system/metrics')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('uptimeSeconds');
    expect(response.body).toHaveProperty('nodeVersion');
    expect(response.body).toHaveProperty('db');
    expect(response.body).toHaveProperty('redis');
    expect(response.body).toHaveProperty('memory');
  });

  test('ai runtime profiles endpoint returns configured role chains', async () => {
    const response = await request(app)
      .get('/api/admin/ai-runtime/profiles')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.profiles)).toBe(true);
    expect(response.body.profiles.length).toBeGreaterThan(0);
    const criticProfile = response.body.profiles.find(
      (profile: { role: string }) => profile.role === 'critic',
    );
    expect(criticProfile).toBeTruthy();
    expect(Array.isArray(criticProfile.providers)).toBe(true);
    expect(criticProfile.providers.length).toBeGreaterThan(1);
    expect(Array.isArray(response.body.providers)).toBe(true);
  });

  test('ai runtime health endpoint returns snapshot with cooldown state', async () => {
    const dryRunFailure = await request(app)
      .post('/api/admin/ai-runtime/dry-run')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        role: 'author',
        prompt: 'Force cooldown on primary provider',
        providersOverride: ['gpt-4.1'],
        simulateFailures: ['gpt-4.1'],
      });

    expect(dryRunFailure.status).toBe(200);
    expect(dryRunFailure.body.result.failed).toBe(true);

    const response = await request(app)
      .get('/api/admin/ai-runtime/health')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(typeof response.body.generatedAt).toBe('string');
    expect(Array.isArray(response.body.roleStates)).toBe(true);
    expect(Array.isArray(response.body.providers)).toBe(true);
    expect(response.body.summary).toMatchObject({
      health: expect.any(String),
      providerCount: expect.any(Number),
      providersCoolingDown: expect.any(Number),
      providersReady: expect.any(Number),
      roleCount: expect.any(Number),
      rolesBlocked: expect.any(Number),
    });

    const gptProvider = response.body.providers.find(
      (provider: { provider: string }) => provider.provider === 'gpt-4.1',
    );
    expect(gptProvider).toBeTruthy();
    expect(gptProvider.coolingDown).toBe(true);
    expect(typeof gptProvider.cooldownUntil).toBe('string');
  });

  test('ai runtime dry-run applies failover chain', async () => {
    const response = await request(app)
      .post('/api/admin/ai-runtime/dry-run')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        role: 'critic',
        prompt: 'Review draft coherence and suggest next action',
        providersOverride: ['claude-4', 'gemini-2'],
        simulateFailures: ['claude-4'],
      });

    expect(response.status).toBe(200);
    expect(response.body.result.failed).toBe(false);
    expect(response.body.result.selectedProvider).toBe('gemini-2');
    expect(response.body.result.attempts[0]).toMatchObject({
      provider: 'claude-4',
      status: 'failed',
      errorCode: 'AI_PROVIDER_UNAVAILABLE',
    });
    expect(response.body.result.attempts[1]).toMatchObject({
      provider: 'gemini-2',
      status: 'success',
      errorCode: null,
    });
  });

  test('ai runtime dry-run rejects unsupported fields and invalid payload values', async () => {
    const unknownFieldRes = await request(app)
      .post('/api/admin/ai-runtime/dry-run')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        role: 'critic',
        prompt: 'Validate runtime payload',
        extra: 'unsupported',
      });

    expect(unknownFieldRes.status).toBe(400);
    expect(unknownFieldRes.body.error).toBe(
      'AI_RUNTIME_DRY_RUN_INVALID_FIELDS',
    );

    const invalidProvidersRes = await request(app)
      .post('/api/admin/ai-runtime/dry-run')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        role: 'critic',
        prompt: 'Validate providersOverride',
        providersOverride: 'gpt-4.1',
      });

    expect(invalidProvidersRes.status).toBe(400);
    expect(invalidProvidersRes.body.error).toBe('AI_RUNTIME_INVALID_INPUT');

    const invalidTimeoutRes = await request(app)
      .post('/api/admin/ai-runtime/dry-run')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        role: 'critic',
        prompt: 'Validate timeout',
        timeoutMs: 999_999,
      });

    expect(invalidTimeoutRes.status).toBe(400);
    expect(invalidTimeoutRes.body.error).toBe('AI_RUNTIME_INVALID_TIMEOUT');
  });

  test('agent gateway orchestration endpoint is guarded by feature flag', async () => {
    const previous = env.AGENT_ORCHESTRATION_ENABLED;
    env.AGENT_ORCHESTRATION_ENABLED = 'false';
    try {
      const response = await request(app)
        .post('/api/admin/agent-gateway/orchestrate')
        .set('x-admin-token', env.ADMIN_API_TOKEN)
        .send({
          draftId: '00000000-0000-0000-0000-000000000000',
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('AGENT_ORCHESTRATION_DISABLED');
    } finally {
      env.AGENT_ORCHESTRATION_ENABLED = previous;
    }
  });

  test('agent gateway orchestration endpoint runs critic-maker-judge cycle', async () => {
    const { agentId } = await registerAgent('Orchestration Persona Studio');
    await db.query(
      `UPDATE agents
       SET personality = $2,
           style_tags = $3::jsonb,
           skill_profile = $4::jsonb
       WHERE id = $1`,
      [
        agentId,
        'Bold cinematic neon storytelling',
        '["neon","cinematic"]',
        JSON.stringify({
          tone: 'cinematic',
          forbiddenTerms: ['flat', 'generic'],
          preferredPatterns: ['strong contrast', 'depth layering'],
        }),
      ],
    );
    const postService = new PostServiceImpl(db);
    const createdDraft = await postService.createDraft({
      authorId: agentId,
      imageUrl: 'https://example.com/orchestration-v1.png',
      thumbnailUrl: 'https://example.com/orchestration-v1-thumb.png',
      metadata: { title: 'Orchestration Draft' },
    });

    const response = await request(app)
      .post('/api/admin/agent-gateway/orchestrate')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        draftId: createdDraft.draft.id,
        promptSeed: 'Focus on narrative coherence and style consistency.',
        metadata: { source: 'integration-test' },
      });

    expect(response.status).toBe(201);
    expect(response.body.completed).toBe(true);
    expect(response.body.steps).toHaveLength(3);
    expect(
      response.body.steps.map((step: { role: string }) => step.role),
    ).toEqual(['critic', 'maker', 'judge']);
    expect(response.body.studioContext).toMatchObject({
      studioId: agentId,
      studioName: 'Orchestration Persona Studio',
      personality: 'Bold cinematic neon storytelling',
      styleTags: ['neon', 'cinematic'],
      skillProfile: {
        tone: 'cinematic',
        forbiddenTerms: ['flat', 'generic'],
        preferredPatterns: ['strong contrast', 'depth layering'],
      },
    });
    expect(String(response.body.steps[0]?.prompt ?? '')).toContain(
      'Bold cinematic neon storytelling',
    );
    expect(String(response.body.steps[0]?.prompt ?? '')).toContain(
      'Studio style tags: neon, cinematic.',
    );
    expect(String(response.body.steps[0]?.prompt ?? '')).toContain(
      'Skill profile tone: cinematic.',
    );
    expect(String(response.body.steps[0]?.prompt ?? '')).toContain(
      'Skill forbidden terms: flat, generic.',
    );

    const sessionId = response.body.sessionId as string;
    expect(typeof sessionId).toBe('string');

    const detail = await request(app)
      .get(`/api/admin/agent-gateway/sessions/${sessionId}`)
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(detail.status).toBe(200);
    expect(detail.body.session.status).toBe('closed');
    expect(Array.isArray(detail.body.events)).toBe(true);
    expect(
      detail.body.events.some(
        (event: { type: string }) => event.type === 'draft_cycle_completed',
      ),
    ).toBe(true);
  });

  test('agent gateway orchestration broadcasts step/completed events to session, post, and feed scopes', async () => {
    const mockRealtime = {
      broadcast: jest.fn(),
      getEvents: jest.fn(() => []),
      getResyncPayload: jest.fn(() => ({
        events: [],
        latestSequence: 0,
        oldestSequence: null,
        resyncRequired: false,
      })),
    };
    app.set('realtime', mockRealtime);

    const { agentId } = await registerAgent('Orchestration Broadcast Studio');
    const postService = new PostServiceImpl(db);
    const createdDraft = await postService.createDraft({
      authorId: agentId,
      imageUrl: 'https://example.com/orchestration-broadcast-v1.png',
      thumbnailUrl: 'https://example.com/orchestration-broadcast-v1-thumb.png',
      metadata: { title: 'Orchestration Broadcast Draft' },
    });

    const response = await request(app)
      .post('/api/admin/agent-gateway/orchestrate')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        draftId: createdDraft.draft.id,
      });

    expect(response.status).toBe(201);

    const sessionId = response.body.sessionId as string;
    const draftId = response.body.draftId as string;
    const broadcastCalls = mockRealtime.broadcast.mock.calls as [
      string,
      string,
      Record<string, unknown>,
    ][];

    expect(
      broadcastCalls.some(
        (call) =>
          call[0] === `session:${sessionId}` &&
          call[1] === 'agent_gateway_orchestration_step',
      ),
    ).toBe(true);
    expect(
      broadcastCalls.some(
        (call) =>
          call[0] === `post:${draftId}` &&
          call[1] === 'agent_gateway_orchestration_step',
      ),
    ).toBe(true);
    expect(
      broadcastCalls.some(
        (call) =>
          call[0] === 'feed:live' &&
          call[1] === 'agent_gateway_orchestration_step',
      ),
    ).toBe(true);

    expect(
      broadcastCalls.some(
        (call) =>
          call[0] === `session:${sessionId}` &&
          call[1] === 'agent_gateway_orchestration_completed',
      ),
    ).toBe(true);
    expect(
      broadcastCalls.some(
        (call) =>
          call[0] === `post:${draftId}` &&
          call[1] === 'agent_gateway_orchestration_completed',
      ),
    ).toBe(true);
    expect(
      broadcastCalls.some(
        (call) =>
          call[0] === 'feed:live' &&
          call[1] === 'agent_gateway_orchestration_completed',
      ),
    ).toBe(true);

    app.set('realtime', undefined);
  });

  test('agent gateway admin endpoints support session lifecycle', async () => {
    const created = await request(app)
      .post('/api/admin/agent-gateway/sessions')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        channel: 'ws-control-plane',
        draftId: 'draft-sim-1',
        roles: ['critic', 'maker'],
        metadata: { source: 'integration-test' },
      });

    expect(created.status).toBe(201);
    expect(created.body.session.status).toBe('active');
    expect(created.body.session.channel).toBe('ws-control-plane');
    expect(created.body.session.roles).toEqual(['critic', 'maker']);

    const sessionId = created.body.session.id as string;

    const eventCreated = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'critic',
        toRole: 'maker',
        type: 'fix_request_created',
        payload: { severity: 'medium' },
      });

    expect(eventCreated.status).toBe(201);
    expect(eventCreated.body.event.sessionId).toBe(sessionId);
    expect(eventCreated.body.event.type).toBe('fix_request_created');

    const secondEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'maker',
        toRole: 'judge',
        type: 'pull_request_submitted',
        payload: { severity: 'major' },
      });

    expect(secondEvent.status).toBe(201);
    expect(secondEvent.body.event.type).toBe('pull_request_submitted');

    const detail = await request(app)
      .get(`/api/admin/agent-gateway/sessions/${sessionId}`)
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(detail.status).toBe(200);
    expect(detail.body.session.id).toBe(sessionId);
    expect(Array.isArray(detail.body.events)).toBe(true);
    expect(detail.body.events).toHaveLength(2);

    const latestEventsBeforeCompact = await request(app)
      .get(`/api/admin/agent-gateway/sessions/${sessionId}/events?limit=1`)
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(latestEventsBeforeCompact.status).toBe(200);
    expect(latestEventsBeforeCompact.body.source).toBe('db');
    expect(latestEventsBeforeCompact.body.total).toBe(2);
    expect(latestEventsBeforeCompact.body.events).toHaveLength(1);
    expect(latestEventsBeforeCompact.body.events[0].type).toBe(
      'pull_request_submitted',
    );

    const compacted = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/compact`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({ keepRecent: 1 });

    expect(compacted.status).toBe(200);
    expect(compacted.body.keepRecent).toBe(1);
    expect(compacted.body.prunedCount).toBe(1);
    expect(compacted.body.totalBefore).toBe(2);
    expect(compacted.body.totalAfter).toBe(2);
    expect(compacted.body.event.type).toBe('session_compacted');
    expect(compacted.body.eventTypeCounts.fix_request_created).toBe(1);

    const compactedDetail = await request(app)
      .get(`/api/admin/agent-gateway/sessions/${sessionId}`)
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(compactedDetail.status).toBe(200);
    expect(compactedDetail.body.events).toHaveLength(2);
    expect(
      compactedDetail.body.events.some(
        (event: { type: string }) => event.type === 'session_compacted',
      ),
    ).toBe(true);

    const latestEventsAfterCompact = await request(app)
      .get(`/api/admin/agent-gateway/sessions/${sessionId}/events?limit=2`)
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(latestEventsAfterCompact.status).toBe(200);
    expect(latestEventsAfterCompact.body.total).toBe(2);
    expect(latestEventsAfterCompact.body.events).toHaveLength(2);
    expect(latestEventsAfterCompact.body.events[0].type).toBe(
      'session_compacted',
    );

    const summary = await request(app)
      .get(`/api/admin/agent-gateway/sessions/${sessionId}/summary`)
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(summary.status).toBe(200);
    expect(summary.body.source).toBe('db');
    expect(summary.body.summary.session.id).toBe(sessionId);
    expect(summary.body.summary.totals.eventCount).toBe(2);
    expect(summary.body.summary.byType.pull_request_submitted).toBe(1);
    expect(summary.body.summary.byType.session_compacted).toBe(1);
    expect(summary.body.summary.byRole.system).toBe(1);
    expect(summary.body.summary.compaction.compactCount).toBe(1);
    expect(summary.body.summary.compaction.prunedCountTotal).toBe(1);
    expect(summary.body.summary.lastEvent.type).toBe('session_compacted');

    const statusBeforeClose = await request(app)
      .get(`/api/admin/agent-gateway/sessions/${sessionId}/status`)
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(statusBeforeClose.status).toBe(200);
    expect(statusBeforeClose.body.source).toBe('db');
    expect(statusBeforeClose.body.status.sessionId).toBe(sessionId);
    expect(statusBeforeClose.body.status.status).toBe('active');
    expect(statusBeforeClose.body.status.lastEventType).toBe(
      'session_compacted',
    );
    expect(statusBeforeClose.body.status.eventCount).toBe(2);
    expect(statusBeforeClose.body.status.health).toBe('ok');
    expect(statusBeforeClose.body.status.needsAttention).toBe(false);

    const closed = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/close`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send();

    expect(closed.status).toBe(200);
    expect(closed.body.session.status).toBe('closed');

    const statusAfterClose = await request(app)
      .get(`/api/admin/agent-gateway/sessions/${sessionId}/status`)
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(statusAfterClose.status).toBe(200);
    expect(statusAfterClose.body.status.status).toBe('closed');

    const appendAfterClose = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'maker',
        type: 'pull_request_submitted',
      });

    expect(appendAfterClose.status).toBe(409);
    expect(appendAfterClose.body.error).toBe('AGENT_GATEWAY_SESSION_CLOSED');
  });

  test('embedding backfill and metrics endpoints return data', async () => {
    const { agentId } = await registerAgent('Backfill Studio');
    const postService = new PostServiceImpl(db);

    await postService.createDraft({
      authorId: agentId,
      imageUrl: 'https://example.com/admin-v1.png',
      thumbnailUrl: 'https://example.com/admin-v1-thumb.png',
      metadata: { title: 'Admin Backfill' },
    });

    const backfill = await request(app)
      .post('/api/admin/embeddings/backfill?batchSize=10&maxBatches=1')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send();

    expect(backfill.status).toBe(200);
    expect(backfill.body).toHaveProperty('processed');
    expect(backfill.body.processed).toBeGreaterThan(0);

    const embeddingRows = await db.query(
      'SELECT COUNT(*)::int AS count FROM draft_embeddings',
    );
    expect(embeddingRows.rows[0].count).toBeGreaterThan(0);

    const metrics = await request(app)
      .get('/api/admin/embeddings/metrics?hours=24')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(metrics.status).toBe(200);
    expect(Array.isArray(metrics.body.rows)).toBe(true);
    expect(metrics.body.rows.length).toBeGreaterThan(0);
  });

  test('ux metrics endpoint returns aggregated events', async () => {
    await db.query(
      `INSERT INTO ux_events (event_type, user_type, timing_ms, metadata)
       VALUES ('feed_filter_change', 'anonymous', 120, '{}'),
              ('feed_load_timing', 'anonymous', 340, '{}')`,
    );

    const response = await request(app)
      .get('/api/admin/ux/metrics?hours=24')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.rows)).toBe(true);
    expect(response.body.rows.length).toBeGreaterThan(0);
  });

  test('similar search metrics endpoint aggregates by profile', async () => {
    await db.query(
      `INSERT INTO ux_events (event_type, user_type, metadata)
       VALUES ('similar_search_shown', 'anonymous', '{"profile":"balanced"}'),
              ('similar_search_clicked', 'anonymous', '{"profile":"balanced"}'),
              ('similar_search_empty', 'anonymous', '{"profile":"quality"}'),
              ('search_performed', 'anonymous', '{"profile":"quality","mode":"text"}'),
              ('search_performed', 'anonymous', '{"profile":"quality","mode":"text"}'),
              ('search_result_open', 'anonymous', '{"profile":"quality","mode":"text"}')`,
    );
    await db.query(
      `INSERT INTO ux_events (event_type, user_type, status, metadata)
       VALUES ('style_fusion_generate', 'anonymous', 'success', '{"sampleCount":3}'),
              ('style_fusion_generate', 'anonymous', 'success', '{"sampleCount":2}'),
              ('style_fusion_generate', 'anonymous', 'error', '{"errorCode":"STYLE_FUSION_NOT_ENOUGH_MATCHES"}')`,
    );

    const response = await request(app)
      .get('/api/admin/ux/similar-search?hours=24')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.rows)).toBe(true);
    expect(Array.isArray(response.body.profiles)).toBe(true);
    const balancedSimilar = response.body.profiles.find(
      (profile: any) =>
        profile.profile === 'balanced' && profile.mode === 'unknown',
    );
    const qualitySimilar = response.body.profiles.find(
      (profile: any) =>
        profile.profile === 'quality' && profile.mode === 'unknown',
    );
    const qualityText = response.body.profiles.find(
      (profile: any) =>
        profile.profile === 'quality' && profile.mode === 'text',
    );

    expect(balancedSimilar).toBeTruthy();
    expect(qualitySimilar).toBeTruthy();
    expect(qualityText).toBeTruthy();

    expect(balancedSimilar.shown).toBeGreaterThanOrEqual(1);
    expect(balancedSimilar.clicked).toBeGreaterThanOrEqual(1);
    expect(qualitySimilar.empty).toBeGreaterThanOrEqual(1);

    expect(qualityText.performed).toBe(2);
    expect(qualityText.resultOpen).toBe(1);
    expect(qualityText.openRate).toBe(0.5);
    expect(response.body.styleFusion.total).toBe(3);
    expect(response.body.styleFusion.success).toBe(2);
    expect(response.body.styleFusion.errors).toBe(1);
    expect(response.body.styleFusion.successRate).toBe(0.667);
    expect(response.body.styleFusion.avgSampleCount).toBe(2.5);
    expect(response.body.styleFusion.errorBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          errorCode: 'STYLE_FUSION_NOT_ENOUGH_MATCHES',
          count: 1,
        }),
      ]),
    );
  });

  test('observer engagement metrics endpoint returns KPI aggregates and segments', async () => {
    const users = await db.query(
      `INSERT INTO users (
         email, password_hash, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at
       )
       VALUES
         ('observer-kpi-a@example.com', 'hash', 'v1', NOW(), 'v1', NOW()),
         ('observer-kpi-b@example.com', 'hash', 'v1', NOW(), 'v1', NOW())
       RETURNING id`,
    );
    const observerA = users.rows[0].id;
    const observerB = users.rows[1].id;

    await db.query(
      `INSERT INTO ux_events (event_type, user_type, user_id, status, metadata, created_at)
       VALUES
         ('draft_arc_view', 'observer', $1, 'draft', '{"mode":"hot_now","abVariant":"A"}', NOW() - INTERVAL '1 hour'),
         ('watchlist_follow', 'observer', $1, 'draft', '{"mode":"hot_now","abVariant":"A"}', NOW() - INTERVAL '50 minutes'),
         ('digest_open', 'observer', $1, 'draft', '{"mode":"digest","digestVariant":"daily"}', NOW() - INTERVAL '40 minutes'),
         ('hot_now_open', 'observer', $1, 'draft', '{"mode":"hot_now","rankingVariant":"rank_v1"}', NOW() - INTERVAL '35 minutes'),
         ('pr_prediction_submit', 'observer', $1, 'draft', '{"mode":"hot_now","abVariant":"A"}', NOW() - INTERVAL '20 minutes'),
         ('draft_multimodal_glowup_view', 'observer', $1, 'draft', '{"mode":"hot_now","provider":"gpt-4.1"}', NOW() - INTERVAL '19 minutes'),
         ('draft_arc_view', 'observer', $2, 'draft', '{"mode":"hot_now","abVariant":"B"}', NOW() - INTERVAL '10 minutes'),
         ('draft_multimodal_glowup_empty', 'observer', $2, 'draft', '{"mode":"hot_now","reason":"not_available"}', NOW() - INTERVAL '9 minutes'),
         ('draft_multimodal_glowup_error', 'observer', $2, 'draft', '{"mode":"hot_now","reason":"network"}', NOW() - INTERVAL '8 minutes'),
         ('draft_arc_view', 'observer', $1, 'draft', '{"mode":"hot_now","abVariant":"A"}', NOW() - INTERVAL '30 hours'),
         ('hot_now_open', 'observer', $1, 'draft', '{"mode":"hot_now","rankingVariant":"rank_v1"}', NOW() - INTERVAL '3 days')`,
      [observerA, observerB],
    );
    await db.query(
      `INSERT INTO ux_events (event_type, user_type, user_id, status, source, metadata, created_at)
       VALUES
         ('feed_view_mode_change', 'observer', $1, 'draft', 'header', '{"mode":"observer","previousMode":"focus"}', NOW() - INTERVAL '18 minutes'),
         ('feed_view_mode_change', 'observer', $1, 'draft', 'hint', '{"mode":"focus","previousMode":"observer"}', NOW() - INTERVAL '17 minutes'),
         ('feed_view_mode_change', 'observer', $2, 'draft', 'header', '{"mode":"focus","previousMode":"observer"}', NOW() - INTERVAL '16 minutes'),
         ('feed_view_mode_hint_dismiss', 'observer', $2, 'draft', 'web', '{"mode":"observer"}', NOW() - INTERVAL '15 minutes'),
         ('feed_density_change', 'observer', $1, 'draft', 'web', '{"density":"compact","previousDensity":"comfort"}', NOW() - INTERVAL '14 minutes'),
         ('feed_density_change', 'observer', $2, 'draft', 'web', '{"density":"comfort","previousDensity":"compact"}', NOW() - INTERVAL '13 minutes'),
         ('feed_density_change', 'observer', $2, 'draft', 'web', '{"density":"compact","previousDensity":"comfort"}', NOW() - INTERVAL '12 minutes')`,
      [observerA, observerB],
    );

    const response = await request(app)
      .get('/api/admin/ux/observer-engagement?hours=24')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(response.body.windowHours).toBe(24);
    expect(response.body.totals.observerUsers).toBe(2);
    expect(response.body.totals.draftArcViews).toBe(2);
    expect(response.body.totals.watchlistFollows).toBe(1);
    expect(response.body.totals.digestOpens).toBe(1);
    expect(response.body.kpis.followRate).toBe(0.5);
    expect(response.body.kpis.digestOpenRate).toBe(1);
    expect(response.body.kpis.return24h).toBe(0.5);
    expect(response.body.kpis.return7d).toBe(0.5);
    expect(response.body.kpis.viewModeObserverRate).toBe(0.333);
    expect(response.body.kpis.viewModeFocusRate).toBe(0.667);
    expect(response.body.kpis.densityComfortRate).toBe(0.333);
    expect(response.body.kpis.densityCompactRate).toBe(0.667);
    expect(response.body.kpis.hintDismissRate).toBe(0.5);
    expect(response.body.kpis.predictionParticipationRate).toBe(0);
    expect(response.body.kpis.predictionAccuracyRate).toBeNull();
    expect(response.body.kpis.predictionPoolPoints).toBe(0);
    expect(response.body.kpis.payoutToStakeRatio).toBeNull();
    expect(response.body.kpis.multimodalCoverageRate).toBe(0.5);
    expect(response.body.kpis.multimodalErrorRate).toBe(0.333);
    expect(typeof response.body.kpis.observerSessionTimeSec).toBe('number');
    expect(response.body.multimodal.views).toBe(1);
    expect(response.body.multimodal.emptyStates).toBe(1);
    expect(response.body.multimodal.errors).toBe(1);
    expect(response.body.multimodal.attempts).toBe(2);
    expect(response.body.multimodal.totalEvents).toBe(3);
    expect(response.body.multimodal.coverageRate).toBe(0.5);
    expect(response.body.multimodal.errorRate).toBe(0.333);
    expect(response.body.multimodal.providerBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'gpt-4.1', count: 1 }),
      ]),
    );
    expect(response.body.multimodal.emptyReasonBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'not_available', count: 1 }),
      ]),
    );
    expect(response.body.multimodal.errorReasonBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'network', count: 1 }),
      ]),
    );
    const multimodalHourlyTrend = Array.isArray(
      response.body.multimodal.hourlyTrend,
    )
      ? response.body.multimodal.hourlyTrend
      : [];
    expect(multimodalHourlyTrend.length).toBeGreaterThan(0);
    const hourlyTrendTotals = multimodalHourlyTrend.reduce(
      (
        acc: {
          emptyStates: number;
          errors: number;
          totalEvents: number;
          views: number;
        },
        bucket: any,
      ) => ({
        views: acc.views + Number(bucket?.views ?? 0),
        emptyStates: acc.emptyStates + Number(bucket?.emptyStates ?? 0),
        errors: acc.errors + Number(bucket?.errors ?? 0),
        totalEvents: acc.totalEvents + Number(bucket?.totalEvents ?? 0),
      }),
      { views: 0, emptyStates: 0, errors: 0, totalEvents: 0 },
    );
    expect(hourlyTrendTotals).toEqual({
      views: 1,
      emptyStates: 1,
      errors: 1,
      totalEvents: 3,
    });
    for (const bucket of multimodalHourlyTrend) {
      expect(typeof bucket.hour).toBe('string');
    }
    expect(Array.isArray(response.body.segments)).toBe(true);
    expect(Array.isArray(response.body.variants)).toBe(true);
    expect(response.body.predictionMarket.totals.predictions).toBe(0);
    expect(Array.isArray(response.body.predictionMarket.outcomes)).toBe(true);
    expect(Array.isArray(response.body.predictionMarket.hourlyTrend)).toBe(
      true,
    );
    expect(response.body.predictionMarket.hourlyTrend).toHaveLength(0);
    expect(response.body.feedPreferences.viewMode.observer).toBe(1);
    expect(response.body.feedPreferences.viewMode.focus).toBe(2);
    expect(response.body.feedPreferences.viewMode.total).toBe(3);
    expect(response.body.feedPreferences.density.comfort).toBe(1);
    expect(response.body.feedPreferences.density.compact).toBe(2);
    expect(response.body.feedPreferences.density.total).toBe(3);
    expect(response.body.feedPreferences.hint.dismissCount).toBe(1);
    expect(response.body.feedPreferences.hint.switchCount).toBe(1);
    expect(response.body.feedPreferences.hint.totalInteractions).toBe(2);
    expect(response.body.feedPreferences.hint.dismissRate).toBe(0.5);

    const hotNowSegment = response.body.segments.find(
      (segment: any) =>
        segment.mode === 'hot_now' &&
        segment.draftStatus === 'draft' &&
        segment.eventType === 'draft_arc_view',
    );
    expect(hotNowSegment).toBeTruthy();
    expect(hotNowSegment.count).toBe(2);

    const variantA = response.body.variants.find(
      (entry: any) =>
        entry.variant === 'A' && entry.eventType === 'draft_arc_view',
    );
    const variantB = response.body.variants.find(
      (entry: any) =>
        entry.variant === 'B' && entry.eventType === 'draft_arc_view',
    );
    expect(variantA).toBeTruthy();
    expect(variantB).toBeTruthy();
  });

  test('observer engagement metrics endpoint includes prediction hourly trend', async () => {
    const { agentId, apiKey } = await registerAgent(
      'Prediction Hourly Trend Studio',
    );

    const draftRes = await request(app)
      .post('/api/drafts')
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        imageUrl: 'https://example.com/prediction-hourly-v1.png',
        thumbnailUrl: 'https://example.com/prediction-hourly-v1-thumb.png',
      });
    expect(draftRes.status).toBe(200);
    const draftId = draftRes.body.draft.id as string;

    const pullRequestRes = await request(app)
      .post(`/api/drafts/${draftId}/pull-requests`)
      .set('x-agent-id', agentId)
      .set('x-api-key', apiKey)
      .send({
        description: 'Prediction trend PR',
        severity: 'minor',
        imageUrl: 'https://example.com/prediction-hourly-v2.png',
        thumbnailUrl: 'https://example.com/prediction-hourly-v2-thumb.png',
      });
    expect(pullRequestRes.status).toBe(200);
    const pullRequestId = pullRequestRes.body.id as string;

    const observers = await db.query(
      `INSERT INTO users (
         email, password_hash, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at
       )
       VALUES
         ('prediction-hourly-a@example.com', 'hash', 'v1', NOW(), 'v1', NOW()),
         ('prediction-hourly-b@example.com', 'hash', 'v1', NOW(), 'v1', NOW()),
         ('prediction-hourly-c@example.com', 'hash', 'v1', NOW(), 'v1', NOW())
       RETURNING id`,
    );
    const observerA = observers.rows[0].id;
    const observerB = observers.rows[1].id;
    const observerC = observers.rows[2].id;

    await db.query(
      `INSERT INTO observer_pr_predictions (
         observer_id,
         pull_request_id,
         predicted_outcome,
         stake_points,
         payout_points,
         resolved_outcome,
         is_correct,
         created_at,
         resolved_at
       )
       VALUES
         ($1, $4, 'merge', 40, 80, 'merge', true, NOW() - INTERVAL '70 minutes', NOW() - INTERVAL '65 minutes'),
         ($2, $4, 'reject', 20, 0, 'merge', false, NOW() - INTERVAL '66 minutes', NOW() - INTERVAL '60 minutes'),
         ($3, $4, 'merge', 30, 0, NULL, NULL, NOW() - INTERVAL '10 minutes', NULL)`,
      [observerA, observerB, observerC, pullRequestId],
    );

    const response = await request(app)
      .get('/api/admin/ux/observer-engagement?hours=24')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(response.body.predictionMarket.totals.predictions).toBe(3);
    expect(response.body.predictionMarket.totals.predictors).toBe(3);
    expect(response.body.predictionMarket.totals.markets).toBe(1);
    expect(response.body.predictionMarket.totals.stakePoints).toBe(90);
    expect(response.body.predictionMarket.totals.payoutPoints).toBe(80);
    expect(response.body.predictionMarket.totals.averageStakePoints).toBe(30);
    expect(response.body.predictionMarket.totals.resolvedPredictions).toBe(2);
    expect(response.body.predictionMarket.totals.correctPredictions).toBe(1);
    expect(response.body.kpis.predictionAccuracyRate).toBe(0.5);
    expect(response.body.kpis.payoutToStakeRatio).toBe(0.889);
    expect(response.body.predictionMarket.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          predictedOutcome: 'merge',
          predictions: 2,
          stakePoints: 70,
        }),
        expect.objectContaining({
          predictedOutcome: 'reject',
          predictions: 1,
          stakePoints: 20,
        }),
      ]),
    );

    const hourlyTrend = Array.isArray(
      response.body.predictionMarket.hourlyTrend,
    )
      ? response.body.predictionMarket.hourlyTrend
      : [];
    expect(hourlyTrend.length).toBeGreaterThan(0);
    const hourlyTotals = hourlyTrend.reduce(
      (
        acc: {
          correctPredictions: number;
          payoutPoints: number;
          predictions: number;
          resolvedPredictions: number;
          stakePoints: number;
        },
        bucket: any,
      ) => ({
        predictions: acc.predictions + Number(bucket?.predictions ?? 0),
        stakePoints: acc.stakePoints + Number(bucket?.stakePoints ?? 0),
        payoutPoints: acc.payoutPoints + Number(bucket?.payoutPoints ?? 0),
        resolvedPredictions:
          acc.resolvedPredictions + Number(bucket?.resolvedPredictions ?? 0),
        correctPredictions:
          acc.correctPredictions + Number(bucket?.correctPredictions ?? 0),
      }),
      {
        predictions: 0,
        stakePoints: 0,
        payoutPoints: 0,
        resolvedPredictions: 0,
        correctPredictions: 0,
      },
    );
    expect(hourlyTotals).toEqual({
      predictions: 3,
      stakePoints: 90,
      payoutPoints: 80,
      resolvedPredictions: 2,
      correctPredictions: 1,
    });
    for (const bucket of hourlyTrend) {
      expect(typeof bucket.hour).toBe('string');
    }
  });

  test('job metrics endpoint returns aggregated runs', async () => {
    await db.query(
      `INSERT INTO job_runs (job_name, status, started_at, finished_at, duration_ms, error_message, metadata)
       VALUES ('budgets_reset', 'success', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', 1200, NULL, '{}'),
              ('budgets_reset', 'failed', NOW() - INTERVAL '1 hours', NOW() - INTERVAL '1 hours', 900, 'failed', '{}'),
              ('embedding_backfill', 'success', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours', 2400, NULL, '{"processed":10}')`,
    );

    const response = await request(app)
      .get('/api/admin/jobs/metrics?hours=24')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.rows)).toBe(true);
    const budgets = response.body.rows.find(
      (row: any) => row.job_name === 'budgets_reset',
    );
    expect(budgets).toBeTruthy();
    expect(budgets.total_runs).toBe(2);
    expect(budgets.failure_count).toBe(1);
  });

  test('cleanup preview and run endpoints return counts', async () => {
    const { agentId } = await registerAgent('Cleanup Studio');
    const postService = new PostServiceImpl(db);

    const created = await postService.createDraft({
      authorId: agentId,
      imageUrl: 'https://example.com/cleanup-v1.png',
      thumbnailUrl: 'https://example.com/cleanup-v1-thumb.png',
    });

    const userRow = await db.query(
      'INSERT INTO users (email) VALUES ($1) RETURNING id',
      ['cleanup@example.com'],
    );
    const userId = userRow.rows[0].id;

    await db.query(
      `INSERT INTO viewing_history (user_id, draft_id, viewed_at)
       VALUES ($1, $2, NOW() - INTERVAL '200 days')`,
      [userId, created.draft.id],
    );

    const commissionRow = await db.query(
      `INSERT INTO commissions (user_id, description)
       VALUES ($1, 'cleanup test') RETURNING id`,
      [userId],
    );
    const commissionId = commissionRow.rows[0].id;

    await db.query(
      `INSERT INTO payment_events (provider, provider_event_id, commission_id, event_type, received_at)
       VALUES ('stripe', 'evt_cleanup', $1, 'payment', NOW() - INTERVAL '200 days')`,
      [commissionId],
    );

    await db.query(
      `INSERT INTO data_exports (user_id, status, export_url, expires_at, created_at)
       VALUES ($1, 'ready', 'https://example.com/exports/old.zip', NOW() - INTERVAL '200 days', NOW() - INTERVAL '200 days')`,
      [userId],
    );

    const preview = await request(app)
      .get('/api/admin/cleanup/preview')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(preview.status).toBe(200);
    expect(preview.body.counts.viewingHistory).toBeGreaterThanOrEqual(1);
    expect(preview.body.counts.paymentEvents).toBeGreaterThanOrEqual(1);
    expect(preview.body.counts.dataExports).toBeGreaterThanOrEqual(1);

    const run = await request(app)
      .post('/api/admin/cleanup/run?confirm=true')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({});

    expect(run.status).toBe(200);
    expect(run.body.counts.viewingHistory).toBeGreaterThanOrEqual(1);
    expect(run.body.counts.paymentEvents).toBeGreaterThanOrEqual(1);
    expect(run.body.counts.dataExports).toBeGreaterThanOrEqual(1);

    const after = await request(app)
      .get('/api/admin/cleanup/preview')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(after.status).toBe(200);
    expect(after.body.counts.viewingHistory).toBe(0);
    expect(after.body.counts.paymentEvents).toBe(0);
    expect(after.body.counts.dataExports).toBe(0);
  });

  test('error metrics endpoint returns recorded errors', async () => {
    await db.query(
      `INSERT INTO error_events (error_code, message, status, route, method, user_type)
       VALUES ('VERSION_MEDIA_REQUIRED', 'Initial version image and thumbnail are required.', 400, '/api/drafts', 'POST', 'agent')`,
    );

    const response = await request(app)
      .get('/api/admin/errors/metrics?hours=24')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    const entry = response.body.rows.find(
      (row: any) => row.error_code === 'VERSION_MEDIA_REQUIRED',
    );
    expect(entry).toBeTruthy();
  });

  test('budget metrics and remaining endpoints return usage', async () => {
    const { agentId } = await registerAgent('Budget Admin Studio');
    const postService = new PostServiceImpl(db);
    const budgetService = new BudgetServiceImpl(redis);

    const created = await postService.createDraft({
      authorId: agentId,
      imageUrl: 'https://example.com/budget-v1.png',
      thumbnailUrl: 'https://example.com/budget-v1-thumb.png',
    });

    await budgetService.incrementActionBudget(agentId, 'fix_request');
    await budgetService.incrementEditBudget(created.draft.id, 'pr');

    const remaining = await request(app)
      .get(
        `/api/admin/budgets/remaining?agentId=${agentId}&draftId=${created.draft.id}`,
      )
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(remaining.status).toBe(200);
    expect(remaining.body.agent?.counts?.fix_request).toBe(1);
    expect(remaining.body.draft?.counts?.pr).toBe(1);

    const dateKey = getUtcDateKey(new Date());
    const metrics = await request(app)
      .get(`/api/admin/budgets/metrics?date=${dateKey}`)
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(metrics.status).toBe(200);
    expect(metrics.body.date).toBe(dateKey);
    expect(metrics.body.totals?.agent?.fix_request).toBeGreaterThanOrEqual(1);
    expect(metrics.body.totals?.draft?.pr).toBeGreaterThanOrEqual(1);
  });
});
