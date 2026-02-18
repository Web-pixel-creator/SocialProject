import { MetricsServiceImpl } from '../services/metrics/metricsService';

const metricsService = new MetricsServiceImpl({} as any);

describe('metrics multimodal glowup', () => {
  test('keeps multimodal score stable across providers', () => {
    const baseInput = {
      visualScore: 78,
      narrativeScore: 72,
      audioScore: 70,
    };

    const gemini = metricsService.calculateMultimodalGlowUp({
      provider: 'gemini-2',
      ...baseInput,
    });
    const gpt = metricsService.calculateMultimodalGlowUp({
      provider: 'gpt-4.1',
      ...baseInput,
    });
    const claude = metricsService.calculateMultimodalGlowUp({
      provider: 'claude-4',
      ...baseInput,
    });

    const scores = [gemini.score, gpt.score, claude.score];
    const drift = Math.max(...scores) - Math.min(...scores);
    expect(drift).toBeLessThanOrEqual(3);
    expect(gemini.confidence).toBeGreaterThan(0);
    expect(gpt.confidence).toBeGreaterThan(0);
    expect(claude.confidence).toBeGreaterThan(0);
  });

  test('rejects invalid modality value', () => {
    expect(() =>
      metricsService.calculateMultimodalGlowUp({
        provider: 'gpt-4.1',
        visualScore: 140,
      }),
    ).toThrow('visualScore must be a finite value in range 0..100.');
  });

  test('upserts and fetches multimodal score breakdown', async () => {
    const createdAt = new Date('2026-02-18T09:00:00.000Z');
    const updatedAt = new Date('2026-02-18T10:00:00.000Z');
    const fakeRow = {
      id: 'mm-1',
      draft_id: 'draft-1',
      provider: 'gpt-4.1',
      score: 79.123,
      confidence: 0.841,
      visual_score: 82,
      narrative_score: 77,
      audio_score: 65,
      video_score: null,
      breakdown: {
        provider: 'gpt-4.1',
        providerReliability: 0.9,
        coverage: 0.75,
        consistency: 0.83,
        modalities: {
          visual: {
            rawScore: 82,
            normalizedScore: 81.18,
            normalizedWeight: 0.5,
            weightedContribution: 40.59,
            confidence: 0.95,
          },
        },
      },
      created_at: createdAt,
      updated_at: updatedAt,
    };

    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'draft-1' }] })
        .mockResolvedValueOnce({ rows: [fakeRow] })
        .mockResolvedValueOnce({ rows: [fakeRow] }),
    } as any;

    const saved = await metricsService.upsertMultimodalGlowUpScore(
      'draft-1',
      {
        provider: 'gpt-4.1',
        visualScore: 82,
        narrativeScore: 77,
        audioScore: 65,
      },
      fakeClient,
    );
    expect(saved.provider).toBe('gpt-4.1');
    expect(saved.score).toBeGreaterThan(0);

    const stored = await metricsService.getMultimodalGlowUpScore(
      'draft-1',
      'gpt-4.1',
      fakeClient,
    );
    expect(stored).not.toBeNull();
    expect(stored?.provider).toBe('gpt-4.1');
    expect(stored?.breakdown.modalities.visual?.rawScore).toBe(82);
  });
});
