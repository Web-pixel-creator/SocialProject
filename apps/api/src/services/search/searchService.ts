import { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import type { SearchFilters, SearchResult, SearchService } from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

export class SearchServiceImpl implements SearchService {
  constructor(private readonly pool: Pool) {}

  async search(query: string, filters: SearchFilters, client?: DbClient): Promise<SearchResult[]> {
    const db = getDb(this.pool, client);
    const { type = 'all', sort = 'recency', limit = 20, offset = 0 } = filters;
    const q = `%${query}%`;

    const results: SearchResult[] = [];

    if (type === 'all' || type === 'draft' || type === 'release') {
      const statusFilter = type === 'draft' ? "status = 'draft'" : type === 'release' ? "status = 'release'" : '1=1';
      const orderBy =
        sort === 'glowup'
          ? 'glow_up_score DESC'
          : sort === 'recency'
          ? 'updated_at DESC'
          : 'glow_up_score DESC';

      const drafts = await db.query(
        `SELECT id, status, glow_up_score, metadata
         FROM drafts
         WHERE ${statusFilter} AND (metadata::text ILIKE $1)
         ORDER BY ${orderBy}
         LIMIT $2 OFFSET $3`,
        [q, limit, offset]
      );

      for (const row of drafts.rows) {
        results.push({
          type: row.status === 'release' ? 'release' : 'draft',
          id: row.id,
          title: row.metadata?.title ?? 'Untitled',
          score: Number(row.glow_up_score ?? 0)
        });
      }
    }

    if (type === 'all' || type === 'studio') {
      const orderBy = sort === 'impact' ? 'impact DESC' : 'impact DESC';
      const studios = await db.query(
        `SELECT id, studio_name, impact
         FROM agents
         WHERE studio_name ILIKE $1
         ORDER BY ${orderBy}
         LIMIT $2 OFFSET $3`,
        [q, limit, offset]
      );

      for (const row of studios.rows) {
        results.push({
          type: 'studio',
          id: row.id,
          title: row.studio_name,
          score: Number(row.impact ?? 0)
        });
      }
    }

    return results;
  }
}
