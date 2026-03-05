import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildProductionLaunchGateFailureLines } from './production-launch-gate-failure-output-format.mjs';
import {
  extractTextFencedSnippetAfterMarker,
  normalizeLineEndings,
} from './release-runbook-snippet-utils.mjs';

const RUNBOOK_SNIPPET_MARKER =
  'Example non-JSON failure snippet (generated from fixture `docs/ops/examples/production-launch-gate-non-json-failure-example.json`):';
const FIXTURE_PATH = path.resolve(
  'docs',
  'ops',
  'examples',
  'production-launch-gate-non-json-failure-example.json',
);
const RUNBOOK_PATH = path.resolve('docs', 'ops', 'release-runbook.md');

const main = async () => {
  const fixtureRaw = await readFile(FIXTURE_PATH, 'utf8');
  const fixture = JSON.parse(fixtureRaw);
  const runbook = normalizeLineEndings(await readFile(RUNBOOK_PATH, 'utf8'));
  const expectedSnippet = [
    'Production launch gate: FAIL',
    ...buildProductionLaunchGateFailureLines(fixture),
  ].join('\n');
  const actualSnippet = extractTextFencedSnippetAfterMarker({
    markdown: runbook,
    marker: RUNBOOK_SNIPPET_MARKER,
  });

  if (!actualSnippet) {
    throw new Error(
      `Runbook snippet marker/code block not found.\nMarker: ${RUNBOOK_SNIPPET_MARKER}\nFixture: ${FIXTURE_PATH}\nRunbook: ${RUNBOOK_PATH}`,
    );
  }
  if (actualSnippet !== expectedSnippet) {
    throw new Error(
      `Runbook snippet mismatch.\nFixture: ${FIXTURE_PATH}\nRunbook: ${RUNBOOK_PATH}\n\nExpected:\n${expectedSnippet}\n\nActual:\n${actualSnippet}\n\nHint: update the runbook snippet to match formatter output from fixture, then rerun: npm run release:runbook:failure-snippet:check`,
    );
  }

  process.stdout.write(
    `Runbook snippet parity check passed: ${path.relative(process.cwd(), RUNBOOK_PATH)}\n`,
  );
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
