import {
  parseSandboxExecutionLimitProfileMap,
  parseSandboxExecutionOperationLimitProfileMap,
  resolveSandboxExecutionLimitProfile,
  resolveSandboxExecutionOperationLimitProfile,
} from '../services/sandboxExecution/limitsProfile';

describe('sandbox execution limit profiles', () => {
  test('parses operation-to-limit-profile map with wildcard fallback', () => {
    const map = parseSandboxExecutionOperationLimitProfileMap(
      JSON.stringify({
        ai_runtime_dry_run: 'runtime_default',
        '*': 'global_default',
      }),
    );

    expect(
      resolveSandboxExecutionOperationLimitProfile(map, 'ai_runtime_dry_run'),
    ).toBe('runtime_default');
    expect(
      resolveSandboxExecutionOperationLimitProfile(map, 'unknown_operation'),
    ).toBe('global_default');
  });

  test('parses limit profiles and resolves normalized identifiers', () => {
    const profiles = parseSandboxExecutionLimitProfileMap(
      JSON.stringify({
        RUNTIME_DEFAULT: {
          timeoutMs: 12_000,
          ttlSeconds: 900,
          maxArtifactBytes: 5_000_000,
        },
      }),
    );

    expect(
      resolveSandboxExecutionLimitProfile(profiles, 'runtime_default'),
    ).toEqual({
      timeoutMs: 12_000,
      ttlSeconds: 900,
      maxArtifactBytes: 5_000_000,
    });
  });

  test('throws on malformed operation profile map payload', () => {
    expect(() => parseSandboxExecutionOperationLimitProfileMap('{')).toThrow(
      /operation_limit_profiles/i,
    );
    expect(() =>
      parseSandboxExecutionOperationLimitProfileMap(
        JSON.stringify({ ai_runtime_dry_run: 42 }),
      ),
    ).toThrow(/must map to a profile string/i);
    expect(() =>
      parseSandboxExecutionOperationLimitProfileMap(
        JSON.stringify({ 'bad operation': 'runtime_default' }),
      ),
    ).toThrow(/invalid operation identifier/i);
  });

  test('throws on malformed limit profiles payload', () => {
    expect(() => parseSandboxExecutionLimitProfileMap('{')).toThrow(
      /limit_profiles/i,
    );
    expect(() =>
      parseSandboxExecutionLimitProfileMap(
        JSON.stringify({
          runtime_default: [],
        }),
      ),
    ).toThrow(/must map to an object/i);
    expect(() =>
      parseSandboxExecutionLimitProfileMap(
        JSON.stringify({
          runtime_default: {
            timeoutMs: '12000',
          },
        }),
      ),
    ).toThrow(/must be a number/i);
    expect(() =>
      parseSandboxExecutionLimitProfileMap(
        JSON.stringify({
          runtime_default: {
            timeoutMs: 99,
          },
        }),
      ),
    ).toThrow(/must be between/i);
    expect(() =>
      parseSandboxExecutionLimitProfileMap(
        JSON.stringify({
          runtime_default: {
            timeoutMs: 12_000,
            unsupportedField: 1,
          },
        }),
      ),
    ).toThrow(/unsupported fields/i);
  });
});
