import { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { env } from '../../config/env';
import type {
  FeedFilters,
  FeedItem,
  FeedService,
  FeedSort,
  FeedStatus,
  FeedIntent,
  ChangeFeedItem,
  ProgressFeedItem,
  StudioItem,
  HotNowItem,
  UnifiedFeedFilters
} from './types';
import { IMPACT_MAJOR_INCREMENT, IMPACT_MINOR_INCREMENT } from '../metrics/constants';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const mapFeedItem = (row: any): FeedItem => ({
  id: row.id,
  type: row.status === 'release' ? 'release' : 'draft',
  glowUpScore: Number(row.glow_up_score ?? 0),
  updatedAt: row.updated_at,
  beforeImageUrl: row.before_image_url ?? row.before_thumbnail_url,
  afterImageUrl: row.after_image_url ?? row.after_thumbnail_url
});

const mapAutopsyItem = (row: any): FeedItem => ({
  id: row.id,
  type: 'autopsy',
  glowUpScore: 0,
  updatedAt: row.published_at ?? row.created_at,
  summary: row.summary
});

const mapStudioItem = (row: any): StudioItem => ({
  id: row.id,
  studioName: row.studio_name,
  impact: Number(row.impact ?? 0),
  signal: Number(row.signal ?? 0)
});

const mapProgressItem = (row: any): ProgressFeedItem => ({
  draftId: row.draft_id,
  beforeImageUrl: row.before_image_url,
  afterImageUrl: row.after_image_url,
  glowUpScore: Number(row.glow_up_score ?? 0),
  prCount: Number(row.pr_count ?? 0),
  lastActivity: row.last_activity,
  authorStudio: row.studio_name,
  guildId: row.guild_id ?? null
});

const mapChangeItem = (row: any): ChangeFeedItem => {
  const severity = row.severity ?? null;
  const impactDelta =
    row.kind === 'pr_merged'
      ? severity === 'major'
        ? IMPACT_MAJOR_INCREMENT
        : IMPACT_MINOR_INCREMENT
      : 0;
  return {
    kind: row.kind,
    id: row.id,
    draftId: row.draft_id,
    draftTitle: row.draft_title ?? 'Untitled',
    description: row.description,
    severity,
    occurredAt: row.occurred_at,
    glowUpScore: Number(row.glow_up_score ?? 0),
    impactDelta
  };
};

const computeRecencyBonus = (lastActivity: Date): number => {
  const now = Date.now();
  const activity = new Date(lastActivity).getTime();
  const days = (now - activity) / (1000 * 60 * 60 * 24);
  const remaining = Math.max(0, 7 - days);
  return remaining / 7;
};

const computeRecencyDecay = (lastActivity: Date): number => {
  const now = Date.now();
  const activity = new Date(lastActivity).getTime();
  const hours = Math.max(0, (now - activity) / (1000 * 60 * 60));
  const tau = Math.max(env.HOT_NOW_DECAY_TAU_HOURS, 1);
  return Math.exp(-hours / tau);
};

const normalizeWeights = (
  weights: Record<string, number>,
  defaults: Record<string, number>
): Record<string, number> => {
  const sanitized = Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, Number.isFinite(value) && value > 0 ? value : 0])
  );
  const sum = Object.values(sanitized).reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return defaults;
  }
  return Object.fromEntries(Object.entries(sanitized).map(([key, value]) => [key, value / sum]));
};

const HOT_NOW_DEFAULT_WEIGHTS = {
  recent: 0.4,
  fix: 0.2,
  pending: 0.2,
  decisions: 0.1,
  glowup: 0.1
};

const buildHotReasonLabel = (item: {
  prPendingCount: number;
  fixOpenCount: number;
  merges24h: number;
  decisions24h: number;
}): string => {
  const parts: string[] = [];
  if (item.prPendingCount > 0) {
    parts.push(`${item.prPendingCount} PR pending`);
  }
  if (item.fixOpenCount > 0) {
    parts.push(`${item.fixOpenCount} open fix`);
  }
  if (item.merges24h > 0) {
    parts.push(`${item.merges24h} merge in 24h`);
  } else if (item.decisions24h > 0) {
    parts.push(`${item.decisions24h} decisions in 24h`);
  }
  return parts.length > 0 ? parts.join(', ') : 'Low activity';
};

export class FeedServiceImpl implements FeedService {
  constructor(private readonly pool: Pool) {}

  async getFeed(filters: UnifiedFeedFilters, client?: DbClient): Promise<FeedItem[]> {
    const db = getDb(this.pool, client);
    const {
      limit = 20,
      offset = 0,
      sort = 'recent',
      status,
      intent,
      from,
      to,
      cursor
    } = filters;

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    const clauses: string[] = [];
    const params: Array<string | number | Date> = [];

    const addParam = (value: string | number | Date) => {
      params.push(value);
      return `$${params.length}`;
    };

    clauses.push('d.is_sandbox = false');

    if (status === 'draft') {
      clauses.push("d.status = 'draft'");
    } else if (status === 'release') {
      clauses.push("d.status = 'release'");
    } else if (status === 'pr') {
      clauses.push(
        "EXISTS (SELECT 1 FROM pull_requests pr WHERE pr.draft_id = d.id AND pr.status = 'pending')"
      );
    }

    if (intent === 'ready_for_review') {
      clauses.push(
        "EXISTS (SELECT 1 FROM pull_requests pr WHERE pr.draft_id = d.id AND pr.status = 'pending')"
      );
    } else if (intent === 'seeking_pr') {
      clauses.push('EXISTS (SELECT 1 FROM fix_requests fr WHERE fr.draft_id = d.id)');
      clauses.push(
        "NOT EXISTS (SELECT 1 FROM pull_requests pr WHERE pr.draft_id = d.id AND pr.status = 'pending')"
      );
    } else if (intent === 'needs_help') {
      clauses.push("d.status = 'draft'");
      clauses.push('NOT EXISTS (SELECT 1 FROM fix_requests fr WHERE fr.draft_id = d.id)');
    }

    if (from) {
      clauses.push(`d.updated_at >= ${addParam(from)}`);
    }

    if (to) {
      clauses.push(`d.updated_at <= ${addParam(to)}`);
    }

    if (cursor && sort === 'recent') {
      clauses.push(`d.updated_at < ${addParam(cursor)}`);
    }

    const orderBy = (() => {
      const orderMap: Record<FeedSort, string> = {
        recent: 'd.updated_at DESC',
        glowup: 'd.glow_up_score DESC, d.updated_at DESC',
        impact: 'a.impact DESC, d.updated_at DESC'
      };
      return orderMap[sort as FeedSort] ?? orderMap.recent;
    })();

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(safeLimit, safeOffset);

    const result = await db.query(
      `SELECT d.*,
              v_first.thumbnail_url AS before_image_url,
              v_last.thumbnail_url AS after_image_url
       FROM drafts d
       JOIN agents a ON a.id = d.author_id
       LEFT JOIN versions v_first ON v_first.draft_id = d.id AND v_first.version_number = 1
       LEFT JOIN versions v_last ON v_last.draft_id = d.id AND v_last.version_number = d.current_version
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return result.rows.map(mapFeedItem);
  }

  async getProgress(filters: FeedFilters, client?: DbClient): Promise<ProgressFeedItem[]> {
    const db = getDb(this.pool, client);
    const { limit = 20, offset = 0 } = filters;
    const take = Math.max(limit + offset, 50);

    const result = await db.query(
      `WITH version_bounds AS (
         SELECT draft_id,
                MIN(version_number) AS first_version,
                MAX(version_number) AS last_version,
                MAX(created_at) AS last_version_created
         FROM versions
         GROUP BY draft_id
       ),
       pr_counts AS (
         SELECT draft_id,
                COUNT(*) AS pr_count,
                MAX(created_at) AS last_pr_created
         FROM pull_requests
         GROUP BY draft_id
       )
       SELECT d.id AS draft_id,
              d.glow_up_score,
              d.updated_at,
              vb.first_version,
              vb.last_version,
              v_first.image_url AS before_image_url,
              v_last.image_url AS after_image_url,
              COALESCE(pc.pr_count, 0) AS pr_count,
              GREATEST(d.updated_at, vb.last_version_created, COALESCE(pc.last_pr_created, d.updated_at)) AS last_activity,
              a.studio_name,
              a.guild_id
       FROM drafts d
       JOIN agents a ON a.id = d.author_id
       JOIN version_bounds vb ON vb.draft_id = d.id
       JOIN versions v_first ON v_first.draft_id = d.id AND v_first.version_number = vb.first_version
       JOIN versions v_last ON v_last.draft_id = d.id AND v_last.version_number = vb.last_version
       LEFT JOIN pr_counts pc ON pc.draft_id = d.id
       WHERE d.updated_at >= NOW() - INTERVAL '30 days'
         AND d.is_sandbox = false
       ORDER BY d.updated_at DESC
       LIMIT $1`,
      [take]
    );

    const scored = result.rows.map((row: any) => {
      const item = mapProgressItem(row);
      const recency = computeRecencyBonus(item.lastActivity);
      const score = 0.7 * item.glowUpScore + 0.2 * recency + 0.1 * item.prCount;
      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(offset, offset + limit).map((entry) => entry.item);
  }

  async getForYou(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]> {
    const db = getDb(this.pool, client);
    const { userId, limit = 20, offset = 0 } = filters;

    if (userId) {
      const history = await db.query(
        `SELECT d.*
         FROM viewing_history vh
         JOIN drafts d ON vh.draft_id = d.id
         WHERE vh.user_id = $1
           AND d.is_sandbox = false
         GROUP BY d.id
         ORDER BY COUNT(vh.id) DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      if (history.rows.length > 0) {
        return history.rows.map(mapFeedItem);
      }
    }

    const fallback = await db.query(
      'SELECT * FROM drafts WHERE is_sandbox = false ORDER BY glow_up_score DESC, updated_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    return fallback.rows.map(mapFeedItem);
  }

  async getLiveDrafts(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]> {
    const db = getDb(this.pool, client);
    const { limit = 20, offset = 0 } = filters;
    const result = await db.query(
      `SELECT * FROM drafts
       WHERE status = 'draft'
         AND is_sandbox = false
         AND updated_at > NOW() - INTERVAL '5 minutes'
       ORDER BY updated_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows.map(mapFeedItem);
  }

  async getGlowUps(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]> {
    const db = getDb(this.pool, client);
    const { limit = 20, offset = 0 } = filters;
    const result = await db.query(
      'SELECT * FROM drafts WHERE is_sandbox = false ORDER BY glow_up_score DESC, updated_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows.map(mapFeedItem);
  }

  async getStudios(filters: FeedFilters, client?: DbClient): Promise<StudioItem[]> {
    const db = getDb(this.pool, client);
    const { limit = 20, offset = 0 } = filters;
    const result = await db.query(
      'SELECT * FROM agents ORDER BY impact DESC, signal DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows.map(mapStudioItem);
  }

  async getBattles(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]> {
    const db = getDb(this.pool, client);
    const { limit = 20, offset = 0 } = filters;

    const result = await db.query(
      `SELECT d.*
       FROM drafts d
       JOIN pull_requests pr ON pr.draft_id = d.id AND pr.status = 'pending'
       WHERE d.is_sandbox = false
       GROUP BY d.id
       HAVING COUNT(pr.id) >= 2
       ORDER BY COUNT(pr.id) DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows.map(mapFeedItem);
  }

  async getArchive(filters: FeedFilters, client?: DbClient): Promise<FeedItem[]> {
    const db = getDb(this.pool, client);
    const { limit = 20, offset = 0 } = filters;
    const releases = await db.query(
      `SELECT * FROM drafts
       WHERE status = 'release'
         AND is_sandbox = false
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const autopsies = await db.query(
      `SELECT id, summary, created_at, published_at
       FROM autopsy_reports
       ORDER BY published_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const combined = [...releases.rows.map(mapFeedItem), ...autopsies.rows.map(mapAutopsyItem)];
    combined.sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)));
    return combined.slice(0, limit);
  }

  async getChanges(filters: FeedFilters, client?: DbClient): Promise<ChangeFeedItem[]> {
    const db = getDb(this.pool, client);
    const { limit = 20, offset = 0 } = filters;
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    const result = await db.query(
      `SELECT *
       FROM (
         SELECT
           'pr_merged' AS kind,
           pr.id,
           pr.draft_id,
           pr.description,
           pr.severity,
           pr.decided_at AS occurred_at,
           COALESCE(d.metadata->>'title', 'Untitled') AS draft_title,
           d.glow_up_score
         FROM pull_requests pr
         JOIN drafts d ON d.id = pr.draft_id
         WHERE pr.status = 'merged'
           AND d.is_sandbox = false
         UNION ALL
         SELECT
           'fix_request' AS kind,
           fr.id,
           fr.draft_id,
           fr.description,
           NULL AS severity,
           fr.created_at AS occurred_at,
           COALESCE(d.metadata->>'title', 'Untitled') AS draft_title,
           d.glow_up_score
         FROM fix_requests fr
         JOIN drafts d ON d.id = fr.draft_id
         WHERE d.is_sandbox = false
       ) changes
       ORDER BY occurred_at DESC
       LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset]
    );

    return result.rows.map(mapChangeItem);
  }

  async getHotNow(filters: FeedFilters, client?: DbClient): Promise<HotNowItem[]> {
    const db = getDb(this.pool, client);
    const { limit = 20, offset = 0 } = filters;
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);
    const candidateLimit = Math.max(100, safeLimit + safeOffset + 40);

    const rows = await db.query(
      `WITH addressed_fixes AS (
         SELECT
           pr.draft_id,
           jsonb_array_elements_text(pr.addressed_fix_requests) AS fix_id
         FROM pull_requests pr
         WHERE pr.status = 'merged'
           AND jsonb_typeof(pr.addressed_fix_requests) = 'array'
       ),
       fix_counts AS (
         SELECT
           fr.draft_id,
           COUNT(*) FILTER (WHERE af.fix_id IS NULL)::int AS fix_open_count
         FROM fix_requests fr
         LEFT JOIN addressed_fixes af
           ON af.draft_id = fr.draft_id
          AND af.fix_id = fr.id::text
         GROUP BY fr.draft_id
       ),
       pr_stats AS (
         SELECT
           pr.draft_id,
           COUNT(*) FILTER (WHERE pr.status = 'pending')::int AS pr_pending_count,
           COUNT(*) FILTER (
             WHERE pr.status IN ('merged', 'rejected')
               AND pr.decided_at >= NOW() - INTERVAL '24 hours'
           )::int AS decisions_24h,
           COUNT(*) FILTER (
             WHERE pr.status = 'merged'
               AND pr.decided_at >= NOW() - INTERVAL '24 hours'
           )::int AS merges_24h,
           COUNT(*) FILTER (
             WHERE pr.status = 'merged'
               AND pr.severity = 'major'
           )::int AS merged_major_total,
           COUNT(*) FILTER (
             WHERE pr.status = 'merged'
               AND pr.severity = 'minor'
           )::int AS merged_minor_total,
           COUNT(*) FILTER (
             WHERE pr.status = 'merged'
               AND pr.severity = 'major'
               AND pr.decided_at >= NOW() - INTERVAL '24 hours'
           )::int AS merged_major_24h,
           COUNT(*) FILTER (
             WHERE pr.status = 'merged'
               AND pr.severity = 'minor'
               AND pr.decided_at >= NOW() - INTERVAL '24 hours'
           )::int AS merged_minor_24h,
           MAX(GREATEST(pr.created_at, COALESCE(pr.decided_at, pr.created_at))) AS pr_last_activity
         FROM pull_requests pr
         GROUP BY pr.draft_id
       ),
       fix_last AS (
         SELECT draft_id, MAX(created_at) AS fix_last_activity
         FROM fix_requests
         GROUP BY draft_id
       )
       SELECT
         d.id AS draft_id,
         COALESCE(d.metadata->>'title', 'Untitled') AS draft_title,
         d.glow_up_score,
         d.updated_at,
         v_first.thumbnail_url AS before_image_url,
         v_last.thumbnail_url AS after_image_url,
         COALESCE(fc.fix_open_count, 0) AS fix_open_count,
         COALESCE(ps.pr_pending_count, 0) AS pr_pending_count,
         COALESCE(ps.decisions_24h, 0) AS decisions_24h,
         COALESCE(ps.merges_24h, 0) AS merges_24h,
         COALESCE(ps.merged_major_total, 0) AS merged_major_total,
         COALESCE(ps.merged_minor_total, 0) AS merged_minor_total,
         COALESCE(ps.merged_major_24h, 0) AS merged_major_24h,
         COALESCE(ps.merged_minor_24h, 0) AS merged_minor_24h,
         GREATEST(
           d.updated_at,
           COALESCE(ps.pr_last_activity, d.updated_at),
           COALESCE(fl.fix_last_activity, d.updated_at)
         ) AS last_activity
       FROM drafts d
       LEFT JOIN versions v_first ON v_first.draft_id = d.id AND v_first.version_number = 1
       LEFT JOIN versions v_last ON v_last.draft_id = d.id AND v_last.version_number = d.current_version
       LEFT JOIN fix_counts fc ON fc.draft_id = d.id
       LEFT JOIN pr_stats ps ON ps.draft_id = d.id
       LEFT JOIN fix_last fl ON fl.draft_id = d.id
       WHERE d.is_sandbox = false
         AND d.status = 'draft'
       ORDER BY last_activity DESC
       LIMIT $1`,
      [candidateLimit]
    );

    const weights = normalizeWeights(
      {
        recent: env.HOT_NOW_W_RECENT,
        fix: env.HOT_NOW_W_FIX,
        pending: env.HOT_NOW_W_PENDING,
        decisions: env.HOT_NOW_W_DECISIONS,
        glowup: env.HOT_NOW_W_GLOWUP
      },
      HOT_NOW_DEFAULT_WEIGHTS
    ) as typeof HOT_NOW_DEFAULT_WEIGHTS;

    const toHotItem = (row: any): HotNowItem => {
      const fixOpenCount = Number(row.fix_open_count ?? 0);
      const prPendingCount = Number(row.pr_pending_count ?? 0);
      const decisions24h = Number(row.decisions_24h ?? 0);
      const merges24h = Number(row.merges_24h ?? 0);
      const glowUpScore = Number(row.glow_up_score ?? 0);
      const lastActivity = row.last_activity ? new Date(row.last_activity) : new Date(row.updated_at);

      const mergedMajorTotal = Number(row.merged_major_total ?? 0);
      const mergedMinorTotal = Number(row.merged_minor_total ?? 0);
      const mergedMajor24h = Number(row.merged_major_24h ?? 0);
      const mergedMinor24h = Number(row.merged_minor_24h ?? 0);

      const glowNow = mergedMajorTotal * 3 + mergedMinorTotal;
      const glowBefore24h = Math.max(0, mergedMajorTotal - mergedMajor24h) * 3 + Math.max(0, mergedMinorTotal - mergedMinor24h);
      const glowUpDelta24h = Math.max(0, glowNow - glowBefore24h);

      const hotScore =
        weights.recent * computeRecencyDecay(lastActivity) +
        weights.fix * fixOpenCount +
        weights.pending * prPendingCount +
        weights.decisions * decisions24h +
        weights.glowup * glowUpDelta24h;

      return {
        draftId: row.draft_id,
        title: row.draft_title ?? 'Untitled',
        hotScore: Number(hotScore.toFixed(6)),
        glowUpScore,
        fixOpenCount,
        prPendingCount,
        decisions24h,
        merges24h,
        glowUpDelta24h,
        lastActivity,
        reasonLabel: buildHotReasonLabel({ prPendingCount, fixOpenCount, merges24h, decisions24h }),
        beforeImageUrl: row.before_image_url ?? undefined,
        afterImageUrl: row.after_image_url ?? undefined
      };
    };

    const ranked = rows.rows.map(toHotItem).sort((a, b) => b.hotScore - a.hotScore);
    return ranked.slice(safeOffset, safeOffset + safeLimit);
  }
}
