import request from 'supertest';
import { env } from '../config/env';
import { db } from '../db/pool';
import { redis } from '../redis/client';
import { createApp, initInfra } from '../server';
import { aiRuntimeService } from '../services/aiRuntime/aiRuntimeService';
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
  const TEST_DRAFT_ID_A = '00000000-0000-0000-0000-000000000001';
  const TEST_DRAFT_ID_B = '00000000-0000-0000-0000-000000000002';
  const TEST_DRAFT_ID_C = '00000000-0000-0000-0000-000000000003';
  beforeAll(async () => {
    await initInfra();
  });

  beforeEach(async () => {
    await resetDb();
    aiRuntimeService.resetProviderState();
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

  test('system metrics rejects unsupported query fields', async () => {
    const response = await request(app)
      .get('/api/admin/system/metrics?extra=true')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ADMIN_INVALID_QUERY');
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
    const runtimeFailure = await aiRuntimeService.runWithFailover({
      role: 'author',
      prompt: 'Force cooldown on primary provider',
      providersOverride: ['gpt-4.1'],
      simulateFailures: ['gpt-4.1'],
    });
    expect(runtimeFailure.failed).toBe(true);

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

  test('ai runtime read endpoints reject unsupported query fields', async () => {
    const invalidProfilesQuery = await request(app)
      .get('/api/admin/ai-runtime/profiles?extra=true')
      .set('x-admin-token', env.ADMIN_API_TOKEN);
    expect(invalidProfilesQuery.status).toBe(400);
    expect(invalidProfilesQuery.body.error).toBe('ADMIN_INVALID_QUERY');

    const invalidHealthQuery = await request(app)
      .get('/api/admin/ai-runtime/health?extra=true')
      .set('x-admin-token', env.ADMIN_API_TOKEN);
    expect(invalidHealthQuery.status).toBe(400);
    expect(invalidHealthQuery.body.error).toBe('ADMIN_INVALID_QUERY');
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
    const invalidDryRunQuery = await request(app)
      .post('/api/admin/ai-runtime/dry-run?extra=true')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        role: 'critic',
        prompt: 'Validate runtime payload',
      });

    expect(invalidDryRunQuery.status).toBe(400);
    expect(invalidDryRunQuery.body.error).toBe('ADMIN_INVALID_QUERY');

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

    const promptTooLongRes = await request(app)
      .post('/api/admin/ai-runtime/dry-run')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        role: 'critic',
        prompt: 'p'.repeat(4001),
      });

    expect(promptTooLongRes.status).toBe(400);
    expect(promptTooLongRes.body.error).toBe('AI_RUNTIME_INVALID_PROMPT');

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

    const invalidProviderIdentifierRes = await request(app)
      .post('/api/admin/ai-runtime/dry-run')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        role: 'critic',
        prompt: 'Validate providersOverride item identifier',
        providersOverride: ['invalid provider'],
      });

    expect(invalidProviderIdentifierRes.status).toBe(400);
    expect(invalidProviderIdentifierRes.body.error).toBe(
      'AI_RUNTIME_INVALID_INPUT',
    );

    const invalidSimulateFailureItemLengthRes = await request(app)
      .post('/api/admin/ai-runtime/dry-run')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        role: 'critic',
        prompt: 'Validate simulateFailures item length',
        simulateFailures: ['x'.repeat(65)],
      });

    expect(invalidSimulateFailureItemLengthRes.status).toBe(400);
    expect(invalidSimulateFailureItemLengthRes.body.error).toBe(
      'AI_RUNTIME_INVALID_INPUT',
    );

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

    const invalidBodyShapeRes = await request(app)
      .post('/api/admin/ai-runtime/dry-run')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send(['invalid-body-shape']);

    expect(invalidBodyShapeRes.status).toBe(400);
    expect(invalidBodyShapeRes.body.error).toBe('AI_RUNTIME_INVALID_INPUT');
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
          rolePersonas: {
            critic: {
              tone: 'brutally honest',
              signaturePhrase: 'No blur, no mercy',
              focus: ['composition', 'contrast'],
              boundaries: ['avoid generic clichés'],
            },
            maker: {
              tone: 'precise builder',
              signaturePhrase: 'Ship the patch clean',
              focus: ['lighting', 'detail retention'],
            },
            judge: {
              tone: 'strict reviewer',
              boundaries: ['reject unsupported claims'],
            },
          },
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
    expect(String(response.body.steps[0]?.prompt ?? '')).toContain(
      'Role persona (critic) tone: brutally honest.',
    );
    expect(String(response.body.steps[0]?.prompt ?? '')).toContain(
      'Role persona (critic) signature phrase: No blur, no mercy.',
    );
    expect(String(response.body.steps[0]?.prompt ?? '')).toContain(
      'Role persona (critic) focus: composition, contrast.',
    );
    expect(String(response.body.steps[1]?.prompt ?? '')).toContain(
      'Role persona (maker) signature phrase: Ship the patch clean.',
    );
    expect(String(response.body.steps[2]?.prompt ?? '')).toContain(
      'Role persona (judge) boundaries: reject unsupported claims.',
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
        draftId: TEST_DRAFT_ID_A,
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

  test('agent gateway telemetry endpoint returns aggregated session and attempt signals', async () => {
    const createFirst = await request(app)
      .post('/api/admin/agent-gateway/sessions')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        channel: 'ws-control-plane',
      });
    expect(createFirst.status).toBe(201);
    const firstSessionId = createFirst.body.session.id as string;

    const firstStepEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${firstSessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'critic',
        toRole: 'maker',
        type: 'draft_cycle_critic_completed',
        payload: {
          failed: false,
          selectedProvider: 'gpt-4.1',
          attempts: [{ status: 'failed' }, { status: 'success' }],
        },
      });
    expect(firstStepEvent.status).toBe(201);

    const firstCompactEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${firstSessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'system',
        type: 'session_compacted',
        payload: {
          prunedCount: 5,
        },
      });
    expect(firstCompactEvent.status).toBe(201);

    const closeFirst = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${firstSessionId}/close`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({});
    expect(closeFirst.status).toBe(200);

    const createSecond = await request(app)
      .post('/api/admin/agent-gateway/sessions')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        channel: 'ws-control-plane',
      });
    expect(createSecond.status).toBe(201);
    const secondSessionId = createSecond.body.session.id as string;

    const secondStepEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${secondSessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'maker',
        toRole: 'judge',
        type: 'draft_cycle_maker_completed',
        payload: {
          failed: true,
          selectedProvider: 'gemini-2',
          attempts: [{ status: 'skipped_cooldown' }],
        },
      });
    expect(secondStepEvent.status).toBe(201);

    const secondFailedEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${secondSessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'author',
        toRole: 'author',
        type: 'draft_cycle_failed',
        payload: {
          reason: 'provider chain exhausted',
        },
      });
    expect(secondFailedEvent.status).toBe(201);

    const response = await request(app)
      .get('/api/admin/agent-gateway/telemetry?hours=24&limit=10')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(response.body.windowHours).toBe(24);
    expect(response.body.sampleLimit).toBe(10);
    expect(response.body.sessions).toEqual(
      expect.objectContaining({
        total: 2,
        active: 1,
        closed: 1,
        attention: 1,
        compacted: 1,
        autoCompacted: 0,
        attentionRate: 0.5,
        compactionRate: 0.5,
        autoCompactedRate: 0,
      }),
    );
    expect(response.body.events).toEqual(
      expect.objectContaining({
        total: 4,
        draftCycleStepEvents: 2,
        failedStepEvents: 1,
        compactionEvents: 1,
        autoCompactionEvents: 0,
        manualCompactionEvents: 1,
        autoCompactionShare: 0,
        autoCompactionRiskLevel: 'healthy',
        prunedEventCount: 5,
        failedStepRate: 0.5,
      }),
    );
    expect(response.body.health).toEqual(
      expect.objectContaining({
        level: 'critical',
        failedStepLevel: 'critical',
        runtimeSuccessLevel: 'critical',
        cooldownSkipLevel: 'watch',
        autoCompactionLevel: 'healthy',
      }),
    );
    expect(response.body.filters).toEqual({
      channel: null,
      provider: null,
    });
    expect(response.body.thresholds).toEqual(
      expect.objectContaining({
        autoCompactionShare: expect.objectContaining({
          watchAbove: 0.5,
          criticalAbove: 0.8,
        }),
        failedStepRate: expect.objectContaining({
          watchAbove: 0.25,
          criticalAbove: 0.5,
        }),
        runtimeSuccessRate: expect.objectContaining({
          watchBelow: 0.75,
          criticalBelow: 0.5,
        }),
        cooldownSkipRate: expect.objectContaining({
          watchAbove: 0.2,
          criticalAbove: 0.4,
        }),
      }),
    );
    expect(response.body.events.compactionHourlyTrend).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          compactions: 1,
          autoCompactions: 0,
          manualCompactions: 1,
          prunedEventCount: 5,
          autoCompactionShare: 0,
          autoCompactionRiskLevel: 'healthy',
        }),
      ]),
    );
    expect(response.body.events.compactionHourlyTrend[0]?.hour).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/,
    );
    expect(response.body.attempts).toEqual(
      expect.objectContaining({
        total: 3,
        success: 1,
        failed: 1,
        skippedCooldown: 1,
        successRate: 0.333,
        failureRate: 0.333,
        skippedRate: 0.333,
      }),
    );
    expect(response.body.providerUsage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'gpt-4.1',
          count: 1,
        }),
        expect.objectContaining({
          provider: 'gemini-2',
          count: 1,
        }),
      ]),
    );
    expect(response.body.channelUsage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'ws-control-plane',
          count: 2,
        }),
      ]),
    );
  });

  test('agent gateway telemetry endpoint applies channel and provider filters', async () => {
    const wsSession = await request(app)
      .post('/api/admin/agent-gateway/sessions')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        channel: 'ws-control-plane',
      });
    expect(wsSession.status).toBe(201);
    const wsSessionId = wsSession.body.session.id as string;

    const wsEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${wsSessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'critic',
        toRole: 'maker',
        type: 'draft_cycle_critic_completed',
        payload: {
          failed: false,
          selectedProvider: 'gpt-4.1',
          attempts: [{ status: 'success' }],
        },
      });
    expect(wsEvent.status).toBe(201);

    const draftSession = await request(app)
      .post('/api/admin/agent-gateway/sessions')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        channel: 'draft_cycle',
      });
    expect(draftSession.status).toBe(201);
    const draftSessionId = draftSession.body.session.id as string;

    const draftEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${draftSessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'maker',
        toRole: 'judge',
        type: 'draft_cycle_maker_completed',
        payload: {
          failed: false,
          selectedProvider: 'gemini-2',
          attempts: [{ status: 'success' }],
        },
      });
    expect(draftEvent.status).toBe(201);

    const response = await request(app)
      .get(
        '/api/admin/agent-gateway/telemetry?hours=24&limit=10&channel=draft_cycle&provider=gemini-2',
      )
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(response.body.filters).toEqual({
      channel: 'draft_cycle',
      provider: 'gemini-2',
    });
    expect(response.body.sessions).toEqual(
      expect.objectContaining({
        total: 1,
        active: 1,
        closed: 0,
      }),
    );
    expect(response.body.events).toEqual(
      expect.objectContaining({
        total: 1,
        draftCycleStepEvents: 1,
        failedStepEvents: 0,
      }),
    );
    expect(response.body.providerUsage).toEqual([
      expect.objectContaining({
        provider: 'gemini-2',
        count: 1,
      }),
    ]);
    expect(response.body.channelUsage).toEqual([
      expect.objectContaining({
        channel: 'draft_cycle',
        count: 1,
      }),
    ]);
  });

  test('agent gateway telemetry endpoint validates hours and limit query params', async () => {
    const invalidQueries = [
      '/api/admin/agent-gateway/telemetry?hours=0',
      '/api/admin/agent-gateway/telemetry?hours=721',
      '/api/admin/agent-gateway/telemetry?hours=1.5',
      '/api/admin/agent-gateway/telemetry?hours=abc',
      '/api/admin/agent-gateway/telemetry?limit=0',
      '/api/admin/agent-gateway/telemetry?limit=1001',
      '/api/admin/agent-gateway/telemetry?limit=2.5',
      '/api/admin/agent-gateway/telemetry?limit=oops',
      '/api/admin/agent-gateway/telemetry?channel=bad%20channel',
      '/api/admin/agent-gateway/telemetry?channel=x',
      '/api/admin/agent-gateway/telemetry?provider=bad%20provider',
      `/api/admin/agent-gateway/telemetry?provider=${'x'.repeat(65)}`,
    ];

    for (const url of invalidQueries) {
      const response = await request(app)
        .get(url)
        .set('x-admin-token', env.ADMIN_API_TOKEN);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ADMIN_INVALID_QUERY');
    }
  });

  test('agent gateway session read endpoints validate query params', async () => {
    const created = await request(app)
      .post('/api/admin/agent-gateway/sessions')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        channel: 'ws-control-plane',
        draftId: TEST_DRAFT_ID_B,
        roles: ['critic', 'maker'],
      });

    expect(created.status).toBe(201);
    const sessionId = created.body.session.id as string;

    const invalidQueries = [
      '/api/admin/agent-gateway/sessions?source=cache',
      '/api/admin/agent-gateway/sessions?limit=0',
      '/api/admin/agent-gateway/sessions?limit=201',
      '/api/admin/agent-gateway/sessions?limit=2.5',
      '/api/admin/agent-gateway/sessions?channel=bad%20channel',
      '/api/admin/agent-gateway/sessions?channel=x',
      '/api/admin/agent-gateway/sessions?provider=bad%20provider',
      `/api/admin/agent-gateway/sessions?provider=${'x'.repeat(65)}`,
      '/api/admin/agent-gateway/sessions?status=pending',
      '/api/admin/agent-gateway/sessions?extra=true',
      `/api/admin/agent-gateway/sessions/${sessionId}?source=cache`,
      `/api/admin/agent-gateway/sessions/${sessionId}?extra=true`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?source=cache`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?limit=0`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?limit=201`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?limit=2.5`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?eventType=invalid%20type`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?eventQuery=${'x'.repeat(161)}`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?fromRole=bad%20role`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?toRole=bad%20role`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?provider=bad%20provider`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?provider=${'x'.repeat(65)}`,
      `/api/admin/agent-gateway/sessions/${sessionId}/events?extra=true`,
      `/api/admin/agent-gateway/sessions/${sessionId}/summary?source=cache`,
      `/api/admin/agent-gateway/sessions/${sessionId}/summary?extra=true`,
      `/api/admin/agent-gateway/sessions/${sessionId}/status?source=cache`,
      `/api/admin/agent-gateway/sessions/${sessionId}/status?extra=true`,
    ];

    for (const url of invalidQueries) {
      const response = await request(app)
        .get(url)
        .set('x-admin-token', env.ADMIN_API_TOKEN);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ADMIN_INVALID_QUERY');
    }
  });

  test('agent gateway sessions endpoint applies channel/provider/status filters', async () => {
    const firstSession = await request(app)
      .post('/api/admin/agent-gateway/sessions')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        channel: 'ws-control-plane',
        draftId: TEST_DRAFT_ID_B,
        roles: ['critic'],
      });
    expect(firstSession.status).toBe(201);
    const firstSessionId = firstSession.body.session.id as string;

    const firstEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${firstSessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'critic',
        type: 'draft_cycle_step',
        payload: {
          selectedProvider: 'gemini-2',
        },
      });
    expect(firstEvent.status).toBe(201);

    const secondSession = await request(app)
      .post('/api/admin/agent-gateway/sessions')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        channel: 'draft_cycle',
        draftId: TEST_DRAFT_ID_C,
        roles: ['judge'],
      });
    expect(secondSession.status).toBe(201);
    const secondSessionId = secondSession.body.session.id as string;

    const secondEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${secondSessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'judge',
        type: 'draft_cycle_step',
        payload: {
          selectedProvider: 'gpt-4.1',
        },
      });
    expect(secondEvent.status).toBe(201);

    const closeSecond = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${secondSessionId}/close`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({});
    expect(closeSecond.status).toBe(200);

    const response = await request(app)
      .get(
        '/api/admin/agent-gateway/sessions?source=db&channel=draft_cycle&provider=gpt-4.1&status=closed&limit=20',
      )
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(response.body.filters).toEqual({
      channel: 'draft_cycle',
      provider: 'gpt-4.1',
      status: 'closed',
    });
    expect(response.body.sessions).toEqual([
      expect.objectContaining({
        id: secondSessionId,
        channel: 'draft_cycle',
        status: 'closed',
      }),
    ]);
  });

  test('agent gateway session events endpoint applies eventType/role/provider filters', async () => {
    const created = await request(app)
      .post('/api/admin/agent-gateway/sessions')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        channel: 'draft_cycle',
        draftId: TEST_DRAFT_ID_B,
        roles: ['critic', 'maker', 'judge'],
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.session.id as string;

    const criticEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'critic',
        toRole: 'maker',
        type: 'draft_cycle_critic_completed',
        payload: {
          selectedProvider: 'gemini-2',
        },
      });
    expect(criticEvent.status).toBe(201);

    const makerEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'maker',
        toRole: 'judge',
        type: 'draft_cycle_maker_completed',
        payload: {
          selectedProvider: 'gpt-4.1',
        },
      });
    expect(makerEvent.status).toBe(201);
    const makerEventId = makerEvent.body.event.id as string;

    const judgeEvent = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'judge',
        toRole: 'system',
        type: 'draft_cycle_completed',
        payload: {
          selectedProvider: 'gpt-4.1',
        },
      });
    expect(judgeEvent.status).toBe(201);

    const response = await request(app)
      .get(
        `/api/admin/agent-gateway/sessions/${sessionId}/events?source=db&eventType=draft_cycle_maker_completed&eventQuery=maker&fromRole=maker&toRole=judge&provider=gpt-4.1&limit=20`,
      )
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(response.body.filters).toEqual({
      eventType: 'draft_cycle_maker_completed',
      eventQuery: 'maker',
      fromRole: 'maker',
      toRole: 'judge',
      provider: 'gpt-4.1',
    });
    expect(response.body.total).toBe(1);
    expect(response.body.events).toEqual([
      expect.objectContaining({
        id: makerEventId,
        fromRole: 'maker',
        toRole: 'judge',
        type: 'draft_cycle_maker_completed',
      }),
    ]);
  });

  test('agent gateway session endpoints validate sessionId route params', async () => {
    const invalidSessionId = 'ags-invalid_session';
    const readUrls = [
      `/api/admin/agent-gateway/sessions/${invalidSessionId}`,
      `/api/admin/agent-gateway/sessions/${invalidSessionId}/events`,
      `/api/admin/agent-gateway/sessions/${invalidSessionId}/summary`,
      `/api/admin/agent-gateway/sessions/${invalidSessionId}/status`,
    ];

    for (const url of readUrls) {
      const response = await request(app)
        .get(url)
        .set('x-admin-token', env.ADMIN_API_TOKEN);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ADMIN_INVALID_SESSION_ID');
    }

    const eventMutation = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${invalidSessionId}/events`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'critic',
        type: 'fix_request_created',
      });
    expect(eventMutation.status).toBe(400);
    expect(eventMutation.body.error).toBe('ADMIN_INVALID_SESSION_ID');

    const compactMutation = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${invalidSessionId}/compact`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({});
    expect(compactMutation.status).toBe(400);
    expect(compactMutation.body.error).toBe('ADMIN_INVALID_SESSION_ID');

    const closeMutation = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${invalidSessionId}/close`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({});
    expect(closeMutation.status).toBe(400);
    expect(closeMutation.body.error).toBe('ADMIN_INVALID_SESSION_ID');
  });

  test('agent gateway mutation endpoints validate query and body payloads', async () => {
    const invalidCreateQuery = await request(app)
      .post('/api/admin/agent-gateway/sessions?extra=true')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({ channel: 'ws-control-plane' });
    expect(invalidCreateQuery.status).toBe(400);
    expect(invalidCreateQuery.body.error).toBe('ADMIN_INVALID_QUERY');

    const invalidCreateBodies = [
      { channel: 'ws-control-plane', unknown: true },
      { channel: 'ws-control-plane', roles: 'critic' },
      { channel: 'ws-control-plane', roles: ['bad role'] },
      { channel: 'ws-control-plane', metadata: ['invalid'] },
      { channel: 'ws-control-plane', metadata: { blob: 'x'.repeat(12_001) } },
      { channel: 'invalid channel format' },
      { channel: 'x'.repeat(121) },
      { channel: 'ws-control-plane', externalSessionId: 'bad session id' },
      { channel: 'ws-control-plane', draftId: 'not-a-uuid' },
      { channel: 'ws-control-plane', draftId: 'd'.repeat(129) },
    ];

    for (const body of invalidCreateBodies) {
      const response = await request(app)
        .post('/api/admin/agent-gateway/sessions')
        .set('x-admin-token', env.ADMIN_API_TOKEN)
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ADMIN_INVALID_BODY');
    }

    const created = await request(app)
      .post('/api/admin/agent-gateway/sessions')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        channel: 'ws-control-plane',
        draftId: TEST_DRAFT_ID_C,
        roles: ['critic', 'maker'],
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.session.id as string;

    const invalidEventsQuery = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/events?extra=true`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({
        fromRole: 'critic',
        type: 'fix_request_created',
      });
    expect(invalidEventsQuery.status).toBe(400);
    expect(invalidEventsQuery.body.error).toBe('ADMIN_INVALID_QUERY');

    const invalidEventBodies = [
      { fromRole: 'critic', type: 'fix_request_created', unknown: true },
      { fromRole: 42, type: 'fix_request_created' },
      { fromRole: 'bad role', type: 'fix_request_created' },
      { fromRole: 'critic', type: 7 },
      { fromRole: 'critic', type: 'invalid type with spaces' },
      { fromRole: 'critic', type: 'fix_request_created', payload: ['bad'] },
      {
        fromRole: 'critic',
        type: 'fix_request_created',
        payload: { blob: 'x'.repeat(12_001) },
      },
    ];

    for (const body of invalidEventBodies) {
      const response = await request(app)
        .post(`/api/admin/agent-gateway/sessions/${sessionId}/events`)
        .set('x-admin-token', env.ADMIN_API_TOKEN)
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ADMIN_INVALID_BODY');
    }

    const invalidCompactQuery = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/compact?extra=true`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({});
    expect(invalidCompactQuery.status).toBe(400);
    expect(invalidCompactQuery.body.error).toBe('ADMIN_INVALID_QUERY');

    const invalidCompactBodies = [
      { keepRecent: 0 },
      { keepRecent: 300 },
      { keepRecent: 1.5 },
      { keepRecent: 'bad' },
      { keepRecent: [5, 6] },
      { unknown: true },
    ];

    for (const body of invalidCompactBodies) {
      const response = await request(app)
        .post(`/api/admin/agent-gateway/sessions/${sessionId}/compact`)
        .set('x-admin-token', env.ADMIN_API_TOKEN)
        .send(body);
      expect(response.status).toBe(400);
    }

    const invalidCloseQuery = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/close?extra=true`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({});
    expect(invalidCloseQuery.status).toBe(400);
    expect(invalidCloseQuery.body.error).toBe('ADMIN_INVALID_QUERY');

    const invalidCloseBody = await request(app)
      .post(`/api/admin/agent-gateway/sessions/${sessionId}/close`)
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({ unknown: true });
    expect(invalidCloseBody.status).toBe(400);
    expect(invalidCloseBody.body.error).toBe('ADMIN_INVALID_BODY');

    const invalidOrchestrateQuery = await request(app)
      .post('/api/admin/agent-gateway/orchestrate?extra=true')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({ draftId: 'draft-mutation-guards' });
    expect(invalidOrchestrateQuery.status).toBe(400);
    expect(invalidOrchestrateQuery.body.error).toBe('ADMIN_INVALID_QUERY');

    const invalidOrchestrateBodies = [
      {},
      { draftId: 'draft-mutation-guards', unknown: true },
      { draftId: 'not-a-uuid' },
      { draftId: 'd'.repeat(129) },
      { draftId: 'draft-mutation-guards', channel: 'invalid channel format' },
      { draftId: 'draft-mutation-guards', channel: 'x'.repeat(121) },
      {
        draftId: 'draft-mutation-guards',
        externalSessionId: 'bad session id',
      },
      { draftId: 'draft-mutation-guards', externalSessionId: 'e'.repeat(129) },
      { draftId: 'draft-mutation-guards', promptSeed: 'p'.repeat(4001) },
      { draftId: 'draft-mutation-guards', hostAgentId: 'not-a-uuid' },
      { draftId: 'draft-mutation-guards', hostAgentId: 'h'.repeat(129) },
      { draftId: 'draft-mutation-guards', metadata: ['invalid'] },
      {
        draftId: 'draft-mutation-guards',
        metadata: { blob: 'x'.repeat(12_001) },
      },
    ];

    for (const body of invalidOrchestrateBodies) {
      const response = await request(app)
        .post('/api/admin/agent-gateway/orchestrate')
        .set('x-admin-token', env.ADMIN_API_TOKEN)
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ADMIN_INVALID_BODY');
    }
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

  test('embedding backfill endpoint validates query/body controls', async () => {
    const invalidQueryCases = [
      '/api/admin/embeddings/backfill?batchSize=0',
      '/api/admin/embeddings/backfill?batchSize=1001',
      '/api/admin/embeddings/backfill?batchSize=2.5',
      '/api/admin/embeddings/backfill?batchSize=oops',
      '/api/admin/embeddings/backfill?batchSize=10&batchSize=11',
      '/api/admin/embeddings/backfill?maxBatches=0',
      '/api/admin/embeddings/backfill?maxBatches=21',
      '/api/admin/embeddings/backfill?maxBatches=1.5',
      '/api/admin/embeddings/backfill?maxBatches=nope',
      '/api/admin/embeddings/backfill?extra=true',
      '/api/admin/embeddings/backfill?batchSize=10&maxBatches=2&extra=true',
    ];

    for (const url of invalidQueryCases) {
      const response = await request(app)
        .post(url)
        .set('x-admin-token', env.ADMIN_API_TOKEN)
        .send({});

      expect(response.status).toBe(400);
    }

    const invalidBodyCases = [
      { batchSize: 0 },
      { batchSize: 1001 },
      { batchSize: 1.5 },
      { batchSize: 'bad' },
      { maxBatches: 0 },
      { maxBatches: 21 },
      { maxBatches: 1.5 },
      { maxBatches: 'bad' },
      { unknown: true },
    ];

    for (const body of invalidBodyCases) {
      const response = await request(app)
        .post('/api/admin/embeddings/backfill')
        .set('x-admin-token', env.ADMIN_API_TOKEN)
        .send(body);

      expect(response.status).toBe(400);
    }

    const conflict = await request(app)
      .post('/api/admin/embeddings/backfill?batchSize=10')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send({ batchSize: 11 });

    expect(conflict.status).toBe(400);
    expect(conflict.body.error).toBe('ADMIN_INPUT_CONFLICT');
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
    await db.query(
      `INSERT INTO ux_events (event_type, user_type, metadata)
       VALUES ('style_fusion_copy_brief', 'anonymous', '{"status":"success","sampleCount":2}'),
              ('style_fusion_copy_brief', 'anonymous', '{"status":"failed","errorCode":"CLIPBOARD_WRITE_FAILED","sampleCount":2}')`,
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
    expect(response.body.styleFusionCopy.total).toBe(2);
    expect(response.body.styleFusionCopy.success).toBe(1);
    expect(response.body.styleFusionCopy.errors).toBe(1);
    expect(response.body.styleFusionCopy.successRate).toBe(0.5);
    expect(response.body.styleFusionCopy.errorBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          errorCode: 'CLIPBOARD_WRITE_FAILED',
          count: 1,
        }),
      ]),
    );
  });

  test('admin metrics endpoints validate query params', async () => {
    const tooLongEventType = 'e'.repeat(121);
    const invalidQueries = [
      '/api/admin/embeddings/metrics?hours=0',
      '/api/admin/embeddings/metrics?hours=721',
      '/api/admin/embeddings/metrics?hours=2.5',
      '/api/admin/embeddings/metrics?hours=oops',
      '/api/admin/embeddings/metrics?extra=true',
      '/api/admin/ux/metrics?hours=0',
      '/api/admin/ux/metrics?hours=721',
      '/api/admin/ux/metrics?hours=1.5',
      '/api/admin/ux/metrics?hours=oops',
      '/api/admin/ux/metrics?eventType=invalid event',
      `/api/admin/ux/metrics?eventType=${tooLongEventType}`,
      '/api/admin/ux/metrics?eventType=a&eventType=b',
      '/api/admin/ux/metrics?extra=true',
      '/api/admin/ux/similar-search?hours=0',
      '/api/admin/ux/similar-search?hours=721',
      '/api/admin/ux/similar-search?hours=1.5',
      '/api/admin/ux/similar-search?hours=oops',
      '/api/admin/ux/similar-search?extra=true',
      '/api/admin/jobs/metrics?hours=0',
      '/api/admin/jobs/metrics?hours=721',
      '/api/admin/jobs/metrics?hours=1.5',
      '/api/admin/jobs/metrics?hours=oops',
      '/api/admin/jobs/metrics?extra=true',
    ];

    for (const url of invalidQueries) {
      const response = await request(app)
        .get(url)
        .set('x-admin-token', env.ADMIN_API_TOKEN);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ADMIN_INVALID_QUERY');
    }
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
         ('pr_prediction_settle', 'observer', $1, 'reject', '{"mode":"hot_now","abVariant":"A","isCorrect":false}', NOW() - INTERVAL '18 minutes'),
         ('draft_multimodal_glowup_view', 'observer', $1, 'draft', '{"mode":"hot_now","provider":"gpt-4.1"}', NOW() - INTERVAL '19 minutes'),
         ('observer_prediction_filter_change', 'observer', $1, 'draft', '{"scope":"self","filter":"all"}', NOW() - INTERVAL '11 minutes'),
         ('observer_prediction_filter_change', 'observer', $1, 'draft', '{"scope":"self","filter":"resolved"}', NOW() - INTERVAL '10 minutes'),
         ('observer_prediction_sort_change', 'observer', $1, 'draft', '{"scope":"self","sort":"recent"}', NOW() - INTERVAL '9 minutes'),
         ('draft_arc_view', 'observer', $2, 'draft', '{"mode":"hot_now","abVariant":"B"}', NOW() - INTERVAL '10 minutes'),
         ('observer_prediction_filter_change', 'observer', $2, 'draft', '{"scope":"public","filter":"pending"}', NOW() - INTERVAL '9 minutes'),
         ('observer_prediction_filter_change', 'observer', $2, 'draft', '{}', NOW() - INTERVAL '8 minutes'),
         ('observer_prediction_sort_change', 'observer', $2, 'draft', '{"scope":"public","sort":"stake_desc"}', NOW() - INTERVAL '7 minutes'),
         ('observer_prediction_sort_change', 'observer', $2, 'draft', '{}', NOW() - INTERVAL '6 minutes'),
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
    await db.query(
      `INSERT INTO ux_events (event_type, user_type, status, source, metadata, created_at)
       VALUES
         ('draft_multimodal_glowup_error', 'system', 'invalid_query', 'api', '{"reason":"invalid_query","errorCode":"MULTIMODAL_GLOWUP_INVALID_QUERY_FIELDS"}', NOW() - INTERVAL '7 minutes')`,
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
    expect(response.body.kpis.predictionSettlementRate).toBe(1);
    expect(response.body.kpis.predictionFilterSwitchShare).toBe(0.571);
    expect(response.body.kpis.predictionSortSwitchShare).toBe(0.429);
    expect(response.body.kpis.predictionNonDefaultSortRate).toBe(0.667);
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
    expect(response.body.multimodal.guardrails).toEqual(
      expect.objectContaining({
        invalidQueryErrors: 1,
        invalidQueryRate: 0.5,
      }),
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
    expect(response.body.predictionMarket.resolutionWindows).toEqual(
      expect.objectContaining({
        d7: expect.objectContaining({
          days: 7,
          predictors: 0,
          resolvedPredictions: 0,
          correctPredictions: 0,
          accuracyRate: null,
          netPoints: 0,
          riskLevel: 'unknown',
        }),
        d30: expect.objectContaining({
          days: 30,
          predictors: 0,
          resolvedPredictions: 0,
          correctPredictions: 0,
          accuracyRate: null,
          netPoints: 0,
          riskLevel: 'unknown',
        }),
      }),
    );
    expect(response.body.predictionMarket.thresholds).toEqual(
      expect.objectContaining({
        resolutionWindows: expect.objectContaining({
          minResolvedPredictions: 3,
          accuracyRate: expect.objectContaining({
            criticalBelow: 0.45,
            watchBelow: 0.6,
          }),
        }),
      }),
    );
    expect(response.body.predictionFilterTelemetry.totalSwitches).toBe(4);
    expect(response.body.predictionFilterTelemetry.byScope).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'self', count: 2 }),
        expect.objectContaining({ scope: 'public', count: 1 }),
        expect.objectContaining({ scope: 'unknown', count: 1 }),
      ]),
    );
    expect(response.body.predictionFilterTelemetry.byFilter).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filter: 'all', count: 1 }),
        expect.objectContaining({ filter: 'resolved', count: 1 }),
        expect.objectContaining({ filter: 'pending', count: 1 }),
        expect.objectContaining({ filter: 'unknown', count: 1 }),
      ]),
    );
    expect(response.body.predictionFilterTelemetry.byScopeAndFilter).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'self', filter: 'all', count: 1 }),
        expect.objectContaining({
          scope: 'self',
          filter: 'resolved',
          count: 1,
        }),
        expect.objectContaining({
          scope: 'public',
          filter: 'pending',
          count: 1,
        }),
        expect.objectContaining({
          scope: 'unknown',
          filter: 'unknown',
          count: 1,
        }),
      ]),
    );
    expect(response.body.predictionSortTelemetry.totalSwitches).toBe(3);
    expect(response.body.predictionSortTelemetry.byScope).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'self', count: 1 }),
        expect.objectContaining({ scope: 'public', count: 1 }),
        expect.objectContaining({ scope: 'unknown', count: 1 }),
      ]),
    );
    expect(response.body.predictionSortTelemetry.bySort).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sort: 'recent', count: 1 }),
        expect.objectContaining({ sort: 'stake_desc', count: 1 }),
        expect.objectContaining({ sort: 'unknown', count: 1 }),
      ]),
    );
    expect(response.body.predictionSortTelemetry.byScopeAndSort).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'self', sort: 'recent', count: 1 }),
        expect.objectContaining({
          scope: 'public',
          sort: 'stake_desc',
          count: 1,
        }),
        expect.objectContaining({
          scope: 'unknown',
          sort: 'unknown',
          count: 1,
        }),
      ]),
    );
    expect(response.body.totals.predictionSettles).toBe(1);
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

  test('observer engagement metrics endpoint validates hours query param', async () => {
    const invalidQueries = [
      '/api/admin/ux/observer-engagement?hours=0',
      '/api/admin/ux/observer-engagement?hours=721',
      '/api/admin/ux/observer-engagement?hours=3.14',
      '/api/admin/ux/observer-engagement?hours=invalid',
      '/api/admin/ux/observer-engagement?extra=true',
    ];

    for (const url of invalidQueries) {
      const response = await request(app)
        .get(url)
        .set('x-admin-token', env.ADMIN_API_TOKEN);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ADMIN_INVALID_QUERY');
    }
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
    expect(response.body.predictionMarket.resolutionWindows).toEqual(
      expect.objectContaining({
        d7: expect.objectContaining({
          days: 7,
          predictors: 2,
          resolvedPredictions: 2,
          correctPredictions: 1,
          accuracyRate: 0.5,
          netPoints: 20,
          riskLevel: 'unknown',
        }),
        d30: expect.objectContaining({
          days: 30,
          predictors: 2,
          resolvedPredictions: 2,
          correctPredictions: 1,
          accuracyRate: 0.5,
          netPoints: 20,
          riskLevel: 'unknown',
        }),
      }),
    );
    expect(response.body.predictionMarket.thresholds).toEqual(
      expect.objectContaining({
        resolutionWindows: expect.objectContaining({
          minResolvedPredictions: 3,
          accuracyRate: expect.objectContaining({
            criticalBelow: 0.45,
            watchBelow: 0.6,
          }),
        }),
      }),
    );
    for (const bucket of hourlyTrend) {
      expect(typeof bucket.hour).toBe('string');
    }
    expect(response.body.predictionFilterTelemetry).toEqual(
      expect.objectContaining({
        totalSwitches: 0,
        byScope: [],
        byFilter: [],
        byScopeAndFilter: [],
      }),
    );
    expect(response.body.predictionSortTelemetry).toEqual(
      expect.objectContaining({
        totalSwitches: 0,
        byScope: [],
        bySort: [],
        byScopeAndSort: [],
      }),
    );
    expect(response.body.kpis.predictionFilterSwitchShare).toBeNull();
    expect(response.body.kpis.predictionSortSwitchShare).toBeNull();
    expect(response.body.kpis.predictionNonDefaultSortRate).toBeNull();
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

  test('cleanup endpoints validate query/body controls', async () => {
    const invalidPreview = await request(app)
      .get('/api/admin/cleanup/preview?extra=true')
      .set('x-admin-token', env.ADMIN_API_TOKEN);
    expect(invalidPreview.status).toBe(400);
    expect(invalidPreview.body.error).toBe('ADMIN_INVALID_QUERY');

    const invalidRunCases: Array<{
      url: string;
      body: Record<string, unknown>;
      expectedError?: string;
    }> = [
      {
        url: '/api/admin/cleanup/run?extra=true',
        body: { confirm: true },
        expectedError: 'ADMIN_INVALID_QUERY',
      },
      {
        url: '/api/admin/cleanup/run?confirm=maybe',
        body: {},
        expectedError: 'ADMIN_INVALID_QUERY',
      },
      {
        url: '/api/admin/cleanup/run?confirm=true',
        body: { confirm: 'maybe' },
        expectedError: 'ADMIN_INVALID_BODY',
      },
      {
        url: '/api/admin/cleanup/run?confirm=true',
        body: { confirm: false },
        expectedError: 'ADMIN_INPUT_CONFLICT',
      },
      {
        url: '/api/admin/cleanup/run?confirm=false',
        body: {},
        expectedError: 'CONFIRM_REQUIRED',
      },
      {
        url: '/api/admin/cleanup/run',
        body: { unknown: true, confirm: true },
        expectedError: 'ADMIN_INVALID_BODY',
      },
      {
        url: '/api/admin/cleanup/run',
        body: {},
        expectedError: 'CONFIRM_REQUIRED',
      },
    ];

    for (const testCase of invalidRunCases) {
      const response = await request(app)
        .post(testCase.url)
        .set('x-admin-token', env.ADMIN_API_TOKEN)
        .send(testCase.body);

      expect(response.status).toBe(400);
      if (testCase.expectedError) {
        expect(response.body.error).toBe(testCase.expectedError);
      }
    }
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

  test('error metrics endpoint validates query params', async () => {
    const tooLongCode = 'x'.repeat(121);
    const tooLongRoute = 'y'.repeat(241);

    const invalidQueries = [
      '/api/admin/errors/metrics?hours=0',
      '/api/admin/errors/metrics?hours=721',
      '/api/admin/errors/metrics?hours=1.5',
      '/api/admin/errors/metrics?hours=abc',
      '/api/admin/errors/metrics?limit=0',
      '/api/admin/errors/metrics?limit=201',
      '/api/admin/errors/metrics?limit=2.5',
      '/api/admin/errors/metrics?limit=oops',
      `/api/admin/errors/metrics?code=${tooLongCode}`,
      `/api/admin/errors/metrics?route=${tooLongRoute}`,
      '/api/admin/errors/metrics?code=invalid code',
      '/api/admin/errors/metrics?route=api/no-leading-slash',
      '/api/admin/errors/metrics?route=/api/drafts?raw=true',
      '/api/admin/errors/metrics?code=a&code=b',
      '/api/admin/errors/metrics?unknown=true',
    ];

    for (const url of invalidQueries) {
      const response = await request(app)
        .get(url)
        .set('x-admin-token', env.ADMIN_API_TOKEN);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ADMIN_INVALID_QUERY');
    }
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

  test('budget metrics and remaining endpoints validate query params', async () => {
    const invalidQueryCases = [
      '/api/admin/budgets/remaining?extra=true',
      '/api/admin/budgets/remaining?agentId=a&agentId=b',
      '/api/admin/budgets/remaining?agentId=not-a-uuid',
      '/api/admin/budgets/remaining?draftId=not-a-uuid',
      `/api/admin/budgets/remaining?agentId=${'a'.repeat(129)}`,
      `/api/admin/budgets/remaining?date=${'2'.repeat(41)}`,
      '/api/admin/budgets/metrics?extra=true',
      '/api/admin/budgets/metrics?date=2026-01-01&date=2026-01-02',
      `/api/admin/budgets/metrics?date=${'9'.repeat(41)}`,
    ];

    for (const url of invalidQueryCases) {
      const response = await request(app)
        .get(url)
        .set('x-admin-token', env.ADMIN_API_TOKEN);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ADMIN_INVALID_QUERY');
    }
  });
});
