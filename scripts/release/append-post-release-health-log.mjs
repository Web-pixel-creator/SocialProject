import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const DEFAULT_REPORT_DIR = 'artifacts/release';
const RELEASE_LOG_PATH = 'docs/ops/release-log.md';
const REPORT_FILE_PATTERN = /^post-release-health-run-\d+\.json$/u;
const USAGE = `Usage: npm run release:health:log -- [run_id] [--dry-run]

Arguments:
  run_id     Optional run id. If omitted, latest local post-release health report is used.

Options:
  --dry-run  Print generated release-log block without writing file.
  --help     Show help.
`;

const parseRunId = (raw) => {
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid run id '${raw}'. Use a positive integer.`);
  }
  return parsed;
};

const resolvePath = (relativePath) => path.resolve(projectRoot, relativePath);
const toRelative = (absolutePath) =>
  path.relative(projectRoot, absolutePath).replace(/\\/gu, '/');

const parseArguments = (argv) => {
  const options = {
    runId: null,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
    if (options.runId !== null) {
      throw new Error(`Unexpected argument: ${arg}\n\n${USAGE}`);
    }
    options.runId = parseRunId(arg);
  }

  return options;
};

const findLatestReportPath = async () => {
  const reportsDir = resolvePath(DEFAULT_REPORT_DIR);
  let entries = [];
  try {
    entries = await readdir(reportsDir, { withFileTypes: true });
  } catch (error) {
    const typedError = error;
    if (typedError?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!REPORT_FILE_PATTERN.test(entry.name)) {
      continue;
    }
    const fullPath = path.join(reportsDir, entry.name);
    const entryStats = await stat(fullPath);
    candidates.push({
      fullPath,
      mtimeMs: entryStats.mtimeMs,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.fullPath ?? null;
};

const resolveReportPath = async (runId) => {
  if (runId !== null) {
    return resolvePath(`artifacts/release/post-release-health-run-${runId}.json`);
  }
  return findLatestReportPath();
};

const toDateOnly = (rawUtc) => {
  if (!rawUtc) {
    return 'unknown-date';
  }
  const parsed = new Date(rawUtc);
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown-date';
  }
  return parsed.toISOString().slice(0, 10);
};

const escapeMarkdown = (value) => value.replace(/\r?\n/gu, ' ').trim();

const buildEntry = ({ report, reportPath }) => {
  const runNumber =
    typeof report?.run?.runNumber === 'number' ? report.run.runNumber : null;
  const runId = typeof report?.run?.id === 'number' ? report.run.id : null;
  const generatedAtUtc =
    typeof report?.generatedAtUtc === 'string' ? report.generatedAtUtc : null;
  const date = toDateOnly(generatedAtUtc);
  const runUrl =
    typeof report?.run?.htmlUrl === 'string' ? report.run.htmlUrl : '<unknown>';

  const requiredJobsPassed =
    typeof report?.summary?.requiredJobsPassed === 'number'
      ? report.summary.requiredJobsPassed
      : 0;
  const requiredJobsTotal =
    typeof report?.summary?.requiredJobsTotal === 'number'
      ? report.summary.requiredJobsTotal
      : 0;
  const failedJobsTotal =
    typeof report?.summary?.failedJobsTotal === 'number'
      ? report.summary.failedJobsTotal
      : 0;
  const requiredArtifactsPresent =
    typeof report?.summary?.requiredArtifactsPresent === 'number'
      ? report.summary.requiredArtifactsPresent
      : 0;
  const requiredArtifactsTotal =
    typeof report?.summary?.requiredArtifactsTotal === 'number'
      ? report.summary.requiredArtifactsTotal
      : 0;

  const reasons = Array.isArray(report?.summary?.reasons)
    ? report.summary.reasons.filter((value) => typeof value === 'string')
    : [];

  const smokeSummary = report?.smokeReport?.summary;
  const smokeLine =
    smokeSummary && typeof smokeSummary === 'object'
      ? `pass=${String(smokeSummary.pass)} totalSteps=${String(smokeSummary.totalSteps)} failedSteps=${String(smokeSummary.failedSteps)}`
      : 'unavailable';

  const heading = `### ${date} - post-release health run #${runNumber ?? '<unknown>'} (id ${runId ?? '<unknown>'})`;
  const lines = [
    heading,
    '',
    `- Source workflow run: #${runNumber ?? '<unknown>'} (${runUrl}).`,
    `- Overall health: ${report?.summary?.pass ? 'pass' : 'fail'}.`,
    `- Required jobs: ${requiredJobsPassed}/${requiredJobsTotal} passed.`,
    `- Required artifacts: ${requiredArtifactsPresent}/${requiredArtifactsTotal} present.`,
    `- Failed jobs total: ${failedJobsTotal}.`,
    `- Smoke summary: ${smokeLine}.`,
    `- Report artifact: \`${toRelative(reportPath)}\`.`,
  ];

  if (reasons.length > 0) {
    lines.push(`- Reasons: ${escapeMarkdown(reasons.join('; '))}.`);
  }

  return {
    heading,
    text: `${lines.join('\n')}\n`,
  };
};

const insertAfterEntriesHeader = ({ releaseLogContent, entryText }) => {
  const marker = '## Entries';
  const markerIndex = releaseLogContent.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Unable to find '${marker}' in ${RELEASE_LOG_PATH}.`);
  }

  const lineEndIndex = releaseLogContent.indexOf('\n', markerIndex);
  if (lineEndIndex === -1) {
    throw new Error(`Unable to insert entry after '${marker}' in ${RELEASE_LOG_PATH}.`);
  }

  const insertIndex = lineEndIndex + 1;
  const before = releaseLogContent.slice(0, insertIndex);
  const after = releaseLogContent.slice(insertIndex);
  const normalizedAfter = after.startsWith('\n') ? after.slice(1) : after;
  return `${before}\n${entryText}\n${normalizedAfter}`;
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const reportPath = await resolveReportPath(options.runId);
  if (!reportPath) {
    throw new Error(
      'No post-release health report found. Run `npm run release:health:report` first.',
    );
  }

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const releaseLogPath = resolvePath(RELEASE_LOG_PATH);
  const releaseLogContent = await readFile(releaseLogPath, 'utf8');
  const entry = buildEntry({
    report,
    reportPath,
  });

  if (releaseLogContent.includes(entry.heading)) {
    process.stdout.write(
      `Release log entry already exists for run ${String(report?.run?.id ?? '<unknown>')}.\n`,
    );
    return;
  }

  if (options.dryRun) {
    process.stdout.write(`${entry.text}`);
    return;
  }

  const nextContent = insertAfterEntriesHeader({
    releaseLogContent,
    entryText: entry.text,
  });
  await writeFile(releaseLogPath, nextContent);

  process.stdout.write(
    `Appended post-release health entry to ${RELEASE_LOG_PATH}: ${entry.heading}\n`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
