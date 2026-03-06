const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PLAYWRIGHT_ARTIFACT_SUMMARY_TITLE = 'Playwright Artifact Presence Summary';

const ensureDir = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
};

const normalizeDisplayPath = (value) =>
  value ? String(value).trim().replaceAll('\\', '/') : value;

const collectPlaywrightArtifactPathStats = (targetPath) => {
  const normalizedPath = normalizeDisplayPath(targetPath);

  if (!targetPath || !fs.existsSync(targetPath)) {
    return {
      bytes: 0,
      directoryCount: 0,
      exists: false,
      fileCount: 0,
      kind: 'missing',
      path: normalizedPath,
    };
  }

  const stat = fs.statSync(targetPath);

  if (stat.isFile()) {
    return {
      bytes: stat.size,
      directoryCount: 0,
      exists: true,
      fileCount: 1,
      kind: 'file',
      path: normalizedPath,
    };
  }

  if (!stat.isDirectory()) {
    return {
      bytes: 0,
      directoryCount: 0,
      exists: true,
      fileCount: 0,
      kind: 'other',
      path: normalizedPath,
    };
  }

  let bytes = 0;
  let directoryCount = 0;
  let fileCount = 0;
  const stack = [targetPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    directoryCount += 1;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile()) {
        fileCount += 1;
        bytes += fs.statSync(entryPath).size;
      }
    }
  }

  return {
    bytes,
    directoryCount,
    exists: true,
    fileCount,
    kind: 'directory',
    path: normalizedPath,
  };
};

const renderEntryMarkdown = (label, entry) => [
  `- ${label}: \`${entry.path}\``,
  `  - exists: \`${entry.exists}\``,
  `  - kind: \`${entry.kind}\``,
  `  - files: \`${entry.fileCount}\``,
  `  - directories: \`${entry.directoryCount}\``,
  `  - bytes: \`${entry.bytes}\``,
];

const renderPlaywrightArtifactSummaryMarkdown = (
  summary,
  title = DEFAULT_PLAYWRIGHT_ARTIFACT_SUMMARY_TITLE,
) => {
  const lines = [
    `### ${title}`,
    '',
    `- status: \`${summary.status}\``,
    '',
    ...renderEntryMarkdown('report', summary.report),
  ];

  if (summary.results) {
    lines.push('', ...renderEntryMarkdown('results', summary.results));
  }

  if (summary.actionableMessages.length > 0) {
    lines.push('', 'Actionable notes:', '');
    for (const message of summary.actionableMessages) {
      lines.push(`- ${message}`);
    }
  }

  return `${lines.join('\n')}\n`;
};

const summarizePlaywrightArtifacts = ({
  markdownOutputPath = null,
  outputPath,
  reportPath,
  resultsPath = null,
  title = DEFAULT_PLAYWRIGHT_ARTIFACT_SUMMARY_TITLE,
}) => {
  if (!reportPath || !outputPath) {
    throw new Error('Both reportPath and outputPath are required');
  }

  const report = collectPlaywrightArtifactPathStats(reportPath);
  const results = resultsPath ? collectPlaywrightArtifactPathStats(resultsPath) : null;
  const actionableMessages = [];

  if (!report.exists) {
    actionableMessages.push(`Playwright report missing at ${report.path}`);
  }

  if (report.exists && report.fileCount === 0) {
    actionableMessages.push(`Playwright report exists but contains no files at ${report.path}`);
  }

  if (resultsPath && results && !results.exists) {
    actionableMessages.push(`Playwright results missing at ${results.path}`);
  }

  if (results && results.exists && results.fileCount === 0) {
    actionableMessages.push(`Playwright results exist but contain no files at ${results.path}`);
  }

  let status = 'complete';
  if (!report.exists && (!resultsPath || !results || !results.exists)) {
    status = 'missing';
  } else if (!report.exists || (resultsPath && results && !results.exists)) {
    status = 'partial';
  }

  const summary = {
    actionableMessages,
    checkedAtUtc: new Date().toISOString(),
    report,
    results,
    status,
  };

  ensureDir(outputPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (markdownOutputPath) {
    ensureDir(markdownOutputPath);
    fs.writeFileSync(
      markdownOutputPath,
      renderPlaywrightArtifactSummaryMarkdown(summary, title),
      'utf8',
    );
  }

  return summary;
};

module.exports = {
  DEFAULT_PLAYWRIGHT_ARTIFACT_SUMMARY_TITLE,
  collectPlaywrightArtifactPathStats,
  renderPlaywrightArtifactSummaryMarkdown,
  summarizePlaywrightArtifacts,
};
