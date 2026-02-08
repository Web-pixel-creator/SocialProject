import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_PATH } from './retry-json-schema-contracts.mjs';
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
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: node scripts/release/validate-release-smoke-preflight-summary.mjs [--json]\n',
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

const runPreflightSummaryCommand = () => {
  const result = spawnSync(
    process.execPath,
    [
      resolvePath('scripts/release/preflight-smoke-targets.mjs'),
      '--allow-skip',
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        RELEASE_PREFLIGHT_OUTPUT_PATH:
          'artifacts/release/tunnel-preflight-summary.json',
      },
    },
  );

  if (result.status !== 0) {
    const stderrText = result.stderr?.trim() ?? '';
    throw new Error(
      `preflight summary command failed with status ${result.status ?? 'unknown'}: ${stderrText}`,
    );
  }

  const filePath = resolvePath('artifacts/release/tunnel-preflight-summary.json');
  const text = readFile(filePath, 'utf8');
  return text.then((raw) => JSON.parse(raw));
};

const writeJsonSummary = ({
  status,
  fixturePayloads,
  runtimePayloads,
  validatedPayloads,
  failures,
}) => {
  const payload = {
    label: 'retry:schema:preflight:check',
    mode: 'preflight',
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

  const schema = await loadJson(RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_PATH);
  const validate = ajv.compile(schema);

  const failures = [];
  let validatedPayloads = 0;
  let fixturePayloads = 0;
  let runtimePayloads = 0;

  const preflightFixtures = RETRY_SCHEMA_SAMPLE_FIXTURES.filter(
    (fixture) => fixture.schemaPath === RELEASE_SMOKE_PREFLIGHT_JSON_SCHEMA_PATH,
  );

  for (const fixture of preflightFixtures) {
    const payload = await loadJson(fixture.samplePath);
    if (!validate(payload)) {
      failures.push(
        `${fixture.label} (${fixture.samplePath}) is invalid: ${formatAjvErrors(validate.errors)}`,
      );
      continue;
    }
    fixturePayloads += 1;
    validatedPayloads += 1;
  }

  try {
    const runtimePayload = await runPreflightSummaryCommand();
    if (!validate(runtimePayload)) {
      failures.push(
        `runtime preflight summary payload is invalid: ${formatAjvErrors(validate.errors)}`,
      );
    } else {
      runtimePayloads += 1;
      validatedPayloads += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`runtime preflight summary payload validation failed: ${message}`);
  }

  if (failures.length > 0) {
    if (options.json) {
      writeJsonSummary({
        status: 'fail',
        fixturePayloads,
        runtimePayloads,
        validatedPayloads,
        failures,
      });
    } else {
      process.stderr.write('Release smoke preflight summary schema validation failed:\n');
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
      failures: [],
    });
    return;
  }

  process.stdout.write(
    `Release smoke preflight summary schema validation passed (${validatedPayloads} payloads).\n`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
