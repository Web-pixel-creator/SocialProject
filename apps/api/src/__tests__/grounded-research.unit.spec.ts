import { GroundedResearchServiceImpl } from '../services/search/groundedResearchService';
import type { ProviderRoutingService } from '../services/providerRouting/types';

describe('GroundedResearchServiceImpl', () => {
  const previousPerplexityKey = process.env.PERPLEXITY_API_KEY;
  const previousGeminiKey = process.env.GEMINI_API_KEY;

  const createRoute = (providers: string[]) => ({
    budgetCapUsd: null,
    cacheEligible: false,
    disabledProviders: [],
    grounded: true,
    lane: 'grounded_research' as const,
    providers: providers.map((provider, index) => ({
      enabled: true,
      model:
        provider === 'perplexity-search-api'
          ? 'search-api'
          : provider === 'perplexity-sonar'
            ? 'sonar-pro'
            : 'gemini-2.5-flash',
      provider,
      role: index === 0 ? ('primary' as const) : ('fallback' as const),
    })),
    requestedProviders: [],
    resolvedProviders: providers.map((provider, index) => ({
      model:
        provider === 'perplexity-search-api'
          ? 'search-api'
          : provider === 'perplexity-sonar'
            ? 'sonar-pro'
            : 'gemini-2.5-flash',
      provider,
      role: index === 0 ? ('primary' as const) : ('fallback' as const),
    })),
    stage: 'pilot' as const,
  });

  afterEach(() => {
    if (previousPerplexityKey === undefined) {
      delete process.env.PERPLEXITY_API_KEY;
    } else {
      process.env.PERPLEXITY_API_KEY = previousPerplexityKey;
    }
    if (previousGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousGeminiKey;
    }
    jest.restoreAllMocks();
  });

  test('persists raw search sources and grounded sonar answer', async () => {
    process.env.PERPLEXITY_API_KEY = 'pplx-test';
    const recordExecution = jest.fn().mockResolvedValue(undefined);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          results: [
            {
              date: '2026-03-07',
              snippet: 'First source snippet',
              title: 'Source One',
              url: 'https://example.com/one',
            },
          ],
        }),
        ok: true,
        status: 200,
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Grounded answer from Sonar',
              },
            },
          ],
          search_results: [
            {
              date: '2026-03-07',
              title: 'Answer Source',
              url: 'https://example.com/two',
            },
          ],
        }),
        ok: true,
        status: 200,
        text: async () => '',
      } as Response);
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            created_at: new Date('2026-03-07T13:00:00.000Z'),
            id: 'run-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const service = new GroundedResearchServiceImpl({
      fetchImpl: fetchMock as unknown as typeof fetch,
      providerRouting: {
        recordExecution,
        resolveRoute: jest
          .fn()
          .mockReturnValue(createRoute(['perplexity-search-api', 'perplexity-sonar'])),
      } as unknown as ProviderRoutingService,
      queryable: { query },
    });

    const result = await service.runResearch({
      query: 'What changed in the release checklist?',
      requestedByType: 'admin',
    });

    expect(result).toEqual(
      expect.objectContaining({
        answer: 'Grounded answer from Sonar',
        answerProvider: 'perplexity-sonar',
        model: 'sonar-pro',
        retrievalProvider: 'perplexity-search-api',
        runId: 'run-1',
      }),
    );
    expect(result.rawSources).toHaveLength(1);
    expect(result.citations).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.perplexity.ai/search',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.perplexity.ai/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('INSERT INTO grounded_research_runs');
    expect(query.mock.calls[1][0]).toContain('INSERT INTO grounded_research_citations');
    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'grounded_research_retrieval',
        provider: 'perplexity-search-api',
        status: 'ok',
      }),
    );
    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'grounded_research_answer',
        provider: 'perplexity-sonar',
        status: 'ok',
      }),
    );
  });

  test('falls back to gemini grounded answer when sonar fails', async () => {
    process.env.PERPLEXITY_API_KEY = 'pplx-test';
    process.env.GEMINI_API_KEY = 'gemini-test';
    const recordExecution = jest.fn().mockResolvedValue(undefined);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          results: [],
        }),
        ok: true,
        status: 200,
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => 'sonar upstream failed',
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Gemini grounded answer' }],
              },
              groundingMetadata: {
                groundingChunks: [
                  {
                    web: {
                      title: 'Gemini Source',
                      uri: 'https://example.com/gemini',
                    },
                  },
                ],
                webSearchQueries: ['finishit release checklist'],
              },
            },
          ],
        }),
        ok: true,
        status: 200,
        text: async () => '',
      } as Response);
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            created_at: new Date('2026-03-07T13:05:00.000Z'),
            id: 'run-2',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const service = new GroundedResearchServiceImpl({
      fetchImpl: fetchMock as unknown as typeof fetch,
      providerRouting: {
        recordExecution,
        resolveRoute: jest
          .fn()
          .mockReturnValue(
            createRoute(['perplexity-search-api', 'perplexity-sonar', 'gemini-search-grounded']),
          ),
      } as unknown as ProviderRoutingService,
      queryable: { query },
    });

    const result = await service.runResearch({
      query: 'Summarize the latest grounded research rollout.',
      requestedByType: 'admin',
    });

    expect(result.answerProvider).toBe('gemini-search-grounded');
    expect(result.answer).toBe('Gemini grounded answer');
    expect(result.citations).toEqual([
      expect.objectContaining({
        provider: 'gemini-search-grounded',
        title: 'Gemini Source',
        url: 'https://example.com/gemini',
      }),
    ]);
    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'grounded_research_answer',
        provider: 'perplexity-sonar',
        status: 'failed',
      }),
    );
    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'grounded_research_answer',
        provider: 'gemini-search-grounded',
        status: 'ok',
      }),
    );
  });
});
