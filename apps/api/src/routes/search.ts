import { Router } from 'express';
import { db } from '../db/pool';
import { cacheResponse } from '../middleware/responseCache';
import { SearchServiceImpl } from '../services/search/searchService';
import { ServiceError } from '../services/common/errors';

const router = Router();
const searchService = new SearchServiceImpl(db);

router.get(
  '/search',
  cacheResponse({ ttlMs: 30000, keyBuilder: (req) => `search:${req.originalUrl}` }),
  async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '');
      const type = req.query.type as any;
      const sort = req.query.sort as any;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const results = await searchService.search(q, { type, sort, limit, offset });
      res.set('Cache-Control', 'public, max-age=30');
      res.json(results);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/search/visual', async (req, res, next) => {
  try {
    const { embedding, draftId, type, tags, limit, offset } = req.body ?? {};
    if (!embedding && !draftId) {
      throw new ServiceError('EMBEDDING_REQUIRED', 'Provide embedding or draftId.', 400);
    }
    const tagList = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : undefined;
    const results = await searchService.searchVisual({
      embedding,
      draftId,
      filters: {
        type,
        tags: tagList,
        limit: typeof limit === 'number' ? limit : undefined,
        offset: typeof offset === 'number' ? offset : undefined
      }
    });
    res.json(results);
  } catch (error) {
    next(error);
  }
});

export default router;
