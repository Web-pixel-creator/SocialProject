import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const formatterModuleHref = pathToFileURL(
  path.join(
    projectRoot,
    'scripts',
    'release',
    'production-launch-gate-failure-output-format.mjs',
  ),
).href;
const fixturePath = path.join(
  projectRoot,
  'docs',
  'ops',
  'examples',
  'production-launch-gate-non-json-failure-example.json',
);
const runbookPath = path.join(projectRoot, 'docs', 'ops', 'release-runbook.md');
const runbookSnippetMarker =
  'Example non-JSON failure snippet (generated from fixture `docs/ops/examples/production-launch-gate-non-json-failure-example.json`):';

interface ModuleActionResult<T> {
  error: string;
  ok: boolean;
  result: T;
}

const runBuildFailureLines = (input: unknown) => {
  const script = `
    import { buildProductionLaunchGateFailureLines } from ${JSON.stringify(formatterModuleHref)};
    const input = ${JSON.stringify(input)};
    try {
      const result = buildProductionLaunchGateFailureLines(input);
      process.stdout.write(JSON.stringify({ ok: true, result, error: '' }));
    } catch (error) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      process.exitCode = 1;
    }
  `;
  const output = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );
  const payload = JSON.parse(output.stdout) as ModuleActionResult<string[]>;
  return {
    output,
    payload,
  };
};

const normalizeLineEndings = (value: string) => value.replace(/\r\n/gu, '\n');

const dedent = (value: string) => {
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

const extractRunbookSnippet = (runbookMarkdown: string) => {
  const markerIndex = runbookMarkdown.indexOf(runbookSnippetMarker);
  if (markerIndex < 0) {
    return '';
  }
  const trailing = runbookMarkdown.slice(markerIndex);
  const match = trailing.match(/```text\n([\s\S]*?)\n\s*```/u);
  return match ? dedent(match[1]).trim() : '';
};

describe('production launch-gate runbook failure snippet', () => {
  test('stays synchronized with formatter output from fixture payload', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<
      string,
      unknown
    >;
    const formatterResult = runBuildFailureLines(fixture);
    const runbook = normalizeLineEndings(readFileSync(runbookPath, 'utf8'));

    expect(formatterResult.output.status).toBe(0);
    expect(formatterResult.payload.ok).toBe(true);
    const expectedSnippet = [
      'Production launch gate: FAIL',
      ...formatterResult.payload.result,
    ].join('\n');

    expect(extractRunbookSnippet(runbook)).toBe(expectedSnippet);
  });
});
