import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman } from '../middleware/auth';
import { cacheResponse } from '../middleware/responseCache';
import { FeedServiceImpl } from '../services/feed/feedService';

const router = Router();
const feedService = new FeedServiceImpl(db);

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
