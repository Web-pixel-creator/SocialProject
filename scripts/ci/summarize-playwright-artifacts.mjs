#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import core from './summarize-playwright-artifacts-core.js';

const {
  DEFAULT_PLAYWRIGHT_ARTIFACT_SUMMARY_TITLE,
  collectPlaywrightArtifactPathStats,
  renderPlaywrightArtifactSummaryMarkdown,
  summarizePlaywrightArtifacts,
} = core;

export {
  collectPlaywrightArtifactPathStats,
  renderPlaywrightArtifactSummaryMarkdown,
  summarizePlaywrightArtifacts,
};

const usage = `Usage: node scripts/ci/summarize-playwright-artifacts.mjs --report-path <path> --output <summary.json> [options]

Options:
  --report-path <path>          Playwright HTML report directory or file
  --results-path <path>         Playwright results directory or file
  --output <summary.json>       JSON summary output path
  --markdown-output <summary.md>
                                optional Markdown summary output path
  --title <text>                summary title (default: ${DEFAULT_PLAYWRIGHT_ARTIFACT_SUMMARY_TITLE})
  -h, --help                    print usage
`;

const parseCliArgs = (argv) => {
  const cliArgs = argv.slice(2);
  let reportPath = null;
  let resultsPath = null;
  let outputPath = null;
  let markdownOutputPath = null;
  let title = DEFAULT_PLAYWRIGHT_ARTIFACT_SUMMARY_TITLE;

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

    if (token === '--report-path') {
      reportPath = readValue('--report-path', index);
      index += 1;
      continue;
    }

    if (token.startsWith('--report-path=')) {
      reportPath = token.slice('--report-path='.length);
      if (!reportPath) {
        throw new Error('Missing value for --report-path=');
      }
      continue;
    }

    if (token === '--results-path') {
      resultsPath = readValue('--results-path', index);
      index += 1;
      continue;
    }

    if (token.startsWith('--results-path=')) {
      resultsPath = token.slice('--results-path='.length);
      if (!resultsPath) {
        throw new Error('Missing value for --results-path=');
      }
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

    throw new Error(`Unknown argument: ${token}`);
  }

  return {
    markdownOutputPath,
    outputPath,
    reportPath,
    resultsPath,
    title,
  };
};

const maybeRunCli = () => {
  try {
    const parsed = parseCliArgs(process.argv);
    if (parsed.help) {
      process.stdout.write(`${usage}\n`);
      return;
    }
    summarizePlaywrightArtifacts(parsed);
  } catch (error) {
    if (error instanceof Error && error.message === 'Both reportPath and outputPath are required') {
      process.stderr.write(`${usage}\n`);
      process.exit(1);
    }

    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
};

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  maybeRunCli();
}
