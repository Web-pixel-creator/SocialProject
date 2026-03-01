import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_REQUIRED_EXTERNAL_CHANNELS = 'all';
const DEFAULT_OUTPUT_DIR = 'artifacts/release';
const DEFAULT_RELEASE_HEALTH_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_RELEASE_HEALTH_POLL_MS = 10000;

const USAGE = `Usage: npm run release:alert-risk:reassess -- [options]

Options:
  --required-external-channels <csv|all>  Input for launch-gate dispatch (default: all)
  --run-id <id>                           Skip dispatch and evaluate explicit launch-gate run id
  --not-before-utc <ISO8601>              Defer reassessment until this UTC time
  --apply                                 If ready, set RELEASE_HEALTH_ALERT_RISK_STRICT=true via gh cli
  --require-ready                         Exit non-zero when readiness conditions are not met
  --json                                  Print machine-readable JSON summary
  --help                                  Show this help
`;

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const parseDateUtc = (value, label) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO8601 timestamp.`);
  }
  return parsed;
};

const parsePositiveInteger = (value, label) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1 || !Number.isInteger(numeric)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return numeric;
};

const parseCliArgs = (argv) => {
  const options = {
    requiredExternalChannels: DEFAULT_REQUIRED_EXTERNAL_CHANNELS,
    runId: null,
    notBeforeUtc: null,
    apply: false,
    requireReady: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--require-ready') {
      options.requireReady = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg.startsWith('--required-external-channels=')) {
      const value = arg.slice('--required-external-channels='.length).trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      options.requiredExternalChannels = value;
      continue;
    }
    if (arg === '--required-external-channels') {
      const value = String(argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      options.requiredExternalChannels = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--run-id=')) {
      options.runId = parsePositiveInteger(
        arg.slice('--run-id='.length).trim(),
        '--run-id',
      );
      continue;
    }
    if (arg === '--run-id') {
      const value = String(argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      options.runId = parsePositiveInteger(value, '--run-id');
      index += 1;
      continue;
    }
    if (arg.startsWith('--not-before-utc=')) {
      options.notBeforeUtc = parseDateUtc(
        arg.slice('--not-before-utc='.length),
        '--not-before-utc',
      );
      continue;
    }
    if (arg === '--not-before-utc') {
      const value = String(argv[index + 1] ?? '').trim();
      if (!value) {
        throw new Error(`Missing value for ${arg}.\n\n${USAGE}`);
      }
      options.notBeforeUtc = parseDateUtc(value, '--not-before-utc');
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  return options;
};

const quoteCmdArg = (value) => {
  const normalized = String(value ?? '');
  if (!/[\s"&|<>^]/u.test(normalized)) {
    return normalized;
  }
  return `"${normalized.replace(/"/gu, '""')}"`;
};

const runCommand = ({ command, args, label }) => {
  const result =
    process.platform === 'win32'
      ? spawnSync(
          'cmd.exe',
          ['/d', '/s', '/c', [command, ...args].map(quoteCmdArg).join(' ')],
          {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        )
      : spawnSync(command, args, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = `${stdout}${stderr}`;

  if (result.error) {
    throw new Error(`${label} failed: ${toErrorMessage(result.error)}`);
  }
  if (result.status !== 0) {
    const output = combined.trim();
    throw new Error(
      `${label} exited with code ${String(result.status)}.${
        output ? `\n${output}` : ''
      }`,
    );
  }

  return {
    stdout,
    stderr,
    combined,
  };
};

const extractLastRunMatch = (text) => {
  const matcher =
    /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/actions\/runs\/(\d+)/gu;
  let match = null;
  let current = matcher.exec(text);
  while (current) {
    match = current;
    current = matcher.exec(text);
  }
  return match;
};

const sleep = (ms) =>
  new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });

const collectFilesRecursive = (rootDir) => {
  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }

  return files;
};

const readJsonFile = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));

const listReleaseHealthWorkflowRuns = () => {
  const response = runCommand({
    command: 'gh',
    args: [
      'run',
      'list',
      '--workflow',
      'release-health-gate.yml',
      '--limit',
      '40',
      '--json',
      'databaseId,number,status,conclusion,event,createdAt,url',
    ],
    label: 'gh run list release-health-gate.yml',
  });
  const parsed = JSON.parse(response.stdout);
  const runs = Array.isArray(parsed) ? parsed : [];
  return runs
    .filter(
      (run) =>
        run &&
        run.event === 'workflow_run' &&
        Number.isFinite(Number(run.databaseId)),
    )
    .map((run) => ({
      databaseId: Number(run.databaseId),
      number: Number.isFinite(Number(run.number)) ? Number(run.number) : null,
      status: typeof run.status === 'string' ? run.status : 'unknown',
      conclusion: typeof run.conclusion === 'string' ? run.conclusion : null,
      createdAt:
        typeof run.createdAt === 'string' && run.createdAt
          ? run.createdAt
          : null,
      url: typeof run.url === 'string' ? run.url : null,
    }));
};

const tryReadReleaseHealthSummaryForTargetRun = ({ workflowRunId, targetRunId }) => {
  const artifactRoot = resolve(
    `${DEFAULT_OUTPUT_DIR}/alert-risk-strict-reassessment-release-health-run-${String(
      workflowRunId,
    )}`,
  );
  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });

  runCommand({
    command: 'gh',
    args: ['run', 'download', String(workflowRunId), '-D', artifactRoot],
    label: `gh run download ${String(workflowRunId)}`,
  });

  const files = collectFilesRecursive(artifactRoot);
  const expectedSummaryFile = `post-release-health-summary-${String(targetRunId)}.json`;
  const expectedReportFile = `post-release-health-run-${String(targetRunId)}.json`;
  const summaryPath = files.find((file) => file.endsWith(expectedSummaryFile)) ?? null;
  if (!summaryPath) {
    return null;
  }

  const summary = readJsonFile(summaryPath);
  const summaryRunId = Number(summary?.run?.id);
  if (!Number.isFinite(summaryRunId) || summaryRunId !== targetRunId) {
    return null;
  }

  const reportPath = files.find((file) => file.endsWith(expectedReportFile)) ?? null;
  const report = reportPath ? readJsonFile(reportPath) : null;

  return {
    artifactRoot,
    summaryPath,
    reportPath,
    summary,
    report,
  };
};

const waitForReleaseHealthSummary = async ({ targetRunId }) => {
  const deadline = Date.now() + DEFAULT_RELEASE_HEALTH_WAIT_TIMEOUT_MS;
  const attemptedCompletedRuns = new Set();

  while (Date.now() < deadline) {
    const runs = listReleaseHealthWorkflowRuns().sort((a, b) => {
      const aTs = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTs = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTs - aTs;
    });

    for (const run of runs) {
      if (run.status !== 'completed') {
        continue;
      }
      if (attemptedCompletedRuns.has(run.databaseId)) {
        continue;
      }
      attemptedCompletedRuns.add(run.databaseId);

      try {
        const match = tryReadReleaseHealthSummaryForTargetRun({
          workflowRunId: run.databaseId,
          targetRunId,
        });
        if (match) {
          return {
            releaseHealthRun: run,
            ...match,
          };
        }
      } catch {
        // Ignore single-run inspection failures and continue polling.
      }
    }

    await sleep(DEFAULT_RELEASE_HEALTH_POLL_MS);
  }

  throw new Error(
    `Timed out waiting for matching Release Health Gate artifact for launch-gate run ${String(targetRunId)}.`,
  );
};

const main = async () => {
  const options = parseCliArgs(process.argv.slice(2));
  const now = new Date();
  const configuredNotBefore =
    options.notBeforeUtc ??
    parseDateUtc(
      process.env.RELEASE_HEALTH_ALERT_RISK_STRICT_NOT_BEFORE_UTC ?? '',
      'RELEASE_HEALTH_ALERT_RISK_STRICT_NOT_BEFORE_UTC',
    );
  const deferred =
    configuredNotBefore instanceof Date && now.getTime() < configuredNotBefore.getTime();

  const runLabel = options.runId ? String(options.runId) : 'pending';
  mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });

  if (deferred) {
    const summary = {
      label: 'release:alert-risk:strict-reassess',
      status: 'deferred',
      generatedAtUtc: now.toISOString(),
      notBeforeUtc: configuredNotBefore.toISOString(),
      readyToEnableStrict: false,
      notReadyReasons: [
        `deferred until ${configuredNotBefore.toISOString()} (current UTC ${now.toISOString()})`,
      ],
      applyRequested: options.apply,
      strictVariableApplied: false,
      run: {
        id: null,
        url: null,
      },
      releaseHealthAlertTelemetry: null,
      outputPath: resolve(
        `${DEFAULT_OUTPUT_DIR}/alert-risk-strict-reassessment-${runLabel}.json`,
      ),
    };
    writeFileSync(summary.outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    if (options.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      process.stdout.write(`Reassessment deferred until ${summary.notBeforeUtc}.\n`);
      process.stdout.write(`Summary: ${summary.outputPath}\n`);
    }
    return;
  }

  let dispatchLog = '';
  let runId = options.runId;
  let runUrl = null;

  if (!runId) {
    const dispatchResult = runCommand({
      command: 'npm',
      args: [
        '--silent',
        'run',
        'release:launch:gate:dispatch',
        '--',
        '--required-external-channels',
        options.requiredExternalChannels,
      ],
      label: 'release:launch:gate:dispatch',
    });
    dispatchLog = dispatchResult.combined;
    const runMatch = extractLastRunMatch(dispatchLog);
    if (!runMatch) {
      throw new Error(
        'Unable to extract workflow run id from release:launch:gate:dispatch output.',
      );
    }
    runId = parsePositiveInteger(runMatch[3], 'dispatch run id');
    runUrl = `https://github.com/${runMatch[1]}/${runMatch[2]}/actions/runs/${runMatch[3]}`;
  }

  const healthArtifacts = await waitForReleaseHealthSummary({ targetRunId: runId });
  const parsedSummary = healthArtifacts.summary;
  const parsedReport =
    healthArtifacts.report && typeof healthArtifacts.report === 'object'
      ? healthArtifacts.report
      : parsedSummary;

  if (!runUrl && typeof parsedSummary?.run?.htmlUrl === 'string') {
    runUrl = parsedSummary.run.htmlUrl;
  }

  const telemetry =
    parsedSummary?.releaseHealthAlertTelemetry &&
    typeof parsedSummary.releaseHealthAlertTelemetry === 'object'
      ? parsedSummary.releaseHealthAlertTelemetry
      : null;

  const notReadyReasons = [];
  if (parsedSummary?.status !== 'pass') {
    notReadyReasons.push(
      `post-release health summary status is '${String(parsedSummary?.status)}'`,
    );
  }
  if (!telemetry) {
    notReadyReasons.push('releaseHealthAlertTelemetry block is missing.');
  } else {
    if (telemetry.evaluated !== true) {
      notReadyReasons.push('releaseHealthAlertTelemetry.evaluated is not true.');
    }
    if (telemetry.status !== 'healthy') {
      notReadyReasons.push(
        `releaseHealthAlertTelemetry.status is '${String(telemetry.status)}' (expected 'healthy').`,
      );
    }
    if (telemetry.escalationTriggered === true) {
      notReadyReasons.push('releaseHealthAlertTelemetry.escalationTriggered is true.');
    }
    if (telemetry.escalationSuppressed === true) {
      notReadyReasons.push('releaseHealthAlertTelemetry.escalationSuppressed is true.');
    }
  }

  const readyToEnableStrict = notReadyReasons.length === 0;
  let strictVariableApplied = false;
  let strictVariableApplyError = null;

  if (options.apply && readyToEnableStrict) {
    try {
      runCommand({
        command: 'gh',
        args: ['variable', 'set', 'RELEASE_HEALTH_ALERT_RISK_STRICT', '--body', 'true'],
        label: 'gh variable set RELEASE_HEALTH_ALERT_RISK_STRICT',
      });
      strictVariableApplied = true;
    } catch (error) {
      strictVariableApplyError = toErrorMessage(error);
    }
  }

  const outputPath = resolve(
    `${DEFAULT_OUTPUT_DIR}/alert-risk-strict-reassessment-${String(runId)}.json`,
  );
  const dispatchLogPath =
    dispatchLog.length > 0
      ? resolve(
          `${DEFAULT_OUTPUT_DIR}/alert-risk-strict-reassessment-dispatch-${String(runId)}.log`,
        )
      : null;
  if (dispatchLogPath) {
    writeFileSync(dispatchLogPath, dispatchLog, 'utf8');
  }
  const summarySnapshotPath = resolve(
    `${DEFAULT_OUTPUT_DIR}/alert-risk-strict-reassessment-health-summary-${String(runId)}.json`,
  );
  const reportSnapshotPath = resolve(
    `${DEFAULT_OUTPUT_DIR}/alert-risk-strict-reassessment-health-report-${String(runId)}.json`,
  );
  writeFileSync(summarySnapshotPath, `${JSON.stringify(parsedSummary, null, 2)}\n`, 'utf8');
  writeFileSync(reportSnapshotPath, `${JSON.stringify(parsedReport, null, 2)}\n`, 'utf8');

  const summary = {
    label: 'release:alert-risk:strict-reassess',
    status: readyToEnableStrict ? 'ready' : 'not_ready',
    generatedAtUtc: now.toISOString(),
    notBeforeUtc: configuredNotBefore ? configuredNotBefore.toISOString() : null,
    applyRequested: options.apply,
    strictVariableApplied,
    strictVariableApplyError,
    requiredExternalChannels: options.requiredExternalChannels,
    readyToEnableStrict,
    notReadyReasons,
    run: {
      id: runId,
      url: runUrl,
      runNumber: parsedSummary?.run?.runNumber ?? null,
      conclusion: parsedSummary?.run?.conclusion ?? null,
    },
    releaseHealthWorkflowRun: {
      id: healthArtifacts.releaseHealthRun.databaseId,
      number: healthArtifacts.releaseHealthRun.number,
      status: healthArtifacts.releaseHealthRun.status,
      conclusion: healthArtifacts.releaseHealthRun.conclusion,
      createdAt: healthArtifacts.releaseHealthRun.createdAt,
      url: healthArtifacts.releaseHealthRun.url,
    },
    healthReport: {
      status: parsedSummary?.status ?? 'unknown',
      strict: parsedSummary?.strict === true,
      outputPath:
        typeof parsedSummary?.outputPath === 'string' ? parsedSummary.outputPath : null,
    },
    releaseHealthAlertTelemetry: telemetry
      ? {
          enabled: telemetry.enabled === true,
          strict: telemetry.strict === true,
          windowHours:
            Number.isFinite(Number(telemetry.windowHours))
              ? Number(telemetry.windowHours)
              : null,
          escalationStreak:
            Number.isFinite(Number(telemetry.escalationStreak))
              ? Number(telemetry.escalationStreak)
              : null,
          status: telemetry.status ?? null,
          evaluated: telemetry.evaluated === true,
          riskLevel: telemetry.riskLevel ?? null,
          pass: telemetry.pass === true,
          consecutiveSuccessfulRunStreak:
            Number.isFinite(Number(telemetry.consecutiveSuccessfulRunStreak))
              ? Number(telemetry.consecutiveSuccessfulRunStreak)
              : null,
          latestAlertRun:
            telemetry.latestAlertRun && typeof telemetry.latestAlertRun === 'object'
              ? telemetry.latestAlertRun
              : null,
          escalationSuppressed: telemetry.escalationSuppressed === true,
          escalationSuppressionReason:
            typeof telemetry.escalationSuppressionReason === 'string'
              ? telemetry.escalationSuppressionReason
              : null,
          escalationTriggered: telemetry.escalationTriggered === true,
          reasons: Array.isArray(telemetry.reasons) ? telemetry.reasons : [],
        }
      : null,
    dispatchLogPath,
    sourceSummaryPath: healthArtifacts.summaryPath,
    sourceReportPath: healthArtifacts.reportPath,
    sourceArtifactRoot: healthArtifacts.artifactRoot,
    summarySnapshotPath,
    reportSnapshotPath,
    outputPath,
  };

  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`Run id: ${String(runId)}\n`);
    process.stdout.write(`Ready to enable strict: ${readyToEnableStrict ? 'yes' : 'no'}\n`);
    if (notReadyReasons.length > 0) {
      process.stdout.write(`Not-ready reasons: ${notReadyReasons.join(' | ')}\n`);
    }
    if (options.apply) {
      process.stdout.write(
        `Strict variable applied: ${
          strictVariableApplied ? 'yes' : strictVariableApplyError ? 'failed' : 'no'
        }\n`,
      );
      if (strictVariableApplyError) {
        process.stdout.write(`Strict variable apply error: ${strictVariableApplyError}\n`);
      }
    }
    process.stdout.write(`Summary: ${outputPath}\n`);
  }

  if (options.requireReady && !readyToEnableStrict) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  process.stderr.write(`${toErrorMessage(error)}\n`);
  process.exit(1);
});
