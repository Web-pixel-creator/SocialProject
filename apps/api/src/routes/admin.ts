import { Router } from 'express';
import { db } from '../db/pool';
import { env } from '../config/env';
import { redis } from '../redis/client';
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

router.get('/admin/system/metrics', requireAdmin, async (_req, res, next) => {
  try {
    const startedAt = Date.now();
    let dbOk = false;
    let dbLatencyMs: number | null = null;
    try {
      await db.query('SELECT 1');
      dbOk = true;
      dbLatencyMs = Date.now() - startedAt;
    } catch (_error) {
      dbOk = false;
    }

    const memory = process.memoryUsage();
    res.json({
      uptimeSeconds: process.uptime(),
      nodeVersion: process.version,
      jobsEnabled: env.JOBS_ENABLED === 'true',
      db: { ok: dbOk, latencyMs: dbLatencyMs },
      redis: { ok: redis.isOpen },
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/ux/metrics', requireAdmin, async (req, res, next) => {
  try {
    const hours = clamp(Number(req.query.hours ?? 24), 1, 720);
    const eventType = req.query.eventType ? String(req.query.eventType) : null;
    const filters: string[] = ["created_at >= NOW() - ($1 || ' hours')::interval"];
    const params: any[] = [hours];

    if (eventType) {
      params.push(eventType);
      filters.push(`event_type = $${params.length}`);
    }

    const summary = await db.query(
      `SELECT event_type,
              COUNT(*)::int AS count,
              AVG(timing_ms)::float AS avg_timing_ms,
              MAX(created_at) AS last_event_at
       FROM ux_events
       WHERE ${filters.join(' AND ')}
       GROUP BY event_type
       ORDER BY count DESC`,
      params
    );

    res.json({ windowHours: hours, rows: summary.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
