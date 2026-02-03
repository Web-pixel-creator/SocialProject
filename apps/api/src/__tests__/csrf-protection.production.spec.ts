jest.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'production',
    CSRF_TOKEN: 'test-csrf'
  }
}));

import express from 'express';
import request from 'supertest';
import { csrfProtection } from '../middleware/security';

describe('csrfProtection middleware (production)', () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use(csrfProtection);
    app.post('/secure', (_req, res) => res.json({ ok: true }));
    app.get('/secure', (_req, res) => res.json({ ok: true }));
    return app;
  };

  test('blocks POST without token', async () => {
    const response = await request(buildApp()).post('/secure').send({});
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('CSRF_TOKEN_INVALID');
  });

  test('allows POST with valid token', async () => {
    const response = await request(buildApp())
      .post('/secure')
      .set('x-csrf-token', 'test-csrf')
      .send({});
    expect(response.status).toBe(200);
  });

  test('allows GET without token', async () => {
    const response = await request(buildApp()).get('/secure');
    expect(response.status).toBe(200);
  });
});
