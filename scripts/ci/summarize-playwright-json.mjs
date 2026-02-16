#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const readArg = (flag, fallback = null) => {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const inputPath = readArg('--input');
const outputPath = readArg('--output');
const markdownPath = readArg('--markdown-output');
const title = readArg('--title', 'Playwright E2E Summary');
const topSlow = toNumber(readArg('--top-slow', '10'), 10);
const slowThresholdMs = toNumber(readArg('--slow-threshold-ms', '5000'), 5000);

if (!inputPath || !outputPath) {
  console.error(
    'Usage: node scripts/ci/summarize-playwright-json.mjs --input <report.json> --output <summary.json> [--markdown-output <summary.md>] [--top-slow <n>] [--slow-threshold-ms <ms>]',
  );
  process.exit(1);
}

const ensureDir = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
};

const readJson = (targetPath) => {
  try {
    return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${targetPath}: ${message}`);
  }
};

const suiteEntries = [];

const walkSuite = (suite, parents = []) => {
  const nextParents = suite?.title ? [...parents, suite.title] : parents;

  for (const spec of suite?.specs ?? []) {
    for (const test of spec?.tests ?? []) {
      const results = Array.isArray(test?.results) ? test.results : [];
      const totalDurationMs = results.reduce(
        (sum, result) => sum + Number(result?.duration ?? 0),
        0,
      );

      suiteEntries.push({
        attemptStatuses: results.map((result) => String(result?.status ?? 'unknown')),
        attempts: results.length,
        file: spec?.file ?? suite?.file ?? null,
        line: Number(spec?.line ?? suite?.line ?? 0),
        project: test?.projectName ?? test?.projectId ?? 'unknown',
        status: String(test?.status ?? 'unknown'),
        title: [...nextParents, spec?.title].filter(Boolean).join(' > '),
        totalDurationMs,
      });
    }
  }

  for (const childSuite of suite?.suites ?? []) {
    walkSuite(childSuite, nextParents);
  }
};

const fallbackSummary = (reason) => ({
  checkedAtUtc: new Date().toISOString(),
  reason,
  slowThresholdMs,
  source: inputPath,
  status: 'missing',
  topSlow,
});

if (!fs.existsSync(inputPath)) {
  const summary = fallbackSummary('input report not found');
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (markdownPath) {
    ensureDir(markdownPath);
    fs.writeFileSync(
      markdownPath,
      [
        `### ${title}`,
        '',
        `- status: \`missing\``,
        `- reason: ${summary.reason}`,
        `- source: \`${summary.source}\``,
        '',
      ].join('\n'),
      'utf8',
    );
  }

  process.exit(0);
}

const report = readJson(inputPath);
for (const rootSuite of report?.suites ?? []) {
  walkSuite(rootSuite, []);
}

const flakyTests = suiteEntries
  .filter((entry) => {
    if (entry.status === 'flaky') {
      return true;
    }

    const hasPass = entry.attemptStatuses.includes('passed');
    const hasNonPass = entry.attemptStatuses.some((status) => status !== 'passed' && status !== 'skipped');

    return hasPass && hasNonPass;
  })
  .sort((left, right) => right.totalDurationMs - left.totalDurationMs);

const slowTests = suiteEntries
  .filter((entry) => entry.totalDurationMs >= slowThresholdMs)
  .sort((left, right) => right.totalDurationMs - left.totalDurationMs)
  .slice(0, Math.max(1, topSlow));

const retriesUsed = suiteEntries.reduce(
  (sum, entry) => sum + Math.max(0, entry.attempts - 1),
  0,
);

const summary = {
  checkedAtUtc: new Date().toISOString(),
  flakyTests,
  slowTests,
  slowThresholdMs,
  source: inputPath,
  stats: {
    durationMs: Number(report?.stats?.duration ?? 0),
    expected: Number(report?.stats?.expected ?? 0),
    flaky: Number(report?.stats?.flaky ?? flakyTests.length),
    skipped: Number(report?.stats?.skipped ?? 0),
    totalCollectedTests: suiteEntries.length,
    unexpected: Number(report?.stats?.unexpected ?? 0),
  },
  status: 'ok',
  topSlow,
  totals: {
    flakyDetected: flakyTests.length,
    retriesUsed,
    slowDetected: slowTests.length,
  },
};

ensureDir(outputPath);
fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

if (markdownPath) {
  const lines = [
    `### ${title}`,
    '',
    `- status: \`${summary.status}\``,
    `- total tests: \`${summary.stats.totalCollectedTests}\``,
    `- expected: \`${summary.stats.expected}\``,
    `- unexpected: \`${summary.stats.unexpected}\``,
    `- flaky: \`${summary.stats.flaky}\``,
    `- retries used: \`${summary.totals.retriesUsed}\``,
    `- run duration (ms): \`${Math.round(summary.stats.durationMs)}\``,
    `- slow threshold (ms): \`${slowThresholdMs}\``,
    '',
  ];

  if (flakyTests.length > 0) {
    lines.push('Flaky tests:', '');
    for (const entry of flakyTests.slice(0, 10)) {
      lines.push(
        `- ${entry.title} (${entry.project}) - attempts: ${entry.attempts}, statuses: ${entry.attemptStatuses.join(', ')}`,
      );
    }
    lines.push('');
  }

  if (slowTests.length > 0) {
    lines.push(`Top slow tests (>= ${slowThresholdMs}ms):`, '');
    for (const entry of slowTests) {
      lines.push(
        `- ${entry.title} (${entry.project}) - ${Math.round(entry.totalDurationMs)}ms over ${entry.attempts} attempt(s)`,
      );
    }
    lines.push('');
  }

  ensureDir(markdownPath);
  fs.writeFileSync(markdownPath, lines.join('\n'), 'utf8');
}

