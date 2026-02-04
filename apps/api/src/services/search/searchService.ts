import { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import type {
  SearchFilters,
  SearchResult,
  SearchService,
  VisualSearchFilters,
  VisualSearchInput,
  VisualSearchResult
} from './types';

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

  async upsertDraftEmbedding(
    draftId: string,
    embedding: number[],
    source = 'manual',
    client?: DbClient
  ): Promise<void> {
    const db = getDb(this.pool, client);
    const normalized = sanitizeEmbedding(embedding);
    if (normalized.length === 0) {
      throw new ServiceError('EMBEDDING_INVALID', 'Embedding must be a non-empty numeric array.', 400);
    }

    await db.query(
      `INSERT INTO draft_embeddings (draft_id, embedding, source, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (draft_id)
       DO UPDATE SET embedding = EXCLUDED.embedding, source = EXCLUDED.source, updated_at = NOW()`,
      [draftId, JSON.stringify(normalized), source]
    );
  }

  async searchVisual(input: VisualSearchInput, client?: DbClient): Promise<VisualSearchResult[]> {
    const db = getDb(this.pool, client);
    const { embedding, draftId, filters } = input;
    const vector = embedding ? sanitizeEmbedding(embedding) : await this.getEmbeddingByDraftId(draftId, db);

    if (!vector || vector.length === 0) {
      throw new ServiceError('EMBEDDING_REQUIRED', 'Provide a draftId or embedding array.', 400);
    }

    const { type = 'all', tags = [], limit = 20, offset = 0 } = filters ?? {};
    const candidateLimit = Math.max(100, (offset + limit) * 5);

    const statusFilter =
      type === 'draft' ? "d.status = 'draft'" : type === 'release' ? "d.status = 'release'" : '1=1';
    const params: any[] = [candidateLimit];
    const tagClause =
      tags.length > 0
        ? (() => {
            params.push(tags);
            return 'AND COALESCE(d.metadata->\'tags\', \'[]\'::jsonb) ?| $2';
          })()
        : '';

    const results = await db.query(
      `SELECT d.id, d.status, d.glow_up_score, d.metadata, e.embedding
       FROM drafts d
       JOIN draft_embeddings e ON e.draft_id = d.id
       WHERE ${statusFilter}
       ${tagClause}
       LIMIT $1`,
      params
    );

    const scored = results.rows
      .map((row) => {
        const rowEmbedding = parseEmbedding(row.embedding);
        if (!rowEmbedding) {
          return null;
        }
        const score = cosineSimilarity(vector, rowEmbedding);
        return {
          type: row.status === 'release' ? 'release' : 'draft',
          id: row.id,
          title: row.metadata?.title ?? 'Untitled',
          score,
          glowUpScore: Number(row.glow_up_score ?? 0)
        } satisfies VisualSearchResult;
      })
      .filter((item): item is VisualSearchResult => item != null);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(offset, offset + limit);
  }

  private async getEmbeddingByDraftId(draftId: string | undefined, db: DbClient): Promise<number[] | null> {
    if (!draftId) {
      return null;
    }
    const result = await db.query('SELECT embedding FROM draft_embeddings WHERE draft_id = $1', [draftId]);
    if (result.rows.length === 0) {
      return null;
    }
    return parseEmbedding(result.rows[0].embedding);
  }
}

const sanitizeEmbedding = (embedding: number[]): number[] => {
  if (!Array.isArray(embedding)) {
    return [];
  }
  return embedding
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
};

const parseEmbedding = (value: unknown): number[] | null => {
  if (Array.isArray(value)) {
    return sanitizeEmbedding(value);
  }
  return null;
};

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};
