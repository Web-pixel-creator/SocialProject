import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RETRY_CLEANUP_JSON_SCHEMA_PATH,
  RETRY_CLEANUP_JSON_SCHEMA_VERSION,
  RETRY_COLLECT_JSON_SCHEMA_PATH,
  RETRY_COLLECT_JSON_SCHEMA_VERSION,
} from './retry-json-schema-contracts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const SAMPLE_PAYLOAD_PATHS = [
  'docs/ops/schemas/samples/release-retry-cleanup-output.sample.json',
  'docs/ops/schemas/samples/release-retry-collect-output-empty.sample.json',
  'docs/ops/schemas/samples/release-retry-collect-output-success.sample.json',
];

const resolvePath = (relativePath) => path.join(projectRoot, relativePath);
const loadJson = async (relativePath) => {
  const text = await readFile(resolvePath(relativePath), 'utf8');
  return JSON.parse(text);
};

const getSchemaConst = (schema, key) =>
  schema?.properties?.[key] && Object.hasOwn(schema.properties[key], 'const')
    ? schema.properties[key].const
    : undefined;

const pushMismatch = ({ failures, label, actual, expected }) => {
  failures.push(`${label}: expected '${expected}', got '${String(actual)}'`);
};

const assertSchemaContract = ({
  failures,
  schema,
  schemaFilePath,
  expectedPath,
  expectedVersion,
}) => {
  const pathConst = getSchemaConst(schema, 'schemaPath');
  if (pathConst !== expectedPath) {
    pushMismatch({
      failures,
      label: `${schemaFilePath} properties.schemaPath.const`,
      actual: pathConst,
      expected: expectedPath,
    });
  }

  const versionConst = getSchemaConst(schema, 'schemaVersion');
  if (versionConst !== expectedVersion) {
    pushMismatch({
      failures,
      label: `${schemaFilePath} properties.schemaVersion.const`,
      actual: versionConst,
      expected: expectedVersion,
    });
  }
};

const assertSampleContract = ({
  failures,
  samplePath,
  samplePayload,
  expectedPath,
  expectedVersion,
}) => {
  if (samplePayload?.schemaPath !== expectedPath) {
    pushMismatch({
      failures,
      label: `${samplePath} schemaPath`,
      actual: samplePayload?.schemaPath,
      expected: expectedPath,
    });
  }

  if (samplePayload?.schemaVersion !== expectedVersion) {
    pushMismatch({
      failures,
      label: `${samplePath} schemaVersion`,
      actual: samplePayload?.schemaVersion,
      expected: expectedVersion,
    });
  }
};

const main = async () => {
  const failures = [];
  let checks = 0;

  const cleanupSchema = await loadJson(RETRY_CLEANUP_JSON_SCHEMA_PATH);
  assertSchemaContract({
    failures,
    schema: cleanupSchema,
    schemaFilePath: RETRY_CLEANUP_JSON_SCHEMA_PATH,
    expectedPath: RETRY_CLEANUP_JSON_SCHEMA_PATH,
    expectedVersion: RETRY_CLEANUP_JSON_SCHEMA_VERSION,
  });
  checks += 2;

  const collectSchema = await loadJson(RETRY_COLLECT_JSON_SCHEMA_PATH);
  assertSchemaContract({
    failures,
    schema: collectSchema,
    schemaFilePath: RETRY_COLLECT_JSON_SCHEMA_PATH,
    expectedPath: RETRY_COLLECT_JSON_SCHEMA_PATH,
    expectedVersion: RETRY_COLLECT_JSON_SCHEMA_VERSION,
  });
  checks += 2;

  for (const samplePath of SAMPLE_PAYLOAD_PATHS) {
    const samplePayload = await loadJson(samplePath);
    const isCleanupSample = samplePayload?.label === 'retry:cleanup';
    assertSampleContract({
      failures,
      samplePath,
      samplePayload,
      expectedPath: isCleanupSample
        ? RETRY_CLEANUP_JSON_SCHEMA_PATH
        : RETRY_COLLECT_JSON_SCHEMA_PATH,
      expectedVersion: isCleanupSample
        ? RETRY_CLEANUP_JSON_SCHEMA_VERSION
        : RETRY_COLLECT_JSON_SCHEMA_VERSION,
    });
    checks += 2;
  }

  if (failures.length > 0) {
    process.stderr.write('Retry schema version sync check failed:\n');
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`Retry schema version sync check passed (${checks} checks).\n`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
