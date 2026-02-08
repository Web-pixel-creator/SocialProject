import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RETRY_SCHEMA_SAMPLE_FIXTURES,
  stringifyRetrySchemaFixture,
} from './retry-schema-sample-fixtures.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const normalizeLineEndings = (value) => value.replace(/\r\n/gu, '\n');

const parseArguments = (argv) => {
  const options = {
    check: false,
  };

  for (const arg of argv) {
    if (arg === '--check') {
      options.check = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: npm run release:smoke:retry:schema:samples:generate [-- --check]\n',
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
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

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.check) {
    await checkFixtures();
    return;
  }
  await writeFixtures();
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
