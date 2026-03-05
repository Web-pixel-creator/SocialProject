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
const snippetUtilsModuleHref = pathToFileURL(
  path.join(
    projectRoot,
    'scripts',
    'release',
    'release-runbook-snippet-utils.mjs',
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

const runExtractRunbookSnippet = (runbookMarkdown: string) => {
  const script = `
    import { extractTextFencedSnippetAfterMarker, normalizeLineEndings } from ${JSON.stringify(snippetUtilsModuleHref)};
    const runbook = ${JSON.stringify(runbookMarkdown)};
    const marker = ${JSON.stringify(runbookSnippetMarker)};
    try {
      const normalized = normalizeLineEndings(runbook);
      const snippet = extractTextFencedSnippetAfterMarker({ markdown: normalized, marker });
      process.stdout.write(JSON.stringify({ ok: true, result: snippet, error: '' }));
    } catch (error) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          result: '',
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
  const payload = JSON.parse(output.stdout) as ModuleActionResult<string>;
  return {
    output,
    payload,
  };
};

describe('production launch-gate runbook failure snippet', () => {
  test('stays synchronized with formatter output from fixture payload', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<
      string,
      unknown
    >;
    const formatterResult = runBuildFailureLines(fixture);
    const runbook = readFileSync(runbookPath, 'utf8');
    const snippetResult = runExtractRunbookSnippet(runbook);

    expect(formatterResult.output.status).toBe(0);
    expect(formatterResult.payload.ok).toBe(true);
    expect(snippetResult.output.status).toBe(0);
    expect(snippetResult.payload.ok).toBe(true);
    const expectedSnippet = [
      'Production launch gate: FAIL',
      ...formatterResult.payload.result,
    ].join('\n');

    expect(snippetResult.payload.result).toBe(expectedSnippet);
  });
});
