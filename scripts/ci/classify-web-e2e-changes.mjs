#!/usr/bin/env node

import core from './classify-web-e2e-changes-core.js';

const { classifyWebE2EChanges, DEFAULT_WEB_E2E_CHANGE_SCOPE_TITLE } = core;

const usage = `Usage: node scripts/ci/classify-web-e2e-changes.mjs [options]

Options:
  --base-sha <sha>              compare git diff from base SHA
  --head-sha <sha>              compare git diff to head SHA
  --changed-path <path>         add one changed path manually (repeatable)
  --output <summary.json>       optional JSON summary output path
  --markdown-output <summary.md>
                                optional Markdown summary output path
  --title <text>                summary title (default: ${DEFAULT_WEB_E2E_CHANGE_SCOPE_TITLE})
  --github-output <path>        optional GitHub step output file path
  -h, --help                    print usage
`;

const parseCliArgs = (argv) => {
  const cliArgs = argv.slice(2);
  let baseSha = null;
  let headSha = null;
  let outputPath = null;
  let markdownOutputPath = null;
  let title = DEFAULT_WEB_E2E_CHANGE_SCOPE_TITLE;
  let githubOutputPath = null;
  const changedPaths = [];

  const readValue = (flag, index) => {
    if (index + 1 >= cliArgs.length) {
      throw new Error(`Missing value for ${flag}`);
    }

    return cliArgs[index + 1];
  };

  for (let index = 0; index < cliArgs.length; index += 1) {
    const token = cliArgs[index];

    if (token === '--help' || token === '-h') {
      return { help: true };
    }

    if (token === '--base-sha') {
      baseSha = readValue('--base-sha', index);
      index += 1;
      continue;
    }

    if (token.startsWith('--base-sha=')) {
      baseSha = token.slice('--base-sha='.length);
      if (!baseSha) {
        throw new Error('Missing value for --base-sha=');
      }
      continue;
    }

    if (token === '--head-sha') {
      headSha = readValue('--head-sha', index);
      index += 1;
      continue;
    }

    if (token.startsWith('--head-sha=')) {
      headSha = token.slice('--head-sha='.length);
      if (!headSha) {
        throw new Error('Missing value for --head-sha=');
      }
      continue;
    }

    if (token === '--changed-path') {
      changedPaths.push(readValue('--changed-path', index));
      index += 1;
      continue;
    }

    if (token.startsWith('--changed-path=')) {
      const changedPath = token.slice('--changed-path='.length);
      if (!changedPath) {
        throw new Error('Missing value for --changed-path=');
      }
      changedPaths.push(changedPath);
      continue;
    }

    if (token === '--output') {
      outputPath = readValue('--output', index);
      index += 1;
      continue;
    }

    if (token.startsWith('--output=')) {
      outputPath = token.slice('--output='.length);
      if (!outputPath) {
        throw new Error('Missing value for --output=');
      }
      continue;
    }

    if (token === '--markdown-output') {
      markdownOutputPath = readValue('--markdown-output', index);
      index += 1;
      continue;
    }

    if (token.startsWith('--markdown-output=')) {
      markdownOutputPath = token.slice('--markdown-output='.length);
      if (!markdownOutputPath) {
        throw new Error('Missing value for --markdown-output=');
      }
      continue;
    }

    if (token === '--title') {
      title = readValue('--title', index);
      index += 1;
      continue;
    }

    if (token.startsWith('--title=')) {
      title = token.slice('--title='.length);
      if (!title) {
        throw new Error('Missing value for --title=');
      }
      continue;
    }

    if (token === '--github-output') {
      githubOutputPath = readValue('--github-output', index);
      index += 1;
      continue;
    }

    if (token.startsWith('--github-output=')) {
      githubOutputPath = token.slice('--github-output='.length);
      if (!githubOutputPath) {
        throw new Error('Missing value for --github-output=');
      }
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return {
    baseSha,
    changedPaths,
    githubOutputPath,
    headSha,
    markdownOutputPath,
    outputPath,
    title,
  };
};

try {
  const parsed = parseCliArgs(process.argv);
  if (parsed.help) {
    process.stdout.write(`${usage}\n`);
    process.exit(0);
  }
  classifyWebE2EChanges(parsed);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
