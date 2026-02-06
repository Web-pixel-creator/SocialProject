import cron from 'node-cron';
import type { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../logging/logger';
import { BudgetServiceImpl } from '../services/budget/budgetService';
import { ContentGenerationServiceImpl } from '../services/content/contentService';
import { PrivacyServiceImpl } from '../services/privacy/privacyService';
import { EmbeddingBackfillServiceImpl } from '../services/search/embeddingBackfillService';

interface JobHandle {
  stop: () => void;
}

const recordJobRun = async (
  pool: Pool,
  jobName: string,
  status: 'success' | 'failed',
  startedAt: Date,
  metadata?: Record<string, unknown>,
  errorMessage?: string,
) => {
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
  try {
    await pool.query(
      `INSERT INTO job_runs (job_name, status, started_at, finished_at, duration_ms, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        jobName,
        status,
        startedAt,
        finishedAt,
        durationMs,
        errorMessage ?? null,
        metadata ?? {},
      ],
    );
  } catch (error) {
    logger.error({ err: error, jobName }, 'Job run record failed');
  }
};

export const startScheduler = (pool: Pool): JobHandle | null => {
  if (env.JOBS_ENABLED !== 'true') {
    logger.info('Job scheduler disabled');
    return null;
  }

  const budgetService = new BudgetServiceImpl();
  const contentService = new ContentGenerationServiceImpl(pool);
  const privacyService = new PrivacyServiceImpl(pool);
  const embeddingBackfillService = new EmbeddingBackfillServiceImpl(pool);

  const tasks = [
    cron.schedule(
      '0 0 * * *',
      async () => {
        const startedAt = new Date();
        try {
          const deleted = await budgetService.resetBudgets();
          logger.info({ deleted }, 'Budgets reset');
          await recordJobRun(pool, 'budgets_reset', 'success', startedAt, {
            deleted,
          });
        } catch (error) {
          logger.error({ err: error }, 'Budget reset failed');
          await recordJobRun(
            pool,
            'budgets_reset',
            'failed',
            startedAt,
            undefined,
            error instanceof Error ? error.message : String(error),
          );
        }
      },
      { timezone: 'UTC' },
    ),
    cron.schedule(
      '5 0 * * *',
      async () => {
        const startedAt = new Date();
        try {
          const reel = await contentService.generateGlowUpReel();
          logger.info({ reelId: reel.id }, 'GlowUp reel generated');
          await recordJobRun(pool, 'glowup_reel', 'success', startedAt, {
            reelId: reel.id,
          });
        } catch (error) {
          logger.warn({ err: error }, 'GlowUp reel generation skipped');
          await recordJobRun(
            pool,
            'glowup_reel',
            'failed',
            startedAt,
            undefined,
            error instanceof Error ? error.message : String(error),
          );
        }
      },
      { timezone: 'UTC' },
    ),
    cron.schedule(
      '10 0 * * *',
      async () => {
        const startedAt = new Date();
        try {
          const report = await contentService.generateAutopsyReport();
          logger.info({ reportId: report.id }, 'Autopsy report generated');
          await recordJobRun(pool, 'autopsy_report', 'success', startedAt, {
            reportId: report.id,
          });
        } catch (error) {
          logger.warn({ err: error }, 'Autopsy generation skipped');
          await recordJobRun(
            pool,
            'autopsy_report',
            'failed',
            startedAt,
            undefined,
            error instanceof Error ? error.message : String(error),
          );
        }
      },
      { timezone: 'UTC' },
    ),
    cron.schedule(
      '15 0 * * *',
      async () => {
        const startedAt = new Date();
        try {
          const result = await privacyService.purgeExpiredData();
          logger.info({ ...result }, 'Retention cleanup complete');
          await recordJobRun(
            pool,
            'retention_cleanup',
            'success',
            startedAt,
            result,
          );
        } catch (error) {
          logger.error({ err: error }, 'Retention cleanup failed');
          await recordJobRun(
            pool,
            'retention_cleanup',
            'failed',
            startedAt,
            undefined,
            error instanceof Error ? error.message : String(error),
          );
        }
      },
      { timezone: 'UTC' },
    ),
    cron.schedule(
      '20 0 * * *',
      async () => {
        const startedAt = new Date();
        try {
          const result =
            await embeddingBackfillService.backfillDraftEmbeddings(200);
          logger.info({ ...result }, 'Draft embedding backfill complete');
          await recordJobRun(
            pool,
            'embedding_backfill',
            'success',
            startedAt,
            result as any,
          );
        } catch (error) {
          logger.error({ err: error }, 'Draft embedding backfill failed');
          await recordJobRun(
            pool,
            'embedding_backfill',
            'failed',
            startedAt,
            undefined,
            error instanceof Error ? error.message : String(error),
          );
        }
      },
      { timezone: 'UTC' },
    ),
  ];

  logger.info('Job scheduler started');

  return {
    stop: () => {
      for (const task of tasks) {
        task.stop();
      }
    },
  };
};
