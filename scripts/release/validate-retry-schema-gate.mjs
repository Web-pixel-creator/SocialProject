import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

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
        'Usage: node scripts/release/validate-retry-schema-gate.mjs [--json]\n',
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const runJsonValidator = ({ scriptRelativePath, args, label }) => {
  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, scriptRelativePath), ...args, '--json'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
      },
    },
  );

  const stdoutText = result.stdout?.trim() ?? '';
  const stderrText = result.stderr?.trim() ?? '';
  const exitStatus = result.status ?? 1;

  let parsedPayload = null;
  if (stdoutText.length > 0) {
    try {
      parsedPayload = JSON.parse(stdoutText);
    } catch {
      parsedPayload = null;
    }
  }

  const parseFailure =
    stdoutText.length > 0 && parsedPayload === null
      ? [`${label} produced non-JSON stdout output.`]
      : [];
  const stderrFailure = stderrText.length > 0 ? [stderrText] : [];
  const payloadFailures = Array.isArray(parsedPayload?.failures)
    ? parsedPayload.failures
    : [];

  const failures = [...new Set([...parseFailure, ...stderrFailure, ...payloadFailures])];
  const status =
    exitStatus === 0 && parsedPayload?.status === 'pass' ? 'pass' : 'fail';

  return {
    label,
    status,
    exitStatus,
    validatedPayloads:
      typeof parsedPayload?.totals?.validatedPayloads === 'number'
        ? parsedPayload.totals.validatedPayloads
        : 0,
    failures,
  };
};

const toSummaryPayload = (steps) => {
  const passedSteps = steps.filter((step) => step.status === 'pass').length;
  const failedSteps = steps.length - passedSteps;
  const validatedPayloads = steps.reduce(
    (sum, step) => sum + step.validatedPayloads,
    0,
  );
  return {
    label: 'retry:schema:check',
    mode: 'strict',
    status: failedSteps === 0 ? 'pass' : 'fail',
    totals: {
      steps: steps.length,
      passedSteps,
      failedSteps,
      validatedPayloads,
    },
    steps: steps.map((step) => ({
      label: step.label,
      status: step.status,
      exitStatus: step.exitStatus,
      validatedPayloads: step.validatedPayloads,
      failures: step.failures,
    })),
  };
};

const writeFailureText = (summary) => {
  process.stderr.write('Retry schema gate validation failed:\n');
  for (const step of summary.steps) {
    if (step.status !== 'fail') {
      continue;
    }
    process.stderr.write(
      `- ${step.label} failed (exit ${step.exitStatus}, validated ${step.validatedPayloads} payloads)\n`,
    );
    for (const failure of step.failures) {
      process.stderr.write(`  ${failure}\n`);
    }
  }
};

const writeSuccessText = (summary) => {
  const baseStep = summary.steps.find(
    (step) => step.label === 'retry:schema:base:check',
  );
  const previewStep = summary.steps.find(
    (step) => step.label === 'retry:schema:preview:check:strict',
  );
  const baseCount = baseStep?.validatedPayloads ?? 0;
  const previewCount = previewStep?.validatedPayloads ?? 0;
  process.stdout.write(
    `Retry schema gate validation passed (base: ${baseCount} payloads, preview strict: ${previewCount} payloads, total: ${summary.totals.validatedPayloads}).\n`,
  );
};

const main = () => {
  const options = parseArguments(process.argv.slice(2));

  const steps = [
    runJsonValidator({
      scriptRelativePath: 'scripts/release/validate-retry-json-schemas.mjs',
      args: [],
      label: 'retry:schema:base:check',
    }),
    runJsonValidator({
      scriptRelativePath:
        'scripts/release/validate-retry-preview-selection-json.mjs',
      args: ['--strict'],
      label: 'retry:schema:preview:check:strict',
    }),
  ];

  const summary = toSummaryPayload(steps);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else if (summary.status === 'pass') {
    writeSuccessText(summary);
  } else {
    writeFailureText(summary);
  }

  if (summary.status !== 'pass') {
    process.exit(1);
  }
};

main();
