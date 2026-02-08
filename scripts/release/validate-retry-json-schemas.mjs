import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  RETRY_CLEANUP_JSON_SCHEMA_PATH,
  RETRY_COLLECT_JSON_SCHEMA_PATH,
  RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH,
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

const runPreviewSelectionJsonCommand = () => {
  const result = spawnSync(
    process.execPath,
    [
      resolvePath('scripts/release/generate-retry-schema-samples.mjs'),
      '--preview',
      '--json',
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
      },
    },
  );

  if (result.status !== 0) {
    const stderrText = result.stderr?.trim() ?? '';
    throw new Error(
      `preview --json command failed with status ${result.status ?? 'unknown'}: ${stderrText}`,
    );
  }

  const stdoutText = result.stdout?.trim() ?? '';
  if (!stdoutText) {
    throw new Error('preview --json command returned empty stdout.');
  }
  return JSON.parse(stdoutText);
};

const runPreviewSelectionUnknownJsonCommand = () => {
  const result = spawnSync(
    process.execPath,
    [
      resolvePath('scripts/release/generate-retry-schema-samples.mjs'),
      '--preview',
      '--preview=missing-label',
      '--json',
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
      },
    },
  );

  const stdoutText = result.stdout?.trim() ?? '';
  if (!stdoutText) {
    const stderrText = result.stderr?.trim() ?? '';
    throw new Error(
      `preview --preview=missing-label --json returned empty stdout (status ${result.status ?? 'unknown'}): ${stderrText}`,
    );
  }

  if (result.status === 0) {
    throw new Error(
      'preview --preview=missing-label --json unexpectedly exited with status 0.',
    );
  }

  const payload = JSON.parse(stdoutText);
  if (
    !Array.isArray(payload?.unknown?.labels) ||
    payload.unknown.labels.length === 0
  ) {
    throw new Error(
      'preview unknown-filter payload must include at least one unknown label.',
    );
  }
  return payload;
};

const main = async () => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  });
  addFormats(ajv);

  const cleanupSchema = await loadJson(RETRY_CLEANUP_JSON_SCHEMA_PATH);
  const collectSchema = await loadJson(RETRY_COLLECT_JSON_SCHEMA_PATH);
  const previewSelectionSchema = await loadJson(
    RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH,
  );
  const schemaByPath = new Map([
    [RETRY_CLEANUP_JSON_SCHEMA_PATH, cleanupSchema],
    [RETRY_COLLECT_JSON_SCHEMA_PATH, collectSchema],
    [RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH, previewSelectionSchema],
  ]);

  const validators = new Map();
  for (const [schemaPath, schema] of schemaByPath.entries()) {
    validators.set(schemaPath, ajv.compile(schema));
  }

  const failures = [];
  let validatedPayloads = 0;

  for (const fixture of RETRY_SCHEMA_SAMPLE_FIXTURES) {
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
    const validateCleanup = validators.get(RETRY_CLEANUP_JSON_SCHEMA_PATH);
    if (!validateCleanup) {
      failures.push(`Missing validator for schema ${RETRY_CLEANUP_JSON_SCHEMA_PATH}`);
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

  try {
    const runtimePreviewPayload = runPreviewSelectionJsonCommand();
    const validatePreview = validators.get(RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH);
    if (!validatePreview) {
      failures.push(`Missing validator for schema ${RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH}`);
    } else if (!validatePreview(runtimePreviewPayload)) {
      failures.push(
        `runtime preview-selection payload is invalid: ${formatAjvErrors(validatePreview.errors)}`,
      );
    } else {
      validatedPayloads += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`runtime preview-selection payload validation failed: ${message}`);
  }

  try {
    const runtimePreviewUnknownPayload = runPreviewSelectionUnknownJsonCommand();
    const validatePreview = validators.get(RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH);
    if (!validatePreview) {
      failures.push(`Missing validator for schema ${RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH}`);
    } else if (!validatePreview(runtimePreviewUnknownPayload)) {
      failures.push(
        `runtime preview-selection unknown payload is invalid: ${formatAjvErrors(validatePreview.errors)}`,
      );
    } else {
      validatedPayloads += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`runtime preview-selection unknown payload validation failed: ${message}`);
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
