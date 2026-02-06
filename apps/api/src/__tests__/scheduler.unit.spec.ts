import type { Pool } from 'pg';

const scheduleCalls: Array<{
  expression: string;
  handler: () => Promise<void>;
  options: { timezone?: string };
  stop: jest.Mock;
}> = [];

const scheduleMock = jest.fn(
  (
    expression: string,
    handler: () => Promise<void>,
    options: { timezone?: string },
  ) => {
    const stop = jest.fn();
    scheduleCalls.push({ expression, handler, options, stop });
    return { stop };
  },
);

const resetBudgets = jest.fn();
const generateGlowUpReel = jest.fn();
const generateAutopsyReport = jest.fn();
const purgeExpiredData = jest.fn();
const backfillDraftEmbeddings = jest.fn();

const loggerInfo = jest.fn();
const loggerWarn = jest.fn();
const loggerError = jest.fn();

const setupScheduler = (jobsEnabled: string) => {
  jest.resetModules();
  scheduleCalls.length = 0;
  scheduleMock.mockClear();
  resetBudgets.mockReset();
  generateGlowUpReel.mockReset();
  generateAutopsyReport.mockReset();
  purgeExpiredData.mockReset();
  backfillDraftEmbeddings.mockReset();
  loggerInfo.mockClear();
  loggerWarn.mockClear();
  loggerError.mockClear();

  jest.doMock('node-cron', () => ({
    __esModule: true,
    default: { schedule: scheduleMock },
  }));
  jest.doMock('../config/env', () => ({ env: { JOBS_ENABLED: jobsEnabled } }));
  jest.doMock('../logging/logger', () => ({
    logger: { info: loggerInfo, warn: loggerWarn, error: loggerError },
  }));
  jest.doMock('../services/budget/budgetService', () => ({
    BudgetServiceImpl: jest.fn().mockImplementation(() => ({
      resetBudgets,
    })),
  }));
  jest.doMock('../services/content/contentService', () => ({
    ContentGenerationServiceImpl: jest.fn().mockImplementation(() => ({
      generateGlowUpReel,
      generateAutopsyReport,
    })),
  }));
  jest.doMock('../services/privacy/privacyService', () => ({
    PrivacyServiceImpl: jest.fn().mockImplementation(() => ({
      purgeExpiredData,
    })),
  }));
  jest.doMock('../services/search/embeddingBackfillService', () => ({
    EmbeddingBackfillServiceImpl: jest.fn().mockImplementation(() => ({
      backfillDraftEmbeddings,
    })),
  }));

  return require('../jobs/scheduler') as typeof import('../jobs/scheduler');
};

describe('job scheduler', () => {
  test('returns null when jobs are disabled', () => {
    const { startScheduler } = setupScheduler('false');
    const result = startScheduler({} as Pool);
    expect(result).toBeNull();
    expect(loggerInfo).toHaveBeenCalledWith('Job scheduler disabled');
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  test('schedules tasks and runs callbacks', async () => {
    const { startScheduler } = setupScheduler('true');
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;
    const handle = startScheduler(pool);

    expect(handle).not.toBeNull();
    expect(loggerInfo).toHaveBeenCalledWith('Job scheduler started');
    expect(scheduleMock).toHaveBeenCalledTimes(5);

    const expressions = scheduleCalls.map((call) => call.expression);
    expect(expressions).toEqual([
      '0 0 * * *',
      '5 0 * * *',
      '10 0 * * *',
      '15 0 * * *',
      '20 0 * * *',
    ]);
    for (const call of scheduleCalls) {
      expect(call.options.timezone).toBe('UTC');
    }

    resetBudgets.mockResolvedValueOnce(3);
    generateGlowUpReel.mockResolvedValueOnce({ id: 'reel-1' });
    generateAutopsyReport.mockResolvedValueOnce({ id: 'report-1' });
    purgeExpiredData.mockResolvedValueOnce({
      viewingHistory: 0,
      paymentEvents: 0,
      dataExports: 0,
    });
    backfillDraftEmbeddings.mockResolvedValueOnce({
      processed: 2,
      inserted: 2,
      skipped: 0,
    });

    await scheduleCalls[0].handler();
    await scheduleCalls[1].handler();
    await scheduleCalls[2].handler();
    await scheduleCalls[3].handler();
    await scheduleCalls[4].handler();

    expect(loggerInfo).toHaveBeenCalledWith({ deleted: 3 }, 'Budgets reset');
    expect(loggerInfo).toHaveBeenCalledWith(
      { reelId: 'reel-1' },
      'GlowUp reel generated',
    );
    expect(loggerInfo).toHaveBeenCalledWith(
      { reportId: 'report-1' },
      'Autopsy report generated',
    );
    expect(loggerInfo).toHaveBeenCalledWith(
      { viewingHistory: 0, paymentEvents: 0, dataExports: 0 },
      'Retention cleanup complete',
    );
    expect(loggerInfo).toHaveBeenCalledWith(
      { processed: 2, inserted: 2, skipped: 0 },
      'Draft embedding backfill complete',
    );

    resetBudgets.mockRejectedValueOnce(new Error('budget fail'));
    generateGlowUpReel.mockRejectedValueOnce(new Error('reel fail'));
    generateAutopsyReport.mockRejectedValueOnce(new Error('autopsy fail'));
    purgeExpiredData.mockRejectedValueOnce(new Error('retention fail'));
    backfillDraftEmbeddings.mockRejectedValueOnce(new Error('backfill fail'));

    await scheduleCalls[0].handler();
    await scheduleCalls[1].handler();
    await scheduleCalls[2].handler();
    await scheduleCalls[3].handler();
    await scheduleCalls[4].handler();

    expect(loggerError).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Budget reset failed',
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'GlowUp reel generation skipped',
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Autopsy generation skipped',
    );
    expect(loggerError).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Retention cleanup failed',
    );
    expect(loggerError).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Draft embedding backfill failed',
    );

    handle?.stop();
    for (const call of scheduleCalls) {
      expect(call.stop).toHaveBeenCalledTimes(1);
    }
    expect(pool.query).toHaveBeenCalled();
  });
});
