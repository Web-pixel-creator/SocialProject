const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_RELEASE_ARTIFACT_SUMMARY_TITLE = 'Release Artifact Presence Summary';

const ensureDir = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
};

const normalizeDisplayPath = (value) =>
  value ? String(value).trim().replaceAll('\\', '/') : value;

const collectArtifactPathStats = (targetPath) => {
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

const renderArtifactMarkdown = (artifact) => [
  `- ${artifact.name}: \`${artifact.path}\``,
  `  - exists: \`${artifact.exists}\``,
  `  - kind: \`${artifact.kind}\``,
  `  - files: \`${artifact.fileCount}\``,
  `  - directories: \`${artifact.directoryCount}\``,
  `  - bytes: \`${artifact.bytes}\``,
];

const renderReleaseArtifactSummaryMarkdown = (
  summary,
  title = DEFAULT_RELEASE_ARTIFACT_SUMMARY_TITLE,
) => {
  const lines = [
    `### ${title}`,
    '',
    `- status: \`${summary.status}\``,
    `- artifacts checked: \`${summary.artifacts.length}\``,
  ];

  for (const artifact of summary.artifacts) {
    lines.push('', ...renderArtifactMarkdown(artifact));
  }

  if (summary.actionableMessages.length > 0) {
    lines.push('', 'Actionable notes:', '');
    for (const message of summary.actionableMessages) {
      lines.push(`- ${message}`);
    }
  }

  return `${lines.join('\n')}\n`;
};

const summarizeReleaseArtifacts = ({
  artifacts,
  markdownOutputPath = null,
  outputPath,
  title = DEFAULT_RELEASE_ARTIFACT_SUMMARY_TITLE,
}) => {
  if (!Array.isArray(artifacts) || artifacts.length === 0 || !outputPath) {
    throw new Error('At least one artifact and outputPath are required');
  }

  const actionableMessages = [];
  const normalizedArtifacts = artifacts.map((artifact) => {
    const stats = collectArtifactPathStats(artifact.path);
    const normalized = {
      ...stats,
      name: String(artifact.name),
    };
    if (!normalized.exists) {
      actionableMessages.push(`Artifact '${normalized.name}' missing at ${normalized.path}`);
    } else if (normalized.fileCount === 0) {
      actionableMessages.push(
        `Artifact '${normalized.name}' exists but contains no files at ${normalized.path}`,
      );
    }
    return normalized;
  });

  const presentCount = normalizedArtifacts.filter((artifact) => artifact.exists).length;
  let status = 'complete';
  if (presentCount === 0) {
    status = 'missing';
  } else if (presentCount !== normalizedArtifacts.length || actionableMessages.length > 0) {
    status = 'partial';
  }

  const summary = {
    actionableMessages,
    artifacts: normalizedArtifacts,
    checkedAtUtc: new Date().toISOString(),
    missingCount: normalizedArtifacts.length - presentCount,
    presentCount,
    status,
  };

  ensureDir(outputPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (markdownOutputPath) {
    ensureDir(markdownOutputPath);
    fs.writeFileSync(
      markdownOutputPath,
      renderReleaseArtifactSummaryMarkdown(summary, title),
      'utf8',
    );
  }

  return summary;
};

module.exports = {
  DEFAULT_RELEASE_ARTIFACT_SUMMARY_TITLE,
  collectArtifactPathStats,
  renderReleaseArtifactSummaryMarkdown,
  summarizeReleaseArtifacts,
};
