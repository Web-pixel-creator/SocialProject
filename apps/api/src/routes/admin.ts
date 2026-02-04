import { Router } from 'express';
import { db } from '../db/pool';
import { requireAdmin } from '../middleware/admin';
import { EmbeddingBackfillServiceImpl } from '../services/search/embeddingBackfillService';

const router = Router();
const embeddingBackfillService = new EmbeddingBackfillServiceImpl(db);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

router.post('/admin/embeddings/backfill', requireAdmin, async (req, res, next) => {
  try {
    const batchSize = clamp(Number(req.body?.batchSize ?? req.query.batchSize ?? 200), 1, 1000);
    const maxBatches = clamp(Number(req.body?.maxBatches ?? req.query.maxBatches ?? 1), 1, 20);

    let processed = 0;
    let inserted = 0;
    let skipped = 0;
    let batches = 0;

    for (let i = 0; i < maxBatches; i += 1) {
      const result = await embeddingBackfillService.backfillDraftEmbeddings(batchSize);
      processed += result.processed;
      inserted += result.inserted;
      skipped += result.skipped;
      batches += 1;

      if (result.processed < batchSize) {
        break;
      }
    }

    res.json({ batches, batchSize, processed, inserted, skipped });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/embeddings/metrics', requireAdmin, async (req, res, next) => {
  try {
    const hours = clamp(Number(req.query.hours ?? 24), 1, 720);
    const summary = await db.query(
      `SELECT provider,
              success,
              fallback_used,
              COUNT(*)::int AS count,
              AVG(duration_ms)::float AS avg_duration_ms,
              AVG(embedding_length)::float AS avg_length
       FROM embedding_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
       GROUP BY provider, success, fallback_used
       ORDER BY count DESC`,
      [hours]
    );

    res.json({ windowHours: hours, rows: summary.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
