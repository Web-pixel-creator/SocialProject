import { Pool } from 'pg';
import { SearchServiceImpl } from '../services/search/searchService';

describe('SearchServiceImpl style fusion long-context wiring', () => {
  const sample = [
    {
      afterImageUrl: 'https://example.com/a-after.png',
      beforeImageUrl: 'https://example.com/a-before.png',
      glowUpScore: 6.2,
      id: 'draft-a',
      score: 0.98,
      title: 'Fusion Similar A',
      type: 'draft' as const,
    },
    {
      afterImageUrl: 'https://example.com/b-after.png',
      beforeImageUrl: 'https://example.com/b-before.png',
      glowUpScore: 5.4,
      id: 'draft-b',
      score: 0.93,
      title: 'Fusion Similar B',
      type: 'draft' as const,
    },
    {
      afterImageUrl: 'https://example.com/c-after.png',
      beforeImageUrl: 'https://example.com/c-before.png',
      glowUpScore: 4.9,
      id: 'draft-c',
      score: 0.91,
      title: 'Fusion Similar C',
      type: 'draft' as const,
    },
  ];

  test('keeps rule-based style fusion when long-context enhancement is disabled', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValue({
        rows: [{ description: 'Keep the winning edge treatment.' }],
      }),
    } as any;
    const runAnalysis = jest.fn();
    const service = new SearchServiceImpl(stubPool as Pool, {
      longContextService: {
        getJob: jest.fn(),
        runAnalysis,
      } as any,
      styleFusionLongContextEnabled: false,
    });
    jest.spyOn(service, 'searchSimilar').mockResolvedValue(sample.slice(0, 2));

    const result = await service.generateStyleFusion('target-draft', {
      limit: 3,
      type: 'draft',
    });

    expect(runAnalysis).not.toHaveBeenCalled();
    expect(result.planSource).toBe('rule_based');
    expect(result.analysisJobId).toBeNull();
    expect(result.analysisProvider).toBeNull();
    expect(result.titleSuggestion).toContain('Fusion:');
    expect(result.winningPrHints).toEqual(['Keep the winning edge treatment.']);
  });

  test('uses long-context refinement for style fusion when enabled', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as any;
    const runAnalysis = jest.fn().mockResolvedValue({
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      cacheTtl: '5m',
      completedAt: new Date('2026-03-10T10:00:01.000Z'),
      createdAt: new Date('2026-03-10T10:00:00.000Z'),
      draftId: null,
      estimatedCostUsd: 0.002,
      failureCode: null,
      failureMessage: null,
      id: 'job-style-1',
      inputTokens: 120,
      lane: 'long_context',
      maxOutputTokens: 512,
      metadata: {},
      model: 'claude-sonnet-4-20250514',
      outputTokens: 55,
      prompt: 'prompt',
      provider: 'claude-4',
      requestedById: null,
      requestedByType: 'system',
      resultText: JSON.stringify({
        styleDirectives: [
          'Keep the cinematic framing stable.',
          'Fuse the neon light cadence into the midtones.',
          'Borrow the high-frequency finishing texture from the third sample.',
        ],
        titleSuggestion: 'Fusion: Cinematic Neon Finish',
        winningPrHints: [
          'Carry over the strongest edge-light silhouette.',
          'Preserve the clean subject separation from the top sample.',
        ],
      }),
      route: null,
      serviceTier: 'auto',
      status: 'completed',
      systemPrompt: 'system',
      updatedAt: new Date('2026-03-10T10:00:01.000Z'),
      useCase: 'style_fusion_plan',
    });
    const service = new SearchServiceImpl(stubPool as Pool, {
      longContextService: {
        getJob: jest.fn(),
        runAnalysis,
      } as any,
      styleFusionLongContextEnabled: true,
    });
    jest.spyOn(service, 'searchSimilar').mockResolvedValue(sample);

    const result = await service.generateStyleFusion('target-draft', {
      limit: 3,
      type: 'draft',
    });

    expect(runAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedByType: 'system',
        useCase: 'style_fusion_plan',
      }),
    );
    expect(result.planSource).toBe('long_context');
    expect(result.analysisJobId).toBe('job-style-1');
    expect(result.analysisProvider).toBe('claude-4');
    expect(result.titleSuggestion).toBe('Fusion: Cinematic Neon Finish');
    expect(result.styleDirectives).toHaveLength(3);
    expect(result.winningPrHints).toHaveLength(2);
  });

  test('falls back to rule-based style fusion when long-context refinement is unavailable', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as any;
    const runAnalysis = jest.fn().mockResolvedValue({
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      cacheTtl: '5m',
      completedAt: new Date('2026-03-10T10:00:01.000Z'),
      createdAt: new Date('2026-03-10T10:00:00.000Z'),
      draftId: null,
      estimatedCostUsd: null,
      failureCode: 'LONG_CONTEXT_NOT_CONFIGURED',
      failureMessage: 'Anthropic API key is not configured.',
      id: 'job-style-2',
      inputTokens: 0,
      lane: 'long_context',
      maxOutputTokens: 512,
      metadata: {
        failureStatus: 503,
      },
      model: 'claude-sonnet-4-20250514',
      outputTokens: 0,
      prompt: 'prompt',
      provider: 'claude-4',
      requestedById: null,
      requestedByType: 'system',
      resultText: null,
      route: null,
      serviceTier: 'auto',
      status: 'failed',
      systemPrompt: 'system',
      updatedAt: new Date('2026-03-10T10:00:01.000Z'),
      useCase: 'style_fusion_plan',
    });
    const service = new SearchServiceImpl(stubPool as Pool, {
      longContextService: {
        getJob: jest.fn(),
        runAnalysis,
      } as any,
      styleFusionLongContextEnabled: true,
    });
    jest.spyOn(service, 'searchSimilar').mockResolvedValue(sample.slice(0, 2));

    const result = await service.generateStyleFusion('target-draft', {
      limit: 3,
      type: 'draft',
    });

    expect(result.planSource).toBe('rule_based');
    expect(result.analysisJobId).toBe('job-style-2');
    expect(result.analysisProvider).toBe('claude-4');
    expect(result.titleSuggestion).toContain('Fusion:');
  });
});
