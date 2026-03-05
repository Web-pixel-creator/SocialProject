import { readFileSync } from 'node:fs';
import {
  resolveProjectModuleHref,
  resolveProjectPath,
  runInlineModuleScript,
} from './module-runner.util';

const formatterModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'production-launch-gate-failure-output-format.mjs',
);
const snippetUtilsModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'release-runbook-snippet-utils.mjs',
);
const fixturePath = resolveProjectPath(
  'docs',
  'ops',
  'examples',
  'production-launch-gate-non-json-failure-example.json',
);
const runbookPath = resolveProjectPath('docs', 'ops', 'release-runbook.md');
const runbookSnippetMarker =
  'Example non-JSON failure snippet (generated from fixture `docs/ops/examples/production-launch-gate-non-json-failure-example.json`):';

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
  return runInlineModuleScript<string[]>(script);
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
  return runInlineModuleScript<string>(script);
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
