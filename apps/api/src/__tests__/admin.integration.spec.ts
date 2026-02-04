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
