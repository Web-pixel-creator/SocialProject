import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH,
  RETRY_PREVIEW_SELECTION_JSON_SCHEMA_VERSION,
} from './retry-json-schema-contracts.mjs';
import {
  RETRY_SCHEMA_SAMPLE_FIXTURES,
  stringifyRetrySchemaFixture,
} from './retry-schema-sample-fixtures.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const normalizeLineEndings = (value) => value.replace(/\r\n/gu, '\n');
const normalizePreviewToken = (value) => value.trim().toLowerCase();
const normalizePreviewPathToken = (value) =>
  normalizePreviewToken(value).replaceAll('\\', '/');

const toPreviewSlug = (value) =>
  normalizePreviewToken(value)
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');

const buildPreviewAliases = (fixture) => {
  const aliases = [
    normalizePreviewToken(fixture.label),
    toPreviewSlug(fixture.label),
    normalizePreviewToken(fixture.samplePath),
    normalizePreviewToken(path.basename(fixture.samplePath)),
  ];

  return [...new Set(aliases.filter((alias) => alias.length > 0))];
};

const buildPreviewFileAliases = (fixture) => {
  const aliases = [
    normalizePreviewPathToken(fixture.samplePath),
    normalizePreviewPathToken(path.basename(fixture.samplePath)),
  ];

  return [...new Set(aliases.filter((alias) => alias.length > 0))];
};

const parseArguments = (argv) => {
  const options = {
    check: false,
    preview: false,
    previewLabels: [],
    previewFiles: [],
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv.at(index);
    if (arg === undefined) {
      continue;
    }
    if (arg === '--check') {
      options.check = true;
      continue;
    }
    if (arg === '--preview') {
      options.preview = true;
      continue;
    }
    if (arg.startsWith('--preview=')) {
      const previewLabel = arg.slice('--preview='.length).trim();
      if (previewLabel.length === 0) {
        throw new Error(
          'Argument --preview=<label> requires a non-empty label value.',
        );
      }
      options.preview = true;
      options.previewLabels.push(previewLabel);
      continue;
    }
    if (arg === '--preview-file') {
      const previewFile = argv.at(index + 1)?.trim() ?? '';
      if (previewFile.length === 0) {
        throw new Error(
          'Argument --preview-file requires a non-empty file path value.',
        );
      }
      options.preview = true;
      options.previewFiles.push(previewFile);
      index += 1;
      continue;
    }
    if (arg.startsWith('--preview-file=')) {
      const previewFile = arg.slice('--preview-file='.length).trim();
      if (previewFile.length === 0) {
        throw new Error(
          'Argument --preview-file=<path> requires a non-empty file path value.',
        );
      }
      options.preview = true;
      options.previewFiles.push(previewFile);
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: npm run release:smoke:retry:schema:samples:generate [-- --check|--preview|--preview=<label> [--preview=<label> ...]|--preview-file=<path> [--preview-file=<path> ...]|--json]\n',
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.check && options.preview) {
    throw new Error('Arguments --check and --preview cannot be used together.');
  }
  if (options.json && !options.preview) {
    throw new Error(
      'Argument --json can only be used together with preview mode (--preview, --preview=<label>, or --preview-file=<path>).',
    );
  }

  return options;
};

const resolvePath = (relativePath) => path.join(projectRoot, relativePath);

const checkFixtures = async () => {
  const mismatches = [];
  for (const fixture of RETRY_SCHEMA_SAMPLE_FIXTURES) {
    const filePath = resolvePath(fixture.samplePath);
    const expected = stringifyRetrySchemaFixture(fixture.payload);
    let actual;
    try {
      actual = await readFile(filePath, 'utf8');
    } catch (error) {
      const typedError = error;
      if (typedError?.code === 'ENOENT') {
        mismatches.push(`${fixture.samplePath}: file does not exist`);
        continue;
      }
      throw error;
    }

    if (normalizeLineEndings(actual) !== normalizeLineEndings(expected)) {
      mismatches.push(`${fixture.samplePath}: file content is out of date`);
    }
  }

  if (mismatches.length > 0) {
    process.stderr.write('Retry schema sample fixtures are out of sync:\n');
    for (const mismatch of mismatches) {
      process.stderr.write(`- ${mismatch}\n`);
    }
    process.stderr.write(
      'Run `npm run release:smoke:retry:schema:samples:generate` to regenerate fixtures.\n',
    );
    process.exit(1);
  }

  process.stdout.write(
    `Retry schema sample fixtures are up to date (${RETRY_SCHEMA_SAMPLE_FIXTURES.length} files).\n`,
  );
};

const writeFixtures = async () => {
  for (const fixture of RETRY_SCHEMA_SAMPLE_FIXTURES) {
    const filePath = resolvePath(fixture.samplePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, stringifyRetrySchemaFixture(fixture.payload), 'utf8');
    process.stdout.write(`Generated: ${fixture.samplePath}\n`);
  }
  process.stdout.write(
    `Generated ${RETRY_SCHEMA_SAMPLE_FIXTURES.length} retry schema sample fixtures.\n`,
  );
};

const formatAvailablePreviewLabels = () =>
  RETRY_SCHEMA_SAMPLE_FIXTURES.map((fixture) => {
    const slug = toPreviewSlug(fixture.label);
    return `${fixture.label} (slug: ${slug})`;
  }).join(', ');

const formatAvailablePreviewFiles = () =>
  RETRY_SCHEMA_SAMPLE_FIXTURES.map((fixture) => fixture.samplePath).join(', ');

const selectPreviewFixtures = ({ previewLabels, previewFiles }) => {
  if (previewLabels.length === 0 && previewFiles.length === 0) {
    return {
      matchedCount: RETRY_SCHEMA_SAMPLE_FIXTURES.length,
      selectedFixtures: RETRY_SCHEMA_SAMPLE_FIXTURES,
      unknownLabels: [],
      unknownFiles: [],
    };
  }

  const selectedFixtures = [];
  const selectedPaths = new Set();
  const unknownLabels = [];
  const unknownFiles = [];
  let matchedCount = 0;

  for (const previewLabel of previewLabels) {
    const normalizedPreviewLabel = normalizePreviewToken(previewLabel);
    const matchedFixtures = RETRY_SCHEMA_SAMPLE_FIXTURES.filter((fixture) =>
      buildPreviewAliases(fixture).includes(normalizedPreviewLabel),
    );
    if (matchedFixtures.length === 0) {
      unknownLabels.push(previewLabel);
      continue;
    }
    matchedCount += matchedFixtures.length;

    for (const fixture of matchedFixtures) {
      if (selectedPaths.has(fixture.samplePath)) {
        continue;
      }
      selectedPaths.add(fixture.samplePath);
      selectedFixtures.push(fixture);
    }
  }

  for (const previewFile of previewFiles) {
    const normalizedPreviewFile = normalizePreviewPathToken(previewFile);
    const matchedFixtures = RETRY_SCHEMA_SAMPLE_FIXTURES.filter((fixture) =>
      buildPreviewFileAliases(fixture).includes(normalizedPreviewFile),
    );
    if (matchedFixtures.length === 0) {
      unknownFiles.push(previewFile);
      continue;
    }
    matchedCount += matchedFixtures.length;

    for (const fixture of matchedFixtures) {
      if (selectedPaths.has(fixture.samplePath)) {
        continue;
      }
      selectedPaths.add(fixture.samplePath);
      selectedFixtures.push(fixture);
    }
  }

  return {
    matchedCount,
    selectedFixtures,
    unknownLabels,
    unknownFiles,
  };
};

const ensurePreviewSelectionIsKnown = ({ unknownLabels, unknownFiles }) => {
  if (unknownLabels.length > 0) {
    const unknownLabelSuffix = unknownLabels.length === 1 ? '' : 's';
    throw new Error(
      `Unknown preview label${unknownLabelSuffix}: ${unknownLabels.join(', ')}. Available labels: ${formatAvailablePreviewLabels()}.`,
    );
  }

  if (unknownFiles.length > 0) {
    const unknownFileSuffix = unknownFiles.length === 1 ? '' : 's';
    throw new Error(
      `Unknown preview file${unknownFileSuffix}: ${unknownFiles.join(', ')}. Available sample files: ${formatAvailablePreviewFiles()}.`,
    );
  }
};

const writePreviewSelectionJson = ({
  previewLabels,
  previewFiles,
  matchedCount,
  selectedFixtures,
  unknownLabels,
  unknownFiles,
}) => {
  const payload = {
    schemaPath: RETRY_PREVIEW_SELECTION_JSON_SCHEMA_PATH,
    schemaVersion: RETRY_PREVIEW_SELECTION_JSON_SCHEMA_VERSION,
    label: 'retry:schema:samples:preview-selection',
    mode: 'preview',
    filters: {
      labels: previewLabels,
      files: previewFiles,
    },
    totals: {
      available: RETRY_SCHEMA_SAMPLE_FIXTURES.length,
      matched: matchedCount,
      selected: selectedFixtures.length,
      deduped: Math.max(0, matchedCount - selectedFixtures.length),
    },
    unknown: {
      labels: unknownLabels,
      files: unknownFiles,
    },
    selected: selectedFixtures.map((fixture) => ({
      label: fixture.label,
      samplePath: fixture.samplePath,
      schemaPath: fixture.schemaPath,
    })),
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const previewFixtures = ({ previewLabels, previewFiles, json }) => {
  const selection = selectPreviewFixtures({
    previewLabels,
    previewFiles,
  });
  if (json) {
    writePreviewSelectionJson({
      previewLabels,
      previewFiles,
      matchedCount: selection.matchedCount,
      selectedFixtures: selection.selectedFixtures,
      unknownLabels: selection.unknownLabels,
      unknownFiles: selection.unknownFiles,
    });
    if (selection.unknownLabels.length > 0 || selection.unknownFiles.length > 0) {
      process.exit(1);
    }
    return;
  }

  ensurePreviewSelectionIsKnown({
    unknownLabels: selection.unknownLabels,
    unknownFiles: selection.unknownFiles,
  });

  const fixturesToPreview = selection.selectedFixtures;
  if (previewLabels.length > 0) {
    process.stdout.write(`Preview label filters: ${previewLabels.join(', ')}\n`);
  }
  if (previewFiles.length > 0) {
    process.stdout.write(`Preview file filters: ${previewFiles.join(', ')}\n`);
  }

  for (const fixture of fixturesToPreview) {
    process.stdout.write(`--- ${fixture.samplePath} (${fixture.label}) ---\n`);
    process.stdout.write(stringifyRetrySchemaFixture(fixture.payload));
  }

  const fixtureSuffix = fixturesToPreview.length === 1 ? '' : 's';
  process.stdout.write(
    `Previewed ${fixturesToPreview.length} retry schema sample fixture${fixtureSuffix}.\n`,
  );
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.check) {
    await checkFixtures();
    return;
  }
  if (options.preview) {
    previewFixtures({
      previewLabels: options.previewLabels,
      previewFiles: options.previewFiles,
      json: options.json,
    });
    return;
  }
  await writeFixtures();
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
