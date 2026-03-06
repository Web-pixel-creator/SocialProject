import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  RELEASE_DIAGNOSTICS_BUNDLE_JSON_SCHEMA_PATH,
} from './release-diagnostics-schema-contracts.mjs';
import { DEFAULT_RELEASE_DIAGNOSTICS_DIR } from './release-diagnostics-bundle-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const OUTPUT_LABEL = 'release:diagnostics:schema:check';
const DEFAULT_SAMPLE_PATH =
  'docs/ops/schemas/samples/release-diagnostics-bundle-output.sample.json';
const MANIFEST_FILE_NAME = 'release-diagnostics-bundle.json';
const USAGE =
  'Usage: node scripts/release/validate-release-diagnostics-bundle-schema.mjs [bundle_manifest_path] [--json]\n';

const resolvePath = (filePath) =>
  path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);

const loadJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const formatAjvErrors = (errors = []) =>
  errors
    .map((error) => {
      const location = error.instancePath || '/';
      return `${location}: ${error.message ?? 'validation error'}`;
    })
    .join('; ');

const parseArguments = (argv) => {
  const options = {
    bundlePath: null,
    json: false,
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
    if (options.bundlePath) {
      throw new Error(`Unexpected argument: ${arg}\n${USAGE}`);
    }
    options.bundlePath = arg;
  }

  return options;
};

const findLatestBundleManifestPath = async () => {
  const bundlesDir = resolvePath(DEFAULT_RELEASE_DIAGNOSTICS_DIR);
  let entries = [];
  try {
    entries = await readdir(bundlesDir, { withFileTypes: true });
  } catch (error) {
    const typedError = error;
    if (typedError?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(bundlesDir, entry.name, MANIFEST_FILE_NAME);
    try {
      const manifestStats = await stat(manifestPath);
      candidates.push({
        manifestPath,
        mtimeMs: manifestStats.mtimeMs,
      });
    } catch (error) {
      const typedError = error;
      if (typedError?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.manifestPath ?? null;
};

const toRelative = (filePath) => path.relative(projectRoot, filePath).replace(/\\/gu, '/');

const writeJsonSummary = ({
  failures,
  fixturePayloads,
  runtimeBundlePath,
  runtimePayloads,
  status,
  validatedPayloads,
}) => {
  process.stdout.write(
    `${JSON.stringify(
      {
        failures,
        label: OUTPUT_LABEL,
        mode: 'diagnostics-bundle',
        runtimeBundlePath: runtimeBundlePath ? toRelative(runtimeBundlePath) : null,
        status,
        totals: {
          fixturePayloads,
          runtimePayloads,
          validatedPayloads,
        },
      },
      null,
      2,
    )}\n`,
  );
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const schemaPath = resolvePath(RELEASE_DIAGNOSTICS_BUNDLE_JSON_SCHEMA_PATH);
  const samplePath = resolvePath(DEFAULT_SAMPLE_PATH);
  const runtimeBundlePath = options.bundlePath
    ? resolvePath(options.bundlePath)
    : await findLatestBundleManifestPath();

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

  if (!runtimeBundlePath) {
    failures.push(
      'Runtime diagnostics bundle not found. Capture a diagnostics bundle first or provide explicit manifest path.',
    );
  } else {
    try {
      const runtimePayload = await loadJson(runtimeBundlePath);
      if (!validate(runtimePayload)) {
        failures.push(
          `runtime bundle (${toRelative(runtimeBundlePath)}) is invalid: ${formatAjvErrors(validate.errors)}`,
        );
      } else {
        runtimePayloads += 1;
        validatedPayloads += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(
        `runtime bundle validation failed (${toRelative(runtimeBundlePath)}): ${message}`,
      );
    }
  }

  if (failures.length > 0) {
    if (options.json) {
      writeJsonSummary({
        failures,
        fixturePayloads,
        runtimeBundlePath,
        runtimePayloads,
        status: 'fail',
        validatedPayloads,
      });
    } else {
      process.stderr.write('Release diagnostics bundle schema validation failed:\n');
      for (const failure of failures) {
        process.stderr.write(`- ${failure}\n`);
      }
    }
    process.exit(1);
  }

  if (options.json) {
    writeJsonSummary({
      failures: [],
      fixturePayloads,
      runtimeBundlePath,
      runtimePayloads,
      status: 'pass',
      validatedPayloads,
    });
    return;
  }

  process.stdout.write(
    `Release diagnostics bundle schema validation passed (${validatedPayloads} payloads).\n`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
