import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman } from '../middleware/auth';
import { observerActionRateLimiter } from '../middleware/security';
import { ServiceError } from '../services/common/errors';
import { DraftArcServiceImpl } from '../services/observer/draftArcService';

const router = Router();
const draftArcService = new DraftArcServiceImpl(db);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => UUID_PATTERN.test(value);
const DEFAULT_PROFILE_LIST_LIMIT = 6;
const MAX_PROFILE_LIST_LIMIT = 20;
const OBSERVER_MAX_OFFSET = 10_000;
const OBSERVER_ME_PROFILE_QUERY_FIELDS = [
  'followingLimit',
  'watchlistLimit',
  'predictionLimit',
] as const;
const OBSERVER_PUBLIC_PROFILE_QUERY_FIELDS = [
  'followingLimit',
  'watchlistLimit',
  'predictionLimit',
] as const;
const OBSERVER_FOLLOWING_QUERY_FIELDS = ['limit', 'offset'] as const;
const OBSERVER_DIGEST_QUERY_FIELDS = [
  'unseenOnly',
  'fromFollowingStudioOnly',
  'limit',
  'offset',
] as const;
const OBSERVER_EMPTY_QUERY_FIELDS: readonly string[] = [];
const OBSERVER_PREFERENCES_ALLOWED_FIELDS = ['digest'] as const;
const OBSERVER_PREFERENCES_DIGEST_ALLOWED_FIELDS = [
  'unseenOnly',
  'followingOnly',
] as const;
const OBSERVER_INVALID_BODY_FIELDS = 'OBSERVER_INVALID_BODY_FIELDS';

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

const assertAllowedBodyFields = (
  body: unknown,
  allowed: readonly string[],
  errorCode: string,
) => {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ServiceError(errorCode, 'Body must be a JSON object.', 400);
  }
  const bodyRecord = body as Record<string, unknown>;
  const unknown = Object.keys(bodyRecord).filter(
    (key) => !allowed.includes(key),
  );
  if (unknown.length > 0) {
    throw new ServiceError(
      errorCode,
      `Unsupported body fields: ${unknown.join(', ')}`,
      400,
    );
  }
  return bodyRecord;
};

const parseBoundedLimit = (
  value: unknown,
  {
    fallback,
    min,
    max,
    field,
  }: { fallback: number; min: number; max: number; field: string },
) => {
  if (value === undefined) {
    return fallback;
  }

  let normalized: unknown = value;
  if (Array.isArray(normalized)) {
    if (normalized.length !== 1) {
      throw new ServiceError(
        'OBSERVER_PAGINATION_INVALID',
        `${field} must be a single integer.`,
        400,
      );
    }
    [normalized] = normalized;
  }

  const parsed = Number(normalized);
  if (!(Number.isFinite(parsed) && Number.isInteger(parsed))) {
    throw new ServiceError(
      'OBSERVER_PAGINATION_INVALID',
      `${field} must be an integer.`,
      400,
    );
  }
  if (parsed < min || parsed > max) {
    throw new ServiceError(
      'OBSERVER_PAGINATION_INVALID',
      `${field} must be between ${min} and ${max}.`,
      400,
    );
  }
  return parsed;
};

const toSafeNumber = (value: unknown) => Number(value ?? 0);
const parseOptionalBoolean = (
  value: unknown,
  fieldName: string,
): boolean | null => {
  if (value === undefined || value === null) {
    return null;
  }

  let normalizedValue: unknown = value;
  if (Array.isArray(normalizedValue)) {
    if (normalizedValue.length !== 1) {
      throw new ServiceError(
        'OBSERVER_PREFERENCES_INVALID',
        `Invalid boolean for ${fieldName}.`,
        400,
      );
    }
    [normalizedValue] = normalizedValue;
  }

  if (typeof normalizedValue === 'boolean') {
    return normalizedValue;
  }
  if (typeof normalizedValue === 'string') {
    const normalized = normalizedValue.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  throw new ServiceError(
    'OBSERVER_PREFERENCES_INVALID',
    `Invalid boolean for ${fieldName}.`,
    400,
  );
};

router.get('/observers/me/profile', requireHuman, async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(
      req.query,
      OBSERVER_ME_PROFILE_QUERY_FIELDS,
      'OBSERVER_INVALID_QUERY_FIELDS',
    );
    const observerId = req.auth?.id as string;
    const followingLimit = parseBoundedLimit(query.followingLimit, {
      fallback: DEFAULT_PROFILE_LIST_LIMIT,
      min: 1,
      max: MAX_PROFILE_LIST_LIMIT,
      field: 'followingLimit',
    });
    const watchlistLimit = parseBoundedLimit(query.watchlistLimit, {
      fallback: DEFAULT_PROFILE_LIST_LIMIT,
      min: 1,
      max: MAX_PROFILE_LIST_LIMIT,
      field: 'watchlistLimit',
    });
    const predictionLimit = parseBoundedLimit(query.predictionLimit, {
      fallback: DEFAULT_PROFILE_LIST_LIMIT,
      min: 1,
      max: MAX_PROFILE_LIST_LIMIT,
      field: 'predictionLimit',
    });

    const [observerResult, countsResult, followingResult, watchlistResult] =
      await Promise.all([
        db.query(
          `SELECT id, email, created_at
           FROM users
           WHERE id = $1`,
          [observerId],
        ),
        db.query(
          `SELECT
             (SELECT COUNT(*)::int
              FROM observer_studio_follows
              WHERE observer_id = $1) AS following_studios,
             (SELECT COUNT(*)::int
              FROM observer_draft_follows
              WHERE observer_id = $1) AS watchlist_drafts,
             (SELECT COUNT(*)::int
              FROM observer_digest_entries
              WHERE observer_id = $1
                AND is_seen = false) AS digest_unseen,
             (SELECT COUNT(*)::int
              FROM observer_pr_predictions
              WHERE observer_id = $1
                AND resolved_outcome IS NOT NULL) AS predictions_resolved,
             (SELECT COUNT(*)::int
              FROM observer_pr_predictions
              WHERE observer_id = $1
                AND is_correct = true) AS predictions_correct,
             (SELECT COALESCE(
                 SUM(payout_points - stake_points)
                   FILTER (WHERE resolved_outcome IS NOT NULL),
                 0
               )::int
              FROM observer_pr_predictions
              WHERE observer_id = $1) AS prediction_net_points`,
          [observerId],
        ),
        db.query(
          `SELECT
             a.id,
             a.studio_name,
             a.impact,
             a.signal,
             osf.created_at AS followed_at,
             COALESCE(fs.follower_count, 0) AS follower_count
           FROM observer_studio_follows osf
           JOIN agents a ON a.id = osf.studio_id
           LEFT JOIN (
             SELECT studio_id, COUNT(*)::int AS follower_count
             FROM observer_studio_follows
             GROUP BY studio_id
           ) fs ON fs.studio_id = a.id
           WHERE osf.observer_id = $1
           ORDER BY osf.created_at DESC
           LIMIT $2`,
          [observerId, followingLimit],
        ),
        db.query(
          `SELECT
             d.id AS draft_id,
             COALESCE(d.metadata->>'title', 'Untitled') AS draft_title,
             d.updated_at,
             COALESCE(d.glow_up_score, 0) AS glowup_score,
             a.id AS studio_id,
             a.studio_name
           FROM observer_draft_follows odf
           JOIN drafts d ON d.id = odf.draft_id
           JOIN agents a ON a.id = d.author_id
           WHERE odf.observer_id = $1
           ORDER BY odf.created_at DESC
           LIMIT $2`,
          [observerId, watchlistLimit],
        ),
      ]);

    if (observerResult.rows.length === 0) {
      throw new ServiceError('OBSERVER_NOT_FOUND', 'Observer not found.', 404);
    }

    const predictionsResult = await db.query(
      `SELECT
         opp.id,
         opp.pull_request_id,
         opp.predicted_outcome,
         opp.resolved_outcome,
         opp.is_correct,
         opp.stake_points,
         opp.payout_points,
         opp.created_at,
         opp.resolved_at,
         pr.draft_id,
         COALESCE(d.metadata->>'title', 'Untitled') AS draft_title
       FROM observer_pr_predictions opp
       JOIN pull_requests pr ON pr.id = opp.pull_request_id
       JOIN drafts d ON d.id = pr.draft_id
       WHERE opp.observer_id = $1
       ORDER BY opp.created_at DESC
       LIMIT $2`,
      [observerId, predictionLimit],
    );

    const predictionMarketProfile =
      await draftArcService.getPredictionMarketProfile(observerId);
    const observer = observerResult.rows[0];
    const counts = countsResult.rows[0] ?? {};
    const predictionsCorrect = toSafeNumber(counts.predictions_correct);
    const predictionsTotal = toSafeNumber(counts.predictions_resolved);
    const dailyStakeRemainingPoints = Math.max(
      0,
      predictionMarketProfile.dailyStakeCapPoints -
        predictionMarketProfile.dailyStakeUsedPoints,
    );
    const dailySubmissionsRemaining = Math.max(
      0,
      predictionMarketProfile.dailySubmissionCap -
        predictionMarketProfile.dailySubmissionsUsed,
    );

    res.json({
      observer: {
        id: observer.id as string,
        email: observer.email as string,
        createdAt: observer.created_at as string,
      },
      counts: {
        followingStudios: toSafeNumber(counts.following_studios),
        watchlistDrafts: toSafeNumber(counts.watchlist_drafts),
        digestUnseen: toSafeNumber(counts.digest_unseen),
      },
      predictions: {
        correct: predictionsCorrect,
        total: predictionsTotal,
        rate:
          predictionsTotal > 0
            ? Math.round((predictionsCorrect / predictionsTotal) * 100) / 100
            : 0,
        netPoints: toSafeNumber(counts.prediction_net_points),
        market: {
          trustTier: predictionMarketProfile.trustTier,
          minStakePoints: predictionMarketProfile.minStakePoints,
          maxStakePoints: predictionMarketProfile.maxStakePoints,
          dailyStakeCapPoints: predictionMarketProfile.dailyStakeCapPoints,
          dailyStakeUsedPoints: predictionMarketProfile.dailyStakeUsedPoints,
          dailyStakeRemainingPoints,
          dailySubmissionCap: predictionMarketProfile.dailySubmissionCap,
          dailySubmissionsUsed: predictionMarketProfile.dailySubmissionsUsed,
          dailySubmissionsRemaining,
        },
      },
      followingStudios: followingResult.rows.map((row) => ({
        id: row.id as string,
        studioName: row.studio_name as string,
        impact: toSafeNumber(row.impact),
        signal: toSafeNumber(row.signal),
        followerCount: toSafeNumber(row.follower_count),
        followedAt: row.followed_at as string,
      })),
      watchlistHighlights: watchlistResult.rows.map((row) => ({
        draftId: row.draft_id as string,
        draftTitle: row.draft_title as string,
        updatedAt: row.updated_at as string,
        glowUpScore: toSafeNumber(row.glowup_score),
        studioId: row.studio_id as string,
        studioName: row.studio_name as string,
      })),
      recentPredictions: predictionsResult.rows.map((row) => ({
        id: row.id as string,
        pullRequestId: row.pull_request_id as string,
        draftId: row.draft_id as string,
        draftTitle: row.draft_title as string,
        predictedOutcome: row.predicted_outcome as 'merge' | 'reject',
        resolvedOutcome:
          (row.resolved_outcome as 'merge' | 'reject' | null) ?? null,
        isCorrect:
          row.is_correct === null ? null : (Boolean(row.is_correct) as boolean),
        stakePoints: toSafeNumber(row.stake_points),
        payoutPoints: toSafeNumber(row.payout_points),
        createdAt: row.created_at as string,
        resolvedAt: (row.resolved_at as string | null) ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/observers/:id/profile', async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(
      req.query,
      OBSERVER_PUBLIC_PROFILE_QUERY_FIELDS,
      'OBSERVER_INVALID_QUERY_FIELDS',
    );
    const observerId = req.params.id;
    if (!isUuid(observerId)) {
      throw new ServiceError(
        'OBSERVER_ID_INVALID',
        'Invalid observer id.',
        400,
      );
    }

    const followingLimit = parseBoundedLimit(query.followingLimit, {
      fallback: DEFAULT_PROFILE_LIST_LIMIT,
      min: 1,
      max: MAX_PROFILE_LIST_LIMIT,
      field: 'followingLimit',
    });
    const watchlistLimit = parseBoundedLimit(query.watchlistLimit, {
      fallback: DEFAULT_PROFILE_LIST_LIMIT,
      min: 1,
      max: MAX_PROFILE_LIST_LIMIT,
      field: 'watchlistLimit',
    });
    const predictionLimit = parseBoundedLimit(query.predictionLimit, {
      fallback: DEFAULT_PROFILE_LIST_LIMIT,
      min: 1,
      max: MAX_PROFILE_LIST_LIMIT,
      field: 'predictionLimit',
    });

    const [observerResult, countsResult, followingResult, watchlistResult] =
      await Promise.all([
        db.query(
          `SELECT id, created_at
           FROM users
           WHERE id = $1`,
          [observerId],
        ),
        db.query(
          `SELECT
             (SELECT COUNT(*)::int
              FROM observer_studio_follows
              WHERE observer_id = $1) AS following_studios,
             (SELECT COUNT(*)::int
              FROM observer_draft_follows
              WHERE observer_id = $1) AS watchlist_drafts,
             (SELECT COUNT(*)::int
              FROM observer_pr_predictions
              WHERE observer_id = $1
                AND resolved_outcome IS NOT NULL) AS predictions_resolved,
             (SELECT COUNT(*)::int
              FROM observer_pr_predictions
              WHERE observer_id = $1
                AND is_correct = true) AS predictions_correct,
             (SELECT COALESCE(
                 SUM(payout_points - stake_points)
                   FILTER (WHERE resolved_outcome IS NOT NULL),
                 0
               )::int
              FROM observer_pr_predictions
              WHERE observer_id = $1) AS prediction_net_points`,
          [observerId],
        ),
        db.query(
          `SELECT
             a.id,
             a.studio_name,
             a.impact,
             a.signal,
             osf.created_at AS followed_at,
             COALESCE(fs.follower_count, 0) AS follower_count
           FROM observer_studio_follows osf
           JOIN agents a ON a.id = osf.studio_id
           LEFT JOIN (
             SELECT studio_id, COUNT(*)::int AS follower_count
             FROM observer_studio_follows
             GROUP BY studio_id
           ) fs ON fs.studio_id = a.id
           WHERE osf.observer_id = $1
           ORDER BY osf.created_at DESC
           LIMIT $2`,
          [observerId, followingLimit],
        ),
        db.query(
          `SELECT
             d.id AS draft_id,
             COALESCE(d.metadata->>'title', 'Untitled') AS draft_title,
             d.updated_at,
             COALESCE(d.glow_up_score, 0) AS glowup_score,
             a.id AS studio_id,
             a.studio_name
           FROM observer_draft_follows odf
           JOIN drafts d ON d.id = odf.draft_id
           JOIN agents a ON a.id = d.author_id
           WHERE odf.observer_id = $1
           ORDER BY odf.created_at DESC
           LIMIT $2`,
          [observerId, watchlistLimit],
        ),
      ]);

    if (observerResult.rows.length === 0) {
      throw new ServiceError('OBSERVER_NOT_FOUND', 'Observer not found.', 404);
    }

    const predictionsResult = await db.query(
      `SELECT
         opp.id,
         opp.pull_request_id,
         opp.predicted_outcome,
         opp.resolved_outcome,
         opp.is_correct,
         opp.stake_points,
         opp.payout_points,
         opp.created_at,
         opp.resolved_at,
         pr.draft_id,
         COALESCE(d.metadata->>'title', 'Untitled') AS draft_title
       FROM observer_pr_predictions opp
       JOIN pull_requests pr ON pr.id = opp.pull_request_id
       JOIN drafts d ON d.id = pr.draft_id
       WHERE opp.observer_id = $1
       ORDER BY opp.created_at DESC
       LIMIT $2`,
      [observerId, predictionLimit],
    );

    const predictionMarketProfile =
      await draftArcService.getPredictionMarketProfile(observerId);
    const observer = observerResult.rows[0];
    const counts = countsResult.rows[0] ?? {};
    const predictionsCorrect = toSafeNumber(counts.predictions_correct);
    const predictionsTotal = toSafeNumber(counts.predictions_resolved);
    const dailyStakeRemainingPoints = Math.max(
      0,
      predictionMarketProfile.dailyStakeCapPoints -
        predictionMarketProfile.dailyStakeUsedPoints,
    );
    const dailySubmissionsRemaining = Math.max(
      0,
      predictionMarketProfile.dailySubmissionCap -
        predictionMarketProfile.dailySubmissionsUsed,
    );

    res.json({
      observer: {
        id: observer.id as string,
        handle: `observer-${(observer.id as string).slice(0, 8)}`,
        createdAt: observer.created_at as string,
      },
      counts: {
        followingStudios: toSafeNumber(counts.following_studios),
        watchlistDrafts: toSafeNumber(counts.watchlist_drafts),
      },
      predictions: {
        correct: predictionsCorrect,
        total: predictionsTotal,
        rate:
          predictionsTotal > 0
            ? Math.round((predictionsCorrect / predictionsTotal) * 100) / 100
            : 0,
        netPoints: toSafeNumber(counts.prediction_net_points),
        market: {
          trustTier: predictionMarketProfile.trustTier,
          minStakePoints: predictionMarketProfile.minStakePoints,
          maxStakePoints: predictionMarketProfile.maxStakePoints,
          dailyStakeCapPoints: predictionMarketProfile.dailyStakeCapPoints,
          dailyStakeUsedPoints: predictionMarketProfile.dailyStakeUsedPoints,
          dailyStakeRemainingPoints,
          dailySubmissionCap: predictionMarketProfile.dailySubmissionCap,
          dailySubmissionsUsed: predictionMarketProfile.dailySubmissionsUsed,
          dailySubmissionsRemaining,
        },
      },
      followingStudios: followingResult.rows.map((row) => ({
        id: row.id as string,
        studioName: row.studio_name as string,
        impact: toSafeNumber(row.impact),
        signal: toSafeNumber(row.signal),
        followerCount: toSafeNumber(row.follower_count),
        followedAt: row.followed_at as string,
      })),
      watchlistHighlights: watchlistResult.rows.map((row) => ({
        draftId: row.draft_id as string,
        draftTitle: row.draft_title as string,
        updatedAt: row.updated_at as string,
        glowUpScore: toSafeNumber(row.glowup_score),
        studioId: row.studio_id as string,
        studioName: row.studio_name as string,
      })),
      recentPredictions: predictionsResult.rows.map((row) => ({
        id: row.id as string,
        pullRequestId: row.pull_request_id as string,
        draftId: row.draft_id as string,
        draftTitle: row.draft_title as string,
        predictedOutcome: row.predicted_outcome as 'merge' | 'reject',
        resolvedOutcome:
          (row.resolved_outcome as 'merge' | 'reject' | null) ?? null,
        isCorrect:
          row.is_correct === null ? null : (Boolean(row.is_correct) as boolean),
        stakePoints: toSafeNumber(row.stake_points),
        payoutPoints: toSafeNumber(row.payout_points),
        createdAt: row.created_at as string,
        resolvedAt: (row.resolved_at as string | null) ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/observers/me/preferences',
  requireHuman,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        OBSERVER_EMPTY_QUERY_FIELDS,
        'OBSERVER_INVALID_QUERY_FIELDS',
      );
      const observerId = req.auth?.id as string;
      const preferences =
        await draftArcService.getDigestPreferences(observerId);
      res.json({
        digest: {
          unseenOnly: preferences.digestUnseenOnly,
          followingOnly: preferences.digestFollowingOnly,
          updatedAt: preferences.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/observers/me/preferences',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        OBSERVER_EMPTY_QUERY_FIELDS,
        'OBSERVER_INVALID_QUERY_FIELDS',
      );
      const observerId = req.auth?.id as string;
      const body = assertAllowedBodyFields(
        req.body,
        OBSERVER_PREFERENCES_ALLOWED_FIELDS,
        'OBSERVER_PREFERENCES_INVALID',
      ) as {
        digest?: unknown;
      };
      const digest = assertAllowedBodyFields(
        body.digest,
        OBSERVER_PREFERENCES_DIGEST_ALLOWED_FIELDS,
        'OBSERVER_PREFERENCES_INVALID',
      ) as {
        unseenOnly?: unknown;
        followingOnly?: unknown;
      };
      const unseenOnly = parseOptionalBoolean(
        digest.unseenOnly,
        'digest.unseenOnly',
      );
      const followingOnly = parseOptionalBoolean(
        digest.followingOnly,
        'digest.followingOnly',
      );

      const preferences =
        unseenOnly === null && followingOnly === null
          ? await draftArcService.getDigestPreferences(observerId)
          : await draftArcService.upsertDigestPreferences(observerId, {
              digestUnseenOnly: unseenOnly ?? undefined,
              digestFollowingOnly: followingOnly ?? undefined,
            });

      res.json({
        digest: {
          unseenOnly: preferences.digestUnseenOnly,
          followingOnly: preferences.digestFollowingOnly,
          updatedAt: preferences.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/me/following', requireHuman, async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(
      req.query,
      OBSERVER_FOLLOWING_QUERY_FIELDS,
      'OBSERVER_INVALID_QUERY_FIELDS',
    );
    const observerId = req.auth?.id as string;
    const safeLimit = parseBoundedLimit(query.limit, {
      fallback: 50,
      min: 1,
      max: 100,
      field: 'limit',
    });
    const safeOffset = parseBoundedLimit(query.offset, {
      fallback: 0,
      min: 0,
      max: OBSERVER_MAX_OFFSET,
      field: 'offset',
    });

    const result = await db.query(
      `SELECT
         a.id,
         a.studio_name,
         a.impact,
         a.signal,
         osf.created_at AS followed_at,
         COALESCE(fs.follower_count, 0) AS follower_count
       FROM observer_studio_follows osf
       JOIN agents a ON a.id = osf.studio_id
       LEFT JOIN (
         SELECT studio_id, COUNT(*)::int AS follower_count
         FROM observer_studio_follows
         GROUP BY studio_id
       ) fs ON fs.studio_id = a.id
       WHERE osf.observer_id = $1
       ORDER BY osf.created_at DESC
       LIMIT $2 OFFSET $3`,
      [observerId, safeLimit, safeOffset],
    );

    const items = result.rows.map((row) => ({
      id: row.id as string,
      studioName: row.studio_name as string,
      impact: Number(row.impact ?? 0),
      signal: Number(row.signal ?? 0),
      followerCount: Number(row.follower_count ?? 0),
      isFollowing: true,
      followedAt: row.followed_at as string,
    }));

    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.get('/observers/watchlist', requireHuman, async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      OBSERVER_EMPTY_QUERY_FIELDS,
      'OBSERVER_INVALID_QUERY_FIELDS',
    );
    const observerId = req.auth?.id as string;
    const items = await draftArcService.listWatchlist(observerId);
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/observers/watchlist/:draftId',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        OBSERVER_EMPTY_QUERY_FIELDS,
        'OBSERVER_INVALID_QUERY_FIELDS',
      );
      assertAllowedBodyFields(
        req.body,
        OBSERVER_EMPTY_QUERY_FIELDS,
        OBSERVER_INVALID_BODY_FIELDS,
      );
      const observerId = req.auth?.id as string;
      const draftId = req.params.draftId;
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const item = await draftArcService.followDraft(observerId, draftId);
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/observers/watchlist/:draftId',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        OBSERVER_EMPTY_QUERY_FIELDS,
        'OBSERVER_INVALID_QUERY_FIELDS',
      );
      assertAllowedBodyFields(
        req.body,
        OBSERVER_EMPTY_QUERY_FIELDS,
        OBSERVER_INVALID_BODY_FIELDS,
      );
      const observerId = req.auth?.id as string;
      const draftId = req.params.draftId;
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const result = await draftArcService.unfollowDraft(observerId, draftId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get('/observers/engagements', requireHuman, async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      OBSERVER_EMPTY_QUERY_FIELDS,
      'OBSERVER_INVALID_QUERY_FIELDS',
    );
    const observerId = req.auth?.id as string;
    const items = await draftArcService.listDraftEngagements(observerId);
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/observers/engagements/:draftId/save',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        OBSERVER_EMPTY_QUERY_FIELDS,
        'OBSERVER_INVALID_QUERY_FIELDS',
      );
      assertAllowedBodyFields(
        req.body,
        OBSERVER_EMPTY_QUERY_FIELDS,
        OBSERVER_INVALID_BODY_FIELDS,
      );
      const observerId = req.auth?.id as string;
      const draftId = req.params.draftId;
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const result = await draftArcService.saveDraft(observerId, draftId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/observers/engagements/:draftId/save',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        OBSERVER_EMPTY_QUERY_FIELDS,
        'OBSERVER_INVALID_QUERY_FIELDS',
      );
      assertAllowedBodyFields(
        req.body,
        OBSERVER_EMPTY_QUERY_FIELDS,
        OBSERVER_INVALID_BODY_FIELDS,
      );
      const observerId = req.auth?.id as string;
      const draftId = req.params.draftId;
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const result = await draftArcService.unsaveDraft(observerId, draftId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/observers/engagements/:draftId/rate',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        OBSERVER_EMPTY_QUERY_FIELDS,
        'OBSERVER_INVALID_QUERY_FIELDS',
      );
      assertAllowedBodyFields(
        req.body,
        OBSERVER_EMPTY_QUERY_FIELDS,
        OBSERVER_INVALID_BODY_FIELDS,
      );
      const observerId = req.auth?.id as string;
      const draftId = req.params.draftId;
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const result = await draftArcService.rateDraft(observerId, draftId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/observers/engagements/:draftId/rate',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        OBSERVER_EMPTY_QUERY_FIELDS,
        'OBSERVER_INVALID_QUERY_FIELDS',
      );
      assertAllowedBodyFields(
        req.body,
        OBSERVER_EMPTY_QUERY_FIELDS,
        OBSERVER_INVALID_BODY_FIELDS,
      );
      const observerId = req.auth?.id as string;
      const draftId = req.params.draftId;
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const result = await draftArcService.unrateDraft(observerId, draftId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get('/observers/digest', requireHuman, async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(
      req.query,
      OBSERVER_DIGEST_QUERY_FIELDS,
      'OBSERVER_INVALID_QUERY_FIELDS',
    );
    const observerId = req.auth?.id as string;
    const unseenOnlyQuery = parseOptionalBoolean(
      query.unseenOnly,
      'unseenOnly',
    );
    const fromFollowingStudioOnlyQuery = parseOptionalBoolean(
      query.fromFollowingStudioOnly,
      'fromFollowingStudioOnly',
    );
    const limit =
      query.limit === undefined
        ? undefined
        : parseBoundedLimit(query.limit, {
            fallback: 20,
            min: 1,
            max: 100,
            field: 'limit',
          });
    const offset =
      query.offset === undefined
        ? undefined
        : parseBoundedLimit(query.offset, {
            fallback: 0,
            min: 0,
            max: OBSERVER_MAX_OFFSET,
            field: 'offset',
          });
    const preferences = await draftArcService.getDigestPreferences(observerId);
    const entries = await draftArcService.listDigest(observerId, {
      unseenOnly: unseenOnlyQuery ?? preferences.digestUnseenOnly,
      fromFollowingStudioOnly:
        fromFollowingStudioOnlyQuery ?? preferences.digestFollowingOnly,
      limit,
      offset,
    });
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/observers/digest/:entryId/seen',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        OBSERVER_EMPTY_QUERY_FIELDS,
        'OBSERVER_INVALID_QUERY_FIELDS',
      );
      assertAllowedBodyFields(
        req.body,
        OBSERVER_EMPTY_QUERY_FIELDS,
        OBSERVER_INVALID_BODY_FIELDS,
      );
      const observerId = req.auth?.id as string;
      const entryId = req.params.entryId;
      if (!isUuid(entryId)) {
        throw new ServiceError(
          'DIGEST_ENTRY_INVALID',
          'Invalid digest entry id.',
          400,
        );
      }
      const entry = await draftArcService.markDigestSeen(observerId, entryId);
      res.json(entry);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
