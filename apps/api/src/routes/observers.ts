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
const PREDICTION_RESOLUTION_WINDOW_THRESHOLDS = {
  accuracyRate: {
    criticalBelow: 0.45,
    watchBelow: 0.6,
  },
  minResolvedPredictions: 3,
} as const;

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
const resolvePredictionResolutionWindowRiskLevel = (
  rate: number,
  resolvedPredictions: number,
): 'healthy' | 'watch' | 'critical' | 'unknown' => {
  if (
    !Number.isFinite(rate) ||
    resolvedPredictions <
      PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.minResolvedPredictions
  ) {
    return 'unknown';
  }
  if (
    rate < PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.accuracyRate.criticalBelow
  ) {
    return 'critical';
  }
  if (rate < PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.accuracyRate.watchBelow) {
    return 'watch';
  }
  return 'healthy';
};
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

type ObserverPredictionOutcome = 'merge' | 'reject';

const mapObserverPrediction = (row: Record<string, unknown>) => ({
  id: row.id as string,
  pullRequestId: row.pull_request_id as string,
  draftId: row.draft_id as string,
  draftTitle: row.draft_title as string,
  predictedOutcome: row.predicted_outcome as ObserverPredictionOutcome,
  resolvedOutcome:
    (row.resolved_outcome as ObserverPredictionOutcome | null) ?? null,
  isCorrect:
    row.is_correct === null ? null : (Boolean(row.is_correct) as boolean),
  stakePoints: toSafeNumber(row.stake_points),
  payoutPoints: toSafeNumber(row.payout_points),
  createdAt: row.created_at as string,
  resolvedAt: (row.resolved_at as string | null) ?? null,
});

const fetchObserverPredictionSignals = async (observerId: string) => {
  const [
    currentStreakResult,
    bestStreakResult,
    recentWindowResult,
    timeWindowsResult,
    lastResolvedResult,
  ] = await Promise.all([
    db.query(
      `WITH resolved AS (
         SELECT
           is_correct,
           SUM(
             CASE WHEN is_correct = false THEN 1 ELSE 0 END
           ) OVER (
             ORDER BY resolved_at DESC NULLS LAST, created_at DESC, id DESC
           ) AS incorrect_seen
         FROM observer_pr_predictions
         WHERE observer_id = $1
           AND resolved_outcome IS NOT NULL
           AND is_correct IS NOT NULL
       )
       SELECT COUNT(*)::int AS current_streak
       FROM resolved
       WHERE incorrect_seen = 0
         AND is_correct = true`,
      [observerId],
    ),
    db.query(
      `WITH resolved AS (
         SELECT
           is_correct,
           ROW_NUMBER() OVER (
             ORDER BY resolved_at ASC NULLS LAST, created_at ASC, id ASC
           ) AS rn_all,
           ROW_NUMBER() OVER (
             PARTITION BY is_correct
             ORDER BY resolved_at ASC NULLS LAST, created_at ASC, id ASC
           ) AS rn_by_outcome
         FROM observer_pr_predictions
         WHERE observer_id = $1
           AND resolved_outcome IS NOT NULL
           AND is_correct IS NOT NULL
       ),
       streaks AS (
         SELECT
           (rn_all - rn_by_outcome) AS streak_group,
           COUNT(*)::int AS streak_length
         FROM resolved
         WHERE is_correct = true
         GROUP BY (rn_all - rn_by_outcome)
       )
       SELECT COALESCE(MAX(streak_length), 0)::int AS best_streak
       FROM streaks`,
      [observerId],
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS resolved_total,
         COUNT(*) FILTER (WHERE is_correct = true)::int AS resolved_correct
       FROM (
         SELECT is_correct
         FROM observer_pr_predictions
         WHERE observer_id = $1
           AND resolved_outcome IS NOT NULL
           AND is_correct IS NOT NULL
         ORDER BY resolved_at DESC NULLS LAST, created_at DESC, id DESC
         LIMIT 10
       ) recent_resolved`,
      [observerId],
    ),
    db.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE COALESCE(resolved_at, created_at) >= NOW() - INTERVAL '7 days'
         )::int AS resolved_7d,
         COUNT(*) FILTER (
           WHERE COALESCE(resolved_at, created_at) >= NOW() - INTERVAL '7 days'
             AND is_correct = true
         )::int AS correct_7d,
         COALESCE(
           SUM(payout_points - stake_points) FILTER (
             WHERE COALESCE(resolved_at, created_at) >= NOW() - INTERVAL '7 days'
           ),
           0
         )::int AS net_7d,
         COUNT(*) FILTER (
           WHERE COALESCE(resolved_at, created_at) >= NOW() - INTERVAL '30 days'
         )::int AS resolved_30d,
         COUNT(*) FILTER (
           WHERE COALESCE(resolved_at, created_at) >= NOW() - INTERVAL '30 days'
             AND is_correct = true
         )::int AS correct_30d,
         COALESCE(
           SUM(payout_points - stake_points) FILTER (
             WHERE COALESCE(resolved_at, created_at) >= NOW() - INTERVAL '30 days'
           ),
           0
         )::int AS net_30d
       FROM observer_pr_predictions
       WHERE observer_id = $1
         AND resolved_outcome IS NOT NULL
         AND is_correct IS NOT NULL`,
      [observerId],
    ),
    db.query(
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
         AND opp.resolved_outcome IS NOT NULL
       ORDER BY opp.resolved_at DESC NULLS LAST, opp.created_at DESC, opp.id DESC
       LIMIT 1`,
      [observerId],
    ),
  ]);

  const currentStreak = toSafeNumber(
    currentStreakResult.rows[0]?.current_streak,
  );
  const bestStreak = toSafeNumber(bestStreakResult.rows[0]?.best_streak);
  const recentResolvedTotal = toSafeNumber(
    recentWindowResult.rows[0]?.resolved_total,
  );
  const recentResolvedCorrect = toSafeNumber(
    recentWindowResult.rows[0]?.resolved_correct,
  );
  const resolved7d = toSafeNumber(timeWindowsResult.rows[0]?.resolved_7d);
  const correct7d = toSafeNumber(timeWindowsResult.rows[0]?.correct_7d);
  const net7d = toSafeNumber(timeWindowsResult.rows[0]?.net_7d);
  const resolved30d = toSafeNumber(timeWindowsResult.rows[0]?.resolved_30d);
  const correct30d = toSafeNumber(timeWindowsResult.rows[0]?.correct_30d);
  const net30d = toSafeNumber(timeWindowsResult.rows[0]?.net_30d);
  const rate7d =
    resolved7d > 0 ? Math.round((correct7d / resolved7d) * 100) / 100 : 0;
  const rate30d =
    resolved30d > 0 ? Math.round((correct30d / resolved30d) * 100) / 100 : 0;
  const lastResolvedRow = lastResolvedResult.rows[0] as
    | Record<string, unknown>
    | undefined;
  const lastResolved =
    lastResolvedRow === undefined
      ? null
      : {
          ...mapObserverPrediction(lastResolvedRow),
          resolvedOutcome:
            lastResolvedRow.resolved_outcome as ObserverPredictionOutcome,
          isCorrect: Boolean(lastResolvedRow.is_correct),
          resolvedAt:
            (lastResolvedRow.resolved_at as string | null) ??
            (lastResolvedRow.created_at as string),
          netPoints:
            toSafeNumber(lastResolvedRow.payout_points) -
            toSafeNumber(lastResolvedRow.stake_points),
        };

  return {
    currentStreak,
    bestStreak,
    recentWindow: {
      size: 10,
      resolved: recentResolvedTotal,
      correct: recentResolvedCorrect,
      rate:
        recentResolvedTotal > 0
          ? Math.round((recentResolvedCorrect / recentResolvedTotal) * 100) /
            100
          : 0,
    },
    timeWindows: {
      d7: {
        days: 7,
        resolved: resolved7d,
        correct: correct7d,
        rate: rate7d,
        netPoints: net7d,
        riskLevel: resolvePredictionResolutionWindowRiskLevel(
          rate7d,
          resolved7d,
        ),
      },
      d30: {
        days: 30,
        resolved: resolved30d,
        correct: correct30d,
        rate: rate30d,
        netPoints: net30d,
        riskLevel: resolvePredictionResolutionWindowRiskLevel(
          rate30d,
          resolved30d,
        ),
      },
    },
    thresholds: {
      resolutionWindows: PREDICTION_RESOLUTION_WINDOW_THRESHOLDS,
    },
    lastResolved,
  };
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

    const [predictionsResult, predictionMarketProfile, predictionSignals] =
      await Promise.all([
        db.query(
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
        ),
        draftArcService.getPredictionMarketProfile(observerId),
        fetchObserverPredictionSignals(observerId),
      ]);
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
        streak: {
          current: predictionSignals.currentStreak,
          best: predictionSignals.bestStreak,
        },
        recentWindow: predictionSignals.recentWindow,
        timeWindows: predictionSignals.timeWindows,
        thresholds: predictionSignals.thresholds,
        lastResolved: predictionSignals.lastResolved,
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
      recentPredictions: predictionsResult.rows.map((row) =>
        mapObserverPrediction(row as Record<string, unknown>),
      ),
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

    const [predictionsResult, predictionMarketProfile, predictionSignals] =
      await Promise.all([
        db.query(
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
        ),
        draftArcService.getPredictionMarketProfile(observerId),
        fetchObserverPredictionSignals(observerId),
      ]);
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
        streak: {
          current: predictionSignals.currentStreak,
          best: predictionSignals.bestStreak,
        },
        recentWindow: predictionSignals.recentWindow,
        timeWindows: predictionSignals.timeWindows,
        thresholds: predictionSignals.thresholds,
        lastResolved: predictionSignals.lastResolved,
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
      recentPredictions: predictionsResult.rows.map((row) =>
        mapObserverPrediction(row as Record<string, unknown>),
      ),
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
