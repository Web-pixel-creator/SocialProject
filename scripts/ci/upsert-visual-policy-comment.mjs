#!/usr/bin/env node

import fs from 'node:fs';

const defaultCommands = [
  'npm run test:web:visual',
  'npm run test:web:visual:update',
  'npm run test:web:visual',
];

const defaultChecklistTemplate = [
  '- [ ] I ran `npm run test:web:visual`',
  '- [ ] If snapshots changed intentionally, I ran `npm run test:web:visual:update` and re-ran `npm run test:web:visual`',
  '- [ ] I reviewed snapshot diffs in `apps/web/e2e/visual-smoke.spec.ts-snapshots/`',
  '- [ ] I documented why baseline updates are expected',
];

const toArray = (value, fallback) =>
  Array.isArray(value) && value.length > 0 ? value : fallback;

export const upsertVisualPolicyComment = async ({
  github,
  context,
  core,
  marker = '<!-- finishit-visual-baseline-checklist -->',
  summaryPath,
}) => {
  if (!summaryPath || !fs.existsSync(summaryPath)) {
    core.info(
      `Summary file not found at ${summaryPath ?? 'undefined'}, skipping comment update.`,
    );
    return;
  }

  const issueNumber = context.payload.pull_request?.number;
  if (!issueNumber) {
    core.info(
      'No pull request number found in context, skipping comment update.',
    );
    return;
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const changedSnapshots = toArray(summary.changedSnapshots, []);
  const missingChecklistItems = toArray(summary.missingChecklistItems, []);
  const remediation =
    summary.remediation && typeof summary.remediation === 'object'
      ? summary.remediation
      : {};
  const commands = toArray(remediation.commands, defaultCommands);
  const checklistTemplate = toArray(
    remediation.checklistTemplate,
    defaultChecklistTemplate,
  );
  const policyPath =
    typeof remediation.policyPath === 'string'
      ? remediation.policyPath
      : 'apps/web/e2e/VISUAL_BASELINE_POLICY.md';

  const { owner, repo } = context.repo;
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  const existing = comments.find(
    (comment) =>
      comment.user?.type === 'Bot' &&
      typeof comment.body === 'string' &&
      comment.body.includes(marker),
  );

  if (summary.status !== 'failed') {
    if (existing) {
      await github.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: existing.id,
      });
      core.info('Removed stale visual checklist guidance comment.');
    } else {
      core.info('Visual checklist gate is not failed, no comment needed.');
    }
    return;
  }

  const bodyLines = [
    marker,
    '### Visual Baseline Checklist Required',
    '',
    'Snapshot baseline files changed, but required PR checklist items are not marked as completed.',
    '',
    `- status: \`${summary.status}\``,
    `- changed snapshot files: \`${changedSnapshots.length}\``,
    '',
    'Missing checklist items:',
    '',
    ...missingChecklistItems.map((item) => `- ${item.label}`),
    '',
    'How to fix:',
    '',
    '1. Run commands:',
    ...commands.map((command) => `   - \`${command}\``),
    '',
    '2. In PR description, mark checklist items:',
    '',
    '```markdown',
    ...checklistTemplate,
    '```',
    '',
    `Policy: \`${policyPath}\``,
  ];

  const body = bodyLines.join('\n');

  if (existing) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    core.info('Updated existing visual checklist guidance comment.');
    return;
  }

  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  core.info('Created visual checklist guidance comment.');
};
