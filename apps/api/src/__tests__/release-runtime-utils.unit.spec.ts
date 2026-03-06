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
    import {
      decodeTextWithEncodingFallback,
      isTransientFileReadError,
      parseJsonWithEncodingFallback,
      retryFileReadOperation,
      sleep,
      toErrorMessage,
    } from ${JSON.stringify(helperModuleHref)};
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

  test('decodes UTF-8 BOM and UTF-16 LE buffers before JSON parsing', () => {
    const result = runHelperScenario(`
      const utf8Bom = Buffer.from('\\uFEFF{"status":"pass","count":1}', 'utf8');
      const utf16Bom = Buffer.from('\\uFEFF{"status":"pass","count":2}', 'utf16le');
      const value = {
        utf8Raw: decodeTextWithEncodingFallback(utf8Bom),
        utf16Payload: parseJsonWithEncodingFallback(utf16Bom),
      };
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual({
      utf8Raw: '{"status":"pass","count":1}',
      utf16Payload: { status: 'pass', count: 2 },
    });
  });

  test('retries transient file read errors before succeeding', () => {
    const result = runHelperScenario(`
      let attempts = 0;
      const value = await retryFileReadOperation(async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error('busy');
          error.code = attempts === 1 ? 'EBUSY' : 'EPERM';
          throw error;
        }
        return Buffer.from('ready', 'utf8');
      }, { delayMs: 1, maxAttempts: 4 });

      emit({
        ok: true,
        result: {
          attempts,
          isBusyTransient: isTransientFileReadError({ code: 'EBUSY' }),
          isPermTransient: isTransientFileReadError({ code: 'EPERM' }),
          isMissingTransient: isTransientFileReadError({ code: 'ENOENT' }),
          value: value.toString('utf8'),
        },
        error: '',
      });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual({
      attempts: 3,
      isBusyTransient: true,
      isPermTransient: true,
      isMissingTransient: false,
      value: 'ready',
    });
  });
});
