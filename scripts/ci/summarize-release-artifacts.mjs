#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import core from './summarize-release-artifacts-core.js';

const {
  DEFAULT_RELEASE_ARTIFACT_SUMMARY_TITLE,
  collectArtifactPathStats,
  renderReleaseArtifactSummaryMarkdown,
  summarizeReleaseArtifacts,
} = core;

export {
  collectArtifactPathStats,
  renderReleaseArtifactSummaryMarkdown,
  summarizeReleaseArtifacts,
};

const usage = `Usage: node scripts/ci/summarize-release-artifacts.mjs --output <summary.json> --artifact-name <name> --artifact-path <path> [options]

Options:
  --artifact-name <name>        Artifact display name (repeatable, pair with --artifact-path)
  --artifact-path <path>        Artifact path or directory (repeatable, pair with --artifact-name)
  --output <summary.json>       JSON summary output path
  --markdown-output <summary.md>
                                optional Markdown summary output path
  --title <text>                summary title (default: ${DEFAULT_RELEASE_ARTIFACT_SUMMARY_TITLE})
  -h, --help                    print usage
`;

const parseCliArgs = (argv) => {
  const cliArgs = argv.slice(2);
  const artifactNames = [];
  const artifactPaths = [];
  let outputPath = null;
  let markdownOutputPath = null;
  let title = DEFAULT_RELEASE_ARTIFACT_SUMMARY_TITLE;

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

    if (token === '--artifact-name') {
      artifactNames.push(readValue('--artifact-name', index));
      index += 1;
      continue;
    }

    if (token.startsWith('--artifact-name=')) {
      const value = token.slice('--artifact-name='.length);
      if (!value) {
        throw new Error('Missing value for --artifact-name=');
      }
      artifactNames.push(value);
      continue;
    }

    if (token === '--artifact-path') {
      artifactPaths.push(readValue('--artifact-path', index));
      index += 1;
      continue;
    }

    if (token.startsWith('--artifact-path=')) {
      const value = token.slice('--artifact-path='.length);
      if (!value) {
        throw new Error('Missing value for --artifact-path=');
      }
      artifactPaths.push(value);
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

  if (artifactNames.length !== artifactPaths.length) {
    throw new Error('Artifact names and artifact paths must be provided in matching counts');
  }

  return {
    artifacts: artifactNames.map((name, index) => ({
      name,
      path: artifactPaths[index],
    })),
    markdownOutputPath,
    outputPath,
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
    summarizeReleaseArtifacts(parsed);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'At least one artifact and outputPath are required' ||
        error.message === 'Artifact names and artifact paths must be provided in matching counts')
    ) {
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
