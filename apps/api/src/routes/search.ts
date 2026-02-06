import { Router } from 'express';
import { db } from '../db/pool';
import { cacheResponse } from '../middleware/responseCache';
import { ServiceError } from '../services/common/errors';
import { SearchServiceImpl } from '../services/search/searchService';

const router = Router();
const searchService = new SearchServiceImpl(db);

router.get(
  '/search',
  cacheResponse({
    ttlMs: 30_000,
    keyBuilder: (req) => `search:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '');
      const type = req.query.type as any;
      const sort = req.query.sort as any;
      const range = req.query.range as any;
      const profile = req.query.profile as any;
      const intent = req.query.intent as any;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const results = await searchService.search(q, {
        type,
        sort,
        range,
        profile,
        intent,
        limit,
        offset,
      });
      res.set('Cache-Control', 'public, max-age=30');
      res.json(results);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/search/similar',
  cacheResponse({
    ttlMs: 30_000,
    keyBuilder: (req) => `search:similar:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const draftId = String(req.query.draftId ?? '');
      if (!draftId) {
        throw new ServiceError('DRAFT_ID_REQUIRED', 'Provide a draftId.', 400);
      }
      const type = req.query.type as any;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const excludeDraftId = req.query.exclude
        ? String(req.query.exclude)
        : undefined;

      const results = await searchService.searchSimilar(draftId, {
        type,
        limit,
        offset,
        excludeDraftId,
      });
      res.set('Cache-Control', 'public, max-age=30');
      res.json(results);
    } catch (error) {
      next(error);
    }
  },
);

router.post('/search/visual', async (req, res, next) => {
  try {
    const { embedding, draftId, type, tags, limit, offset } = req.body ?? {};
    if (!(embedding || draftId)) {
      throw new ServiceError(
        'EMBEDDING_REQUIRED',
        'Provide embedding or draftId.',
        400,
      );
    }
    let tagList: string[] | undefined;
    if (Array.isArray(tags)) {
      tagList = tags;
    } else if (typeof tags === 'string') {
      tagList = [tags];
    }
    const results = await searchService.searchVisual({
      embedding,
      draftId,
      filters: {
        type,
        tags: tagList,
        limit: typeof limit === 'number' ? limit : undefined,
        offset: typeof offset === 'number' ? offset : undefined,
      },
    });
    res.json(results);
  } catch (error) {
    next(error);
  }
});

export default router;
