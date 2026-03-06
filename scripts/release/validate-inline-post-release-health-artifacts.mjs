import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INLINE_HEALTH_ARTIFACTS_SUMMARY_JSON_SCHEMA_PATH,
  INLINE_HEALTH_ARTIFACTS_SUMMARY_JSON_SCHEMA_VERSION,
  INLINE_HEALTH_ARTIFACTS_SUMMARY_LABEL,
} from './inline-health-artifacts-schema-contracts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const OUTPUT_LABEL = INLINE_HEALTH_ARTIFACTS_SUMMARY_LABEL;
const OUTPUT_SCHEMA_PATH = INLINE_HEALTH_ARTIFACTS_SUMMARY_JSON_SCHEMA_PATH;
const OUTPUT_SCHEMA_VERSION = INLINE_HEALTH_ARTIFACTS_SUMMARY_JSON_SCHEMA_VERSION;
const DEFAULT_OUTPUT_RELATIVE_PATH =
  'artifacts/release/post-release-health-inline-artifacts-summary-<run_id>.json';
const REQUIRED_ARTIFACT_RELATIVE_PATHS = [
  'artifacts/release/post-release-health-run-<run_id>.json',
  'artifacts/release/post-release-health-summary-<run_id>.json',
  'artifacts/release/post-release-health-schema-summary-<run_id>.json',
];

const USAGE = `Usage: node scripts/release/validate-inline-post-release-health-artifacts.mjs --run-id <id> [--strict] [--json] [--output <path>]

Options:
  --run-id <id>   Required workflow run id.
  --strict        Exit with non-zero status when required artifacts are missing.
  --json          Emit machine-readable summary to stdout.
  --output <path> Optional path to persist machine-readable summary JSON.
                  Default: ${DEFAULT_OUTPUT_RELATIVE_PATH}
  --help          Show help.
`;

const parseRunId = (raw) => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid run id '${raw}'. Use a positive integer.`);
  }
  return parsed;
};

const parseArgs = (argv) => {
  const options = {
    runId: null,
    strict: false,
    json: false,
    outputPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--run-id') {
      const raw = argv[index + 1] ?? '';
      options.runId = parseRunId(raw);
      index += 1;
      continue;
    }
    if (arg === '--output') {
      options.outputPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  if (!options.runId) {
    throw new Error(`--run-id is required.\n\n${USAGE}`);
  }

  if (!options.outputPath) {
    options.outputPath = defaultOutputPathForRunId(options.runId);
  }

  return options;
};

const resolveArtifactPaths = (runId) =>
  REQUIRED_ARTIFACT_RELATIVE_PATHS.map((template) => template.replace(/<run_id>/gu, String(runId)));

const defaultOutputPathForRunId = (runId) =>
  DEFAULT_OUTPUT_RELATIVE_PATH.replace(/<run_id>/gu, String(runId));

const resolveAbsolutePath = (relativePath) => path.resolve(projectRoot, relativePath);
const toRelativePath = (absolutePath) =>
  path.relative(projectRoot, absolutePath).replace(/\\/gu, '/');

const checkArtifact = async (relativePath) => {
  const absolutePath = resolveAbsolutePath(relativePath);
  try {
    const fileStats = await stat(absolutePath);
    const present = fileStats.isFile() && fileStats.size > 0;
    return {
      path: toRelativePath(absolutePath),
      present,
      sizeBytes: fileStats.isFile() ? fileStats.size : 0,
      reason: present ? null : 'empty_or_not_file',
    };
  } catch (error) {
    const typedError = error;
    return {
      path: toRelativePath(absolutePath),
      present: false,
      sizeBytes: 0,
      reason: typedError?.code === 'ENOENT' ? 'not_found' : 'stat_error',
    };
  }
};

const renderTextSummary = (summary) => {
  const lines = [
    `Inline post-release health artifacts check: ${summary.status.toUpperCase()}`,
    `Run id: ${String(summary.runId)}`,
    `Artifacts present: ${String(summary.presentTotal)}/${String(summary.requiredTotal)}`,
    `Strict mode: ${summary.strict ? 'enabled' : 'disabled'}`,
  ];
  if (summary.missing.length > 0) {
    lines.push(`Missing artifacts: ${summary.missing.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const requiredPaths = resolveArtifactPaths(options.runId);
  const checks = await Promise.all(
    requiredPaths.map((relativePath) => checkArtifact(relativePath)),
  );
  const missing = checks.filter((entry) => entry.present !== true).map((entry) => entry.path);
  const present = checks.filter((entry) => entry.present === true).map((entry) => entry.path);
  const status = missing.length === 0 ? 'pass' : 'fail';

  const summary = {
    schemaPath: OUTPUT_SCHEMA_PATH,
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    label: OUTPUT_LABEL,
    status,
    strict: options.strict,
    runId: options.runId,
    requiredTotal: checks.length,
    presentTotal: present.length,
    present,
    missing,
    checks,
    generatedAtUtc: new Date().toISOString(),
  };

  const absoluteOutputPath = path.isAbsolute(options.outputPath)
    ? options.outputPath
    : path.resolve(projectRoot, options.outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(renderTextSummary(summary));
  }

  if (status === 'fail' && options.strict) {
    process.exit(1);
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
