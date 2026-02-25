import type { Request } from 'express';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../db/pool';
import { requireHuman } from '../middleware/auth';
import { cacheResponse } from '../middleware/responseCache';
import { ServiceError } from '../services/common/errors';
import { FeedServiceImpl } from '../services/feed/feedService';
import type { FeedIntent, FeedSort, FeedStatus } from '../services/feed/types';

const router = Router();
const feedService = new FeedServiceImpl(db);
const FEED_UNIFIED_QUERY_FIELDS = [
  'limit',
  'offset',
  'sort',
  'status',
  'intent',
  'from',
  'to',
  'cursor',
] as const;
const FEED_LIST_QUERY_FIELDS = ['limit', 'offset'] as const;
const FEED_FOLLOWING_QUERY_FIELDS = [
  'limit',
  'offset',
  'sort',
  'status',
] as const;
const FEED_MAX_LIMIT = 100;
const FEED_MAX_OFFSET = 10_000;

const assertAllowedQueryFields = (
  query: unknown,
  allowed: readonly string[],
  errorCode: string,
) => {
  const queryRecord =
    query && typeof query === 'object'
      ? (query as Record<string, unknown>)
      : {};
  const unknown = Object.keys(queryRecord).filter(
    (key) => !allowed.includes(key),
  );
  if (unknown.length > 0) {
    throw new ServiceError(
      errorCode,
      `Unsupported query fields: ${unknown.join(', ')}`,
      400,
    );
  }
  return queryRecord;
};

const parsePaginationQuery = (query: Record<string, unknown>) => {
  const parseBoundedInteger = (
    value: unknown,
    {
      field,
      min,
      max,
    }: {
      field: string;
      min: number;
      max: number;
    },
  ): number | undefined => {
    if (value === undefined) {
      return undefined;
    }
    const parsed = Number(value);
    if (!(Number.isFinite(parsed) && Number.isInteger(parsed))) {
      throw new ServiceError(
        'FEED_PAGINATION_INVALID',
        `${field} must be an integer.`,
        400,
      );
    }
    if (parsed < min || parsed > max) {
      throw new ServiceError(
        'FEED_PAGINATION_INVALID',
        `${field} must be between ${min} and ${max}.`,
        400,
      );
    }
    return parsed;
  };

  const limit = parseBoundedInteger(query.limit, {
    field: 'limit',
    min: 1,
    max: FEED_MAX_LIMIT,
  });
  const offset = parseBoundedInteger(query.offset, {
    field: 'offset',
    min: 0,
    max: FEED_MAX_OFFSET,
  });
  return { limit, offset };
};

const parseDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const parseOptionalObserverId = (req: Request): string | undefined => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return undefined;
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch (_error) {
    return undefined;
  }
};

router.get(
  '/feed',
  cacheResponse({
    ttlMs: 15_000,
    keyBuilder: (req) => `feed:unified:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_UNIFIED_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);
      const sort = typeof query.sort === 'string' ? query.sort : undefined;
      const status =
        typeof query.status === 'string' ? query.status : undefined;
      const intent =
        typeof query.intent === 'string' ? query.intent : undefined;
      const from = parseDate(query.from);
      const to = parseDate(query.to);
      const cursor = parseDate(query.cursor);

      if (query.from && !from) {
        return res.status(400).json({ error: 'Invalid from date.' });
      }

      if (query.to && !to) {
        return res.status(400).json({ error: 'Invalid to date.' });
      }

      if (query.cursor && !cursor) {
        return res.status(400).json({ error: 'Invalid cursor date.' });
      }

      const allowedSorts: FeedSort[] = ['recent', 'impact', 'glowup'];
      const allowedStatuses: FeedStatus[] = ['draft', 'release', 'pr'];
      const allowedIntents: FeedIntent[] = [
        'needs_help',
        'seeking_pr',
        'ready_for_review',
      ];

      if (sort && !allowedSorts.includes(sort as FeedSort)) {
        return res.status(400).json({ error: 'Invalid sort value.' });
      }

      if (status && !allowedStatuses.includes(status as FeedStatus)) {
        return res.status(400).json({ error: 'Invalid status value.' });
      }

      if (intent && !allowedIntents.includes(intent as FeedIntent)) {
        return res.status(400).json({ error: 'Invalid intent value.' });
      }

      const items = await feedService.getFeed({
        limit,
        offset,
        sort: sort as FeedSort | undefined,
        status: status as FeedStatus | undefined,
        intent: intent as FeedIntent | undefined,
        from,
        to,
        cursor,
      });
      res.set('Cache-Control', 'public, max-age=30');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/feeds/hot-now',
  cacheResponse({
    ttlMs: 10_000,
    keyBuilder: (req) => `feed:hot-now:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_LIST_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);

      const items = await feedService.getHotNow({ limit, offset });
      res.set('Cache-Control', 'public, max-age=15');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/feeds/progress',
  cacheResponse({
    ttlMs: 20_000,
    keyBuilder: (req) => `feed:progress:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_LIST_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);
      const items = await feedService.getProgress({ limit, offset });
      res.set('Cache-Control', 'public, max-age=30');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/feeds/for-you',
  requireHuman,
  cacheResponse({
    ttlMs: 15_000,
    keyBuilder: (req) =>
      `feed:for-you:${req.auth?.id ?? 'anon'}:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_LIST_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);
      const items = await feedService.getForYou({
        userId: req.auth?.id as string,
        limit,
        offset,
      });
      res.set('Cache-Control', 'private, max-age=30');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/feeds/live-drafts',
  cacheResponse({
    ttlMs: 10_000,
    keyBuilder: (req) => `feed:live:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_LIST_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);
      const items = await feedService.getLiveDrafts({ limit, offset });
      res.set('Cache-Control', 'public, max-age=15');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/feeds/glowups',
  cacheResponse({
    ttlMs: 30_000,
    keyBuilder: (req) => `feed:glowups:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_LIST_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);
      const items = await feedService.getGlowUps({ limit, offset });
      res.set('Cache-Control', 'public, max-age=60');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/feeds/changes',
  cacheResponse({
    ttlMs: 20_000,
    keyBuilder: (req) => `feed:changes:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_LIST_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);
      const items = await feedService.getChanges({ limit, offset });
      res.set('Cache-Control', 'public, max-age=30');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/feeds/studios',
  cacheResponse({
    ttlMs: 60_000,
    keyBuilder: (req) =>
      `feed:studios:${parseOptionalObserverId(req) ?? 'anon'}:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_LIST_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);
      const userId = parseOptionalObserverId(req);
      const items = await feedService.getStudios({ limit, offset, userId });
      res.set('Cache-Control', 'public, max-age=120');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/feeds/following',
  requireHuman,
  cacheResponse({
    ttlMs: 15_000,
    keyBuilder: (req) =>
      `feed:following:${req.auth?.id ?? 'anon'}:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_FOLLOWING_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);
      const sort = typeof query.sort === 'string' ? query.sort : undefined;
      const status =
        typeof query.status === 'string' ? query.status : undefined;
      const allowedSorts: FeedSort[] = ['recent', 'impact', 'glowup'];
      const allowedStatuses = ['draft', 'release'] as const;

      if (sort && !allowedSorts.includes(sort as FeedSort)) {
        return res.status(400).json({ error: 'Invalid sort value.' });
      }

      if (
        status &&
        !allowedStatuses.includes(status as (typeof allowedStatuses)[number])
      ) {
        return res.status(400).json({ error: 'Invalid status value.' });
      }

      const items = await feedService.getFeed({
        limit,
        offset,
        userId: req.auth?.id as string,
        followingOnly: true,
        sort: (sort as FeedSort | undefined) ?? 'recent',
        status: status as FeedStatus | undefined,
      });
      res.set('Cache-Control', 'private, max-age=30');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/feeds/battles',
  cacheResponse({
    ttlMs: 20_000,
    keyBuilder: (req) => `feed:battles:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_LIST_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);
      const items = await feedService.getBattles({ limit, offset });
      res.set('Cache-Control', 'public, max-age=30');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/feeds/archive',
  cacheResponse({
    ttlMs: 60_000,
    keyBuilder: (req) => `feed:archive:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        FEED_LIST_QUERY_FIELDS,
        'FEED_INVALID_QUERY_FIELDS',
      );
      const { limit, offset } = parsePaginationQuery(query);
      const items = await feedService.getArchive({ limit, offset });
      res.set('Cache-Control', 'public, max-age=120');
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
