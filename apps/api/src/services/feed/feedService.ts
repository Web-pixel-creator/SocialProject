import { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import type { FeedFilters, FeedItem, FeedService, ProgressFeedItem, StudioItem } from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const mapFeedItem = (row: any): FeedItem => ({
  id: row.id,
  type: row.status === 'release' ? 'release' : 'draft',
  glowUpScore: Number(row.glow_up_score ?? 0),
  updatedAt: row.updated_at
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

const computeRecencyBonus = (lastActivity: Date): number => {
  const now = Date.now();
  const activity = new Date(lastActivity).getTime();
  const days = (now - activity) / (1000 * 60 * 60 * 24);
  const remaining = Math.max(0, 7 - days);
  return remaining / 7;
};

export class FeedServiceImpl implements FeedService {
  constructor(private readonly pool: Pool) {}

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
      'SELECT * FROM drafts ORDER BY glow_up_score DESC, updated_at DESC LIMIT $1 OFFSET $2',
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
      'SELECT * FROM drafts ORDER BY glow_up_score DESC, updated_at DESC LIMIT $1 OFFSET $2',
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
}
