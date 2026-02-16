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

const title = readArg('--title', 'Web Nightly Visual Summary');
const artifactsDir = readArg('--artifacts-dir');
const reportJsonPath = readArg('--report-json');
const outputPath = readArg('--output');
const markdownPath = readArg('--markdown-output');

if (!artifactsDir || !outputPath) {
  console.error(
    'Usage: node scripts/ci/summarize-visual-artifacts.mjs --artifacts-dir <dir> --output <summary.json> [--report-json <playwright-report.json>] [--markdown-output <summary.md>] [--title <summary title>]',
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

const collectFiles = (rootDir) => {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
};

const files = collectFiles(artifactsDir);
const pngFiles = files.filter((file) => file.toLowerCase().endsWith('.png'));
const diffFiles = pngFiles.filter((file) => file.toLowerCase().endsWith('-diff.png'));
const actualFiles = pngFiles.filter((file) => file.toLowerCase().endsWith('-actual.png'));
const expectedFiles = pngFiles.filter((file) => file.toLowerCase().endsWith('-expected.png'));
const capturedFiles = pngFiles.filter(
  (file) =>
    !file.toLowerCase().endsWith('-diff.png') &&
    !file.toLowerCase().endsWith('-actual.png') &&
    !file.toLowerCase().endsWith('-expected.png'),
);
const traceFiles = files.filter((file) => file.toLowerCase().endsWith('.zip'));
const videoFiles = files.filter((file) => file.toLowerCase().endsWith('.webm'));

let reportStats = {
  durationMs: 0,
  expected: 0,
  flaky: 0,
  skipped: 0,
  unexpected: 0,
};
const failedTests = [];

const walkSuite = (suite, parents = []) => {
  const nextParents = suite?.title ? [...parents, suite.title] : parents;

  for (const spec of suite?.specs ?? []) {
    const specTitle = [...nextParents, spec?.title].filter(Boolean).join(' > ');

    for (const test of spec?.tests ?? []) {
      const status = String(test?.status ?? 'unknown');
      if (status === 'unexpected' || status === 'flaky') {
        failedTests.push({
          project: test?.projectName ?? test?.projectId ?? 'unknown',
          status,
          title: specTitle,
        });
      }
    }
  }

  for (const childSuite of suite?.suites ?? []) {
    walkSuite(childSuite, nextParents);
  }
};

if (reportJsonPath && fs.existsSync(reportJsonPath)) {
  const report = readJson(reportJsonPath);
  reportStats = {
    durationMs: Number(report?.stats?.duration ?? 0),
    expected: Number(report?.stats?.expected ?? 0),
    flaky: Number(report?.stats?.flaky ?? 0),
    skipped: Number(report?.stats?.skipped ?? 0),
    unexpected: Number(report?.stats?.unexpected ?? 0),
  };

  for (const rootSuite of report?.suites ?? []) {
    walkSuite(rootSuite, []);
  }
}

const status = reportStats.unexpected > 0 ? 'failed' : diffFiles.length > 0 ? 'changed' : 'ok';

const summary = {
  checkedAtUtc: new Date().toISOString(),
  files: {
    actualPng: actualFiles.length,
    capturedPng: capturedFiles.length,
    diffPng: diffFiles.length,
    expectedPng: expectedFiles.length,
    totalPng: pngFiles.length,
    traces: traceFiles.length,
    videos: videoFiles.length,
  },
  failedTests,
  report: {
    ...reportStats,
    source: reportJsonPath ?? null,
  },
  status,
  title,
};

ensureDir(outputPath);
fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

if (markdownPath) {
  const lines = [
    `### ${title}`,
    '',
    `- status: \`${status}\``,
    `- report source: \`${reportJsonPath ?? 'n/a'}\``,
    `- expected: \`${reportStats.expected}\``,
    `- unexpected: \`${reportStats.unexpected}\``,
    `- flaky: \`${reportStats.flaky}\``,
    `- skipped: \`${reportStats.skipped}\``,
    `- duration (ms): \`${Math.round(reportStats.durationMs)}\``,
    `- captured screenshots (.png): \`${capturedFiles.length}\``,
    `- diff screenshots (-diff.png): \`${diffFiles.length}\``,
    `- trace files (.zip): \`${traceFiles.length}\``,
    `- video files (.webm): \`${videoFiles.length}\``,
    '',
  ];

  if (diffFiles.length > 0) {
    lines.push('Diff artifact samples:', '');
    for (const file of diffFiles.slice(0, 10)) {
      lines.push(`- ${path.relative(process.cwd(), file)}`);
    }
    lines.push('');
  }

  if (failedTests.length > 0) {
    lines.push('Failed/flaky tests:', '');
    for (const testEntry of failedTests.slice(0, 10)) {
      lines.push(
        `- ${testEntry.title} (${testEntry.project}) [${testEntry.status}]`,
      );
    }
    lines.push('');
  }

  ensureDir(markdownPath);
  fs.writeFileSync(markdownPath, lines.join('\n'), 'utf8');
}
