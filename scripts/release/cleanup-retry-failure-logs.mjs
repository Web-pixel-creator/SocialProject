import {
  cleanupRetryFailureLogs,
  formatRetryLogsCleanupSummary,
  resolveRetryLogsCleanupConfig,
  resolveRetryLogsDir,
} from './retry-failure-logs-utils.mjs';

const parseArguments = (argv) => {
  const options = {
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: npm run release:smoke:retry:cleanup [-- --json]\n',
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const outputDir = resolveRetryLogsDir(process.env);
  const retryLogsCleanupConfig = resolveRetryLogsCleanupConfig(process.env);

  const summary = await cleanupRetryFailureLogs({
    outputDir,
    ...retryLogsCleanupConfig,
  });
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          label: 'retry:cleanup',
          summary,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
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
