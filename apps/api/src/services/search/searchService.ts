import { Pool } from 'pg';
import { env } from '../../config/env';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import type {
  SearchFilters,
  SearchProfile,
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
    const { type = 'all', sort = 'recency', range = 'all', profile, limit = 20, offset = 0 } = filters;
    const q = `%${query}%`;
    const terms = normalizeTerms(query);
    const rangeClause =
      range === '7d'
        ? "AND d.updated_at >= NOW() - INTERVAL '7 days'"
        : range === '30d'
        ? "AND d.updated_at >= NOW() - INTERVAL '30 days'"
        : '';

    const results: SearchResult[] = [];

    if (type === 'all' || type === 'draft' || type === 'release') {
      const statusFilter =
        type === 'draft' ? "d.status = 'draft'" : type === 'release' ? "d.status = 'release'" : '1=1';
      const orderBy =
        sort === 'glowup'
          ? 'd.glow_up_score DESC'
          : sort === 'recency'
          ? 'd.updated_at DESC'
          : 'd.glow_up_score DESC';

      const drafts = await db.query(
        `SELECT d.id, d.status, d.glow_up_score, d.metadata, d.updated_at
         FROM drafts d
         WHERE ${statusFilter} AND (d.metadata::text ILIKE $1)
         ${rangeClause}
         ORDER BY ${orderBy}
         LIMIT $2 OFFSET $3`,
        [q, limit, offset]
      );

      const draftResults = drafts.rows.map((row) => {
        const title = row.metadata?.title ?? 'Untitled';
        const score = Number(row.glow_up_score ?? 0);
        const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
        const relevanceScore =
          sort === 'relevance'
            ? scoreRelevance(
                JSON.stringify(row.metadata ?? {}),
                score,
                updatedAt,
                terms,
                getSearchWeights(profile)
              )
            : undefined;
        return {
          type: row.status === 'release' ? 'release' : 'draft',
          id: row.id,
          title,
          score,
          relevanceScore
        };
      });

      if (sort === 'relevance') {
        draftResults.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
      }

      results.push(
        ...draftResults.map(({ relevanceScore: _relevanceScore, ...rest }) => rest)
      );
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

      const studioResults = studios.rows.map((row) => {
        const score = Number(row.impact ?? 0);
        const relevanceScore =
          sort === 'relevance'
            ? scoreStudioRelevance(row.studio_name ?? '', score, terms, getStudioWeights(profile))
            : undefined;
        return {
          type: 'studio',
          id: row.id,
          title: row.studio_name,
          score,
          relevanceScore
        };
      });

      if (sort === 'relevance') {
        studioResults.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
      }

      results.push(
        ...studioResults.map(({ relevanceScore: _relevanceScore, ...rest }) => rest)
      );
    }

    return results;
  }

  async searchSimilar(
    draftId: string,
    filters?: VisualSearchFilters,
    client?: DbClient
  ): Promise<VisualSearchResult[]> {
    const db = getDb(this.pool, client);
    const draft = await db.query('SELECT id FROM drafts WHERE id = $1', [draftId]);
    if (draft.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }

    const embedding = await this.getEmbeddingByDraftId(draftId, db);
    if (!embedding || embedding.length === 0) {
      throw new ServiceError('EMBEDDING_NOT_FOUND', 'Draft embedding not found.', 404);
    }

    const effectiveFilters: VisualSearchFilters = {
      ...filters,
      excludeDraftId: filters?.excludeDraftId ?? draftId
    };

    return this.searchVisual(
      {
        embedding,
        filters: effectiveFilters
      },
      db
    );
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
      if (draftId) {
        throw new ServiceError('EMBEDDING_NOT_FOUND', 'Draft embedding not found.', 404);
      }
      throw new ServiceError('EMBEDDING_REQUIRED', 'Provide a draftId or embedding array.', 400);
    }

    const { type = 'all', tags = [], limit = 20, offset = 0, excludeDraftId } = filters ?? {};
    const candidateLimit = Math.max(100, (offset + limit) * 5);

    const statusFilter =
      type === 'draft' ? "d.status = 'draft'" : type === 'release' ? "d.status = 'release'" : '1=1';
    const params: any[] = [candidateLimit];
    const clauses = [`${statusFilter}`, 'd.is_sandbox = false'];
    let paramIndex = 2;

    if (tags.length > 0) {
      clauses.push(`COALESCE(d.metadata->'tags', '[]'::jsonb) ?| $${paramIndex}`);
      params.push(tags);
      paramIndex += 1;
    }

    const effectiveExclude = excludeDraftId ?? draftId;
    if (effectiveExclude) {
      clauses.push(`d.id <> $${paramIndex}`);
      params.push(effectiveExclude);
      paramIndex += 1;
    }

    const results = await db.query(
      `SELECT d.id, d.status, d.glow_up_score, d.metadata, e.embedding
       FROM drafts d
       JOIN draft_embeddings e ON e.draft_id = d.id
       WHERE ${clauses.join(' AND ')}
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

const normalizeTerms = (query: string): string[] =>
  query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);

const scoreKeywordMatch = (text: string, terms: string[]): number => {
  if (terms.length === 0) {
    return 0;
  }
  const lowered = text.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (lowered.includes(term)) {
      hits += 1;
    }
  }
  return hits / terms.length;
};

const scoreRecency = (updatedAt: Date | null): number => {
  if (!updatedAt) {
    return 0;
  }
  const diffMs = Date.now() - updatedAt.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - days / 30);
};

const normalizeMetric = (value: number): number => Math.max(0, Math.min(value / 100, 1));

const scoreRelevance = (
  text: string,
  glowUpScore: number,
  updatedAt: Date | null,
  terms: string[],
  weights: { keyword: number; glowup: number; recency: number }
): number => {
  const keywordScore = scoreKeywordMatch(text, terms);
  const glowScore = normalizeMetric(glowUpScore);
  const recencyScore = scoreRecency(updatedAt);
  return keywordScore * weights.keyword + glowScore * weights.glowup + recencyScore * weights.recency;
};

const scoreStudioRelevance = (
  text: string,
  impact: number,
  terms: string[],
  weights: { keyword: number; impact: number }
): number => {
  const keywordScore = scoreKeywordMatch(text, terms);
  const impactScore = normalizeMetric(impact);
  return keywordScore * weights.keyword + impactScore * weights.impact;
};

const normalizeWeights = (
  weights: Record<string, number>,
  defaults: Record<string, number>
): Record<string, number> => {
  const entries = Object.entries(weights).map(([key, value]) => [key, Number(value)]);
  const sanitized = Object.fromEntries(
    entries.map(([key, value]) => [key, Number.isFinite(value) && value > 0 ? value : 0])
  );
  const sum = Object.values(sanitized).reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return defaults;
  }
  return Object.fromEntries(Object.entries(sanitized).map(([key, value]) => [key, value / sum]));
};

const BALANCED_WEIGHTS = { keyword: 0.6, glowup: 0.3, recency: 0.1 };
const QUALITY_WEIGHTS = { keyword: 0.45, glowup: 0.45, recency: 0.1 };
const NOVELTY_WEIGHTS = { keyword: 0.5, glowup: 0.2, recency: 0.3 };

const BALANCED_STUDIO_WEIGHTS = { keyword: 0.7, impact: 0.3 };
const QUALITY_STUDIO_WEIGHTS = { keyword: 0.6, impact: 0.4 };
const NOVELTY_STUDIO_WEIGHTS = { keyword: 0.65, impact: 0.35 };

const getSearchWeights = (profile?: SearchProfile) => {
  if (profile === 'quality') {
    return QUALITY_WEIGHTS;
  }
  if (profile === 'novelty') {
    return NOVELTY_WEIGHTS;
  }
  return normalizeWeights(
    {
      keyword: env.SEARCH_RELEVANCE_WEIGHT_KEYWORD,
      glowup: env.SEARCH_RELEVANCE_WEIGHT_GLOWUP,
      recency: env.SEARCH_RELEVANCE_WEIGHT_RECENCY
    },
    BALANCED_WEIGHTS
  ) as { keyword: number; glowup: number; recency: number };
};

const getStudioWeights = (profile?: SearchProfile) => {
  if (profile === 'quality') {
    return QUALITY_STUDIO_WEIGHTS;
  }
  if (profile === 'novelty') {
    return NOVELTY_STUDIO_WEIGHTS;
  }
  return normalizeWeights(
    {
      keyword: env.SEARCH_RELEVANCE_WEIGHT_STUDIO_KEYWORD,
      impact: env.SEARCH_RELEVANCE_WEIGHT_STUDIO_IMPACT
    },
    BALANCED_STUDIO_WEIGHTS
  ) as { keyword: number; impact: number };
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
