import { Router } from 'express';
import { db } from '../db/pool';
import { logger } from '../logging/logger';
import { cacheResponse } from '../middleware/responseCache';
import { computeHeavyRateLimiter } from '../middleware/security';
import { ServiceError } from '../services/common/errors';
import { SearchServiceImpl } from '../services/search/searchService';
import type {
  SearchIntent,
  SearchProfile,
  SearchRange,
  SearchSort,
  SearchType,
  VisualSearchFilters,
} from '../services/search/types';

const router = Router();
const searchService = new SearchServiceImpl(db);
const SEARCH_TYPES: SearchType[] = ['draft', 'release', 'studio', 'all'];
const SEARCH_SORTS: SearchSort[] = ['glowup', 'recency', 'impact', 'relevance'];
const SEARCH_RANGES: SearchRange[] = ['7d', '30d', 'all'];
const SEARCH_PROFILES: SearchProfile[] = ['balanced', 'quality', 'novelty'];
const SEARCH_INTENTS: SearchIntent[] = [
  'needs_help',
  'seeking_pr',
  'ready_for_review',
];
const VISUAL_TYPES: NonNullable<VisualSearchFilters['type']>[] = [
  'draft',
  'release',
  'all',
];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISUAL_ALLOWED_FIELDS = new Set([
  'embedding',
  'draftId',
  'type',
  'tags',
  'limit',
  'offset',
]);
const STYLE_FUSION_ALLOWED_FIELDS = new Set(['draftId', 'type', 'limit']);
const SEARCH_MAX_OFFSET = 10_000;

const parseEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined => {
  if (!(typeof value === 'string' && allowed.includes(value as T))) {
    return undefined;
  }
  return value as T;
};

const isUuid = (value: string) => UUID_PATTERN.test(value);

const parseLimit = (
  value: unknown,
  { field, max }: { field: string; max: number },
): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!(Number.isFinite(parsed) && Number.isInteger(parsed))) {
    throw new ServiceError(
      'SEARCH_PAGINATION_INVALID',
      `${field} must be an integer.`,
      400,
    );
  }
  if (parsed < 1 || parsed > max) {
    throw new ServiceError(
      'SEARCH_PAGINATION_INVALID',
      `${field} must be between 1 and ${max}.`,
      400,
    );
  }
  return parsed;
};

const parseOffset = (
  value: unknown,
  {
    field = 'offset',
    max = SEARCH_MAX_OFFSET,
  }: { field?: string; max?: number } = {},
): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!(Number.isFinite(parsed) && Number.isInteger(parsed)) || parsed < 0) {
    throw new ServiceError(
      'SEARCH_PAGINATION_INVALID',
      `${field} must be an integer >= 0.`,
      400,
    );
  }
  if (parsed > max) {
    throw new ServiceError(
      'SEARCH_PAGINATION_INVALID',
      `${field} must be between 0 and ${max}.`,
      400,
    );
  }
  return parsed;
};

const assertAllowedFields = (
  payload: Record<string, unknown>,
  allowed: Set<string>,
  errorCode: string,
) => {
  const unknown = Object.keys(payload).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new ServiceError(
      errorCode,
      `Unsupported fields: ${unknown.join(', ')}.`,
      400,
    );
  }
};

const assertAllowedQueryFields = (
  query: unknown,
  {
    allowed,
    errorCode,
  }: {
    allowed: readonly string[];
    errorCode: string;
  },
): Record<string, unknown> => {
  const queryRecord =
    typeof query === 'object' && query !== null
      ? (query as Record<string, unknown>)
      : {};
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(queryRecord).filter(
    (key) => !allowedSet.has(key),
  );
  if (unknown.length > 0) {
    throw new ServiceError(
      errorCode,
      `Unsupported query fields: ${unknown.join(', ')}.`,
      400,
    );
  }
  return queryRecord;
};

const writeStyleFusionTelemetry = async (params: {
  draftId: string;
  status: string;
  metadata?: Record<string, unknown>;
}) => {
  try {
    await db.query(
      `INSERT INTO ux_events
       (event_type, user_type, user_id, draft_id, status, source, metadata)
       VALUES ('style_fusion_generate', 'anonymous', NULL, $1, $2, 'api', $3)`,
      [params.draftId, params.status, params.metadata ?? {}],
    );
  } catch (error) {
    logger.warn(
      {
        err: error,
        draftId: params.draftId,
        status: params.status,
      },
      'style fusion telemetry insert failed',
    );
  }
};

router.get(
  '/search',
  cacheResponse({
    ttlMs: 30_000,
    keyBuilder: (req) => `search:${req.originalUrl}`,
  }),
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(req.query, {
        allowed: [
          'q',
          'type',
          'sort',
          'range',
          'profile',
          'intent',
          'limit',
          'offset',
        ],
        errorCode: 'SEARCH_INVALID_QUERY_FIELDS',
      });
      const q = String(query.q ?? '');
      const type = parseEnum(query.type, SEARCH_TYPES);
      const sort = parseEnum(query.sort, SEARCH_SORTS);
      const range = parseEnum(query.range, SEARCH_RANGES);
      const profile = parseEnum(query.profile, SEARCH_PROFILES);
      const intent = parseEnum(query.intent, SEARCH_INTENTS);
      const limit = parseLimit(query.limit, { field: 'limit', max: 100 });
      const offset = parseOffset(query.offset);
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
      const query = assertAllowedQueryFields(req.query, {
        allowed: ['draftId', 'type', 'limit', 'offset', 'exclude'],
        errorCode: 'SEARCH_INVALID_QUERY_FIELDS',
      });
      const draftId = String(query.draftId ?? '');
      if (!draftId) {
        throw new ServiceError('DRAFT_ID_REQUIRED', 'Provide a draftId.', 400);
      }
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const type = parseEnum(query.type, VISUAL_TYPES);
      const limit = parseLimit(query.limit, { field: 'limit', max: 50 });
      const offset = parseOffset(query.offset);
      const excludeDraftId = query.exclude ? String(query.exclude) : undefined;
      if (excludeDraftId && !isUuid(excludeDraftId)) {
        throw new ServiceError(
          'DRAFT_ID_INVALID',
          'Invalid exclude draft id.',
          400,
        );
      }

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

router.post(
  '/search/visual',
  computeHeavyRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(req.query, {
        allowed: [],
        errorCode: 'SEARCH_INVALID_QUERY_FIELDS',
      });
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as Record<string, unknown>)
          : {};
      assertAllowedFields(
        body,
        VISUAL_ALLOWED_FIELDS,
        'SEARCH_VISUAL_INVALID_FIELDS',
      );
      const { embedding, draftId, tags, limit, offset } = body;
      const normalizedDraftId =
        typeof draftId === 'string' ? draftId.trim() : undefined;
      if (normalizedDraftId && !isUuid(normalizedDraftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      let parsedEmbedding: number[] | undefined;
      if (embedding !== undefined) {
        if (!Array.isArray(embedding)) {
          throw new ServiceError(
            'EMBEDDING_INVALID',
            'embedding must be a numeric array.',
            400,
          );
        }
        parsedEmbedding = embedding.map((value) => Number(value));
        if (!parsedEmbedding.every((value) => Number.isFinite(value))) {
          throw new ServiceError(
            'EMBEDDING_INVALID',
            'embedding must contain only numbers.',
            400,
          );
        }
      }
      if (!(parsedEmbedding || normalizedDraftId)) {
        throw new ServiceError(
          'EMBEDDING_REQUIRED',
          'Provide embedding or draftId.',
          400,
        );
      }
      let tagList: string[] | undefined;
      if (Array.isArray(tags)) {
        if (tags.some((tag) => typeof tag !== 'string')) {
          throw new ServiceError(
            'SEARCH_VISUAL_TAGS_INVALID',
            'tags must contain strings only.',
            400,
          );
        }
        tagList = tags.map((tag) => tag.trim()).filter(Boolean);
      } else if (typeof tags === 'string') {
        tagList = [tags.trim()].filter(Boolean);
      } else if (tags !== undefined) {
        throw new ServiceError(
          'SEARCH_VISUAL_TAGS_INVALID',
          'tags must be a string or string array.',
          400,
        );
      }
      const parsedType = parseEnum(body.type, VISUAL_TYPES);
      const results = await searchService.searchVisual({
        embedding: parsedEmbedding,
        draftId: normalizedDraftId,
        filters: {
          type: parsedType,
          tags: tagList,
          limit: parseLimit(limit, { field: 'limit', max: 100 }),
          offset: parseOffset(offset),
        },
      });
      res.json(results);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/search/style-fusion',
  computeHeavyRateLimiter,
  async (req, res, next) => {
    let draftId = '';
    let type: VisualSearchFilters['type'] | undefined;
    let limit: number | undefined;
    try {
      assertAllowedQueryFields(req.query, {
        allowed: [],
        errorCode: 'SEARCH_INVALID_QUERY_FIELDS',
      });
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as Record<string, unknown>)
          : {};
      assertAllowedFields(
        body,
        STYLE_FUSION_ALLOWED_FIELDS,
        'STYLE_FUSION_INVALID_FIELDS',
      );
      draftId = String(body.draftId ?? '').trim();
      if (!draftId) {
        throw new ServiceError('DRAFT_ID_REQUIRED', 'Provide a draftId.', 400);
      }
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }

      type = parseEnum(body.type, VISUAL_TYPES);
      limit = parseLimit(body.limit, { field: 'limit', max: 5 });

      const result = await searchService.generateStyleFusion(draftId, {
        type,
        limit,
      });
      await writeStyleFusionTelemetry({
        draftId,
        status: 'success',
        metadata: {
          sampleCount: result.sample.length,
          type: type ?? 'all',
          limit: limit ?? 3,
        },
      });
      res.json(result);
    } catch (error) {
      if (draftId && isUuid(draftId)) {
        const errorCode =
          error instanceof ServiceError
            ? error.code
            : 'STYLE_FUSION_INTERNAL_ERROR';
        await writeStyleFusionTelemetry({
          draftId,
          status: 'error',
          metadata: {
            errorCode,
            type: type ?? 'all',
            limit: limit ?? 3,
          },
        });
      }
      next(error);
    }
  },
);

export default router;
