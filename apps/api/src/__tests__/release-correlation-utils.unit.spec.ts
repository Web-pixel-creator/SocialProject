import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'release-correlation-utils.mjs',
);

const runHelperScenario = (scriptBody: string) =>
  runInlineModuleScript<{
    error: string;
    ok: boolean;
    result: unknown;
  }>(`
    import {
      createReleaseCorrelationContext,
      normalizeReleaseCorrelationContext,
      normalizeReleaseCorrelationValue,
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

describe('release correlation utils', () => {
  test('creates bounded release correlation context', () => {
    const result = runHelperScenario(`
      const value = createReleaseCorrelationContext({
        scope: 'production-launch-gate',
        seedDate: new Date('2026-03-05T19:00:00.000Z'),
      });
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toMatchObject({
      releaseRunId: expect.stringMatching(
        /^rel\.production-launch-gate\.20260305190000\.[a-z0-9]{10}$/,
      ),
      correlationId: expect.stringMatching(
        /^rel\.production-launch-gate\.20260305190000\.[a-z0-9]{10}\.corr$/,
      ),
      auditSessionId: expect.stringMatching(
        /^rel\.production-launch-gate\.20260305190000\.[a-z0-9]{10}\.audit$/,
      ),
    });
  });

  test('normalizes valid correlation context to lowercase', () => {
    const result = runHelperScenario(`
      const value = normalizeReleaseCorrelationContext({
        auditSessionId: 'REL.RUN.AUDIT',
        correlationId: 'REL.RUN.CORR',
        releaseRunId: 'REL.RUN',
      });
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result).toEqual({
      auditSessionId: 'rel.run.audit',
      correlationId: 'rel.run.corr',
      releaseRunId: 'rel.run',
    });
  });

  test('rejects invalid correlation identifiers', () => {
    const result = runHelperScenario(`
      const value = normalizeReleaseCorrelationValue('bad value', {
        allowNull: false,
        fieldName: 'correlationId',
      });
      emit({ ok: true, result: value, error: '' });
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain('correlationId');
  });
});
