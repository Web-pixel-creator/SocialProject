import { Pool } from 'pg';
import { ContentGenerationServiceImpl } from '../services/content/contentService';

describe('ContentGenerationServiceImpl autopsy long-context wiring', () => {
  test('keeps rule-based summary metadata when long-context enhancement is disabled', async () => {
    const responses = [
      { rows: [{ id: 'draft-2', glow_up_score: null }] },
      { rows: [{ count: null }] },
      { rows: [{ count: null }] },
      { rows: [{ count: null }] },
      {
        rows: [
          {
            id: 'report-1',
            created_at: '2020-01-02T00:00:00.000Z',
            published_at: null,
          },
        ],
      },
    ];

    const stubPool = {
      query: jest.fn(async () => responses.shift() ?? { rows: [] }),
    } as any;

    const stubService = new ContentGenerationServiceImpl(stubPool as Pool);
    const report = await stubService.generateAutopsyReport(1);

    expect(report.patterns[0].glowUpScore).toBe(0);
    expect(report.publishedAt).toBeNull();
    expect(report.summary).toContain('Common issues');
    expect(report.summarySource).toBe('rule_based');
    expect(report.analysisJobId).toBeNull();
    expect(report.analysisProvider).toBeNull();
  });

  test('uses long-context lane summary for autopsy reports when enabled', async () => {
    const responses = [
      { rows: [{ id: 'draft-3', glow_up_score: 1.5 }] },
      { rows: [{ count: 0 }] },
      { rows: [{ count: 1 }] },
      { rows: [{ count: 1 }] },
      {
        rows: [
          {
            id: 'report-2',
            created_at: '2020-01-03T00:00:00.000Z',
            published_at: null,
          },
        ],
      },
    ];
    const stubPool = {
      query: jest.fn(async () => responses.shift() ?? { rows: [] }),
    } as any;
    const runAnalysis = jest.fn().mockResolvedValue({
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      cacheTtl: '5m',
      completedAt: new Date('2026-03-09T00:00:01.000Z'),
      createdAt: new Date('2026-03-09T00:00:00.000Z'),
      draftId: null,
      estimatedCostUsd: 0.001,
      failureCode: null,
      failureMessage: null,
      id: 'job-1',
      inputTokens: 100,
      lane: 'long_context',
      maxOutputTokens: 256,
      metadata: {},
      model: 'claude-sonnet-4-20250514',
      outputTokens: 20,
      prompt: 'prompt',
      provider: 'claude-4',
      requestedById: null,
      requestedByType: 'system',
      resultText: 'Autopsy batch shows stalled iteration and weak critic traction.',
      route: null,
      serviceTier: 'auto',
      status: 'completed',
      systemPrompt: 'system',
      updatedAt: new Date('2026-03-09T00:00:01.000Z'),
      useCase: 'autopsy_report',
    });

    const stubService = new ContentGenerationServiceImpl(stubPool as Pool, {
      autopsyLongContextEnabled: true,
      longContextService: {
        getJob: jest.fn(),
        runAnalysis,
      } as any,
    });
    const report = await stubService.generateAutopsyReport(1);

    expect(runAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedByType: 'system',
        useCase: 'autopsy_report',
      }),
    );
    expect(report.summary).toBe('Autopsy batch shows stalled iteration and weak critic traction.');
    expect(report.summarySource).toBe('long_context');
    expect(report.analysisJobId).toBe('job-1');
    expect(report.analysisProvider).toBe('claude-4');
    expect(JSON.parse(stubPool.query.mock.calls.at(-1)?.[1]?.[2] ?? '{}')).toEqual(
      expect.objectContaining({
        analysis: expect.objectContaining({
          jobId: 'job-1',
          provider: 'claude-4',
          summarySource: 'long_context',
        }),
      }),
    );
  });

  test('falls back to rule-based autopsy summary when long-context analysis fails', async () => {
    const responses = [
      { rows: [{ id: 'draft-4', glow_up_score: 2.5 }] },
      { rows: [{ count: 0 }] },
      { rows: [{ count: 0 }] },
      { rows: [{ count: 0 }] },
      {
        rows: [
          {
            id: 'report-3',
            created_at: '2020-01-04T00:00:00.000Z',
            published_at: null,
          },
        ],
      },
    ];
    const stubPool = {
      query: jest.fn(async () => responses.shift() ?? { rows: [] }),
    } as any;
    const runAnalysis = jest.fn().mockResolvedValue({
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      cacheTtl: '5m',
      completedAt: new Date('2026-03-09T00:00:01.000Z'),
      createdAt: new Date('2026-03-09T00:00:00.000Z'),
      draftId: null,
      estimatedCostUsd: null,
      failureCode: 'LONG_CONTEXT_NOT_CONFIGURED',
      failureMessage: 'Anthropic API key is not configured.',
      id: 'job-2',
      inputTokens: 0,
      lane: 'long_context',
      maxOutputTokens: 256,
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
      updatedAt: new Date('2026-03-09T00:00:01.000Z'),
      useCase: 'autopsy_report',
    });

    const stubService = new ContentGenerationServiceImpl(stubPool as Pool, {
      autopsyLongContextEnabled: true,
      longContextService: {
        getJob: jest.fn(),
        runAnalysis,
      } as any,
    });
    const report = await stubService.generateAutopsyReport(1);

    expect(report.summary).toContain('Common issues');
    expect(report.summarySource).toBe('rule_based');
    expect(report.analysisJobId).toBe('job-2');
    expect(report.analysisProvider).toBe('claude-4');
  });
});
