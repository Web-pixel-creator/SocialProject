import { Router } from 'express';
import { db } from '../db/pool';
import { env } from '../config/env';
import { redis } from '../redis/client';
import { requireAdmin } from '../middleware/admin';
import { BudgetServiceImpl, ACTION_LIMITS, EDIT_LIMITS, getUtcDateKey } from '../services/budget/budgetService';
import { ServiceError } from '../services/common/errors';
import { EmbeddingBackfillServiceImpl } from '../services/search/embeddingBackfillService';

const router = Router();
const embeddingBackfillService = new EmbeddingBackfillServiceImpl(db);
const budgetService = new BudgetServiceImpl();

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const toNumber = (value: string | number | undefined, fallback = 0) =>
  typeof value === 'number' ? value : Number.parseInt(value ?? `${fallback}`, 10);

const toCounts = (data: Record<string, string>) => ({
  pr: toNumber(data.prCount),
  major_pr: toNumber(data.majorPrCount),
  fix_request: toNumber(data.fixRequestCount)
});

const buildRemaining = (counts: { pr: number; major_pr: number; fix_request: number }, limits: Record<string, number>) => ({
  pr: Math.max(0, limits.pr - counts.pr),
  major_pr: Math.max(0, limits.major_pr - counts.major_pr),
  fix_request: Math.max(0, limits.fix_request - counts.fix_request)
});

const parseDateParam = (value?: string) => {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) {
    throw new ServiceError('INVALID_DATE', 'Invalid date format. Use YYYY-MM-DD.', 400);
  }
  return parsed;
};

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

router.get('/admin/budgets/remaining', requireAdmin, async (req, res, next) => {
  try {
    const agentId = req.query.agentId ? String(req.query.agentId) : null;
    const draftId = req.query.draftId ? String(req.query.draftId) : null;
    const date = parseDateParam(req.query.date ? String(req.query.date) : undefined);
    const dateKey = getUtcDateKey(date);

    if (!agentId && !draftId) {
      throw new ServiceError('MISSING_TARGET', 'agentId or draftId is required.', 400);
    }

    const response: any = { date: dateKey };

    if (agentId) {
      const counts = await budgetService.getActionBudget(agentId, { now: date });
      response.agent = {
        id: agentId,
        counts,
        limits: ACTION_LIMITS,
        remaining: buildRemaining(counts, ACTION_LIMITS)
      };
    }

    if (draftId) {
      const counts = await budgetService.getEditBudget(draftId, { now: date });
      response.draft = {
        id: draftId,
        counts,
        limits: EDIT_LIMITS,
        remaining: buildRemaining(counts, EDIT_LIMITS)
      };
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/budgets/metrics', requireAdmin, async (req, res, next) => {
  try {
    const date = parseDateParam(req.query.date ? String(req.query.date) : undefined);
    const dateKey = getUtcDateKey(date);
    const keys = await redis.keys(`budget:*:${dateKey}`);

    const draftTotals = { pr: 0, major_pr: 0, fix_request: 0 };
    const agentTotals = { pr: 0, major_pr: 0, fix_request: 0 };
    let draftKeys = 0;
    let agentKeys = 0;

    for (const key of keys) {
      const data = await redis.hGetAll(key);
      const counts = toCounts(data);
      if (key.startsWith('budget:agent:')) {
        agentKeys += 1;
        agentTotals.pr += counts.pr;
        agentTotals.major_pr += counts.major_pr;
        agentTotals.fix_request += counts.fix_request;
      } else if (key.startsWith('budget:draft:')) {
        draftKeys += 1;
        draftTotals.pr += counts.pr;
        draftTotals.major_pr += counts.major_pr;
        draftTotals.fix_request += counts.fix_request;
      }
    }

    res.json({
      date: dateKey,
      keyCount: {
        draft: draftKeys,
        agent: agentKeys,
        total: keys.length
      },
      totals: {
        draft: draftTotals,
        agent: agentTotals,
        combined: {
          pr: draftTotals.pr + agentTotals.pr,
          major_pr: draftTotals.major_pr + agentTotals.major_pr,
          fix_request: draftTotals.fix_request + agentTotals.fix_request
        }
      }
    });
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

router.get('/admin/jobs/metrics', requireAdmin, async (req, res, next) => {
  try {
    const hours = clamp(Number(req.query.hours ?? 24), 1, 720);
    const summary = await db.query(
      `SELECT job_name,
              COUNT(*)::int AS total_runs,
              SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::int AS success_count,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failure_count,
              AVG(duration_ms)::float AS avg_duration_ms,
              MAX(finished_at) AS last_run_at,
              (SELECT status FROM job_runs jr2 WHERE jr2.job_name = job_runs.job_name ORDER BY finished_at DESC LIMIT 1) AS last_status,
              (SELECT error_message FROM job_runs jr3 WHERE jr3.job_name = job_runs.job_name ORDER BY finished_at DESC LIMIT 1) AS last_error
       FROM job_runs
       WHERE started_at >= NOW() - ($1 || ' hours')::interval
       GROUP BY job_name
       ORDER BY last_run_at DESC`,
      [hours]
    );

    res.json({ windowHours: hours, rows: summary.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
