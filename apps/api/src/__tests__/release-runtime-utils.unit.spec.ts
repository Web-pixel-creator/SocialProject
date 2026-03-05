import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'release-runtime-utils.mjs',
);

const runHelperScenario = (scriptBody: string) =>
  runInlineModuleScript<{
    error: string;
    ok: boolean;
    result: unknown;
  }>(`
    import { sleep, toErrorMessage } from ${JSON.stringify(helperModuleHref)};
    const emit = (payload) => {
      process.stdout.write(JSON.stringify(payload));
    };
    try {
      ${scriptBody}
    } catch (error) {
      emit({
        ok: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
  `);

describe('release runtime utils', () => {
  test('normalizes unknown errors into strings', () => {
    const result = runHelperScenario(`
      const value = [
        toErrorMessage(new Error('boom')),
        toErrorMessage('plain-message'),
        toErrorMessage({ code: 500 }),
      ];
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual([
      'boom',
      'plain-message',
      '[object Object]',
    ]);
  });

  test('sleep resolves asynchronously', () => {
    const result = runHelperScenario(`
      const startedAt = Date.now();
      await sleep(5);
      const elapsedMs = Date.now() - startedAt;
      emit({ ok: true, result: { elapsedMs }, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(
      (result.payload.result as { elapsedMs: number }).elapsedMs,
    ).toBeGreaterThanOrEqual(0);
  });
});
