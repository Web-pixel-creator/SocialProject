import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const workflowsDir = path.join(projectRoot, '.github', 'workflows');

const disallowedPatterns = [
  {
    label: "inline heredoc node block (node <<'NODE')",
    regex: /node\s+<<'NODE'/u,
  },
  {
    label: 'inline node -e command',
    regex: /node\s+-e\s+["']/u,
  },
];

const listWorkflowPaths = () =>
  readdirSync(workflowsDir)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .sort()
    .map((entry) => path.join(workflowsDir, entry));

const findMatches = (content, regex) => {
  const results = [];
  for (const match of content.matchAll(new RegExp(regex.source, 'gu'))) {
    const index = match.index ?? 0;
    const before = content.slice(0, index);
    const line = before.split('\n').length;
    results.push({
      line,
      matchedText: match[0],
    });
  }
  return results;
};

const toRelative = (absolutePath) =>
  path.relative(projectRoot, absolutePath).replaceAll('\\', '/');

const main = () => {
  const violations = [];

  for (const workflowPath of listWorkflowPaths()) {
    const content = readFileSync(workflowPath, 'utf8');
    for (const pattern of disallowedPatterns) {
      const matches = findMatches(content, pattern.regex);
      for (const match of matches) {
        violations.push({
          file: toRelative(workflowPath),
          line: match.line,
          label: pattern.label,
          matchedText: match.matchedText,
        });
      }
    }
  }

  if (violations.length === 0) {
    process.stdout.write(
      'Workflow inline-node guard passed: no disallowed inline node patterns found.\n',
    );
    return;
  }

  process.stderr.write(
    `Workflow inline-node guard failed: found ${String(violations.length)} disallowed usage(s).\n`,
  );
  for (const violation of violations) {
    process.stderr.write(
      `- ${violation.file}:${String(violation.line)} ${violation.label} (${violation.matchedText})\n`,
    );
  }
  process.exit(1);
};

main();
