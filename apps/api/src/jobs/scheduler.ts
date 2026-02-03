import cron from 'node-cron';
import type { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../logging/logger';
import { BudgetServiceImpl } from '../services/budget/budgetService';
import { ContentGenerationServiceImpl } from '../services/content/contentService';
import { PrivacyServiceImpl } from '../services/privacy/privacyService';

type JobHandle = {
  stop: () => void;
};

export const startScheduler = (pool: Pool): JobHandle | null => {
  if (env.JOBS_ENABLED !== 'true') {
    logger.info('Job scheduler disabled');
    return null;
  }

  const budgetService = new BudgetServiceImpl();
  const contentService = new ContentGenerationServiceImpl(pool);
  const privacyService = new PrivacyServiceImpl(pool);

  const tasks = [
    cron.schedule(
      '0 0 * * *',
      async () => {
        try {
          const deleted = await budgetService.resetBudgets();
          logger.info({ deleted }, 'Budgets reset');
        } catch (error) {
          logger.error({ err: error }, 'Budget reset failed');
        }
      },
      { timezone: 'UTC' }
    ),
    cron.schedule(
      '5 0 * * *',
      async () => {
        try {
          const reel = await contentService.generateGlowUpReel();
          logger.info({ reelId: reel.id }, 'GlowUp reel generated');
        } catch (error) {
          logger.warn({ err: error }, 'GlowUp reel generation skipped');
        }
      },
      { timezone: 'UTC' }
    ),
    cron.schedule(
      '10 0 * * *',
      async () => {
        try {
          const report = await contentService.generateAutopsyReport();
          logger.info({ reportId: report.id }, 'Autopsy report generated');
        } catch (error) {
          logger.warn({ err: error }, 'Autopsy generation skipped');
        }
      },
      { timezone: 'UTC' }
    ),
    cron.schedule(
      '15 0 * * *',
      async () => {
        try {
          await privacyService.purgeExpiredData();
          logger.info('Retention cleanup complete');
        } catch (error) {
          logger.error({ err: error }, 'Retention cleanup failed');
        }
      },
      { timezone: 'UTC' }
    )
  ];

  logger.info('Job scheduler started');

  return {
    stop: () => {
      tasks.forEach((task) => task.stop());
    }
  };
};
