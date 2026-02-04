import { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { logger } from '../../logging/logger';
import { buildEmbeddingSignal, generateEmbedding } from './embeddingUtils';
import { SearchServiceImpl } from './searchService';

type BackfillResult = {
  processed: number;
  inserted: number;
  skipped: number;
};

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

export class EmbeddingBackfillServiceImpl {
  private readonly searchService: SearchServiceImpl;

  constructor(private readonly pool: Pool) {
    this.searchService = new SearchServiceImpl(pool);
  }

  async backfillDraftEmbeddings(batchSize = 200, client?: DbClient): Promise<BackfillResult> {
    const db = getDb(this.pool, client);
    const drafts = await db.query(
      `SELECT d.id, d.metadata, v.image_url
       FROM drafts d
       JOIN LATERAL (
         SELECT image_url
         FROM versions
         WHERE draft_id = d.id
         ORDER BY version_number DESC
         LIMIT 1
       ) v ON true
       LEFT JOIN draft_embeddings e ON e.draft_id = d.id
       WHERE e.draft_id IS NULL
       LIMIT $1`,
      [batchSize]
    );

    let inserted = 0;
    let skipped = 0;

    for (const row of drafts.rows) {
      const signal = buildEmbeddingSignal(row.image_url, row.metadata ?? {});
      const embedding = generateEmbedding(signal);
      if (embedding.length === 0) {
        skipped += 1;
        continue;
      }
      try {
        await this.searchService.upsertDraftEmbedding(row.id, embedding, 'auto', db);
        inserted += 1;
      } catch (error) {
        logger.warn({ err: error, draftId: row.id }, 'Draft embedding backfill failed');
        skipped += 1;
      }
    }

    return { processed: drafts.rows.length, inserted, skipped };
  }
}
