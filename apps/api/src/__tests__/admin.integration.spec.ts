import request from 'supertest';
import { db } from '../db/pool';
import { redis } from '../redis/client';
import { env } from '../config/env';
import { BudgetServiceImpl, getUtcDateKey } from '../services/budget/budgetService';
import { PostServiceImpl } from '../services/post/postService';
import { createApp, initInfra } from '../server';

env.ADMIN_API_TOKEN = env.ADMIN_API_TOKEN || 'test-admin-token';

const app = createApp();

const resetDb = async () => {
  await db.query('TRUNCATE TABLE draft_embeddings RESTART IDENTITY CASCADE');
  await db.query(`DELETE FROM embedding_events`);
  await db.query('TRUNCATE TABLE ux_events RESTART IDENTITY CASCADE');
  await db.query(`TRUNCATE TABLE job_runs RESTART IDENTITY CASCADE`);
  await db.query(`TRUNCATE TABLE error_events RESTART IDENTITY CASCADE`);
  await db.query('TRUNCATE TABLE versions RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE drafts RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE agents RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
};

const registerAgent = async (studioName = 'Admin Test Studio') => {
  const response = await request(app).post('/api/agents/register').send({
    studioName,
    personality: 'Tester'
  });
  const { agentId } = response.body;
  return { agentId };
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

  test('embedding backfill and metrics endpoints return data', async () => {
    const { agentId } = await registerAgent('Backfill Studio');
    const postService = new PostServiceImpl(db);

    await postService.createDraft({
      authorId: agentId,
      imageUrl: 'https://example.com/admin-v1.png',
      thumbnailUrl: 'https://example.com/admin-v1-thumb.png',
      metadata: { title: 'Admin Backfill' }
    });

    const backfill = await request(app)
      .post('/api/admin/embeddings/backfill?batchSize=10&maxBatches=1')
      .set('x-admin-token', env.ADMIN_API_TOKEN)
      .send();

    expect(backfill.status).toBe(200);
    expect(backfill.body).toHaveProperty('processed');
    expect(backfill.body.processed).toBeGreaterThan(0);

    const embeddingRows = await db.query('SELECT COUNT(*)::int AS count FROM draft_embeddings');
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
              ('feed_load_timing', 'anonymous', 340, '{}')`
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
              ('search_result_open', 'anonymous', '{"profile":"quality","mode":"text"}')`
    );

    const response = await request(app)
      .get('/api/admin/ux/similar-search?hours=24')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.rows)).toBe(true);
    expect(Array.isArray(response.body.profiles)).toBe(true);
    const balancedSimilar = response.body.profiles.find(
      (profile: any) => profile.profile === 'balanced' && profile.mode === 'unknown'
    );
    const qualitySimilar = response.body.profiles.find(
      (profile: any) => profile.profile === 'quality' && profile.mode === 'unknown'
    );
    const qualityText = response.body.profiles.find(
      (profile: any) => profile.profile === 'quality' && profile.mode === 'text'
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
  });

  test('job metrics endpoint returns aggregated runs', async () => {
    await db.query(
      `INSERT INTO job_runs (job_name, status, started_at, finished_at, duration_ms, error_message, metadata)
       VALUES ('budgets_reset', 'success', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', 1200, NULL, '{}'),
              ('budgets_reset', 'failed', NOW() - INTERVAL '1 hours', NOW() - INTERVAL '1 hours', 900, 'failed', '{}'),
              ('embedding_backfill', 'success', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours', 2400, NULL, '{"processed":10}')`
    );

    const response = await request(app)
      .get('/api/admin/jobs/metrics?hours=24')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.rows)).toBe(true);
    const budgets = response.body.rows.find((row: any) => row.job_name === 'budgets_reset');
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
      thumbnailUrl: 'https://example.com/cleanup-v1-thumb.png'
    });

    const userRow = await db.query('INSERT INTO users (email) VALUES ($1) RETURNING id', [
      'cleanup@example.com'
    ]);
    const userId = userRow.rows[0].id;

    await db.query(
      `INSERT INTO viewing_history (user_id, draft_id, viewed_at)
       VALUES ($1, $2, NOW() - INTERVAL '200 days')`,
      [userId, created.draft.id]
    );

    const commissionRow = await db.query(
      `INSERT INTO commissions (user_id, description)
       VALUES ($1, 'cleanup test') RETURNING id`,
      [userId]
    );
    const commissionId = commissionRow.rows[0].id;

    await db.query(
      `INSERT INTO payment_events (provider, provider_event_id, commission_id, event_type, received_at)
       VALUES ('stripe', 'evt_cleanup', $1, 'payment', NOW() - INTERVAL '200 days')`,
      [commissionId]
    );

    await db.query(
      `INSERT INTO data_exports (user_id, status, export_url, expires_at, created_at)
       VALUES ($1, 'ready', 'https://example.com/exports/old.zip', NOW() - INTERVAL '200 days', NOW() - INTERVAL '200 days')`,
      [userId]
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
       VALUES ('VERSION_MEDIA_REQUIRED', 'Initial version image and thumbnail are required.', 400, '/api/drafts', 'POST', 'agent')`
    );

    const response = await request(app)
      .get('/api/admin/errors/metrics?hours=24')
      .set('x-admin-token', env.ADMIN_API_TOKEN);

    expect(response.status).toBe(200);
    const entry = response.body.rows.find((row: any) => row.error_code === 'VERSION_MEDIA_REQUIRED');
    expect(entry).toBeTruthy();
  });

  test('budget metrics and remaining endpoints return usage', async () => {
    const { agentId } = await registerAgent('Budget Admin Studio');
    const postService = new PostServiceImpl(db);
    const budgetService = new BudgetServiceImpl(redis);

    const created = await postService.createDraft({
      authorId: agentId,
      imageUrl: 'https://example.com/budget-v1.png',
      thumbnailUrl: 'https://example.com/budget-v1-thumb.png'
    });

    await budgetService.incrementActionBudget(agentId, 'fix_request');
    await budgetService.incrementEditBudget(created.draft.id, 'pr');

    const remaining = await request(app)
      .get(`/api/admin/budgets/remaining?agentId=${agentId}&draftId=${created.draft.id}`)
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
