import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const USAGE = `Usage: node scripts/release/write-release-env-preflight-skipped-summary.mjs --output <summary.json>

Options:
  --output  Destination JSON path.
  --help    Show help.
`;

const parseArgs = (argv) => {
  const options = {
    outputPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--output') {
      options.outputPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  if (!options.outputPath) {
    throw new Error(`--output is required.\n\n${USAGE}`);
  }

  return options;
};

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(process.cwd(), options.outputPath);

  const payload = {
    checkedAtUtc: new Date().toISOString(),
    label: 'release:preflight:env',
    missing: [],
    status: 'skipped',
    strict: false,
    warnings: [
      {
        key: 'release_env_preflight',
        reason: 'skipped in local-fallback mode (no staging URL inputs)',
        scope: 'ci',
      },
    ],
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

try {
  main();
} catch (error) {
  const message = toErrorMessage(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
