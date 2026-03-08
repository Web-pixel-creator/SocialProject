import { LongContextServiceImpl } from '../services/analysis/longContextService';
import type { ProviderRoutingService } from '../services/providerRouting/types';

describe('LongContextServiceImpl', () => {
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;

  const createRoute = (providers: string[]) => ({
    budgetCapUsd: null,
    cacheEligible: true,
    disabledProviders: [],
    grounded: false,
    lane: 'long_context' as const,
    providers: providers.map((provider, index) => ({
      enabled: true,
      model:
        provider === 'claude-4'
          ? 'claude-sonnet-4-20250514'
          : provider === 'kimi-k2'
            ? 'kimi-k2'
            : 'gpt-4.1',
      provider,
      role: index === 0 ? ('primary' as const) : ('fallback' as const),
    })),
    requestedProviders: [],
    resolvedProviders: providers.map((provider, index) => ({
      model:
        provider === 'claude-4'
          ? 'claude-sonnet-4-20250514'
          : provider === 'kimi-k2'
            ? 'kimi-k2'
            : 'gpt-4.1',
      provider,
      role: index === 0 ? ('primary' as const) : ('fallback' as const),
    })),
    stage: 'pilot' as const,
  });

  const createQueryable = () => {
    const state = {
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      cacheTtl: '5m',
      completedAt: null as Date | null,
      createdAt: new Date('2026-03-08T12:00:00.000Z'),
      draftId: null as string | null,
      estimatedCostUsd: null as number | null,
      failureCode: null as string | null,
      failureMessage: null as string | null,
      id: '22222222-2222-2222-2222-222222222222',
      inputTokens: 0,
      lane: 'long_context' as const,
      maxOutputTokens: 4096,
      metadata: {} as Record<string, unknown>,
      model: null as string | null,
      outputTokens: 0,
      promptText: 'placeholder',
      provider: null as string | null,
      requestedById: null as string | null,
      requestedByType: 'admin' as const,
      resultText: null as string | null,
      serviceTier: 'auto' as string | null,
      status: 'queued' as 'queued' | 'processing' | 'completed' | 'failed',
      systemPrompt: 'placeholder',
      updatedAt: new Date('2026-03-08T12:00:00.000Z'),
      useCase: 'custom' as const,
    };

    const toRow = () => ({
      cache_creation_input_tokens: state.cacheCreationInputTokens,
      cache_read_input_tokens: state.cacheReadInputTokens,
      cache_ttl: state.cacheTtl,
      completed_at: state.completedAt,
      created_at: state.createdAt,
      draft_id: state.draftId,
      estimated_cost_usd: state.estimatedCostUsd,
      failure_code: state.failureCode,
      failure_message: state.failureMessage,
      id: state.id,
      input_tokens: state.inputTokens,
      lane: state.lane,
      max_output_tokens: state.maxOutputTokens,
      metadata: state.metadata,
      model: state.model,
      output_tokens: state.outputTokens,
      prompt_text: state.promptText,
      provider: state.provider,
      requested_by_id: state.requestedById,
      requested_by_type: state.requestedByType,
      result_text: state.resultText,
      service_tier: state.serviceTier,
      status: state.status,
      system_prompt: state.systemPrompt,
      updated_at: state.updatedAt,
      use_case: state.useCase,
    });

    const query = jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO long_context_analysis_jobs')) {
        state.useCase = params?.[0] as typeof state.useCase;
        state.promptText = params?.[1] as string;
        state.systemPrompt = params?.[2] as string;
        state.provider = (params?.[3] as string | null) ?? null;
        state.model = (params?.[4] as string | null) ?? null;
        state.requestedByType = params?.[5] as typeof state.requestedByType;
        state.requestedById = (params?.[6] as string | null) ?? null;
        state.draftId = (params?.[7] as string | null) ?? null;
        state.cacheTtl = params?.[8] as string;
        state.maxOutputTokens = Number(params?.[9] ?? 4096);
        state.serviceTier = params?.[10] as string;
        state.metadata = JSON.parse(String(params?.[11] ?? '{}')) as Record<string, unknown>;
        state.status = 'queued';
        return Promise.resolve({ rows: [toRow()] });
      }
      if (sql.includes('SET status = $2')) {
        state.status = params?.[1] as typeof state.status;
        state.updatedAt = new Date('2026-03-08T12:00:01.000Z');
        return Promise.resolve({ rows: [toRow()] });
      }
      if (sql.includes("SET status = 'completed'")) {
        state.status = 'completed';
        state.provider = params?.[1] as string;
        state.model = params?.[2] as string;
        state.resultText = params?.[3] as string;
        state.inputTokens = Number(params?.[4] ?? 0);
        state.outputTokens = Number(params?.[5] ?? 0);
        state.cacheCreationInputTokens = Number(params?.[6] ?? 0);
        state.cacheReadInputTokens = Number(params?.[7] ?? 0);
        state.estimatedCostUsd = Number(params?.[8] ?? 0);
        state.serviceTier = params?.[9] as string;
        state.metadata = JSON.parse(String(params?.[10] ?? '{}')) as Record<string, unknown>;
        state.completedAt = new Date('2026-03-08T12:00:03.000Z');
        state.updatedAt = new Date('2026-03-08T12:00:03.000Z');
        return Promise.resolve({ rows: [toRow()] });
      }
      if (sql.includes("SET status = 'failed'")) {
        state.status = 'failed';
        state.failureCode = params?.[1] as string;
        state.failureMessage = params?.[2] as string;
        state.metadata = JSON.parse(String(params?.[3] ?? '{}')) as Record<string, unknown>;
        state.completedAt = new Date('2026-03-08T12:00:02.000Z');
        state.updatedAt = new Date('2026-03-08T12:00:02.000Z');
        return Promise.resolve({ rows: [toRow()] });
      }
      if (sql.includes('FROM long_context_analysis_jobs')) {
        return Promise.resolve({ rows: [toRow()] });
      }
      return Promise.resolve({ rows: [] });
    });

    return { query };
  };

  afterEach(() => {
    if (previousAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
    }
    jest.restoreAllMocks();
  });

  test('runs Anthropic long-context analysis and persists cache/token telemetry', async () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-test';
    const recordExecution = jest.fn().mockResolvedValue(undefined);
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({
        content: [
          {
            text: '## Summary\n- Gap A\n- Gap B',
            type: 'text',
          },
        ],
        id: 'msg_123',
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: {
          cache_creation_input_tokens: 1200,
          cache_read_input_tokens: 0,
          input_tokens: 2000,
          output_tokens: 400,
          service_tier: 'standard',
        },
      }),
      ok: true,
      status: 200,
      text: async () => '',
    } as Response);
    const queryable = createQueryable();
    const service = new LongContextServiceImpl({
      fetchImpl: fetchMock as unknown as typeof fetch,
      providerRouting: {
        recordExecution,
        resolveRoute: jest.fn().mockReturnValue(createRoute(['claude-4', 'gpt-4.1'])),
      } as unknown as ProviderRoutingService,
      queryable,
    });

    const job = await service.runAnalysis({
      cacheTtl: '1h',
      maxOutputTokens: 2048,
      prompt: 'Review the production roadmap and identify the main execution gaps.',
      requestedByType: 'admin',
      serviceTier: 'standard_only',
      systemPrompt: 'Prefer concrete sequencing.',
      useCase: 'roadmap_spec_analysis',
    });

    expect(job.status).toBe('completed');
    expect(job.provider).toBe('claude-4');
    expect(job.model).toBe('claude-sonnet-4-20250514');
    expect(job.resultText).toContain('Gap A');
    expect(job.cacheCreationInputTokens).toBe(1200);
    expect(job.inputTokens).toBe(2000);
    expect(job.outputTokens).toBe(400);
    expect(job.estimatedCostUsd).toBe(0.0192);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'anthropic-beta': 'extended-cache-ttl-2025-04-11',
          'anthropic-version': '2023-06-01',
          'x-api-key': 'anthropic-test',
        }),
        method: 'POST',
      }),
    );
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, any>;
    expect(payload.service_tier).toBe('standard_only');
    expect(payload.system[0].cache_control).toEqual({
      ttl: '1h',
      type: 'ephemeral',
    });
    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: 'long_context',
        operation: 'long_context_roadmap_spec_analysis',
        provider: 'claude-4',
        status: 'ok',
      }),
    );
  });

  test('returns failed job when no implemented long-context provider is enabled', async () => {
    const recordExecution = jest.fn().mockResolvedValue(undefined);
    const queryable = createQueryable();
    const service = new LongContextServiceImpl({
      providerRouting: {
        recordExecution,
        resolveRoute: jest.fn().mockReturnValue(createRoute(['kimi-k2'])),
      } as unknown as ProviderRoutingService,
      queryable,
    });

    const job = await service.runAnalysis({
      prompt: 'Summarize moderation drift.',
      requestedByType: 'admin',
      useCase: 'moderation_review_summary',
    });

    expect(job.status).toBe('failed');
    expect(job.failureCode).toBe('LONG_CONTEXT_PROVIDER_UNAVAILABLE');
    expect(job.metadata.failureStatus).toBe(503);
    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: 'long_context',
        operation: 'long_context_moderation_review_summary',
        status: 'failed',
      }),
    );
  });
});
