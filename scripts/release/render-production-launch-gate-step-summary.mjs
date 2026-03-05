import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const USAGE = `Usage: node scripts/release/render-production-launch-gate-step-summary.mjs --run-id <id> --output <summary.md> [--summary <path>] [--inline-health-summary <path>] [--inline-schema-check <path>] [--require-inline-health-artifacts <true|false>]

Options:
  --run-id                          Required workflow run id used for default artifact paths.
  --output                          Required markdown output path.
  --summary                         Optional launch-gate summary JSON path. Default: artifacts/release/production-launch-gate-summary.json
  --inline-health-summary           Optional inline-health summary JSON path. Default: artifacts/release/post-release-health-inline-artifacts-summary-<run_id>.json
  --inline-schema-check             Optional inline schema-check JSON path. Default: artifacts/release/post-release-health-inline-artifacts-schema-check-<run_id>.json
  --require-inline-health-artifacts Optional value for rendered input flag line (true/false). Default: false.
  --help                            Show help.
`;

const parseArgs = (argv) => {
  const options = {
    inlineHealthSummaryPath: '',
    inlineSchemaCheckPath: '',
    outputPath: '',
    requireInlineHealthArtifacts: 'false',
    runId: '',
    summaryPath: 'artifacts/release/production-launch-gate-summary.json',
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
    if (arg === '--summary') {
      options.summaryPath = argv[index + 1] ?? options.summaryPath;
      index += 1;
      continue;
    }
    if (arg === '--inline-health-summary') {
      options.inlineHealthSummaryPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--inline-schema-check') {
      options.inlineSchemaCheckPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--require-inline-health-artifacts') {
      options.requireInlineHealthArtifacts =
        argv[index + 1] ?? options.requireInlineHealthArtifacts;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  if (!options.runId || !options.outputPath) {
    throw new Error(`Both --run-id and --output are required.\n\n${USAGE}`);
  }

  if (!options.inlineHealthSummaryPath) {
    options.inlineHealthSummaryPath = `artifacts/release/post-release-health-inline-artifacts-summary-${options.runId}.json`;
  }
  if (!options.inlineSchemaCheckPath) {
    options.inlineSchemaCheckPath = `artifacts/release/post-release-health-inline-artifacts-schema-check-${options.runId}.json`;
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
    const buffer = readFileSync(filePath);
    let raw = buffer.toString('utf8');
    if (raw.includes('\u0000')) {
      raw = buffer.toString('utf16le');
    }
    raw = raw.replace(/^\uFEFF/gu, '');
    return {
      status: 'ok',
      payload: JSON.parse(raw),
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

const formatCheckState = (entry) => {
  if (entry && typeof entry === 'object' && entry.skipped) {
    return 'SKIPPED';
  }
  if (entry && typeof entry === 'object' && entry.pass === true) {
    return 'PASS';
  }
  return 'FAIL';
};

const stringifyRequiredChannels = (summaryPayload) => {
  const value = summaryPayload?.config?.requiredExternalChannels;
  if (!Array.isArray(value) || value.length === 0) {
    return 'none';
  }
  return value.join(',');
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(process.cwd(), options.outputPath);
  const summaryPath = path.resolve(process.cwd(), options.summaryPath);
  const inlineHealthSummaryPath = path.resolve(
    process.cwd(),
    options.inlineHealthSummaryPath,
  );
  const inlineSchemaCheckPath = path.resolve(
    process.cwd(),
    options.inlineSchemaCheckPath,
  );

  const lines = ['## Production Launch Gate'];
  const summary = tryReadJson(summaryPath);
  if (summary.status === 'ok') {
    const payload = summary.payload;
    lines.push(
      '',
      `- status: \`${String(payload?.status ?? 'unknown')}\``,
      `- pass: \`${String(payload?.pass ?? false)}\``,
      `- environment: \`${String(payload?.config?.environment ?? 'n/a')}\``,
      `- runtime_draft_id: \`${String(payload?.config?.runtimeDraftId ?? 'auto-from-smoke')}\``,
      `- require_skill_markers: \`${String(payload?.config?.requireSkillMarkers ?? false)}\``,
      `- require_natural_cron_window: \`${String(payload?.config?.requireNaturalCronWindow ?? false)}\``,
      `- require_inline_health_artifacts: \`${String(options.requireInlineHealthArtifacts)}\``,
      `- required_external_channels: \`${stringifyRequiredChannels(payload)}\``,
    );

    const inlineHealthSummary = tryReadJson(inlineHealthSummaryPath);
    if (inlineHealthSummary.status === 'ok') {
      const inlinePayload = inlineHealthSummary.payload;
      lines.push(
        `- inline post-release health artifacts: \`${String(inlinePayload?.status ?? 'unknown')}\` (present \`${String(inlinePayload?.presentTotal ?? 0)}/${String(inlinePayload?.requiredTotal ?? 0)}\`, strict \`${String(inlinePayload?.strict ?? false)}\`)`,
      );
    } else if (inlineHealthSummary.status === 'missing') {
      lines.push('- inline post-release health artifacts summary: `missing`');
    } else {
      lines.push(
        `- inline post-release health artifacts summary parse error: \`${inlineHealthSummary.errorMessage}\``,
      );
    }

    const inlineSchemaCheck = tryReadJson(inlineSchemaCheckPath);
    if (inlineSchemaCheck.status === 'ok') {
      lines.push(
        `- inline artifact summary schema check: \`${String(inlineSchemaCheck.payload?.status ?? 'unknown')}\``,
      );
    } else if (inlineSchemaCheck.status === 'missing') {
      lines.push('- inline artifact summary schema check: `missing`');
    } else {
      lines.push(
        `- inline artifact summary schema check parse error: \`${inlineSchemaCheck.errorMessage}\``,
      );
    }

    lines.push('', '### Checks');
    const checks =
      payload?.checks && typeof payload.checks === 'object' && !Array.isArray(payload.checks)
        ? payload.checks
        : {};
    for (const [key, value] of Object.entries(checks)) {
      lines.push(`- ${key}: \`${formatCheckState(value)}\``);
    }
  } else if (summary.status === 'missing') {
    lines.push('', `- summary artifact missing: \`${options.summaryPath}\``);
  } else {
    lines.push(
      '',
      `- summary artifact parse error: \`${summary.errorMessage}\``,
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
