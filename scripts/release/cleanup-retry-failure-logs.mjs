import {
  cleanupRetryFailureLogs,
  formatRetryLogsCleanupSummary,
  resolveRetryLogsCleanupConfig,
  resolveRetryLogsDir,
} from './retry-failure-logs-utils.mjs';

const main = async () => {
  const outputDir = resolveRetryLogsDir(process.env);
  const retryLogsCleanupConfig = resolveRetryLogsCleanupConfig(process.env);

  const summary = await cleanupRetryFailureLogs({
    outputDir,
    ...retryLogsCleanupConfig,
  });
  process.stdout.write(
    `${formatRetryLogsCleanupSummary({
      summary,
      label: 'retry:cleanup',
    })}\n`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
