import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const USAGE = `Usage: node scripts/release/render-release-smoke-step-summary.mjs --status <value> --mode <value> --api-url <value> --web-url <value> --csrf-configured <yes|no> --output <summary.md> [--smoke-results <path>] [--env-preflight <path>] [--title <text>]

Options:
  --status            Release smoke status label.
  --mode              Effective smoke mode.
  --api-url           Effective API URL.
  --web-url           Effective WEB URL.
  --csrf-configured   CSRF token configured flag.
  --output            Destination markdown path.
  --smoke-results     Optional smoke results JSON path.
  --env-preflight     Optional env preflight summary JSON path.
  --title             Optional markdown heading. Default: "### Release Smoke Summary".
  --help              Show help.
`;

const parseArgs = (argv) => {
  const options = {
    status: '',
    mode: 'unknown',
    apiUrl: 'unknown',
    webUrl: 'unknown',
    csrfConfigured: 'unknown',
    outputPath: '',
    smokeResultsPath: '',
    envPreflightPath: '',
    title: '### Release Smoke Summary',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--status') {
      options.status = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--mode') {
      options.mode = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--api-url') {
      options.apiUrl = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--web-url') {
      options.webUrl = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--csrf-configured') {
      options.csrfConfigured = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--output') {
      options.outputPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--smoke-results') {
      options.smokeResultsPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--env-preflight') {
      options.envPreflightPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--title') {
      options.title = argv[index + 1] ?? options.title;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  if (!options.status || !options.outputPath) {
    throw new Error(
      '--status and --output are required.\n\n' + USAGE,
    );
  }

  return options;
};

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const readJsonIfPresent = (filePath) => {
  if (!filePath) {
    return null;
  }
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(process.cwd(), options.outputPath);
  const smokeResultsPath = options.smokeResultsPath
    ? path.resolve(process.cwd(), options.smokeResultsPath)
    : '';
  const envPreflightPath = options.envPreflightPath
    ? path.resolve(process.cwd(), options.envPreflightPath)
    : '';

  const lines = [
    options.title,
    '',
    `- mode: \`${options.mode}\``,
    `- api_url: \`${options.apiUrl}\``,
    `- web_url: \`${options.webUrl}\``,
    `- csrf_token_configured: \`${options.csrfConfigured}\``,
    `- status: \`${options.status}\``,
  ];

  const smokePayload = readJsonIfPresent(smokeResultsPath);
  if (smokePayload || (smokeResultsPath && existsSync(smokeResultsPath))) {
    lines.push(
      `- smoke_pass: \`${String(smokePayload?.summary?.pass ?? 'n/a')}\``,
      `- smoke_total_steps: \`${String(smokePayload?.summary?.totalSteps ?? 'n/a')}\``,
      `- smoke_failed_steps: \`${String(smokePayload?.summary?.failedSteps ?? 'n/a')}\``,
    );
  }

  const envPayload = readJsonIfPresent(envPreflightPath);
  if (envPayload || (envPreflightPath && existsSync(envPreflightPath))) {
    lines.push(
      `- env_preflight_status: \`${String(envPayload?.status ?? 'n/a')}\``,
      `- env_preflight_missing_required: \`${String(Array.isArray(envPayload?.missing) ? envPayload.missing.length : 'n/a')}\``,
      `- env_preflight_warnings: \`${String(Array.isArray(envPayload?.warnings) ? envPayload.warnings.length : 'n/a')}\``,
      `- env_preflight_strict: \`${String(envPayload?.strict ?? 'n/a')}\``,
    );
  }

  lines.push('');
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
};

try {
  main();
} catch (error) {
  const message = toErrorMessage(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
