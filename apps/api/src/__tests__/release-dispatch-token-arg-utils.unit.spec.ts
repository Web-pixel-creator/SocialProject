import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'dispatch-token-arg-utils.mjs',
);

const runHelperScenario = (scriptBody: string) =>
  runInlineModuleScript<{
    error: string;
    ok: boolean;
    result: unknown;
  }>(`
    import {
      assertDispatchTokenNotPlaceholder,
      parseDispatchTokenCliArg,
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

describe('release dispatch token cli arg utils', () => {
  test('parses token value from flag aliases with next argument', () => {
    const result = runHelperScenario(`
      const output = ['--token', '--Token', '-Token', '-token'].map((flag) =>
        parseDispatchTokenCliArg({
          arg: flag,
          argv: [flag, ' token-value '],
          index: 0,
          usage: 'usage-doc',
        }),
      );
      emit({ ok: true, result: output, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual([
      { matched: true, nextIndex: 1, tokenFromArg: 'token-value' },
      { matched: true, nextIndex: 1, tokenFromArg: 'token-value' },
      { matched: true, nextIndex: 1, tokenFromArg: 'token-value' },
      { matched: true, nextIndex: 1, tokenFromArg: 'token-value' },
    ]);
  });

  test('parses token value from inline aliases', () => {
    const result = runHelperScenario(`
      const output = ['--token=', '--Token=', '-Token=', '-token='].map((prefix) =>
        parseDispatchTokenCliArg({
          arg: \`\${prefix}token-value\`,
          argv: [],
          index: 0,
          usage: 'usage-doc',
        }),
      );
      emit({ ok: true, result: output, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual([
      { matched: true, nextIndex: 0, tokenFromArg: 'token-value' },
      { matched: true, nextIndex: 0, tokenFromArg: 'token-value' },
      { matched: true, nextIndex: 0, tokenFromArg: 'token-value' },
      { matched: true, nextIndex: 0, tokenFromArg: 'token-value' },
    ]);
  });

  test('throws usage error when token flag value is missing', () => {
    const result = runHelperScenario(`
      parseDispatchTokenCliArg({
        arg: '--token',
        argv: ['--token'],
        index: 0,
        usage: 'usage-doc',
      });
      emit({ ok: true, result: null, error: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain('Missing value for --token');
    expect(result.payload.error).toContain('usage-doc');
  });

  test('throws usage error when inline token value is empty', () => {
    const result = runHelperScenario(`
      parseDispatchTokenCliArg({
        arg: '--Token=',
        argv: [],
        index: 0,
        usage: 'usage-doc',
      });
      emit({ ok: true, result: null, error: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain('Missing value for --Token=');
    expect(result.payload.error).toContain('usage-doc');
  });

  test('returns unmatched sentinel for non-token argument', () => {
    const result = runHelperScenario(`
      const value = parseDispatchTokenCliArg({
        arg: '--runtime-draft-id',
        argv: ['--runtime-draft-id', 'x'],
        index: 0,
        usage: 'usage-doc',
      });
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual({
      matched: false,
      nextIndex: 0,
      tokenFromArg: '',
    });
  });

  test('rejects placeholder token values', () => {
    const result = runHelperScenario(`
      assertDispatchTokenNotPlaceholder('<YOUR_TOKEN>');
      emit({ ok: true, result: null, error: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain(
      'Token argument looks like a placeholder',
    );
  });

  test('accepts non-placeholder token values', () => {
    const result = runHelperScenario(`
      assertDispatchTokenNotPlaceholder('ghp_validToken123');
      emit({ ok: true, result: 'ok', error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toBe('ok');
  });
});
