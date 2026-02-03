import type { NextFunction, Request, Response } from 'express';

type CacheEntry = {
  expiresAt: number;
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

const cacheStore = new Map<string, CacheEntry>();
const MAX_CACHE_ITEMS = 500;

const pruneCache = () => {
  if (cacheStore.size <= MAX_CACHE_ITEMS) return;
  const overflow = cacheStore.size - MAX_CACHE_ITEMS;
  const keys = cacheStore.keys();
  for (let i = 0; i < overflow; i += 1) {
    const key = keys.next().value;
    if (!key) break;
    cacheStore.delete(key);
  }
};

const normalizeHeaders = (headers: Record<string, unknown>) => {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      normalized[key] = value.join(', ');
      continue;
    }
    normalized[key] = String(value);
  }
  return normalized;
};

type CacheOptions = {
  ttlMs: number;
  keyBuilder?: (req: Request) => string | null;
};

export const cacheResponse = ({ ttlMs, keyBuilder }: CacheOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheControl = req.headers['cache-control'];
    if (typeof cacheControl === 'string' && cacheControl.includes('no-cache')) {
      return next();
    }

    const key = keyBuilder ? keyBuilder(req) : `${req.method}:${req.originalUrl}`;
    if (!key) {
      return next();
    }

    const cached = cacheStore.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      res.set(cached.headers);
      res.set('X-Cache', 'HIT');
      return res.status(cached.status).json(cached.body);
    }

    res.set('X-Cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheStore.set(key, {
          expiresAt: now + ttlMs,
          status: res.statusCode,
          body,
          headers: normalizeHeaders(res.getHeaders() as Record<string, unknown>)
        });
        pruneCache();
      }
      return originalJson(body);
    };

    return next();
  };
};
