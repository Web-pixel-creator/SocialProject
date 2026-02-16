import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const USAGE = `Usage: node scripts/release/render-post-release-health-step-summary.mjs --run-id <id> --output <summary.md> [--health-summary <path>] [--schema-summary <path>] [--title <text>]

Options:
  --run-id         Workflow run id used in generated summary labels.
  --output         Path to markdown file that should be appended to GITHUB_STEP_SUMMARY.
  --health-summary Optional path to health summary JSON.
  --schema-summary Optional path to schema summary JSON.
  --title          Optional markdown heading. Default: "### Post-release Health Gate".
  --help           Show help.
`;

const parseArgs = (argv) => {
  const options = {
    runId: '',
    outputPath: '',
    healthSummaryPath: '',
    schemaSummaryPath: '',
    title: '### Post-release Health Gate',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--run-id') {
      options.runId = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--output') {
      options.outputPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--health-summary') {
      options.healthSummaryPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--schema-summary') {
      options.schemaSummaryPath = argv[index + 1] ?? '';
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

  if (!options.runId || !options.outputPath) {
    throw new Error(`Both --run-id and --output are required.\n\n${USAGE}`);
  }

  if (!options.healthSummaryPath) {
    options.healthSummaryPath = `artifacts/release/post-release-health-summary-${options.runId}.json`;
  }
  if (!options.schemaSummaryPath) {
    options.schemaSummaryPath = `artifacts/release/post-release-health-schema-summary-${options.runId}.json`;
  }

  return options;
};

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const tryReadJson = (filePath) => {
  if (!existsSync(filePath)) {
    return {
      status: 'missing',
      payload: null,
      errorMessage: '',
    };
  }

  try {
    return {
      status: 'ok',
      payload: JSON.parse(readFileSync(filePath, 'utf8')),
      errorMessage: '',
    };
  } catch (error) {
    return {
      status: 'parse-error',
      payload: null,
      errorMessage: toErrorMessage(error),
    };
  }
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(process.cwd(), options.outputPath);
  const healthSummaryPath = path.resolve(process.cwd(), options.healthSummaryPath);
  const schemaSummaryPath = path.resolve(process.cwd(), options.schemaSummaryPath);

  const lines = [
    options.title,
    '',
    `- target run id: \`${options.runId}\``,
  ];

  const healthSummary = tryReadJson(healthSummaryPath);
  if (healthSummary.status === 'ok') {
    const payload = healthSummary.payload;
    lines.push(
      `- health status: \`${String(payload?.status ?? 'unknown')}\``,
      `- required jobs: \`${String(payload?.totals?.requiredJobsPassed ?? 0)}/${String(payload?.totals?.requiredJobsTotal ?? 0)}\``,
      `- required artifacts: \`${String(payload?.totals?.requiredArtifactsPresent ?? 0)}/${String(payload?.totals?.requiredArtifactsTotal ?? 0)}\``,
      `- failed jobs: \`${String(payload?.totals?.failedJobsTotal ?? 0)}\``,
      `- artifacts discovered: \`${String(payload?.totals?.artifactsDiscovered ?? 0)}\``,
    );
  } else if (healthSummary.status === 'missing') {
    lines.push('- health summary: `missing`');
  } else {
    lines.push(`- health summary parse error: \`${healthSummary.errorMessage}\``);
  }

  const schemaSummary = tryReadJson(schemaSummaryPath);
  if (schemaSummary.status === 'ok') {
    const payload = schemaSummary.payload;
    lines.push(
      `- schema status: \`${String(payload?.status ?? 'unknown')}\``,
      `- schema validated payloads: \`${String(payload?.totals?.validatedPayloads ?? 0)}\``,
    );
  } else if (schemaSummary.status === 'missing') {
    lines.push('- schema summary: `missing`');
  } else {
    lines.push(`- schema summary parse error: \`${schemaSummary.errorMessage}\``);
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
