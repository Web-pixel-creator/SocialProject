import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  RELEASE_HEALTH_REPORT_JSON_SCHEMA_PATH,
} from './release-health-schema-contracts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const OUTPUT_LABEL = 'release:health:schema:check';
const DEFAULT_REPORT_DIR = 'artifacts/release';
const DEFAULT_SAMPLE_PATH =
  'docs/ops/schemas/samples/release-health-report-output.sample.json';
const REPORT_FILE_PATTERN = /^post-release-health-run-\d+\.json$/u;
const USAGE =
  'Usage: node scripts/release/validate-release-health-report-schema.mjs [report_path] [--json]\n';

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
    reportPath: null,
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
    if (options.reportPath) {
      throw new Error(`Unexpected argument: ${arg}\n${USAGE}`);
    }
    options.reportPath = arg;
  }

  return options;
};

const findLatestReportPath = async () => {
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
    if (!entry.isFile()) {
      continue;
    }
    if (!REPORT_FILE_PATTERN.test(entry.name)) {
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

const toRelative = (filePath) => path.relative(projectRoot, filePath).replace(/\\/gu, '/');

const writeJsonSummary = ({
  status,
  fixturePayloads,
  runtimePayloads,
  validatedPayloads,
  runtimeReportPath,
  failures,
}) => {
  const payload = {
    label: OUTPUT_LABEL,
    mode: 'health-report',
    status,
    totals: {
      fixturePayloads,
      runtimePayloads,
      validatedPayloads,
    },
    runtimeReportPath: runtimeReportPath ? toRelative(runtimeReportPath) : null,
    failures,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const schemaPath = resolvePath(RELEASE_HEALTH_REPORT_JSON_SCHEMA_PATH);
  const samplePath = resolvePath(DEFAULT_SAMPLE_PATH);
  const runtimeReportPath = options.reportPath
    ? resolvePath(options.reportPath)
    : await findLatestReportPath();

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

  if (!runtimeReportPath) {
    failures.push(
      'Runtime report not found. Run `npm run release:health:report` first or provide explicit report path.',
    );
  } else {
    try {
      const runtimePayload = await loadJson(runtimeReportPath);
      if (!validate(runtimePayload)) {
        failures.push(
          `runtime report (${toRelative(runtimeReportPath)}) is invalid: ${formatAjvErrors(validate.errors)}`,
        );
      } else {
        runtimePayloads += 1;
        validatedPayloads += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(
        `runtime report validation failed (${toRelative(runtimeReportPath)}): ${message}`,
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
        runtimeReportPath,
        failures,
      });
    } else {
      process.stderr.write('Release health report schema validation failed:\n');
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
      runtimeReportPath,
      failures: [],
    });
    return;
  }

  process.stdout.write(
    `Release health report schema validation passed (${validatedPayloads} payloads).\n`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
