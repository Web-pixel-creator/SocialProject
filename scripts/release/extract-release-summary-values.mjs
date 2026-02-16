import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const USAGE = `Usage: node scripts/release/extract-release-summary-values.mjs --kind <smoke|env-preflight> --input <path>

Options:
  --kind   Summary shape to extract.
           smoke        -> pass|totalSteps|failedSteps
           env-preflight -> status|missingCount|warningsCount|strict
  --input  Path to JSON summary payload.
  --help   Show help.
`;

const parseArgs = (argv) => {
  const options = {
    kind: '',
    inputPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--kind') {
      options.kind = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--input') {
      options.inputPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  if (!options.kind || !options.inputPath) {
    throw new Error(`Both --kind and --input are required.\n\n${USAGE}`);
  }

  return options;
};

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const fallbackValuesByKind = {
  smoke: ['n/a', 'n/a', 'n/a'],
  'env-preflight': ['n/a', 'n/a', 'n/a', 'n/a'],
};

const safeLoadJson = (inputPath) => {
  if (!existsSync(inputPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(inputPath, 'utf8'));
  } catch {
    return null;
  }
};

const extractSmokeValues = (payload) => [
  String(payload?.summary?.pass ?? 'n/a'),
  String(payload?.summary?.totalSteps ?? 'n/a'),
  String(payload?.summary?.failedSteps ?? 'n/a'),
];

const extractEnvPreflightValues = (payload) => [
  String(payload?.status ?? 'n/a'),
  String(Array.isArray(payload?.missing) ? payload.missing.length : 'n/a'),
  String(Array.isArray(payload?.warnings) ? payload.warnings.length : 'n/a'),
  String(payload?.strict ?? 'n/a'),
];

const extractByKind = (kind, payload) => {
  if (!payload) {
    return fallbackValuesByKind[kind];
  }
  if (kind === 'smoke') {
    return extractSmokeValues(payload);
  }
  return extractEnvPreflightValues(payload);
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const normalizedKind = options.kind.trim().toLowerCase();
  const inputPath = path.resolve(process.cwd(), options.inputPath);

  if (!Object.hasOwn(fallbackValuesByKind, normalizedKind)) {
    throw new Error(
      `Unsupported --kind "${options.kind}". Expected one of: smoke, env-preflight.`,
    );
  }

  const payload = safeLoadJson(inputPath);
  const values = extractByKind(normalizedKind, payload);
  process.stdout.write(values.join('|'));
};

try {
  main();
} catch (error) {
  const message = toErrorMessage(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
