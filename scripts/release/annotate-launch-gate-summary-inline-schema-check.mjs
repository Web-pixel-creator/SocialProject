import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const USAGE = `Usage: node scripts/release/annotate-launch-gate-summary-inline-schema-check.mjs --summary <path> --schema-check <path>

Options:
  --summary <path>       Required path to production launch-gate summary JSON.
  --schema-check <path>  Required path to inline schema-check JSON output.
  --help                 Show help.
`;

const resolvePath = (filePath) =>
  path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);

const parseArgs = (argv) => {
  const options = {
    schemaCheckPath: '',
    summaryPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--summary') {
      options.summaryPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--schema-check') {
      options.schemaCheckPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  if (!options.summaryPath || !options.schemaCheckPath) {
    throw new Error(
      `Both --summary and --schema-check are required.\n\n${USAGE}`,
    );
  }

  return options;
};

const loadJson = async (filePath) => {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
};

const buildInlineSchemaCheckSummary = (schemaCheckPayload) => {
  const status =
    typeof schemaCheckPayload?.status === 'string'
      ? schemaCheckPayload.status
      : 'unknown';
  const failures = Array.isArray(schemaCheckPayload?.failures)
    ? schemaCheckPayload.failures
    : [];
  const runtimeSummaryPath =
    typeof schemaCheckPayload?.runtimeSummaryPath === 'string'
      ? schemaCheckPayload.runtimeSummaryPath
      : null;

  const entry = {
    pass: status === 'pass',
    skipped: false,
    status,
    runtimeSummaryPath,
  };
  if (failures.length > 0) {
    entry.failures = failures;
  }
  return entry;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const summaryPath = resolvePath(options.summaryPath);
  const schemaCheckPath = resolvePath(options.schemaCheckPath);

  const summary = await loadJson(summaryPath);
  const schemaCheckPayload = await loadJson(schemaCheckPath);

  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error(`Invalid launch summary JSON in ${summaryPath}`);
  }

  if (
    !summary.checks ||
    typeof summary.checks !== 'object' ||
    Array.isArray(summary.checks)
  ) {
    summary.checks = {};
  }

  summary.checks.inlineHealthArtifactsSchema =
    buildInlineSchemaCheckSummary(schemaCheckPayload);

  summary.pass = Object.values(summary.checks).every(
    (entry) =>
      Boolean(
        entry &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          entry.pass === true,
      ),
  );
  summary.status = summary.pass ? 'pass' : 'fail';
  summary.inlineHealthArtifactsSchemaAnnotatedAtUtc = new Date().toISOString();

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `Annotated launch-gate summary with inlineHealthArtifactsSchema (${summary.checks.inlineHealthArtifactsSchema.status}).\n`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
