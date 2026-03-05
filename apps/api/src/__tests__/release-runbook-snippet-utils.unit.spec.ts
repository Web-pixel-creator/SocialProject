import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const moduleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'release-runbook-snippet-utils.mjs',
);

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
  return runInlineModuleScript<{
    dedented: string;
    extracted: string;
    normalized: string;
  }>(script);
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
