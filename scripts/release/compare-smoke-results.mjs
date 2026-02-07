import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_RESULTS_FILE = 'smoke-results.json';
const DEFAULT_ARTIFACTS_DIR = 'artifacts/release';

const parseBoolean = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const parseRunOrPath = (raw) => {
  const value = raw.trim();
  if (!value) {
    return value;
  }
  if (/^\d+$/u.test(value)) {
    return path.join(DEFAULT_ARTIFACTS_DIR, `ci-run-${value}`, DEFAULT_RESULTS_FILE);
  }
  return value;
};

const readJson = async (filePath) => {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read JSON '${filePath}': ${message}`);
  }
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const toStepKey = (step) => {
  if (!step || typeof step.name !== 'string' || !step.name.trim()) {
    return '<unnamed-step>';
  }
  return step.name.trim();
};

const toStepMap = (steps) => {
  const map = new Map();
  for (const step of steps) {
    map.set(toStepKey(step), step);
  }
  return map;
};

const numOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const calculateTotalDuration = (steps) => {
  let total = 0;
  for (const step of steps) {
    const duration = numOrNull(step?.durationMs);
    if (duration !== null) {
      total += duration;
    }
  }
  return total;
};

const calculateFailedSteps = (steps) => {
  let failed = 0;
  for (const step of steps) {
    if (step?.pass === false) {
      failed += 1;
    }
  }
  return failed;
};

const formatMs = (value) => `${value.toFixed(2)}ms`;

const formatPercent = (value) => `${(value * 100).toFixed(2)}%`;

const buildDurationDelta = (baselineDuration, candidateDuration) => {
  const delta = candidateDuration - baselineDuration;
  if (baselineDuration === 0) {
    return {
      baseline: baselineDuration,
      candidate: candidateDuration,
      delta,
      relative: null,
    };
  }
  return {
    baseline: baselineDuration,
    candidate: candidateDuration,
    delta,
    relative: delta / baselineDuration,
  };
};

const summarizeDeltas = (deltas, limit = 5) => {
  const regressions = deltas
    .filter((entry) => entry.delta > 0)
    .sort((left, right) => right.delta - left.delta)
    .slice(0, limit);
  const improvements = deltas
    .filter((entry) => entry.delta < 0)
    .sort((left, right) => left.delta - right.delta)
    .slice(0, limit);
  return { regressions, improvements };
};

const printStepList = (label, list) => {
  if (list.length === 0) {
    process.stdout.write(`${label}: none\n`);
    return;
  }
  process.stdout.write(`${label} (${list.length}): ${list.join(', ')}\n`);
};

const printDurationList = (label, list) => {
  if (list.length === 0) {
    process.stdout.write(`${label}: none\n`);
    return;
  }

  process.stdout.write(`${label} (${list.length}):\n`);
  for (const entry of list) {
    const relativeText =
      entry.relative === null
        ? 'n/a'
        : `${entry.relative >= 0 ? '+' : ''}${formatPercent(entry.relative)}`;
    const deltaText = `${entry.delta >= 0 ? '+' : ''}${formatMs(entry.delta)}`;
    process.stdout.write(
      `- ${entry.name}: ${formatMs(entry.baseline)} -> ${formatMs(entry.candidate)} (${deltaText}, ${relativeText})\n`,
    );
  }
};

const main = async () => {
  const baselineArg = (
    process.argv[2] ??
    process.env.RELEASE_SMOKE_BASELINE ??
    ''
  ).trim();
  const candidateArg = (
    process.argv[3] ??
    process.env.RELEASE_SMOKE_CANDIDATE ??
    ''
  ).trim();
  const failOnRegression = parseBoolean(
    process.env.RELEASE_SMOKE_DIFF_FAIL_ON_REGRESSION,
    false,
  );

  if (!baselineArg || !candidateArg) {
    throw new Error(
      `Usage: npm run release:smoke:diff -- <baseline_path_or_run_id> <candidate_path_or_run_id>`,
    );
  }

  const baselinePath = parseRunOrPath(baselineArg);
  const candidatePath = parseRunOrPath(candidateArg);

  const baseline = await readJson(baselinePath);
  const candidate = await readJson(candidatePath);

  const baselineSteps = asArray(baseline?.steps);
  const candidateSteps = asArray(candidate?.steps);
  const baselineMap = toStepMap(baselineSteps);
  const candidateMap = toStepMap(candidateSteps);

  const baselineNames = [...baselineMap.keys()];
  const candidateNames = [...candidateMap.keys()];
  const baselineSet = new Set(baselineNames);
  const candidateSet = new Set(candidateNames);

  const addedSteps = candidateNames.filter((name) => !baselineSet.has(name));
  const removedSteps = baselineNames.filter((name) => !candidateSet.has(name));
  const commonSteps = baselineNames.filter((name) => candidateSet.has(name));

  const passRegressions = [];
  const passImprovements = [];
  const statusChanges = [];
  const durationDeltas = [];

  for (const name of commonSteps) {
    const baselineStep = baselineMap.get(name);
    const candidateStep = candidateMap.get(name);

    if (baselineStep?.pass === true && candidateStep?.pass === false) {
      passRegressions.push(name);
    }
    if (baselineStep?.pass === false && candidateStep?.pass === true) {
      passImprovements.push(name);
    }

    const baselineStatus = baselineStep?.status ?? null;
    const candidateStatus = candidateStep?.status ?? null;
    if (baselineStatus !== candidateStatus) {
      statusChanges.push(`${name}(${baselineStatus} -> ${candidateStatus})`);
    }

    const baselineDuration = numOrNull(baselineStep?.durationMs);
    const candidateDuration = numOrNull(candidateStep?.durationMs);
    if (baselineDuration !== null && candidateDuration !== null) {
      durationDeltas.push({
        name,
        ...buildDurationDelta(baselineDuration, candidateDuration),
      });
    }
  }

  const baselineTotalDuration = calculateTotalDuration(baselineSteps);
  const candidateTotalDuration = calculateTotalDuration(candidateSteps);
  const totalDurationDelta = buildDurationDelta(
    baselineTotalDuration,
    candidateTotalDuration,
  );

  const baselineFailed = calculateFailedSteps(baselineSteps);
  const candidateFailed = calculateFailedSteps(candidateSteps);

  const baselinePass =
    baseline?.summary?.pass === true || (baseline?.summary?.pass !== false && baselineFailed === 0);
  const candidatePass =
    candidate?.summary?.pass === true || (candidate?.summary?.pass !== false && candidateFailed === 0);

  const { regressions, improvements } = summarizeDeltas(durationDeltas);

  process.stdout.write(`Baseline: ${baselinePath}\n`);
  process.stdout.write(`Candidate: ${candidatePath}\n`);
  process.stdout.write(
    `Overall pass: ${baselinePass ? 'pass' : 'fail'} -> ${candidatePass ? 'pass' : 'fail'}\n`,
  );
  process.stdout.write(`Step count: ${baselineSteps.length} -> ${candidateSteps.length}\n`);
  process.stdout.write(`Failed steps: ${baselineFailed} -> ${candidateFailed}\n`);
  process.stdout.write(
    `Total duration: ${formatMs(totalDurationDelta.baseline)} -> ${formatMs(
      totalDurationDelta.candidate,
    )} (${totalDurationDelta.delta >= 0 ? '+' : ''}${formatMs(totalDurationDelta.delta)})\n`,
  );

  printStepList('Pass regressions', passRegressions);
  printStepList('Pass improvements', passImprovements);
  printStepList('Added steps', addedSteps);
  printStepList('Removed steps', removedSteps);
  printStepList('Status changes', statusChanges);
  printDurationList('Top duration regressions', regressions);
  printDurationList('Top duration improvements', improvements);

  const hasRegression =
    passRegressions.length > 0 ||
    (baselinePass && !candidatePass) ||
    candidateFailed > baselineFailed;

  if (failOnRegression && hasRegression) {
    process.stderr.write(
      'Regression detected and RELEASE_SMOKE_DIFF_FAIL_ON_REGRESSION=true. Exiting with code 2.\n',
    );
    process.exit(2);
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
