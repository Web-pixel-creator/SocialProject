import { AIRuntimeServiceImpl } from '../services/aiRuntime/aiRuntimeService';

describe('ai runtime http adapters', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('uses configured HTTP adapter when enabled', async () => {
    process.env.AI_RUNTIME_USE_HTTP_ADAPTERS = 'true';
    process.env.AI_RUNTIME_GPT_4_1_ENDPOINT = 'https://provider.example/api';
    process.env.AI_RUNTIME_GPT_4_1_API_KEY = 'test-key';
    process.env.AI_RUNTIME_GPT_4_1_MODEL = 'gpt-4.1';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ output_text: 'HTTP adapter output' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const runtime = new AIRuntimeServiceImpl();
    const result = await runtime.runWithFailover({
      role: 'author',
      prompt: 'Summarize draft',
      providersOverride: ['gpt-4.1'],
    });

    expect(result.failed).toBe(false);
    expect(result.selectedProvider).toBe('gpt-4.1');
    expect(result.output).toBe('HTTP adapter output');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('falls back to deterministic stub when adapter config is missing', async () => {
    process.env.AI_RUNTIME_USE_HTTP_ADAPTERS = 'true';
    process.env.AI_RUNTIME_CLAUDE_4_ENDPOINT = undefined;
    process.env.AI_RUNTIME_CLAUDE_4_API_KEY = undefined;

    const runtime = new AIRuntimeServiceImpl();
    const result = await runtime.runWithFailover({
      role: 'critic',
      prompt: 'Review composition drift',
      providersOverride: ['claude-4'],
    });

    expect(result.failed).toBe(false);
    expect(result.selectedProvider).toBe('claude-4');
    expect(result.output).toContain('[claude-4@default] Critique:');
  });

  test('keeps failover and cooldown behavior with HTTP adapters', async () => {
    process.env.AI_RUNTIME_USE_HTTP_ADAPTERS = 'true';
    process.env.AI_PROVIDER_COOLDOWN_MS = '60000';
    process.env.AI_RUNTIME_GPT_4_1_ENDPOINT = 'https://provider.example/gpt';
    process.env.AI_RUNTIME_GPT_4_1_API_KEY = 'gpt-key';
    process.env.AI_RUNTIME_GEMINI_2_ENDPOINT =
      'https://provider.example/gemini';
    process.env.AI_RUNTIME_GEMINI_2_API_KEY = 'gemini-key';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'provider unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ output_text: 'Gemini fallback output' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ output_text: 'Gemini second call' }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const runtime = new AIRuntimeServiceImpl();
    const firstRun = await runtime.runWithFailover({
      role: 'author',
      prompt: 'Route through fallback chain',
      providersOverride: ['gpt-4.1', 'gemini-2'],
    });

    expect(firstRun.failed).toBe(false);
    expect(firstRun.selectedProvider).toBe('gemini-2');
    expect(firstRun.attempts[0].provider).toBe('gpt-4.1');
    expect(firstRun.attempts[0].status).toBe('failed');
    expect(firstRun.attempts[1].provider).toBe('gemini-2');
    expect(firstRun.attempts[1].status).toBe('success');

    const secondRun = await runtime.runWithFailover({
      role: 'author',
      prompt: 'Route while first provider in cooldown',
      providersOverride: ['gpt-4.1', 'gemini-2'],
    });

    expect(secondRun.failed).toBe(false);
    expect(secondRun.selectedProvider).toBe('gemini-2');
    expect(secondRun.attempts[0].provider).toBe('gpt-4.1');
    expect(secondRun.attempts[0].status).toBe('skipped_cooldown');
    expect(secondRun.attempts[1].provider).toBe('gemini-2');
    expect(secondRun.attempts[1].status).toBe('success');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('rotates auth profiles inside one provider and reports profile health', async () => {
    process.env.AI_RUNTIME_USE_HTTP_ADAPTERS = 'true';
    process.env.AI_PROVIDER_COOLDOWN_MS = '60000';
    process.env.AI_RUNTIME_GPT_4_1_AUTH_PROFILES = 'primary,fallback';
    process.env.AI_RUNTIME_GPT_4_1_ENDPOINT__PRIMARY =
      'https://provider.example/gpt-primary';
    process.env.AI_RUNTIME_GPT_4_1_API_KEY__PRIMARY = 'gpt-primary-key';
    process.env.AI_RUNTIME_GPT_4_1_ENDPOINT__FALLBACK =
      'https://provider.example/gpt-fallback';
    process.env.AI_RUNTIME_GPT_4_1_API_KEY__FALLBACK = 'gpt-fallback-key';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'primary unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ output_text: 'Fallback auth profile output' }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const runtime = new AIRuntimeServiceImpl();
    const result = await runtime.runWithFailover({
      role: 'author',
      prompt: 'Run with profile rotation',
      providersOverride: ['gpt-4.1'],
    });

    expect(result.failed).toBe(false);
    expect(result.selectedProvider).toBe('gpt-4.1');
    expect(result.selectedAuthProfile).toBe('fallback');
    expect(result.output).toBe('Fallback auth profile output');
    expect(result.attempts[0]).toMatchObject({
      provider: 'gpt-4.1',
      authProfile: 'primary',
      status: 'failed',
      errorCode: 'AI_PROVIDER_HTTP_ERROR',
    });
    expect(result.attempts[1]).toMatchObject({
      provider: 'gpt-4.1',
      authProfile: 'fallback',
      status: 'success',
      errorCode: null,
    });

    const health = runtime.getHealthSnapshot();
    const gptProvider = health.providers.find(
      (provider) => provider.provider === 'gpt-4.1',
    );
    expect(gptProvider).toBeTruthy();
    expect(gptProvider?.coolingDown).toBe(false);
    expect(gptProvider?.activeProfile).toBe('fallback');
    expect(Array.isArray(gptProvider?.profiles)).toBe(true);
    const primaryProfile = gptProvider?.profiles.find(
      (profile) => profile.profile === 'primary',
    );
    expect(primaryProfile?.coolingDown).toBe(true);
    expect(primaryProfile?.lastFailureCode).toBe('AI_PROVIDER_HTTP_ERROR');
    const fallbackProfile = gptProvider?.profiles.find(
      (profile) => profile.profile === 'fallback',
    );
    expect(fallbackProfile?.coolingDown).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('builds health snapshot with blocked roles when provider chain is cooling down', async () => {
    process.env.AI_PROVIDER_COOLDOWN_MS = '60000';

    const runtime = new AIRuntimeServiceImpl();
    const failureRun = await runtime.runWithFailover({
      role: 'author',
      prompt: 'Force every provider in author chain to fail',
      providersOverride: ['gpt-4.1', 'gemini-2'],
      simulateFailures: ['gpt-4.1', 'gemini-2'],
    });

    expect(failureRun.failed).toBe(true);
    expect(failureRun.selectedProvider).toBeNull();

    const healthSnapshot = runtime.getHealthSnapshot();
    expect(healthSnapshot.summary.providersCoolingDown).toBeGreaterThanOrEqual(
      2,
    );
    expect(healthSnapshot.summary.rolesBlocked).toBeGreaterThanOrEqual(1);
    expect(healthSnapshot.summary.health).toBe('degraded');

    const authorRole = healthSnapshot.roleStates.find(
      (roleState) => roleState.role === 'author',
    );
    expect(authorRole).toBeTruthy();
    expect(authorRole?.hasAvailableProvider).toBe(false);
    expect((authorRole?.blockedProviders.length ?? 0) > 0).toBe(true);
  });

  test('supports dry-run mode without mutating provider cooldown state', async () => {
    process.env.AI_PROVIDER_COOLDOWN_MS = '60000';

    const runtime = new AIRuntimeServiceImpl();
    const dryRunFailure = await runtime.runWithFailover({
      role: 'author',
      prompt: 'Dry-run provider validation',
      providersOverride: ['gpt-4.1'],
      simulateFailures: ['gpt-4.1'],
      mutateProviderState: false,
    });

    expect(dryRunFailure.failed).toBe(true);
    expect(dryRunFailure.attempts).toHaveLength(1);
    expect(dryRunFailure.attempts[0]?.status).toBe('failed');

    const runAfterDryRun = await runtime.runWithFailover({
      role: 'author',
      prompt: 'Runtime should still execute primary provider',
      providersOverride: ['gpt-4.1'],
    });

    expect(runAfterDryRun.failed).toBe(false);
    expect(runAfterDryRun.selectedProvider).toBe('gpt-4.1');
    expect(runAfterDryRun.attempts[0]?.status).toBe('success');
  });
});
