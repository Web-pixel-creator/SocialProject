import type { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import { GLOWUP_MAJOR_WEIGHT, GLOWUP_MINOR_WEIGHT } from '../metrics/constants';
import type {
  DigestListOptions,
  DraftArcService,
  DraftArcState,
  DraftArcSummary,
  DraftArcView,
  DraftEventType,
  DraftRecap24h,
  ObserverDigestEntry,
  ObserverDigestPreferences,
  ObserverDraftEngagement,
  ObserverPrediction,
  ObserverPredictionMarketProfile,
  ObserverWatchlistItem,
  PredictionOutcome,
  PullRequestPredictionSummary,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;
const DIGEST_DEDUP_WINDOW_MINUTES = 10;
const PREDICTION_MIN_STAKE_POINTS = 5;
const PREDICTION_MAX_STAKE_POINTS = 500;
const PREDICTION_DEFAULT_STAKE_POINTS = 10;
const PREDICTION_ENTRY_MAX_STAKE_POINTS = 120;
const PREDICTION_DAILY_STAKE_CAP_POINTS = 1000;
const PREDICTION_DAILY_SUBMISSION_CAP = 30;

type PredictionTrustTier = 'entry' | 'regular' | 'trusted' | 'elite';

const PREDICTION_TRUST_TIER_RULES: ReadonlyArray<{
  tier: Exclude<PredictionTrustTier, 'entry'>;
  minResolved: number;
  minAccuracy: number;
  maxStakePoints: number;
}> = [
  {
    tier: 'elite',
    minResolved: 80,
    minAccuracy: 0.66,
    maxStakePoints: 500,
  },
  {
    tier: 'trusted',
    minResolved: 35,
    minAccuracy: 0.58,
    maxStakePoints: 320,
  },
  {
    tier: 'regular',
    minResolved: 12,
    minAccuracy: 0.5,
    maxStakePoints: 220,
  },
];

interface ArcSummaryRow {
  draft_id: string;
  state: DraftArcState;
  latest_milestone: string;
  fix_open_count: number | string | null;
  pr_pending_count: number | string | null;
  last_merge_at: Date | null;
  updated_at: Date;
}

interface DigestEntryRow {
  id: string;
  observer_id: string;
  draft_id: string;
  title: string;
  summary: string;
  latest_milestone: string;
  studio_id: string | null;
  studio_name: string | null;
  from_following_studio: boolean | null;
  is_seen: boolean;
  created_at: Date;
  updated_at: Date;
}

interface WatchlistRow {
  observer_id: string;
  draft_id: string;
  created_at: Date;
}

interface DraftEngagementRow {
  observer_id: string;
  draft_id: string;
  is_saved: boolean;
  is_rated: boolean;
  created_at: Date;
  updated_at: Date;
}

interface DigestPreferencesRow {
  observer_id: string;
  digest_unseen_only: boolean | null;
  digest_following_only: boolean | null;
  updated_at: Date;
}

interface PredictionRow {
  id: string;
  observer_id: string;
  pull_request_id: string;
  predicted_outcome: PredictionOutcome;
  stake_points: number | string | null;
  payout_points: number | string | null;
  resolved_outcome: PredictionOutcome | null;
  is_correct: boolean | null;
  created_at: Date;
  resolved_at: Date | null;
}

interface PredictionStatsRow {
  resolved_count: number | string | null;
  correct_count: number | string | null;
}

interface PredictionDailyUsageRow {
  submission_count: number | string | null;
  stake_points: number | string | null;
}

interface ExistingPredictionRow extends PredictionRow {
  created_today: boolean | null;
}

const mapArcSummary = (row: ArcSummaryRow): DraftArcSummary => ({
  draftId: row.draft_id,
  state: row.state,
  latestMilestone: row.latest_milestone,
  fixOpenCount: Number(row.fix_open_count ?? 0),
  prPendingCount: Number(row.pr_pending_count ?? 0),
  lastMergeAt: row.last_merge_at ?? null,
  updatedAt: row.updated_at,
});

const mapDigestEntry = (row: DigestEntryRow): ObserverDigestEntry => ({
  id: row.id,
  observerId: row.observer_id,
  draftId: row.draft_id,
  title: row.title,
  summary: row.summary,
  latestMilestone: row.latest_milestone,
  studioId: row.studio_id ?? null,
  studioName: row.studio_name ?? null,
  fromFollowingStudio: Boolean(row.from_following_studio),
  isSeen: Boolean(row.is_seen),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapWatchlistItem = (row: WatchlistRow): ObserverWatchlistItem => ({
  observerId: row.observer_id,
  draftId: row.draft_id,
  createdAt: row.created_at,
});

const mapDraftEngagement = (
  row: DraftEngagementRow,
): ObserverDraftEngagement => ({
  observerId: row.observer_id,
  draftId: row.draft_id,
  isSaved: Boolean(row.is_saved),
  isRated: Boolean(row.is_rated),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapDigestPreferences = (
  row: DigestPreferencesRow,
): ObserverDigestPreferences => ({
  observerId: row.observer_id,
  digestUnseenOnly: Boolean(row.digest_unseen_only),
  digestFollowingOnly: Boolean(row.digest_following_only),
  updatedAt: row.updated_at,
});

const mapPrediction = (row: PredictionRow): ObserverPrediction => ({
  id: row.id,
  observerId: row.observer_id,
  pullRequestId: row.pull_request_id,
  predictedOutcome: row.predicted_outcome,
  stakePoints: Number(row.stake_points ?? PREDICTION_DEFAULT_STAKE_POINTS),
  payoutPoints: Number(row.payout_points ?? 0),
  resolvedOutcome: row.resolved_outcome ?? null,
  isCorrect: row.is_correct ?? null,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at ?? null,
});

const asNumber = (value: unknown): number => Number(value ?? 0);
const round2 = (value: number): number => Math.round(value * 100) / 100;

const resolvePredictionTrustTier = (
  resolvedCount: number,
  accuracyRate: number,
): { tier: PredictionTrustTier; maxStakePoints: number } => {
  for (const rule of PREDICTION_TRUST_TIER_RULES) {
    if (resolvedCount >= rule.minResolved && accuracyRate >= rule.minAccuracy) {
      return { tier: rule.tier, maxStakePoints: rule.maxStakePoints };
    }
  }
  return { tier: 'entry', maxStakePoints: PREDICTION_ENTRY_MAX_STAKE_POINTS };
};

const calcGlowUp = (majorMerged: number, minorMerged: number): number => {
  const prCount = majorMerged + minorMerged;
  if (prCount === 0) {
    return 0;
  }
  const weighted =
    majorMerged * GLOWUP_MAJOR_WEIGHT + minorMerged * GLOWUP_MINOR_WEIGHT;
  return weighted * (1 + Math.log(prCount + 1));
};

const inferState = (
  status: string,
  fixOpenCount: number,
  prPendingCount: number,
): DraftArcState => {
  if (status === 'release') {
    return 'released';
  }
  if (prPendingCount > 0) {
    return 'ready_for_review';
  }
  if (fixOpenCount > 0) {
    return 'in_progress';
  }
  return 'needs_help';
};

const inferMilestone = (
  latestEventKind: string | null,
  state: DraftArcState,
  fixOpenCount: number,
  prPendingCount: number,
): string => {
  if (latestEventKind === 'draft_release') {
    return 'Draft released';
  }
  if (latestEventKind === 'pr_merged') {
    return 'Recent PR merged';
  }
  if (latestEventKind === 'pr_rejected') {
    return 'Recent PR rejected';
  }
  if (latestEventKind === 'pr_submitted') {
    return prPendingCount > 1
      ? `${prPendingCount} PRs pending review`
      : 'PR pending review';
  }
  if (latestEventKind === 'fix_request') {
    return fixOpenCount > 1
      ? `${fixOpenCount} open fix requests`
      : '1 open fix request';
  }
  if (state === 'released') {
    return 'Draft released';
  }
  if (state === 'ready_for_review') {
    return prPendingCount > 1
      ? `${prPendingCount} PRs pending review`
      : 'PR pending review';
  }
  if (state === 'in_progress') {
    return fixOpenCount > 1
      ? `${fixOpenCount} open fix requests`
      : '1 open fix request';
  }
  return 'No activity yet';
};

const digestTitleByEvent = (eventType: DraftEventType): string => {
  if (eventType === 'draft_released') {
    return 'Draft released';
  }
  if (eventType === 'pull_request') {
    return 'New PR on watched draft';
  }
  if (eventType === 'pull_request_decision') {
    return 'PR decision on watched draft';
  }
  if (eventType === 'fix_request') {
    return 'New critique on watched draft';
  }
  return 'Draft activity update';
};

export class DraftArcServiceImpl implements DraftArcService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async getDraftArc(draftId: string, client?: DbClient): Promise<DraftArcView> {
    const db = getDb(this.pool, client);
    const summary = await this.recomputeDraftArcSummary(draftId, db);
    const recap24h = await this.getRecap24h(draftId, db);
    return { summary, recap24h };
  }

  async recomputeDraftArcSummary(
    draftId: string,
    client?: DbClient,
  ): Promise<DraftArcSummary> {
    const db = getDb(this.pool, client);
    await this.ensureDraftExists(draftId, db);

    const result = await db.query(
      `WITH addressed_fixes AS (
         SELECT DISTINCT jsonb_array_elements_text(pr.addressed_fix_requests) AS fix_id
         FROM pull_requests pr
         WHERE pr.draft_id = $1
           AND pr.status = 'merged'
           AND jsonb_typeof(pr.addressed_fix_requests) = 'array'
       ),
       open_fixes AS (
         SELECT COUNT(*)::int AS fix_open_count
         FROM fix_requests fr
         LEFT JOIN addressed_fixes af ON af.fix_id = fr.id::text
         WHERE fr.draft_id = $1
           AND af.fix_id IS NULL
       ),
       pending_prs AS (
         SELECT COUNT(*)::int AS pr_pending_count
         FROM pull_requests pr
         WHERE pr.draft_id = $1
           AND pr.status = 'pending'
       ),
       merge_data AS (
         SELECT MAX(pr.decided_at) AS last_merge_at
         FROM pull_requests pr
         WHERE pr.draft_id = $1
           AND pr.status = 'merged'
       ),
       latest_event AS (
         SELECT kind, occurred_at
         FROM (
           SELECT 'draft_release'::text AS kind, d.updated_at AS occurred_at
           FROM drafts d
           WHERE d.id = $1
             AND d.status = 'release'
           UNION ALL
           SELECT 'pr_merged'::text, pr.decided_at
           FROM pull_requests pr
           WHERE pr.draft_id = $1
             AND pr.status = 'merged'
             AND pr.decided_at IS NOT NULL
           UNION ALL
           SELECT 'pr_rejected'::text, pr.decided_at
           FROM pull_requests pr
           WHERE pr.draft_id = $1
             AND pr.status = 'rejected'
             AND pr.decided_at IS NOT NULL
           UNION ALL
           SELECT 'pr_submitted'::text, pr.created_at
           FROM pull_requests pr
           WHERE pr.draft_id = $1
           UNION ALL
           SELECT 'fix_request'::text, fr.created_at
           FROM fix_requests fr
           WHERE fr.draft_id = $1
         ) events
         ORDER BY occurred_at DESC
         LIMIT 1
       )
       SELECT
         d.status,
         of.fix_open_count,
         pp.pr_pending_count,
         md.last_merge_at,
         le.kind AS latest_event_kind
       FROM drafts d
       CROSS JOIN open_fixes of
       CROSS JOIN pending_prs pp
       CROSS JOIN merge_data md
       LEFT JOIN latest_event le ON true
       WHERE d.id = $1`,
      [draftId],
    );

    if (result.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }

    const row = result.rows[0];
    const fixOpenCount = asNumber(row.fix_open_count);
    const prPendingCount = asNumber(row.pr_pending_count);
    const state = inferState(row.status, fixOpenCount, prPendingCount);
    const latestMilestone = inferMilestone(
      row.latest_event_kind,
      state,
      fixOpenCount,
      prPendingCount,
    );

    const upsert = await db.query(
      `INSERT INTO draft_arc_summaries (
         draft_id,
         state,
         latest_milestone,
         fix_open_count,
         pr_pending_count,
         last_merge_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (draft_id)
       DO UPDATE SET
         state = EXCLUDED.state,
         latest_milestone = EXCLUDED.latest_milestone,
         fix_open_count = EXCLUDED.fix_open_count,
         pr_pending_count = EXCLUDED.pr_pending_count,
         last_merge_at = EXCLUDED.last_merge_at,
         updated_at = NOW()
       RETURNING *`,
      [
        draftId,
        state,
        latestMilestone,
        fixOpenCount,
        prPendingCount,
        row.last_merge_at,
      ],
    );

    return mapArcSummary(upsert.rows[0] as ArcSummaryRow);
  }

  async recordDraftEvent(
    draftId: string,
    eventType: DraftEventType,
    client?: DbClient,
  ): Promise<void> {
    const db = getDb(this.pool, client);
    const summary = await this.recomputeDraftArcSummary(draftId, db);
    await this.upsertDigestEntriesForFollowers(draftId, eventType, summary, db);
  }

  async submitPrediction(
    observerId: string,
    pullRequestId: string,
    predictedOutcome: PredictionOutcome,
    client?: DbClient,
    stakePoints = PREDICTION_DEFAULT_STAKE_POINTS,
  ): Promise<ObserverPrediction> {
    const db = getDb(this.pool, client);
    await this.ensureObserverExists(observerId, db);
    await this.ensurePendingPullRequest(pullRequestId, db);
    if (
      !Number.isInteger(stakePoints) ||
      stakePoints < PREDICTION_MIN_STAKE_POINTS ||
      stakePoints > PREDICTION_MAX_STAKE_POINTS
    ) {
      throw new ServiceError(
        'PREDICTION_STAKE_INVALID',
        `Stake points must be an integer between ${PREDICTION_MIN_STAKE_POINTS} and ${PREDICTION_MAX_STAKE_POINTS}.`,
        400,
      );
    }

    const existing = await db.query(
      `SELECT id,
              observer_id,
              pull_request_id,
              predicted_outcome,
              payout_points,
              resolved_outcome,
              is_correct,
              created_at,
              resolved_at,
              stake_points,
              (created_at >= date_trunc('day', NOW())) AS created_today
       FROM observer_pr_predictions
       WHERE observer_id = $1
         AND pull_request_id = $2`,
      [observerId, pullRequestId],
    );

    if (existing.rows.length > 0 && existing.rows[0].resolved_at) {
      throw new ServiceError(
        'PREDICTION_RESOLVED',
        'Prediction already resolved for this pull request.',
        409,
      );
    }

    if (
      existing.rows.length > 0 &&
      existing.rows[0].predicted_outcome === predictedOutcome &&
      asNumber(existing.rows[0].stake_points) === stakePoints
    ) {
      return mapPrediction(existing.rows[0] as ExistingPredictionRow);
    }

    const riskProfile = await this.getPredictionRiskProfile(observerId, db);
    const existingStakePoints = asNumber(existing.rows[0]?.stake_points);
    const effectiveStakeCap = Math.max(
      riskProfile.maxStakePoints,
      existingStakePoints,
    );
    if (stakePoints > effectiveStakeCap) {
      throw new ServiceError(
        'PREDICTION_STAKE_LIMIT_EXCEEDED',
        `Stake points exceed your current trust-tier limit (${effectiveStakeCap}).`,
        400,
      );
    }

    const dailyUsage = await this.getPredictionDailyUsage(observerId, db);
    const hasExistingPrediction = existing.rows.length > 0;
    const createdToday = Boolean(existing.rows[0]?.created_today);
    if (
      !hasExistingPrediction &&
      dailyUsage.submissionCount >= PREDICTION_DAILY_SUBMISSION_CAP
    ) {
      throw new ServiceError(
        'PREDICTION_DAILY_SUBMISSION_CAP_REACHED',
        `Daily prediction limit reached (${PREDICTION_DAILY_SUBMISSION_CAP}).`,
        429,
      );
    }

    let projectedDailyStakePoints = dailyUsage.stakePoints;
    if (hasExistingPrediction && createdToday) {
      projectedDailyStakePoints =
        dailyUsage.stakePoints - existingStakePoints + stakePoints;
    } else if (!hasExistingPrediction) {
      projectedDailyStakePoints = dailyUsage.stakePoints + stakePoints;
    }

    if (projectedDailyStakePoints > PREDICTION_DAILY_STAKE_CAP_POINTS) {
      throw new ServiceError(
        'PREDICTION_DAILY_STAKE_CAP_REACHED',
        `Daily stake limit reached (${PREDICTION_DAILY_STAKE_CAP_POINTS}).`,
        429,
      );
    }

    const upsert = await db.query(
      `INSERT INTO observer_pr_predictions (
         observer_id,
         pull_request_id,
         predicted_outcome,
         stake_points
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (observer_id, pull_request_id)
       DO UPDATE SET
         predicted_outcome = EXCLUDED.predicted_outcome,
          stake_points = EXCLUDED.stake_points
       WHERE observer_pr_predictions.resolved_at IS NULL
       RETURNING id, observer_id, pull_request_id, predicted_outcome, stake_points, payout_points, resolved_outcome, is_correct, created_at, resolved_at`,
      [observerId, pullRequestId, predictedOutcome, stakePoints],
    );

    if (upsert.rows.length === 0) {
      throw new ServiceError(
        'PREDICTION_RESOLVED',
        'Prediction already resolved for this pull request.',
        409,
      );
    }

    return mapPrediction(upsert.rows[0] as PredictionRow);
  }

  async getPredictionSummary(
    observerId: string,
    pullRequestId: string,
    client?: DbClient,
  ): Promise<PullRequestPredictionSummary> {
    const db = getDb(this.pool, client);
    await this.ensureObserverExists(observerId, db);

    const pullRequest = await db.query(
      `SELECT id, status
       FROM pull_requests
       WHERE id = $1`,
      [pullRequestId],
    );

    if (pullRequest.rows.length === 0) {
      throw new ServiceError('PR_NOT_FOUND', 'Pull request not found.', 404);
    }

    const consensusResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE predicted_outcome = 'merge')::int AS merge_count,
         COUNT(*) FILTER (WHERE predicted_outcome = 'reject')::int AS reject_count,
         COALESCE(SUM(stake_points) FILTER (WHERE predicted_outcome = 'merge'), 0)::int AS merge_stake_points,
         COALESCE(SUM(stake_points) FILTER (WHERE predicted_outcome = 'reject'), 0)::int AS reject_stake_points
       FROM observer_pr_predictions
       WHERE pull_request_id = $1`,
      [pullRequestId],
    );
    const mergeCount = asNumber(consensusResult.rows[0]?.merge_count);
    const rejectCount = asNumber(consensusResult.rows[0]?.reject_count);
    const mergeStakePoints = asNumber(
      consensusResult.rows[0]?.merge_stake_points,
    );
    const rejectStakePoints = asNumber(
      consensusResult.rows[0]?.reject_stake_points,
    );

    const observerPredictionResult = await db.query(
      `SELECT id, observer_id, pull_request_id, predicted_outcome, stake_points, payout_points, resolved_outcome, is_correct, created_at, resolved_at
       FROM observer_pr_predictions
       WHERE observer_id = $1
         AND pull_request_id = $2`,
      [observerId, pullRequestId],
    );

    const accuracyResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE is_correct = true)::int AS correct_count,
         COUNT(*) FILTER (WHERE resolved_outcome IS NOT NULL)::int AS total_count
       FROM observer_pr_predictions
       WHERE observer_id = $1`,
      [observerId],
    );
    const accuracyCorrect = asNumber(accuracyResult.rows[0]?.correct_count);
    const accuracyTotal = asNumber(accuracyResult.rows[0]?.total_count);
    const observerNetPointsResult = await db.query(
      `SELECT
         COALESCE(
           SUM(payout_points - stake_points) FILTER (WHERE resolved_outcome IS NOT NULL),
           0
         )::int AS observer_net_points
       FROM observer_pr_predictions
       WHERE observer_id = $1`,
      [observerId],
    );
    const observerNetPoints = asNumber(
      observerNetPointsResult.rows[0]?.observer_net_points,
    );
    const totalStakePoints = mergeStakePoints + rejectStakePoints;
    const mergeOdds =
      totalStakePoints > 0 ? round2(mergeStakePoints / totalStakePoints) : 0;
    const rejectOdds =
      totalStakePoints > 0 ? round2(rejectStakePoints / totalStakePoints) : 0;
    const mergePayoutMultiplier =
      mergeStakePoints > 0 ? round2(totalStakePoints / mergeStakePoints) : 0;
    const rejectPayoutMultiplier =
      rejectStakePoints > 0 ? round2(totalStakePoints / rejectStakePoints) : 0;
    const riskProfile = await this.getPredictionRiskProfile(observerId, db);
    const dailyUsage = await this.getPredictionDailyUsage(observerId, db);
    const observerPrediction =
      observerPredictionResult.rows.length > 0
        ? mapPrediction(observerPredictionResult.rows[0] as PredictionRow)
        : null;
    const effectiveStakeCap = Math.max(
      riskProfile.maxStakePoints,
      observerPrediction?.stakePoints ?? 0,
    );

    return {
      pullRequestId,
      pullRequestStatus: pullRequest.rows[0].status,
      consensus: {
        merge: mergeCount,
        reject: rejectCount,
        total: mergeCount + rejectCount,
      },
      market: {
        minStakePoints: PREDICTION_MIN_STAKE_POINTS,
        maxStakePoints: effectiveStakeCap,
        mergeStakePoints,
        rejectStakePoints,
        totalStakePoints,
        mergeOdds,
        rejectOdds,
        mergePayoutMultiplier,
        rejectPayoutMultiplier,
        observerNetPoints,
        trustTier: riskProfile.trustTier,
        dailyStakeCapPoints: PREDICTION_DAILY_STAKE_CAP_POINTS,
        dailyStakeUsedPoints: dailyUsage.stakePoints,
        dailySubmissionCap: PREDICTION_DAILY_SUBMISSION_CAP,
        dailySubmissionsUsed: dailyUsage.submissionCount,
      },
      observerPrediction,
      accuracy: {
        correct: accuracyCorrect,
        total: accuracyTotal,
        rate: accuracyTotal > 0 ? round2(accuracyCorrect / accuracyTotal) : 0,
      },
    };
  }

  async getPredictionMarketProfile(
    observerId: string,
    client?: DbClient,
  ): Promise<ObserverPredictionMarketProfile> {
    const db = getDb(this.pool, client);
    await this.ensureObserverExists(observerId, db);

    const riskProfile = await this.getPredictionRiskProfile(observerId, db);
    const dailyUsage = await this.getPredictionDailyUsage(observerId, db);

    return {
      trustTier: riskProfile.trustTier,
      minStakePoints: PREDICTION_MIN_STAKE_POINTS,
      maxStakePoints: riskProfile.maxStakePoints,
      dailyStakeCapPoints: PREDICTION_DAILY_STAKE_CAP_POINTS,
      dailyStakeUsedPoints: dailyUsage.stakePoints,
      dailySubmissionCap: PREDICTION_DAILY_SUBMISSION_CAP,
      dailySubmissionsUsed: dailyUsage.submissionCount,
    };
  }

  async followDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<ObserverWatchlistItem> {
    const db = getDb(this.pool, client);
    await this.ensureObserverExists(observerId, db);
    await this.ensureDraftExists(draftId, db);

    const result = await db.query(
      `INSERT INTO observer_draft_follows (observer_id, draft_id)
       VALUES ($1, $2)
       ON CONFLICT (observer_id, draft_id)
       DO UPDATE SET observer_id = EXCLUDED.observer_id
       RETURNING observer_id, draft_id, created_at`,
      [observerId, draftId],
    );

    return mapWatchlistItem(result.rows[0] as WatchlistRow);
  }

  async unfollowDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<{ removed: boolean }> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      'DELETE FROM observer_draft_follows WHERE observer_id = $1 AND draft_id = $2 RETURNING id',
      [observerId, draftId],
    );
    return { removed: result.rows.length > 0 };
  }

  async listWatchlist(
    observerId: string,
    client?: DbClient,
  ): Promise<ObserverWatchlistItem[]> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      `SELECT observer_id, draft_id, created_at
       FROM observer_draft_follows
       WHERE observer_id = $1
       ORDER BY created_at DESC`,
      [observerId],
    );
    return result.rows.map((row) => mapWatchlistItem(row as WatchlistRow));
  }

  async listDraftEngagements(
    observerId: string,
    client?: DbClient,
  ): Promise<ObserverDraftEngagement[]> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      `SELECT observer_id, draft_id, is_saved, is_rated, created_at, updated_at
       FROM observer_draft_engagements
       WHERE observer_id = $1
       ORDER BY updated_at DESC`,
      [observerId],
    );

    return result.rows.map((row) =>
      mapDraftEngagement(row as DraftEngagementRow),
    );
  }

  async saveDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<{ saved: true }> {
    const db = getDb(this.pool, client);
    await this.ensureObserverExists(observerId, db);
    await this.ensureDraftExists(draftId, db);

    await db.query(
      `INSERT INTO observer_draft_engagements (
         observer_id,
         draft_id,
         is_saved,
         is_rated
       )
       VALUES ($1, $2, true, false)
       ON CONFLICT (observer_id, draft_id)
       DO UPDATE SET
         is_saved = true,
         updated_at = NOW()`,
      [observerId, draftId],
    );

    return { saved: true };
  }

  async unsaveDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<{ saved: false }> {
    const db = getDb(this.pool, client);
    await db.query(
      `DELETE FROM observer_draft_engagements
       WHERE observer_id = $1
         AND draft_id = $2
         AND is_rated = false`,
      [observerId, draftId],
    );
    await db.query(
      `UPDATE observer_draft_engagements
       SET is_saved = false,
           updated_at = NOW()
       WHERE observer_id = $1
         AND draft_id = $2
         AND is_rated = true`,
      [observerId, draftId],
    );

    return { saved: false };
  }

  async rateDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<{ rated: true }> {
    const db = getDb(this.pool, client);
    await this.ensureObserverExists(observerId, db);
    await this.ensureDraftExists(draftId, db);

    await db.query(
      `INSERT INTO observer_draft_engagements (
         observer_id,
         draft_id,
         is_saved,
         is_rated
       )
       VALUES ($1, $2, false, true)
       ON CONFLICT (observer_id, draft_id)
       DO UPDATE SET
         is_rated = true,
         updated_at = NOW()`,
      [observerId, draftId],
    );

    return { rated: true };
  }

  async unrateDraft(
    observerId: string,
    draftId: string,
    client?: DbClient,
  ): Promise<{ rated: false }> {
    const db = getDb(this.pool, client);
    await db.query(
      `DELETE FROM observer_draft_engagements
       WHERE observer_id = $1
         AND draft_id = $2
         AND is_saved = false`,
      [observerId, draftId],
    );
    await db.query(
      `UPDATE observer_draft_engagements
       SET is_rated = false,
           updated_at = NOW()
       WHERE observer_id = $1
         AND draft_id = $2
         AND is_saved = true`,
      [observerId, draftId],
    );

    return { rated: false };
  }

  async getDigestPreferences(
    observerId: string,
    client?: DbClient,
  ): Promise<ObserverDigestPreferences> {
    const db = getDb(this.pool, client);
    await db.query(
      `INSERT INTO observer_preferences (observer_id)
       VALUES ($1)
       ON CONFLICT (observer_id) DO NOTHING`,
      [observerId],
    );

    const result = await db.query(
      `SELECT
         observer_id,
         digest_unseen_only,
         digest_following_only,
         updated_at
       FROM observer_preferences
       WHERE observer_id = $1
       LIMIT 1`,
      [observerId],
    );

    if (result.rows.length === 0) {
      throw new ServiceError('OBSERVER_NOT_FOUND', 'Observer not found.', 404);
    }
    return mapDigestPreferences(result.rows[0] as DigestPreferencesRow);
  }

  async upsertDigestPreferences(
    observerId: string,
    preferences: {
      digestUnseenOnly?: boolean;
      digestFollowingOnly?: boolean;
    },
    client?: DbClient,
  ): Promise<ObserverDigestPreferences> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      `INSERT INTO observer_preferences (
         observer_id,
         digest_unseen_only,
         digest_following_only,
         updated_at
       )
       VALUES (
         $1,
         COALESCE($2::boolean, false),
         COALESCE($3::boolean, false),
         NOW()
       )
       ON CONFLICT (observer_id)
       DO UPDATE SET
         digest_unseen_only = COALESCE(
           $2::boolean,
           observer_preferences.digest_unseen_only
         ),
         digest_following_only = COALESCE(
           $3::boolean,
           observer_preferences.digest_following_only
         ),
         updated_at = NOW()
       RETURNING
         observer_id,
         digest_unseen_only,
         digest_following_only,
         updated_at`,
      [
        observerId,
        preferences.digestUnseenOnly ?? null,
        preferences.digestFollowingOnly ?? null,
      ],
    );
    return mapDigestPreferences(result.rows[0] as DigestPreferencesRow);
  }

  async listDigest(
    observerId: string,
    options?: DigestListOptions,
    client?: DbClient,
  ): Promise<ObserverDigestEntry[]> {
    const db = getDb(this.pool, client);
    const unseenOnly = Boolean(options?.unseenOnly);
    const fromFollowingStudioOnly = Boolean(options?.fromFollowingStudioOnly);
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
    const offset = Math.max(options?.offset ?? 0, 0);

    const result = await db.query(
      `SELECT
         ode.id,
         ode.observer_id,
         ode.draft_id,
         ode.title,
         ode.summary,
         ode.latest_milestone,
         a.id AS studio_id,
         a.studio_name,
         EXISTS (
           SELECT 1
           FROM observer_studio_follows osf
           WHERE osf.observer_id = ode.observer_id
             AND osf.studio_id = a.id
         ) AS from_following_studio,
         ode.is_seen,
         ode.created_at,
         ode.updated_at
       FROM observer_digest_entries ode
       JOIN drafts d ON d.id = ode.draft_id
       JOIN agents a ON a.id = d.author_id
       WHERE ode.observer_id = $1
         AND ($2::boolean = false OR ode.is_seen = false)
         AND (
           $3::boolean = false
           OR EXISTS (
             SELECT 1
             FROM observer_studio_follows osf
             WHERE osf.observer_id = ode.observer_id
               AND osf.studio_id = a.id
           )
         )
        ORDER BY
          ode.is_seen ASC,
          from_following_studio DESC,
          ode.created_at DESC
        LIMIT $4 OFFSET $5`,
      [observerId, unseenOnly, fromFollowingStudioOnly, limit, offset],
    );

    return result.rows.map((row) => mapDigestEntry(row as DigestEntryRow));
  }

  async markDigestSeen(
    observerId: string,
    entryId: string,
    client?: DbClient,
  ): Promise<ObserverDigestEntry> {
    const db = getDb(this.pool, client);
    const updated = await db.query(
      `UPDATE observer_digest_entries
       SET is_seen = true,
           updated_at = NOW()
       WHERE id = $1
         AND observer_id = $2
       RETURNING id`,
      [entryId, observerId],
    );

    if (updated.rows.length === 0) {
      throw new ServiceError(
        'DIGEST_ENTRY_NOT_FOUND',
        'Digest entry not found.',
        404,
      );
    }
    const refreshed = await db.query(
      `SELECT
         ode.id,
         ode.observer_id,
         ode.draft_id,
         ode.title,
         ode.summary,
         ode.latest_milestone,
         a.id AS studio_id,
         a.studio_name,
         EXISTS (
           SELECT 1
           FROM observer_studio_follows osf
           WHERE osf.observer_id = ode.observer_id
             AND osf.studio_id = a.id
         ) AS from_following_studio,
         ode.is_seen,
         ode.created_at,
         ode.updated_at
       FROM observer_digest_entries ode
       JOIN drafts d ON d.id = ode.draft_id
       JOIN agents a ON a.id = d.author_id
       WHERE ode.id = $1
         AND ode.observer_id = $2
       LIMIT 1`,
      [updated.rows[0].id, observerId],
    );
    return mapDigestEntry(refreshed.rows[0] as DigestEntryRow);
  }

  private async getRecap24h(
    draftId: string,
    db: DbClient,
  ): Promise<DraftRecap24h> {
    const result = await db.query(
      `WITH pr_window AS (
         SELECT
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS pr_submitted,
           COUNT(*) FILTER (WHERE status = 'merged' AND decided_at >= NOW() - INTERVAL '24 hours')::int AS pr_merged,
           COUNT(*) FILTER (WHERE status = 'rejected' AND decided_at >= NOW() - INTERVAL '24 hours')::int AS pr_rejected,
           COUNT(*) FILTER (WHERE status = 'merged' AND severity = 'major')::int AS major_total,
           COUNT(*) FILTER (WHERE status = 'merged' AND severity = 'minor')::int AS minor_total,
           COUNT(*) FILTER (WHERE status = 'merged' AND severity = 'major' AND decided_at >= NOW() - INTERVAL '24 hours')::int AS major_24h,
           COUNT(*) FILTER (WHERE status = 'merged' AND severity = 'minor' AND decided_at >= NOW() - INTERVAL '24 hours')::int AS minor_24h
         FROM pull_requests
         WHERE draft_id = $1
       ),
       fix_window AS (
         SELECT COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS fix_requests
         FROM fix_requests
         WHERE draft_id = $1
       )
       SELECT
         fw.fix_requests,
         pw.pr_submitted,
         pw.pr_merged,
         pw.pr_rejected,
         pw.major_total,
         pw.minor_total,
         pw.major_24h,
         pw.minor_24h
       FROM fix_window fw
       CROSS JOIN pr_window pw`,
      [draftId],
    );

    const row = result.rows[0];
    const fixRequests = asNumber(row.fix_requests);
    const prSubmitted = asNumber(row.pr_submitted);
    const prMerged = asNumber(row.pr_merged);
    const prRejected = asNumber(row.pr_rejected);

    const majorTotal = asNumber(row.major_total);
    const minorTotal = asNumber(row.minor_total);
    const major24h = asNumber(row.major_24h);
    const minor24h = asNumber(row.minor_24h);

    const glowUpDelta =
      major24h + minor24h > 0
        ? round2(
            calcGlowUp(majorTotal, minorTotal) -
              calcGlowUp(
                Math.max(majorTotal - major24h, 0),
                Math.max(minorTotal - minor24h, 0),
              ),
          )
        : null;

    const hasChanges = fixRequests + prSubmitted + prMerged + prRejected > 0;

    return {
      fixRequests,
      prSubmitted,
      prMerged,
      prRejected,
      glowUpDelta,
      hasChanges,
    };
  }

  private async upsertDigestEntriesForFollowers(
    draftId: string,
    eventType: DraftEventType,
    summary: DraftArcSummary,
    db: DbClient,
  ): Promise<void> {
    const followers = await db.query(
      `WITH draft_followers AS (
         SELECT observer_id
         FROM observer_draft_follows
         WHERE draft_id = $1
       ),
       studio_followers AS (
         SELECT osf.observer_id
         FROM observer_studio_follows osf
         JOIN drafts d ON d.author_id = osf.studio_id
         WHERE d.id = $1
       )
       SELECT observer_id
       FROM draft_followers
       UNION
       SELECT observer_id
       FROM studio_followers`,
      [draftId],
    );

    if (followers.rows.length === 0) {
      return;
    }

    const title = digestTitleByEvent(eventType);
    const digestSummary = `${summary.latestMilestone}. Open fixes: ${summary.fixOpenCount}, pending PRs: ${summary.prPendingCount}.`;

    for (const row of followers.rows) {
      const observerId = row.observer_id as string;
      const recentEntry = await db.query(
        `SELECT id
         FROM observer_digest_entries
         WHERE observer_id = $1
           AND draft_id = $2
           AND created_at >= NOW() - ($3::text || ' minutes')::interval
         ORDER BY created_at DESC
         LIMIT 1`,
        [observerId, draftId, DIGEST_DEDUP_WINDOW_MINUTES],
      );

      if (recentEntry.rows.length > 0) {
        await db.query(
          `UPDATE observer_digest_entries
           SET title = $1,
               summary = $2,
               latest_milestone = $3,
               is_seen = false,
               updated_at = NOW()
           WHERE id = $4`,
          [
            title,
            digestSummary,
            summary.latestMilestone,
            recentEntry.rows[0].id,
          ],
        );
      } else {
        await db.query(
          `INSERT INTO observer_digest_entries (
             observer_id,
             draft_id,
             title,
             summary,
             latest_milestone,
             is_seen
           )
           VALUES ($1, $2, $3, $4, $5, false)`,
          [observerId, draftId, title, digestSummary, summary.latestMilestone],
        );
      }
    }
  }

  private async getPredictionRiskProfile(
    observerId: string,
    db: DbClient,
  ): Promise<{ trustTier: PredictionTrustTier; maxStakePoints: number }> {
    const stats = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE resolved_outcome IS NOT NULL)::int AS resolved_count,
         COUNT(*) FILTER (WHERE is_correct = true)::int AS correct_count
       FROM observer_pr_predictions
       WHERE observer_id = $1`,
      [observerId],
    );
    const resolvedCount = asNumber(
      (stats.rows[0] as PredictionStatsRow | undefined)?.resolved_count,
    );
    const correctCount = asNumber(
      (stats.rows[0] as PredictionStatsRow | undefined)?.correct_count,
    );
    const accuracyRate =
      resolvedCount > 0 ? round2(correctCount / resolvedCount) : 0;
    const tier = resolvePredictionTrustTier(resolvedCount, accuracyRate);
    return { trustTier: tier.tier, maxStakePoints: tier.maxStakePoints };
  }

  private async getPredictionDailyUsage(
    observerId: string,
    db: DbClient,
  ): Promise<{ submissionCount: number; stakePoints: number }> {
    const usage = await db.query(
      `SELECT
         COUNT(*)::int AS submission_count,
         COALESCE(SUM(stake_points), 0)::int AS stake_points
       FROM observer_pr_predictions
       WHERE observer_id = $1
         AND created_at >= date_trunc('day', NOW())`,
      [observerId],
    );
    return {
      submissionCount: asNumber(
        (usage.rows[0] as PredictionDailyUsageRow | undefined)
          ?.submission_count,
      ),
      stakePoints: asNumber(
        (usage.rows[0] as PredictionDailyUsageRow | undefined)?.stake_points,
      ),
    };
  }

  private async ensureDraftExists(
    draftId: string,
    db: DbClient,
  ): Promise<void> {
    const result = await db.query('SELECT id FROM drafts WHERE id = $1', [
      draftId,
    ]);
    if (result.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }
  }

  private async ensureObserverExists(
    observerId: string,
    db: DbClient,
  ): Promise<void> {
    const result = await db.query('SELECT id FROM users WHERE id = $1', [
      observerId,
    ]);
    if (result.rows.length === 0) {
      throw new ServiceError('OBSERVER_NOT_FOUND', 'Observer not found.', 404);
    }
  }

  private async ensurePendingPullRequest(
    pullRequestId: string,
    db: DbClient,
  ): Promise<void> {
    const result = await db.query(
      `SELECT status
       FROM pull_requests
       WHERE id = $1`,
      [pullRequestId],
    );
    if (result.rows.length === 0) {
      throw new ServiceError('PR_NOT_FOUND', 'Pull request not found.', 404);
    }
    if (result.rows[0].status !== 'pending') {
      throw new ServiceError(
        'PR_NOT_PENDING',
        'Predictions are allowed only for pending pull requests.',
        400,
      );
    }
  }
}
