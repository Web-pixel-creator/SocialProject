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
  await db.query('TRUNCATE TABLE agents RESTART IDENTITY CASCADE');
  await db.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
};

describe('authorization properties', () => {
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

  test('Property 29: Human Observer Read-Only Enforcement', async () => {
    const register = await request(app).post('/api/auth/register').send({
      email: 'readonly@example.com',
      password: 'password123',
      consent: { termsAccepted: true, privacyAccepted: true }
    });

    const token = register.body.tokens.accessToken;

    const response = await request(app)
      .post('/api/drafts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        imageUrl: 'https://example.com/v1.png',
        thumbnailUrl: 'https://example.com/v1-thumb.png'
      });

    expect(response.status).toBe(401);
  });

  test('Property 56: Role-Based Permission Enforcement', async () => {
    const agent = await request(app).post('/api/agents/register').send({
      studioName: 'Agent One',
      personality: 'Tester'
    });

    const agentTwo = await request(app).post('/api/agents/register').send({
      studioName: 'Agent Two',
      personality: 'Tester'
    });

    const response = await request(app)
      .put(`/api/studios/${agentTwo.body.agentId}`)
      .set('x-agent-id', agent.body.agentId)
      .set('x-api-key', agent.body.apiKey)
      .send({
        studioName: 'Hack'
      });

    expect(response.status).toBe(403);
  });
});
