import {
  isSandboxExecutionProviderAllowed,
  parseSandboxExecutionEgressProfileMap,
  parseSandboxExecutionEgressProviderAllowlistMap,
  resolveSandboxExecutionEgressProfile,
  resolveSandboxExecutionEgressProviderAllowlist,
} from '../services/sandboxExecution/egressProfile';

describe('sandbox execution egress profiles', () => {
  test('parses operation-to-profile map with wildcard fallback', () => {
    const map = parseSandboxExecutionEgressProfileMap(
      JSON.stringify({
        ai_runtime_dry_run: 'openai_api',
        '*': 'internal_webhook',
      }),
    );

    expect(
      resolveSandboxExecutionEgressProfile(map, 'ai_runtime_dry_run'),
    ).toBe('openai_api');
    expect(resolveSandboxExecutionEgressProfile(map, 'live_session_tool')).toBe(
      'internal_webhook',
    );
  });

  test('normalizes operation and profile identifiers to lowercase', () => {
    const map = parseSandboxExecutionEgressProfileMap(
      JSON.stringify({
        AI_RUNTIME_DRY_RUN: 'OPENAI_API',
      }),
    );
    expect(
      resolveSandboxExecutionEgressProfile(map, 'ai_runtime_dry_run'),
    ).toBe('openai_api');
  });

  test('returns null when profile is not configured', () => {
    const map = parseSandboxExecutionEgressProfileMap(
      JSON.stringify({
        ai_runtime_dry_run: 'openai_api',
      }),
    );
    expect(resolveSandboxExecutionEgressProfile(map, 'unknown_operation')).toBe(
      null,
    );
  });

  test('throws on malformed or invalid payload', () => {
    expect(() => parseSandboxExecutionEgressProfileMap('{')).toThrow(
      /egress_profiles/i,
    );
    expect(() =>
      parseSandboxExecutionEgressProfileMap(
        JSON.stringify({ ai_runtime_dry_run: 42 }),
      ),
    ).toThrow(/must map to a profile string/i);
    expect(() =>
      parseSandboxExecutionEgressProfileMap(
        JSON.stringify({ 'bad operation': 'openai_api' }),
      ),
    ).toThrow(/invalid operation identifier/i);
    expect(() =>
      parseSandboxExecutionEgressProfileMap(
        JSON.stringify({ ai_runtime_dry_run: 'bad profile?' }),
      ),
    ).toThrow(/invalid profile identifier/i);
  });

  test('parses provider allowlists per egress profile', () => {
    const allowlists = parseSandboxExecutionEgressProviderAllowlistMap(
      JSON.stringify({
        openai_api: ['gpt-4.1', 'claude-4'],
        internal_webhook: '*',
      }),
    );

    expect(
      resolveSandboxExecutionEgressProviderAllowlist(allowlists, 'openai_api'),
    ).toEqual(['gpt-4.1', 'claude-4']);
    expect(
      resolveSandboxExecutionEgressProviderAllowlist(
        allowlists,
        'internal_webhook',
      ),
    ).toEqual(['*']);
    expect(
      isSandboxExecutionProviderAllowed(
        resolveSandboxExecutionEgressProviderAllowlist(
          allowlists,
          'openai_api',
        ),
        'gpt-4.1',
      ),
    ).toBe(true);
    expect(
      isSandboxExecutionProviderAllowed(
        resolveSandboxExecutionEgressProviderAllowlist(
          allowlists,
          'openai_api',
        ),
        'gemini-2',
      ),
    ).toBe(false);
    expect(
      isSandboxExecutionProviderAllowed(
        resolveSandboxExecutionEgressProviderAllowlist(
          allowlists,
          'internal_webhook',
        ),
        'any-provider',
      ),
    ).toBe(true);
  });

  test('throws on invalid provider allowlist payload', () => {
    expect(() => parseSandboxExecutionEgressProviderAllowlistMap('{')).toThrow(
      /provider_allowlists/i,
    );
    expect(() =>
      parseSandboxExecutionEgressProviderAllowlistMap(
        JSON.stringify({
          openai_api: [42],
        }),
      ),
    ).toThrow(/provider strings only/i);
    expect(() =>
      parseSandboxExecutionEgressProviderAllowlistMap(
        JSON.stringify({
          'bad profile?': ['gpt-4.1'],
        }),
      ),
    ).toThrow(/invalid profile identifier/i);
    expect(() =>
      parseSandboxExecutionEgressProviderAllowlistMap(
        JSON.stringify({
          openai_api: ['bad provider'],
        }),
      ),
    ).toThrow(/invalid provider identifier/i);
  });
});
