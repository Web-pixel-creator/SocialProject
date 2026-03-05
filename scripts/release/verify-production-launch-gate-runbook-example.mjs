import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildProductionLaunchGateFailureLines } from './production-launch-gate-failure-output-format.mjs';

const RUNBOOK_SNIPPET_MARKER =
  'Example non-JSON failure snippet (generated from fixture `docs/ops/examples/production-launch-gate-non-json-failure-example.json`):';
const FIXTURE_PATH = path.resolve(
  'docs',
  'ops',
  'examples',
  'production-launch-gate-non-json-failure-example.json',
);
const RUNBOOK_PATH = path.resolve('docs', 'ops', 'release-runbook.md');

const normalizeLineEndings = (value) => value.replace(/\r\n/gu, '\n');

const dedent = (value) => {
  const lines = value.split('\n');
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) {
    return value;
  }
  const minIndent = nonEmpty.reduce((current, line) => {
    const match = line.match(/^ */u);
    const indent = match ? match[0].length : 0;
    return Math.min(current, indent);
  }, Number.POSITIVE_INFINITY);
  return lines.map((line) => line.slice(minIndent)).join('\n');
};

const extractRunbookSnippet = (runbookMarkdown) => {
  const markerIndex = runbookMarkdown.indexOf(RUNBOOK_SNIPPET_MARKER);
  if (markerIndex < 0) {
    return '';
  }
  const trailing = runbookMarkdown.slice(markerIndex);
  const match = trailing.match(/```text\n([\s\S]*?)\n\s*```/u);
  return match ? dedent(match[1]).trim() : '';
};

const main = async () => {
  const fixtureRaw = await readFile(FIXTURE_PATH, 'utf8');
  const fixture = JSON.parse(fixtureRaw);
  const runbook = normalizeLineEndings(await readFile(RUNBOOK_PATH, 'utf8'));
  const expectedSnippet = [
    'Production launch gate: FAIL',
    ...buildProductionLaunchGateFailureLines(fixture),
  ].join('\n');
  const actualSnippet = extractRunbookSnippet(runbook);

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
