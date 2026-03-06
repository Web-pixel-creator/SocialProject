import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'production-launch-gate-critical-config.mjs',
);

describe('production launch-gate critical config', () => {
  test('resolves candidate snapshot with env precedence and validates derived values', () => {
    const result = runInlineModuleScript<{
      error: string;
      ok: boolean;
      result: {
        candidate: Record<string, unknown>;
        validated: Record<string, unknown>;
      } | null;
    }>(`
      import {
        resolveProductionLaunchGateCriticalConfigCandidateSnapshot,
        validateProductionLaunchGateCriticalConfigSnapshot,
      } from ${JSON.stringify(helperModuleHref)};
      process.env.RELEASE_SANDBOX_EXECUTION_EGRESS_PROFILES =
        '{"ai_runtime_dry_run":"strict-egress","*":"fallback-egress"}';
      process.env.RELEASE_SANDBOX_EXECUTION_EGRESS_ENFORCE = 'true';
      process.env.RELEASE_SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES =
        '{"*":"runtime-default"}';
      process.env.RELEASE_SANDBOX_EXECUTION_LIMITS_ENFORCE = '1';
      process.env.RELEASE_SANDBOX_EXECUTION_ENABLED = 'yes';
      const candidate =
        resolveProductionLaunchGateCriticalConfigCandidateSnapshot({
          SANDBOX_EXECUTION_ENABLED: 'false',
          SANDBOX_EXECUTION_EGRESS_ENFORCE: 'false',
        });
      const validated =
        validateProductionLaunchGateCriticalConfigSnapshot(candidate);
      process.stdout.write(
        JSON.stringify({
          ok: true,
          result: { candidate, validated },
          error: '',
        }),
      );
    `);

    expect(result.output.status).toBe(0);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.result?.candidate).toMatchObject({
      sandboxExecutionEnabledConfig: {
        source: 'RELEASE_SANDBOX_EXECUTION_ENABLED',
        value: 'yes',
      },
    });
    expect(result.payload.result?.validated).toMatchObject({
      runtimeDryRunEgressProfile: 'strict-egress',
      runtimeDryRunExpectedMode: 'sandbox_enabled',
      runtimeDryRunLimitProfile: 'runtime-default',
      sandboxExecutionEgressEnforceConfig: {
        source: 'RELEASE_SANDBOX_EXECUTION_EGRESS_ENFORCE',
        value: true,
      },
      sandboxExecutionLimitsEnforceConfig: {
        source: 'RELEASE_SANDBOX_EXECUTION_LIMITS_ENFORCE',
        value: true,
      },
    });
  });

  test('rejects invalid boolean values during validation', () => {
    const result = runInlineModuleScript<{
      error: string;
      ok: boolean;
      result: null;
    }>(`
      import { validateProductionLaunchGateCriticalConfigSnapshot } from ${JSON.stringify(
        helperModuleHref,
      )};
      try {
        validateProductionLaunchGateCriticalConfigSnapshot({
          sandboxExecutionEgressProfilesConfig: {
            source: 'RELEASE_SANDBOX_EXECUTION_EGRESS_PROFILES',
            value: '{"*":"baseline"}',
          },
          sandboxExecutionEgressEnforceConfig: {
            source: 'RELEASE_SANDBOX_EXECUTION_EGRESS_ENFORCE',
            value: 'true',
          },
          sandboxExecutionOperationLimitProfilesConfig: {
            source: 'RELEASE_SANDBOX_EXECUTION_OPERATION_LIMIT_PROFILES',
            value: '{"*":"baseline"}',
          },
          sandboxExecutionLimitsEnforceConfig: {
            source: 'RELEASE_SANDBOX_EXECUTION_LIMITS_ENFORCE',
            value: 'true',
          },
          sandboxExecutionEnabledConfig: {
            source: 'RELEASE_SANDBOX_EXECUTION_ENABLED',
            value: 'maybe',
          },
        });
        process.stdout.write(JSON.stringify({ ok: true, result: null, error: '' }));
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
    `);

    expect(result.output.status).toBe(1);
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toContain(
      'Invalid value for RELEASE_SANDBOX_EXECUTION_ENABLED: maybe',
    );
  });
});
