import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman } from '../middleware/auth';
import { cacheResponse } from '../middleware/responseCache';
import { FeedServiceImpl } from '../services/feed/feedService';
import type { FeedSort, FeedStatus } from '../services/feed/types';

const router = Router();
const feedService = new FeedServiceImpl(db);

const parseDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

router.get(
  '/feed',
  cacheResponse({ ttlMs: 15000, keyBuilder: (req) => `feed:unified:${req.originalUrl}` }),
  async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      const cursor = parseDate(req.query.cursor);

      if (req.query.from && !from) {
        return res.status(400).json({ error: 'Invalid from date.' });
      }

      if (req.query.to && !to) {
        return res.status(400).json({ error: 'Invalid to date.' });
      }

      if (req.query.cursor && !cursor) {
        return res.status(400).json({ error: 'Invalid cursor date.' });
      }

      const allowedSorts: FeedSort[] = ['recent', 'impact', 'glowup'];
      const allowedStatuses: FeedStatus[] = ['draft', 'release', 'pr'];

      if (sort && !allowedSorts.includes(sort as FeedSort)) {
        return res.status(400).json({ error: 'Invalid sort value.' });
      }

      if (status && !allowedStatuses.includes(status as FeedStatus)) {
        return res.status(400).json({ error: 'Invalid status value.' });
      }

      const items = await feedService.getFeed({
        limit,
        offset,
        sort: sort as FeedSort | undefined,
        status: status as FeedStatus | undefined,
        from,
        to,
        cursor
      });
      res.set('Cache-Control', 'public, max-age=30');
      res.json(items);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/feeds/progress',
  cacheResponse({ ttlMs: 20000, keyBuilder: (req) => `feed:progress:${req.originalUrl}` }),
  async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const items = await feedService.getProgress({ limit, offset });
    res.set('Cache-Control', 'public, max-age=30');
    res.json(items);
  } catch (error) {
    next(error);
  }
  }
);

router.get(
  '/feeds/for-you',
  requireHuman,
  cacheResponse({
    ttlMs: 15000,
    keyBuilder: (req) => `feed:for-you:${req.auth?.id ?? 'anon'}:${req.originalUrl}`
  }),
  async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const items = await feedService.getForYou({ userId: req.auth?.id as string, limit, offset });
    res.set('Cache-Control', 'private, max-age=30');
    res.json(items);
  } catch (error) {
    next(error);
  }
  }
);

router.get(
  '/feeds/live-drafts',
  cacheResponse({ ttlMs: 10000, keyBuilder: (req) => `feed:live:${req.originalUrl}` }),
  async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const items = await feedService.getLiveDrafts({ limit, offset });
    res.set('Cache-Control', 'public, max-age=15');
    res.json(items);
  } catch (error) {
    next(error);
  }
  }
);

router.get(
  '/feeds/glowups',
  cacheResponse({ ttlMs: 30000, keyBuilder: (req) => `feed:glowups:${req.originalUrl}` }),
  async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const items = await feedService.getGlowUps({ limit, offset });
    res.set('Cache-Control', 'public, max-age=60');
    res.json(items);
  } catch (error) {
    next(error);
  }
  }
);

router.get(
  '/feeds/studios',
  cacheResponse({ ttlMs: 60000, keyBuilder: (req) => `feed:studios:${req.originalUrl}` }),
  async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const items = await feedService.getStudios({ limit, offset });
    res.set('Cache-Control', 'public, max-age=120');
    res.json(items);
  } catch (error) {
    next(error);
  }
  }
);

router.get(
  '/feeds/battles',
  cacheResponse({ ttlMs: 20000, keyBuilder: (req) => `feed:battles:${req.originalUrl}` }),
  async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const items = await feedService.getBattles({ limit, offset });
    res.set('Cache-Control', 'public, max-age=30');
    res.json(items);
  } catch (error) {
    next(error);
  }
  }
);

router.get(
  '/feeds/archive',
  cacheResponse({ ttlMs: 60000, keyBuilder: (req) => `feed:archive:${req.originalUrl}` }),
  async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const items = await feedService.getArchive({ limit, offset });
    res.set('Cache-Control', 'public, max-age=120');
    res.json(items);
  } catch (error) {
    next(error);
  }
  }
);

export default router;
