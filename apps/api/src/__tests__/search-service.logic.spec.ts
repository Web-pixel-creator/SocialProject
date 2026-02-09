import type { Pool } from 'pg';
import { env } from '../config/env';
import type { DbClient } from '../services/auth/types';
import { SearchServiceImpl } from '../services/search/searchService';

const createService = () => new SearchServiceImpl({} as Pool);

const createClient = () =>
  ({
    query: jest.fn(),
  }) as unknown as DbClient;

describe('search service logic branches', () => {
  test('search uses relevance sorting with range and ready-for-review intent', async () => {
    const service = createService();
    const client = createClient();
    const queryMock = client.query as jest.Mock;
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'draft-low',
            status: 'draft',
            glow_up_score: 5,
            metadata: { title: 'alpha draft' },
            updated_at: '2024-01-01T00:00:00.000Z',
            before_image_url: null,
            after_image_url: null,
          },
          {
            id: 'draft-high',
            status: 'draft',
            glow_up_score: 90,
            metadata: { title: 'alpha alpha' },
            updated_at: '2026-02-01T00:00:00.000Z',
            before_image_url: null,
            after_image_url: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'studio-low',
            studio_name: 'Other studio',
            impact: 95,
          },
          {
            id: 'studio-hit',
            studio_name: 'Alpha Guild',
            impact: 25,
          },
        ],
      });

    const results = await service.search(
      'alpha',
      {
        type: 'all',
        sort: 'relevance',
        range: '30d',
        profile: 'quality',
        intent: 'ready_for_review',
        limit: 2,
        offset: 1,
      },
      client,
    );

    const draftQuery = queryMock.mock.calls[0][0] as string;
    expect(draftQuery).toContain("INTERVAL '30 days'");
    expect(draftQuery).toContain("pr.status = 'pending'");
    expect(queryMock.mock.calls[0][1]).toEqual(['%alpha%', 2, 1]);
    expect(queryMock.mock.calls[1][0]).toContain('FROM agents');

    const draftResults = results.filter((item) => item.type !== 'studio');
    const studioResults = results.filter((item) => item.type === 'studio');
    expect(draftResults[0]?.id).toBe('draft-high');
    expect(studioResults[0]?.id).toBe('studio-hit');
  });

  test('search builds seeking-pr intent clause', async () => {
    const service = createService();
    const client = createClient();
    const queryMock = client.query as jest.Mock;
    queryMock.mockResolvedValueOnce({ rows: [] });

    await service.search(
      'seek',
      { type: 'draft', intent: 'seeking_pr' },
      client,
    );

    const draftQuery = queryMock.mock.calls[0][0] as string;
    expect(draftQuery).toContain('EXISTS (SELECT 1 FROM fix_requests fr');
    expect(draftQuery).toContain('NOT EXISTS (SELECT 1 FROM pull_requests pr');
  });

  test('search builds needs-help intent clause', async () => {
    const service = createService();
    const client = createClient();
    const queryMock = client.query as jest.Mock;
    queryMock.mockResolvedValueOnce({ rows: [] });

    await service.search(
      'help',
      { type: 'draft', intent: 'needs_help' },
      client,
    );

    const draftQuery = queryMock.mock.calls[0][0] as string;
    expect(draftQuery).toContain("d.status = 'draft' AND NOT EXISTS");
  });

  test('search supports novelty profile relevance path', async () => {
    const service = createService();
    const client = createClient();
    const queryMock = client.query as jest.Mock;
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'draft-a',
            status: 'draft',
            glow_up_score: 20,
            metadata: { title: 'novel draft' },
            updated_at: '2026-02-01T00:00:00.000Z',
            before_image_url: null,
            after_image_url: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'studio-a', studio_name: 'novel studio', impact: 20 }],
      });

    const results = await service.search(
      'novel',
      { type: 'all', sort: 'relevance', profile: 'novelty' },
      client,
    );

    expect(results.length).toBe(2);
    expect(results[0].id).toBe('draft-a');
    expect(results[1].id).toBe('studio-a');
  });

  test('search falls back to default weights when env weights are non-positive', async () => {
    const service = createService();
    const client = createClient();
    const queryMock = client.query as jest.Mock;
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'draft-default',
            status: 'draft',
            glow_up_score: 10,
            metadata: { title: 'default weights' },
            updated_at: '2026-02-01T00:00:00.000Z',
            before_image_url: null,
            after_image_url: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'studio-default', studio_name: 'default studio', impact: 10 },
        ],
      });

    const previous = {
      keyword: env.SEARCH_RELEVANCE_WEIGHT_KEYWORD,
      glowup: env.SEARCH_RELEVANCE_WEIGHT_GLOWUP,
      recency: env.SEARCH_RELEVANCE_WEIGHT_RECENCY,
      studioKeyword: env.SEARCH_RELEVANCE_WEIGHT_STUDIO_KEYWORD,
      studioImpact: env.SEARCH_RELEVANCE_WEIGHT_STUDIO_IMPACT,
    };

    Object.assign(env, {
      SEARCH_RELEVANCE_WEIGHT_KEYWORD: 0,
      SEARCH_RELEVANCE_WEIGHT_GLOWUP: 0,
      SEARCH_RELEVANCE_WEIGHT_RECENCY: 0,
      SEARCH_RELEVANCE_WEIGHT_STUDIO_KEYWORD: 0,
      SEARCH_RELEVANCE_WEIGHT_STUDIO_IMPACT: 0,
    });

    try {
      const results = await service.search(
        'default',
        { type: 'all', sort: 'relevance' },
        client,
      );
      expect(results.length).toBe(2);
    } finally {
      Object.assign(env, {
        SEARCH_RELEVANCE_WEIGHT_KEYWORD: previous.keyword,
        SEARCH_RELEVANCE_WEIGHT_GLOWUP: previous.glowup,
        SEARCH_RELEVANCE_WEIGHT_RECENCY: previous.recency,
        SEARCH_RELEVANCE_WEIGHT_STUDIO_KEYWORD: previous.studioKeyword,
        SEARCH_RELEVANCE_WEIGHT_STUDIO_IMPACT: previous.studioImpact,
      });
    }
  });

  test('searchSimilar throws when draft is missing', async () => {
    const service = createService();
    const client = createClient();
    const queryMock = client.query as jest.Mock;
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.searchSimilar(
        '00000000-0000-0000-0000-000000000111',
        undefined,
        client,
      ),
    ).rejects.toMatchObject({
      code: 'DRAFT_NOT_FOUND',
      status: 404,
    });
  });

  test('searchSimilar throws when embedding is missing', async () => {
    const service = createService();
    const client = createClient();
    const queryMock = client.query as jest.Mock;
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'draft-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.searchSimilar(
        '00000000-0000-0000-0000-000000000112',
        undefined,
        client,
      ),
    ).rejects.toMatchObject({
      code: 'EMBEDDING_NOT_FOUND',
      status: 404,
    });
  });

  test('searchVisual validates required input and missing embedding by draftId', async () => {
    const service = createService();
    const noDraftClient = createClient();
    const noDraftQuery = noDraftClient.query as jest.Mock;

    await expect(service.searchVisual({}, noDraftClient)).rejects.toMatchObject(
      {
        code: 'EMBEDDING_REQUIRED',
        status: 400,
      },
    );
    expect(noDraftQuery).not.toHaveBeenCalled();

    const missingEmbeddingClient = createClient();
    const missingEmbeddingQuery = missingEmbeddingClient.query as jest.Mock;
    missingEmbeddingQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.searchVisual(
        { draftId: 'draft-missing' },
        missingEmbeddingClient,
      ),
    ).rejects.toMatchObject({
      code: 'EMBEDDING_NOT_FOUND',
      status: 404,
    });
    expect(missingEmbeddingQuery).toHaveBeenCalledTimes(1);
  });

  test('searchVisual applies filters, skips invalid embeddings, and slices by offset', async () => {
    const service = createService();
    const client = createClient();
    const queryMock = client.query as jest.Mock;
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'skip-invalid',
          status: 'release',
          glow_up_score: 1,
          metadata: { title: 'Skip invalid' },
          embedding: 'not-an-array',
          before_image_url: null,
          after_image_url: null,
        },
        {
          id: 'score-zero',
          status: 'release',
          glow_up_score: 0,
          metadata: { title: '' },
          embedding: [0, 0],
          before_image_url: null,
          after_image_url: null,
        },
        {
          id: 'empty-embedding',
          status: 'draft',
          glow_up_score: 5,
          metadata: { title: 'Has title' },
          embedding: [Number.NaN],
          before_image_url: null,
          after_image_url: null,
        },
        {
          id: 'valid-row',
          status: 'release',
          glow_up_score: '9',
          metadata: { title: 'Valid row' },
          embedding: [1, 1],
          before_image_url: 'before.png',
          after_image_url: 'after.png',
        },
      ],
    });

    const results = await service.searchVisual(
      {
        embedding: [0, 0],
        filters: {
          type: 'release',
          tags: ['neon'],
          excludeDraftId: 'draft-excluded',
          limit: 2,
          offset: 1,
        },
      },
      client,
    );

    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("d.status = 'release'");
    expect(sql).toContain("COALESCE(d.metadata->'tags', '[]'::jsonb) ?| $2");
    expect(sql).toContain('d.id <> $3');
    expect(queryMock.mock.calls[0][1]).toEqual([
      100,
      ['neon'],
      'draft-excluded',
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('empty-embedding');
    expect(results[0].type).toBe('draft');
    expect(results[1].id).toBe('valid-row');
    expect(results[1].beforeImageUrl).toBe('before.png');
  });

  test('upsertDraftEmbedding sanitizes vectors and rejects invalid payloads', async () => {
    const service = createService();
    const validClient = createClient();
    const validQuery = validClient.query as jest.Mock;
    validQuery.mockResolvedValueOnce({ rows: [] });

    await service.upsertDraftEmbedding(
      'draft-valid',
      [1, Number.NaN, Number.POSITIVE_INFINITY, 2],
      'manual',
      validClient,
    );
    expect(validQuery).toHaveBeenCalledWith(expect.any(String), [
      'draft-valid',
      JSON.stringify([1, 2]),
      'manual',
    ]);

    const invalidClient = createClient();
    await expect(
      service.upsertDraftEmbedding(
        'draft-invalid',
        null as unknown as number[],
        'manual',
        invalidClient,
      ),
    ).rejects.toMatchObject({
      code: 'EMBEDDING_INVALID',
      status: 400,
    });
  });
});
