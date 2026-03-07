import {
  PROVIDER_LANE_EXECUTION_EVENT_TYPE,
  PROVIDER_LANE_TELEMETRY_SOURCE,
  ProviderRoutingServiceImpl,
} from '../services/providerRouting/providerRoutingService';

describe('ProviderRoutingServiceImpl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  test('returns default lane routes with resolved providers', () => {
    const service = new ProviderRoutingServiceImpl({
      queryable: {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      },
    });

    const routes = service.getLaneRoutes();
    const voiceLive = routes.find((route) => route.lane === 'voice_live');
    const longContext = routes.find((route) => route.lane === 'long_context');

    expect(voiceLive).toBeTruthy();
    expect(voiceLive?.resolvedProviders).toEqual([
      expect.objectContaining({
        model: 'gpt-realtime',
        provider: 'openai',
        role: 'primary',
      }),
    ]);
    expect(longContext?.resolvedProviders.map((provider) => provider.provider)).toEqual(
      expect.arrayContaining(['claude-4', 'gpt-4.1', 'gemini-2']),
    );
  });

  test('applies env lane overrides and disabled provider filters', () => {
    process.env.AI_PROVIDER_LANE_CONFIGS = JSON.stringify({
      grounded_research: {
        providers: [
          {
            provider: 'perplexity-search-api',
            model: 'search-api',
            role: 'primary',
          },
          {
            provider: 'gemini-search-grounded',
            model: 'gemini-2.0-flash',
            role: 'fallback',
          },
        ],
        stage: 'ga',
      },
    });
    process.env.AI_PROVIDER_LANE_DISABLED_PROVIDERS = JSON.stringify({
      grounded_research: ['gemini-search-grounded'],
    });

    const service = new ProviderRoutingServiceImpl({
      queryable: {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      },
    });
    const route = service.resolveRoute({
      lane: 'grounded_research',
    });

    expect(route.stage).toBe('ga');
    expect(route.providers).toContainEqual(
      expect.objectContaining({
        enabled: false,
        provider: 'gemini-search-grounded',
      }),
    );
    expect(route.resolvedProviders).toEqual([
      expect.objectContaining({
        provider: 'perplexity-search-api',
      }),
    ]);
  });

  test('records provider lane telemetry rows via shared ux_events writer', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const service = new ProviderRoutingServiceImpl({
      queryable: { query },
    });
    const route = service.resolveRoute({
      lane: 'voice_live',
    });

    await service.recordExecution({
      durationMs: 132,
      lane: 'voice_live',
      metadata: {
        liveSessionId: 'live-session-1',
      },
      model: 'gpt-realtime',
      operation: 'live_session_realtime_bootstrap',
      provider: 'openai',
      route,
      status: 'ok',
      userId: 'observer-1',
      userType: 'observer',
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO ux_events');
    expect(params[0]).toBe(PROVIDER_LANE_EXECUTION_EVENT_TYPE);
    expect(params[1]).toBe('observer');
    expect(params[2]).toBe('observer-1');
    expect(params[4]).toBe('ok');
    expect(params[6]).toBe(PROVIDER_LANE_TELEMETRY_SOURCE);
    expect(JSON.parse(String(params[7]))).toEqual(
      expect.objectContaining({
        lane: 'voice_live',
        operation: 'live_session_realtime_bootstrap',
        provider: 'openai',
        resolvedProviders: ['openai'],
        routeStage: 'ga',
      }),
    );
  });
});
