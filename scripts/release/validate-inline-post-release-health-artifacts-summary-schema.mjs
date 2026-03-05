import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  INLINE_HEALTH_ARTIFACTS_SUMMARY_JSON_SCHEMA_PATH,
  INLINE_HEALTH_ARTIFACTS_SUMMARY_JSON_SAMPLE_PATH,
} from './inline-health-artifacts-schema-contracts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const OUTPUT_LABEL = 'release:health:inline-artifacts:schema:check';
const DEFAULT_REPORT_DIR = 'artifacts/release';
const REPORT_FILE_PATTERN =
  /^post-release-health-inline-artifacts-summary-\d+\.json$/u;
const USAGE =
  'Usage: node scripts/release/validate-inline-post-release-health-artifacts-summary-schema.mjs [summary_path] [--json]\n';

const resolvePath = (filePath) =>
  path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);

const loadJson = async (filePath) => {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
};

const formatAjvErrors = (errors = []) =>
  errors
    .map((error) => {
      const location = error.instancePath || '/';
      return `${location}: ${error.message ?? 'validation error'}`;
    })
    .join('; ');

const parseArguments = (argv) => {
  const options = {
    json: false,
    summaryPath: null,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
    }
    if (options.summaryPath) {
      throw new Error(`Unexpected argument: ${arg}\n${USAGE}`);
    }
    options.summaryPath = arg;
  }

  return options;
};

const findLatestSummaryPath = async () => {
  const reportsDir = resolvePath(DEFAULT_REPORT_DIR);
  let entries = [];
  try {
    entries = await readdir(reportsDir, { withFileTypes: true });
  } catch (error) {
    const typedError = error;
    if (typedError?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !REPORT_FILE_PATTERN.test(entry.name)) {
      continue;
    }
    const fullPath = path.join(reportsDir, entry.name);
    const entryStats = await stat(fullPath);
    candidates.push({
      fullPath,
      mtimeMs: entryStats.mtimeMs,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.fullPath ?? null;
};

const toRelative = (filePath) =>
  path.relative(projectRoot, filePath).replace(/\\/gu, '/');

const writeJsonSummary = ({
  status,
  fixturePayloads,
  runtimePayloads,
  validatedPayloads,
  runtimeSummaryPath,
  failures,
}) => {
  const payload = {
    label: OUTPUT_LABEL,
    mode: 'inline-health-artifacts-summary',
    status,
    totals: {
      fixturePayloads,
      runtimePayloads,
      validatedPayloads,
    },
    runtimeSummaryPath: runtimeSummaryPath ? toRelative(runtimeSummaryPath) : null,
    failures,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const schemaPath = resolvePath(INLINE_HEALTH_ARTIFACTS_SUMMARY_JSON_SCHEMA_PATH);
  const samplePath = resolvePath(INLINE_HEALTH_ARTIFACTS_SUMMARY_JSON_SAMPLE_PATH);
  const runtimeSummaryPath = options.summaryPath
    ? resolvePath(options.summaryPath)
    : await findLatestSummaryPath();

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  });
  addFormats(ajv);

  const schema = await loadJson(schemaPath);
  const validate = ajv.compile(schema);

  const failures = [];
  let fixturePayloads = 0;
  let runtimePayloads = 0;
  let validatedPayloads = 0;

  const samplePayload = await loadJson(samplePath);
  if (!validate(samplePayload)) {
    failures.push(
      `sample payload (${toRelative(samplePath)}) is invalid: ${formatAjvErrors(validate.errors)}`,
    );
  } else {
    fixturePayloads += 1;
    validatedPayloads += 1;
  }

  if (!runtimeSummaryPath) {
    failures.push(
      'Runtime summary not found. Run `npm run release:health:inline-artifacts:check` first or provide explicit summary path.',
    );
  } else {
    try {
      const runtimePayload = await loadJson(runtimeSummaryPath);
      if (!validate(runtimePayload)) {
        failures.push(
          `runtime summary (${toRelative(runtimeSummaryPath)}) is invalid: ${formatAjvErrors(validate.errors)}`,
        );
      } else {
        runtimePayloads += 1;
        validatedPayloads += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(
        `runtime summary validation failed (${toRelative(runtimeSummaryPath)}): ${message}`,
      );
    }
  }

  if (failures.length > 0) {
    if (options.json) {
      writeJsonSummary({
        status: 'fail',
        fixturePayloads,
        runtimePayloads,
        validatedPayloads,
        runtimeSummaryPath,
        failures,
      });
    } else {
      process.stderr.write(
        'Inline post-release health artifacts summary schema validation failed:\n',
      );
      for (const failure of failures) {
        process.stderr.write(`- ${failure}\n`);
      }
    }
    process.exit(1);
  }

  if (options.json) {
    writeJsonSummary({
      status: 'pass',
      fixturePayloads,
      runtimePayloads,
      validatedPayloads,
      runtimeSummaryPath,
      failures: [],
    });
    return;
  }

  process.stdout.write(
    `Inline post-release health artifacts summary schema validation passed (${validatedPayloads} payloads).\n`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
