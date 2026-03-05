import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const moduleHref = pathToFileURL(
  path.join(
    projectRoot,
    'scripts',
    'release',
    'release-runbook-snippet-utils.mjs',
  ),
).href;

interface ModuleActionResult<T> {
  error: string;
  ok: boolean;
  result: T;
}

const runSnippetUtils = (input: unknown) => {
  const script = `
    import {
      dedent,
      extractTextFencedSnippetAfterMarker,
      normalizeLineEndings,
    } from ${JSON.stringify(moduleHref)};
    const input = ${JSON.stringify(input)};
    try {
      const normalized = normalizeLineEndings(String(input.markdown || ''));
      const dedented = dedent(String(input.dedentInput || ''));
      const extracted = extractTextFencedSnippetAfterMarker({
        markdown: normalized,
        marker: String(input.marker || ''),
      });
      process.stdout.write(
        JSON.stringify({
          ok: true,
          result: { dedented, extracted, normalized },
          error: '',
        }),
      );
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
  const payload = JSON.parse(output.stdout) as ModuleActionResult<{
    dedented: string;
    extracted: string;
    normalized: string;
  }>;
  return {
    output,
    payload,
  };
};

describe('release runbook snippet utils', () => {
  test('normalizes CRLF and extracts dedented text fenced snippet after marker', () => {
    const result = runSnippetUtils({
      dedentInput: '    line-1\n      line-2',
      marker: 'Marker line',
      markdown:
        'before\r\nMarker line\r\n```text\r\n    alpha\r\n      beta\r\n```\r\nafter\r\n',
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result.normalized).toContain('before\nMarker line');
    expect(result.payload.result.dedented).toBe('line-1\n  line-2');
    expect(result.payload.result.extracted).toBe('alpha\n  beta');
  });

  test('returns empty string when marker is missing', () => {
    const result = runSnippetUtils({
      dedentInput: '',
      marker: 'missing-marker',
      markdown: '```text\nexample\n```',
    });

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result.extracted).toBe('');
  });
});
