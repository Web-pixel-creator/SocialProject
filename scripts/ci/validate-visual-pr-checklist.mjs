#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const readArg = (flag, fallback = null) => {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
};

const ensureDir = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
};

const writeOptionalFile = (targetPath, content) => {
  if (!targetPath) {
    return;
  }
  ensureDir(targetPath);
  fs.writeFileSync(targetPath, content, 'utf8');
};

const baseSha = readArg('--base-sha');
const headSha = readArg('--head-sha');
const outputPath = readArg('--output');
const markdownPath = readArg('--markdown-output');
const title = readArg('--title', 'Web PR Visual Baseline Checklist');
const explicitPrBody = readArg('--pr-body');

if (!baseSha || !headSha) {
  console.error(
    'Usage: node scripts/ci/validate-visual-pr-checklist.mjs --base-sha <sha> --head-sha <sha> [--output <summary.json>] [--markdown-output <summary.md>] [--title <text>] [--pr-body <text>]',
  );
  process.exit(1);
}

const requirements = [
  {
    id: 'ran_visual',
    label: 'I ran `npm run test:web:visual`',
    snippet: 'i ran `npm run test:web:visual`',
  },
  {
    id: 'updated_visual',
    label:
      'If snapshots changed intentionally, I ran `npm run test:web:visual:update` and re-ran `npm run test:web:visual`',
    snippet:
      'if snapshots changed intentionally, i ran `npm run test:web:visual:update` and re-ran `npm run test:web:visual`',
  },
  {
    id: 'reviewed_diffs',
    label:
      'I reviewed snapshot diffs in `apps/web/e2e/visual-smoke.spec.ts-snapshots/`',
    snippet: 'i reviewed snapshot diffs',
  },
  {
    id: 'documented_reason',
    label: 'I documented why baseline updates are expected',
    snippet: 'i documented why baseline updates are expected',
  },
];

const parsePrBodyFromEvent = () => {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    return '';
  }

  try {
    const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    return String(payload?.pull_request?.body ?? '');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read pull request body from event payload: ${message}`);
  }
};

const diffNameOnly = (left, right) => {
  try {
    return execFileSync('git', ['diff', '--name-only', `${left}...${right}`], {
      encoding: 'utf8',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to compute changed files: ${message}`);
  }
};

const changedFiles = diffNameOnly(baseSha, headSha)
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => entry.replaceAll('\\', '/'));

const snapshotFileRegex = /^apps\/web\/e2e\/.+-snapshots\/.+\.(png|jpg|jpeg|webp)$/i;
const changedSnapshots = changedFiles.filter((filePath) =>
  snapshotFileRegex.test(filePath),
);

const prBody = explicitPrBody ?? parsePrBodyFromEvent();
const bodyLines = prBody.split(/\r?\n/);

const isRequirementChecked = (snippet) =>
  bodyLines.some((line) => {
    const normalized = line.toLowerCase();
    return /^\s*[-*]\s*\[[xX]\]/.test(line) && normalized.includes(snippet);
  });

const missingChecklistItems =
  changedSnapshots.length === 0
    ? []
    : requirements.filter((requirement) => !isRequirementChecked(requirement.snippet));

const status =
  changedSnapshots.length === 0
    ? 'skipped'
    : missingChecklistItems.length === 0
      ? 'passed'
      : 'failed';

const summary = {
  baseSha,
  changedSnapshots,
  checkedAtUtc: new Date().toISOString(),
  headSha,
  missingChecklistItems: missingChecklistItems.map(({ id, label }) => ({
    id,
    label,
  })),
  requiredChecklistItems: requirements.map(({ id, label }) => ({ id, label })),
  status,
  title,
};

if (outputPath) {
  writeOptionalFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
}

if (markdownPath) {
  const markdownLines = [
    `### ${title}`,
    '',
    `- status: \`${status}\``,
    `- base: \`${baseSha}\``,
    `- head: \`${headSha}\``,
    `- changed snapshot files: \`${changedSnapshots.length}\``,
    '',
  ];

  if (changedSnapshots.length > 0) {
    markdownLines.push('Changed snapshot files:', '');
    for (const filePath of changedSnapshots.slice(0, 20)) {
      markdownLines.push(`- ${filePath}`);
    }
    markdownLines.push('');
  }

  if (status === 'failed') {
    markdownLines.push('Missing checked PR checklist items:', '');
    for (const requirement of missingChecklistItems) {
      markdownLines.push(`- ${requirement.label}`);
    }
    markdownLines.push('');
  }

  if (status === 'skipped') {
    markdownLines.push(
      'No snapshot files changed in this diff range, checklist validation skipped.',
      '',
    );
  }

  writeOptionalFile(markdownPath, `${markdownLines.join('\n')}\n`);
}

if (status === 'failed') {
  console.error(
    'Visual snapshot files were changed but PR checklist items are missing. See summary output for required items.',
  );
  process.exit(1);
}

console.log(
  status === 'skipped'
    ? 'No visual snapshot files changed. Checklist validation skipped.'
    : 'Visual snapshot checklist validation passed.',
);
