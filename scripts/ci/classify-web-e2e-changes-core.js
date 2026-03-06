const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_WEB_E2E_CHANGE_SCOPE_TITLE = 'Web E2E Scope Summary';

const criticalRules = [
  {
    id: 'web_source',
    label: 'web source changed',
    pattern: /^apps\/web\/src\//,
  },
  {
    id: 'web_public_assets',
    label: 'web public assets changed',
    pattern: /^apps\/web\/public\//,
  },
  {
    id: 'web_runtime_config',
    label: 'web runtime/config changed',
    pattern:
      /^apps\/web\/(?:package\.json|next\.config\.mjs|playwright(?:\.cross-browser)?\.config\.ts|postcss\.config\.cjs|tailwind\.config\.ts|tsconfig\.json|next-env\.d\.ts)$/,
  },
  {
    id: 'web_e2e_runtime',
    label: 'web E2E spec or helper changed',
    pattern: /^apps\/web\/e2e\/(?:utils\/|.+\.(?:spec|test)\.ts$)/,
  },
  {
    id: 'shared_packages',
    label: 'shared package surface changed',
    pattern: /^packages\//,
  },
  {
    id: 'api_public_routes',
    label: 'API public route changed',
    pattern:
      /^apps\/api\/src\/routes\/(?:auth|commissions|creatorStudios|demo|drafts|feeds|liveSessions|observers|privacy|search|studios)\.ts$/,
  },
  {
    id: 'api_runtime_surface',
    label: 'API runtime surface changed',
    pattern:
      /^apps\/api\/src\/(?:config\/|db\/|logging\/|middleware\/|redis\/|services\/|storage\/|types\/|server\.ts$)/,
  },
  {
    id: 'ci_playwright_runtime',
    label: 'CI Playwright runtime changed',
    pattern:
      /^\.github\/(?:workflows\/(?:ci|web-pr-gate)\.yml|actions\/(?:append-step-summary|artifact-upload|node-ci-bootstrap|playwright-[^/]+)\/)/,
  },
  {
    id: 'ci_web_scripts',
    label: 'CI helper script changed',
    pattern: /^scripts\/ci\//,
  },
  {
    id: 'workspace_lockfiles',
    label: 'workspace dependency lockfile changed',
    pattern: /^(?:package\.json|package-lock\.json)$/,
  },
];

const visualRules = [
  {
    id: 'web_source',
    label: 'web source changed',
    pattern: /^apps\/web\/src\//,
  },
  {
    id: 'web_public_assets',
    label: 'web public assets changed',
    pattern: /^apps\/web\/public\//,
  },
  {
    id: 'web_visual_config',
    label: 'web visual/runtime config changed',
    pattern:
      /^apps\/web\/(?:package\.json|next\.config\.mjs|playwright(?:\.cross-browser)?\.config\.ts|postcss\.config\.cjs|tailwind\.config\.ts|tsconfig\.json)$/,
  },
  {
    id: 'visual_baselines',
    label: 'visual baseline assets changed',
    pattern:
      /^apps\/web\/e2e\/(?:visual-smoke\.spec\.ts|visual-smoke\.spec\.ts-snapshots\/|utils\/)/,
  },
  {
    id: 'ci_visual_runtime',
    label: 'CI visual/runtime action changed',
    pattern:
      /^\.github\/(?:workflows\/web-pr-gate\.yml|actions\/(?:append-step-summary|artifact-upload|playwright-[^/]+|visual-policy-gate)\/)/,
  },
];

const normalizePath = (value) => String(value).trim().replaceAll('\\', '/').replace(/^\.\//, '');

const ensureDir = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
};

const writeTextFile = (targetPath, content) => {
  ensureDir(targetPath);
  fs.writeFileSync(targetPath, content, 'utf8');
};

const collectChangedPathsFromGit = (base, head) => {
  const result = spawnSync('git', ['diff', '--name-only', '--find-renames', base, head], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || 'git diff failed';
    throw new Error(`Failed to read changed paths from git diff: ${message}`);
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((entry) => normalizePath(entry))
    .filter(Boolean);
};

const dedupePaths = (values) => {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizePath(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

const buildMatches = (paths, rules) =>
  rules
    .map((rule) => ({
      id: rule.id,
      label: rule.label,
      matchedPaths: paths.filter((candidate) => rule.pattern.test(candidate)),
    }))
    .filter((rule) => rule.matchedPaths.length > 0);

const renderWebE2EChangeScopeMarkdown = (summary, title = DEFAULT_WEB_E2E_CHANGE_SCOPE_TITLE) => {
  const lines = [
    `### ${title}`,
    '',
    `- source: \`${summary.source}\``,
    `- changed paths: \`${summary.totals.changedPaths}\``,
    `- run critical: \`${summary.selection.runCritical}\``,
    `- run visual: \`${summary.selection.runVisual}\``,
    '',
  ];

  if (summary.selectionReasons.length > 0) {
    lines.push('Selection reasons:', '');
    for (const reason of summary.selectionReasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  if (summary.criticalMatches.length > 0) {
    lines.push('Critical matches:', '');
    for (const match of summary.criticalMatches) {
      lines.push(`- ${match.id}: ${match.matchedPaths.join(', ')}`);
    }
    lines.push('');
  }

  if (summary.visualMatches.length > 0) {
    lines.push('Visual matches:', '');
    for (const match of summary.visualMatches) {
      lines.push(`- ${match.id}: ${match.matchedPaths.join(', ')}`);
    }
    lines.push('');
  }

  if (summary.unmatchedPaths.length > 0) {
    lines.push('Unmatched paths:', '');
    for (const unmatchedPath of summary.unmatchedPaths) {
      lines.push(`- ${unmatchedPath}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
};

const classifyWebE2EChanges = ({
  baseSha = null,
  changedPaths = [],
  githubOutputPath = null,
  headSha = null,
  markdownOutputPath = null,
  outputPath = null,
  title = DEFAULT_WEB_E2E_CHANGE_SCOPE_TITLE,
} = {}) => {
  const hasGitDiffInput = Boolean(baseSha || headSha);
  const hasManualPaths = Array.isArray(changedPaths) && changedPaths.length > 0;

  if (hasGitDiffInput && (!baseSha || !headSha)) {
    throw new Error('Both --base-sha and --head-sha are required together');
  }

  if (!hasGitDiffInput && !hasManualPaths) {
    throw new Error('Provide either --base-sha/--head-sha or at least one --changed-path');
  }

  const resolvedChangedPaths = hasGitDiffInput
    ? dedupePaths(collectChangedPathsFromGit(baseSha, headSha))
    : dedupePaths(changedPaths);
  const criticalMatches = buildMatches(resolvedChangedPaths, criticalRules);
  const visualMatches = buildMatches(resolvedChangedPaths, visualRules);
  const matchedPaths = new Set(
    [...criticalMatches, ...visualMatches].flatMap((match) => match.matchedPaths),
  );
  const selection = {
    runCritical: criticalMatches.length > 0,
    runVisual: visualMatches.length > 0,
  };
  const selectionReasons = [
    selection.runCritical
      ? 'critical suite selected because at least one critical rule matched'
      : 'critical suite skipped because no critical rules matched',
    selection.runVisual
      ? 'visual smoke selected because at least one visual rule matched'
      : 'visual smoke skipped because no visual rules matched',
  ];

  const summary = {
    checkedAtUtc: new Date().toISOString(),
    source: hasGitDiffInput ? 'git-diff' : 'manual-paths',
    baseSha,
    headSha,
    changedPaths: resolvedChangedPaths,
    criticalMatches,
    selection,
    selectionReasons,
    totals: {
      changedPaths: resolvedChangedPaths.length,
      criticalMatches: criticalMatches.length,
      visualMatches: visualMatches.length,
    },
    unmatchedPaths: resolvedChangedPaths.filter((candidate) => !matchedPaths.has(candidate)),
    visualMatches,
  };

  if (outputPath) {
    writeTextFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  }

  if (markdownOutputPath) {
    writeTextFile(markdownOutputPath, renderWebE2EChangeScopeMarkdown(summary, title));
  }

  if (githubOutputPath) {
    const outputLines = [
      `run_critical=${String(summary.selection.runCritical)}`,
      `run_visual=${String(summary.selection.runVisual)}`,
      `changed_paths_count=${String(summary.totals.changedPaths)}`,
      `critical_rule_ids=${summary.criticalMatches.map((match) => match.id).join(',')}`,
      `visual_rule_ids=${summary.visualMatches.map((match) => match.id).join(',')}`,
    ];
    fs.appendFileSync(githubOutputPath, `${outputLines.join('\n')}\n`, 'utf8');
  }

  return summary;
};

module.exports = {
  DEFAULT_WEB_E2E_CHANGE_SCOPE_TITLE,
  classifyWebE2EChanges,
  criticalRules,
  renderWebE2EChangeScopeMarkdown,
  visualRules,
};
