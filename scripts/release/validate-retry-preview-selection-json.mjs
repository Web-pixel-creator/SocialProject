import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH,
  RETRY_PREVIEW_SELECTION_JSON_SCHEMA_VERSION,
} from './retry-json-schema-contracts.mjs';
import { RETRY_SCHEMA_SAMPLE_FIXTURES } from './retry-schema-sample-fixtures.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const resolvePath = (relativePath) => path.join(projectRoot, relativePath);
const loadJson = async (relativePath) => {
  const text = await readFile(resolvePath(relativePath), 'utf8');
  return JSON.parse(text);
};

const parseArguments = (argv) => {
  const options = {
    strict: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: node scripts/release/validate-retry-preview-selection-json.mjs [--strict] [--json]\n',
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const formatAjvErrors = (errors = []) =>
  errors
    .map((error) => {
      const location = error.instancePath || '/';
      return `${location}: ${error.message ?? 'validation error'}`;
    })
    .join('; ');

const runPreviewJsonCommand = ({ unknownLabel = null } = {}) => {
  const args = [
    resolvePath('scripts/release/generate-retry-schema-samples.mjs'),
    '--preview',
    '--json',
  ];
  if (unknownLabel !== null) {
    args.push(`--preview=${unknownLabel}`);
  }

  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
    },
  });

  const stdoutText = result.stdout?.trim() ?? '';
  if (!stdoutText) {
    const stderrText = result.stderr?.trim() ?? '';
    throw new Error(
      `preview --json command returned empty stdout (status ${result.status ?? 'unknown'}): ${stderrText}`,
    );
  }

  return {
    status: result.status ?? 1,
    payload: JSON.parse(stdoutText),
  };
};

const writeJsonSummary = ({
  strict,
  status,
  fixturePayloads,
  runtimePayloads,
  validatedPayloads,
  failures,
}) => {
  const payload = {
    schemaPath: RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH,
    schemaVersion: RETRY_PREVIEW_SELECTION_JSON_SCHEMA_VERSION,
    label: 'retry:schema:preview:check',
    mode: 'preview',
    strict,
    status,
    totals: {
      fixturePayloads,
      runtimePayloads,
      validatedPayloads,
    },
    failures,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  });
  addFormats(ajv);

  const schema = await loadJson(RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH);
  const validatePreview = ajv.compile(schema);

  const failures = [];
  let validatedPayloads = 0;
  let fixturePayloads = 0;
  let runtimePayloads = 0;

  const previewFixtures = RETRY_SCHEMA_SAMPLE_FIXTURES.filter(
    (fixture) => fixture.schemaPath === RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH,
  );

  for (const fixture of previewFixtures) {
    const payload = await loadJson(fixture.samplePath);
    if (!validatePreview(payload)) {
      failures.push(
        `${fixture.label} (${fixture.samplePath}) is invalid: ${formatAjvErrors(validatePreview.errors)}`,
      );
      continue;
    }
    fixturePayloads += 1;
    validatedPayloads += 1;
  }

  try {
    const runtimePayload = runPreviewJsonCommand();
    if (runtimePayload.status !== 0) {
      failures.push(
        `runtime preview-selection payload expected status 0, got ${runtimePayload.status}`,
      );
    } else if (!validatePreview(runtimePayload.payload)) {
      failures.push(
        `runtime preview-selection payload is invalid: ${formatAjvErrors(validatePreview.errors)}`,
      );
    } else {
      runtimePayloads += 1;
      validatedPayloads += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`runtime preview-selection payload validation failed: ${message}`);
  }

  if (options.strict) {
    try {
      const unknownLabel = 'missing-label';
      const runtimeUnknownPayload = runPreviewJsonCommand({ unknownLabel });
      if (runtimeUnknownPayload.status === 0) {
        failures.push(
          'runtime preview-selection unknown-filter payload expected non-zero exit status, got 0',
        );
      } else if (!validatePreview(runtimeUnknownPayload.payload)) {
        failures.push(
          `runtime preview-selection unknown-filter payload is invalid: ${formatAjvErrors(validatePreview.errors)}`,
        );
      } else if (
        !Array.isArray(runtimeUnknownPayload.payload?.unknown?.labels) ||
        !runtimeUnknownPayload.payload.unknown.labels.includes(unknownLabel)
      ) {
        failures.push(
          `runtime preview-selection unknown-filter payload is missing expected unknown label '${unknownLabel}'`,
        );
      } else {
        runtimePayloads += 1;
        validatedPayloads += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(
        `runtime preview-selection unknown-filter payload validation failed: ${message}`,
      );
    }
  }

  if (failures.length > 0) {
    if (options.json) {
      writeJsonSummary({
        strict: options.strict,
        status: 'fail',
        fixturePayloads,
        runtimePayloads,
        validatedPayloads,
        failures,
      });
    } else {
      process.stderr.write('Retry preview-selection schema validation failed:\n');
      for (const failure of failures) {
        process.stderr.write(`- ${failure}\n`);
      }
    }
    process.exit(1);
  }

  if (options.json) {
    writeJsonSummary({
      strict: options.strict,
      status: 'pass',
      fixturePayloads,
      runtimePayloads,
      validatedPayloads,
      failures: [],
    });
    return;
  }

  const strictSuffix = options.strict ? ' (strict mode)' : '';
  process.stdout.write(
    `Retry preview-selection schema validation passed (${validatedPayloads} payloads)${strictSuffix}.\n`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
