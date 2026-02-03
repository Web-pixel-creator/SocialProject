import express from 'express';
import request from 'supertest';
import { cacheResponse } from '../middleware/responseCache';

describe('response cache middleware', () => {
  test('returns MISS then HIT for repeated GET requests', async () => {
    const app = express();
    app.get(
      '/cached-hit-miss',
      cacheResponse({ ttlMs: 1000 }),
      (_req, res) => res.json({ value: 'ok' })
    );

    const first = await request(app).get('/cached-hit-miss');
    expect(first.headers['x-cache']).toBe('MISS');

    const second = await request(app).get('/cached-hit-miss');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);
  });

  test('skips cache for non-GET requests', async () => {
    const app = express();
    app.post(
      '/cached-non-get',
      cacheResponse({ ttlMs: 1000 }),
      (_req, res) => res.json({ ok: true })
    );

    const response = await request(app).post('/cached-non-get');
    expect(response.status).toBe(200);
    expect(response.headers['x-cache']).toBeUndefined();
  });

  test('respects cache-control: no-cache', async () => {
    const app = express();
    app.get(
      '/cached-no-cache',
      cacheResponse({ ttlMs: 1000 }),
      (_req, res) => res.json({ ok: true })
    );

    const response = await request(app).get('/cached-no-cache').set('cache-control', 'no-cache');
    expect(response.status).toBe(200);
    expect(response.headers['x-cache']).toBeUndefined();
  });

  test('skips caching when keyBuilder returns null', async () => {
    const app = express();
    app.get(
      '/cached-null-key',
      cacheResponse({ ttlMs: 1000, keyBuilder: () => null }),
      (_req, res) => res.json({ ok: true })
    );

    const response = await request(app).get('/cached-null-key');
    expect(response.status).toBe(200);
    expect(response.headers['x-cache']).toBeUndefined();
  });

  test('does not cache non-2xx responses', async () => {
    const app = express();
    app.get(
      '/cached-error',
      cacheResponse({ ttlMs: 1000 }),
      (_req, res) => res.status(500).json({ error: 'boom' })
    );

    const first = await request(app).get('/cached-error');
    expect(first.status).toBe(500);
    expect(first.headers['x-cache']).toBe('MISS');

    const second = await request(app).get('/cached-error');
    expect(second.status).toBe(500);
    expect(second.headers['x-cache']).toBe('MISS');
  });

  test('prunes cache when over capacity', async () => {
    const app = express();
    app.get(
      '/cached-prune',
      cacheResponse({ ttlMs: 1000, keyBuilder: (req) => `prune:${req.query.i ?? ''}` }),
      (req, res) => res.json({ ok: true, i: req.query.i })
    );

    for (let i = 0; i < 510; i += 1) {
      const response = await request(app).get(`/cached-prune?i=${i}`);
      expect(response.status).toBe(200);
    }
  });

  test('normalizes array headers when caching', async () => {
    const app = express();
    app.get(
      '/cached-array-header',
      cacheResponse({ ttlMs: 1000 }),
      (_req, res) => {
        res.set('X-Array', ['one', 'two']);
        res.json({ ok: true });
      }
    );

    const first = await request(app).get('/cached-array-header');
    expect(first.headers['x-cache']).toBe('MISS');

    const second = await request(app).get('/cached-array-header');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.headers['x-array']).toBe('one, two');
  });
});
