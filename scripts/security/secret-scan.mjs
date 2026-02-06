import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_EXCEPTIONS_PATH = '.security/secret-scan-exceptions.json';

const SECRET_PATTERNS = [
  {
    name: 'private-key-block',
    regex:
      /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    name: 'aws-access-key-id',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: 'github-token',
    regex: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{36,}\b/,
  },
  {
    name: 'slack-token',
    regex: /\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{10,}\b/,
  },
  {
    name: 'stripe-live-key',
    regex: /\bsk_live_[A-Za-z0-9]{16,}\b/,
  },
];

const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.env',
  '.example',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.md',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

const loadExceptions = async (filePath) => {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.exceptions)) {
      return [];
    }
    return parsed.exceptions;
  } catch {
    return [];
  }
};

const listTrackedFiles = () => {
  const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return output
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

const isTextLikeFile = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }

  return (
    filePath.endsWith('.env.example') ||
    filePath.endsWith('.mdx') ||
    filePath.endsWith('.sh')
  );
};

const isSuppressed = (finding, exceptions) => {
  return exceptions.some((rule) => {
    if (rule.path !== finding.path || rule.pattern !== finding.pattern) {
      return false;
    }
    if (typeof rule.line === 'number' && rule.line !== finding.line) {
      return false;
    }
    if (typeof rule.contains === 'string') {
      return finding.snippet.includes(rule.contains);
    }
    return true;
  });
};

const scanFile = async (filePath, exceptions) => {
  if (!isTextLikeFile(filePath)) {
    return [];
  }

  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    return [];
  }

  if (content.includes('\u0000')) {
    return [];
  }

  const findings = [];
  const lines = content.split(/\r?\n/u);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const pattern of SECRET_PATTERNS) {
      if (!pattern.regex.test(line)) {
        continue;
      }
      const finding = {
        path: filePath,
        line: lineIndex + 1,
        pattern: pattern.name,
        snippet: line.trim(),
      };
      if (!isSuppressed(finding, exceptions)) {
        findings.push(finding);
      }
    }
  }
  return findings;
};

const main = async () => {
  const exceptionsPath =
    process.env.SECRET_SCAN_EXCEPTIONS_PATH ?? DEFAULT_EXCEPTIONS_PATH;
  const exceptions = await loadExceptions(exceptionsPath);

  const files = listTrackedFiles();
  const findings = [];
  for (const filePath of files) {
    const fileFindings = await scanFile(filePath, exceptions);
    findings.push(...fileFindings);
  }

  if (findings.length === 0) {
    process.stdout.write('Secret scan passed. No unsuppressed findings.\n');
    return;
  }

  process.stderr.write('Secret scan failed. Findings:\n');
  for (const finding of findings) {
    process.stderr.write(
      `- ${finding.path}:${finding.line} [${finding.pattern}] ${finding.snippet}\n`,
    );
  }
  process.exit(1);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
