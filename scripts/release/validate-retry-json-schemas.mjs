import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const CLEANUP_SCHEMA_PATH = 'docs/ops/schemas/release-retry-cleanup-output.schema.json';
const COLLECT_SCHEMA_PATH = 'docs/ops/schemas/release-retry-collect-output.schema.json';
const SAMPLE_FIXTURES = [
  {
    schemaPath: CLEANUP_SCHEMA_PATH,
    samplePath: 'docs/ops/schemas/samples/release-retry-cleanup-output.sample.json',
    label: 'cleanup sample',
  },
  {
    schemaPath: COLLECT_SCHEMA_PATH,
    samplePath: 'docs/ops/schemas/samples/release-retry-collect-output-empty.sample.json',
    label: 'collect empty sample',
  },
  {
    schemaPath: COLLECT_SCHEMA_PATH,
    samplePath: 'docs/ops/schemas/samples/release-retry-collect-output-success.sample.json',
    label: 'collect success sample',
  },
];

const resolvePath = (relativePath) => path.join(projectRoot, relativePath);
const loadJson = async (relativePath) => {
  const text = await readFile(resolvePath(relativePath), 'utf8');
  return JSON.parse(text);
};

const formatAjvErrors = (errors = []) =>
  errors
    .map((error) => {
      const location = error.instancePath || '/';
      return `${location}: ${error.message ?? 'validation error'}`;
    })
    .join('; ');

const runCleanupJsonCommand = () => {
  const result = spawnSync(
    process.execPath,
    [resolvePath('scripts/release/cleanup-retry-failure-logs.mjs'), '--json'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        RELEASE_RETRY_LOGS_CLEANUP_DRY_RUN: 'true',
      },
    },
  );

  if (result.status !== 0) {
    const stderrText = result.stderr?.trim() ?? '';
    throw new Error(
      `cleanup --json command failed with status ${result.status ?? 'unknown'}: ${stderrText}`,
    );
  }

  const stdoutText = result.stdout?.trim() ?? '';
  if (!stdoutText) {
    throw new Error('cleanup --json command returned empty stdout.');
  }
  return JSON.parse(stdoutText);
};

const main = async () => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  });
  addFormats(ajv);

  const cleanupSchema = await loadJson(CLEANUP_SCHEMA_PATH);
  const collectSchema = await loadJson(COLLECT_SCHEMA_PATH);
  const schemaByPath = new Map([
    [CLEANUP_SCHEMA_PATH, cleanupSchema],
    [COLLECT_SCHEMA_PATH, collectSchema],
  ]);

  const validators = new Map();
  for (const [schemaPath, schema] of schemaByPath.entries()) {
    validators.set(schemaPath, ajv.compile(schema));
  }

  const failures = [];
  let validatedPayloads = 0;

  for (const fixture of SAMPLE_FIXTURES) {
    const payload = await loadJson(fixture.samplePath);
    const validate = validators.get(fixture.schemaPath);
    if (!validate) {
      failures.push(`Missing validator for schema ${fixture.schemaPath}`);
      continue;
    }
    const valid = validate(payload);
    if (!valid) {
      failures.push(
        `${fixture.label} (${fixture.samplePath}) is invalid: ${formatAjvErrors(validate.errors)}`,
      );
      continue;
    }
    validatedPayloads += 1;
  }

  try {
    const runtimeCleanupPayload = runCleanupJsonCommand();
    const validateCleanup = validators.get(CLEANUP_SCHEMA_PATH);
    if (!validateCleanup) {
      failures.push(`Missing validator for schema ${CLEANUP_SCHEMA_PATH}`);
    } else if (!validateCleanup(runtimeCleanupPayload)) {
      failures.push(
        `runtime cleanup payload is invalid: ${formatAjvErrors(validateCleanup.errors)}`,
      );
    } else {
      validatedPayloads += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`runtime cleanup payload validation failed: ${message}`);
  }

  if (failures.length > 0) {
    process.stderr.write('Retry diagnostics schema validation failed:\n');
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(
    `Retry diagnostics schema validation passed (${validatedPayloads} payloads).\n`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
