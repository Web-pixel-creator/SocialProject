jest.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    CSRF_TOKEN: 'test-csrf'
  }
}));

import express from 'express';
import request from 'supertest';
import { csrfProtection } from '../middleware/security';

describe('csrfProtection middleware (non-production)', () => {
  test('skips token validation', async () => {
    const app = express();
    app.use(express.json());
    app.use(csrfProtection);
    app.post('/secure', (_req, res) => res.json({ ok: true }));

    const response = await request(app).post('/secure').send({});
    expect(response.status).toBe(200);
  });
});
