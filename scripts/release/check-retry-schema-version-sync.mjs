import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_PATH,
  RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_VERSION,
  RETRY_CLEANUP_JSON_SCHEMA_PATH,
  RETRY_CLEANUP_JSON_SCHEMA_VERSION,
  RETRY_COLLECT_JSON_SCHEMA_PATH,
  RETRY_COLLECT_JSON_SCHEMA_VERSION,
  RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH,
  RETRY_PREVIEW_SELECTION_JSON_SCHEMA_VERSION,
} from './retry-json-schema-contracts.mjs';
import {
  RETRY_SCHEMA_SAMPLE_FIXTURES,
  stringifyRetrySchemaFixture,
} from './retry-schema-sample-fixtures.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const resolvePath = (relativePath) => path.join(projectRoot, relativePath);
const loadJson = async (relativePath) => {
  const text = await readFile(resolvePath(relativePath), 'utf8');
  return JSON.parse(text);
};
const loadText = async (relativePath) => {
  return await readFile(resolvePath(relativePath), 'utf8');
};
const normalizeLineEndings = (value) => value.replace(/\r\n/gu, '\n');

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

const assertSampleFileSync = async ({
  failures,
  fixture,
}) => {
  const expectedText = stringifyRetrySchemaFixture(fixture.payload);
  let actualText;
  try {
    actualText = await loadText(fixture.samplePath);
  } catch (error) {
    const typedError = error;
    if (typedError?.code === 'ENOENT') {
      failures.push(`${fixture.samplePath}: file does not exist`);
      return;
    }
    throw error;
  }

  if (
    normalizeLineEndings(actualText) !== normalizeLineEndings(expectedText)
  ) {
    failures.push(
      `${fixture.samplePath}: content is out of sync with generated fixture payload`,
    );
  }
};

const main = async () => {
  const failures = [];
  let checks = 0;

  const schemaContracts = [
    {
      schemaPath: RETRY_CLEANUP_JSON_SCHEMA_PATH,
      schemaVersion: RETRY_CLEANUP_JSON_SCHEMA_VERSION,
    },
    {
      schemaPath: RETRY_COLLECT_JSON_SCHEMA_PATH,
      schemaVersion: RETRY_COLLECT_JSON_SCHEMA_VERSION,
    },
    {
      schemaPath: RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH,
      schemaVersion: RETRY_PREVIEW_SELECTION_JSON_SCHEMA_VERSION,
    },
    {
      schemaPath: RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_PATH,
      schemaVersion: RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_VERSION,
    },
  ];
  const schemaVersionByPath = new Map(
    schemaContracts.map((contract) => [contract.schemaPath, contract.schemaVersion]),
  );

  for (const schemaContract of schemaContracts) {
    const schema = await loadJson(schemaContract.schemaPath);
    assertSchemaContract({
      failures,
      schema,
      schemaFilePath: schemaContract.schemaPath,
      expectedPath: schemaContract.schemaPath,
      expectedVersion: schemaContract.schemaVersion,
    });
    checks += 2;
  }

  for (const fixture of RETRY_SCHEMA_SAMPLE_FIXTURES) {
    const samplePath = fixture.samplePath;
    const samplePayload = await loadJson(samplePath);
    const expectedVersion = schemaVersionByPath.get(fixture.schemaPath);
    if (!expectedVersion) {
      failures.push(
        `${samplePath}: no schema version contract configured for ${fixture.schemaPath}`,
      );
      continue;
    }
    assertSampleContract({
      failures,
      samplePath,
      samplePayload,
      expectedPath: fixture.schemaPath,
      expectedVersion,
    });
    await assertSampleFileSync({
      failures,
      fixture,
    });
    checks += 1;
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
