import { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import type { FeedFilters, FeedItem, FeedService, StudioItem } from './types';

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

export class FeedServiceImpl implements FeedService {
  constructor(private readonly pool: Pool) {}

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
