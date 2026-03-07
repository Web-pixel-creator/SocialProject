import type { ServiceError } from '../services/common/errors';
import { VoiceLaneServiceImpl } from '../services/voice/voiceLaneService';
import type { ProviderRoutingService } from '../services/providerRouting/types';
import type { StorageService } from '../services/storage/types';

describe('VoiceLaneServiceImpl', () => {
  const previousDeepgramKey = process.env.DEEPGRAM_API_KEY;
  const previousDeepgramModel = process.env.DEEPGRAM_VOICE_RENDER_MODEL;

  const createRoute = () => ({
    budgetCapUsd: null,
    cacheEligible: false,
    disabledProviders: [],
    grounded: false,
    lane: 'voice_render' as const,
    providers: [
      {
        enabled: true,
        model: 'aura-2',
        provider: 'deepgram',
        role: 'primary' as const,
      },
    ],
    requestedProviders: [],
    resolvedProviders: [
      {
        model: 'aura-2',
        provider: 'deepgram',
        role: 'primary' as const,
      },
    ],
    stage: 'pilot' as const,
  });

  afterEach(() => {
    if (previousDeepgramKey === undefined) {
      delete process.env.DEEPGRAM_API_KEY;
    } else {
      process.env.DEEPGRAM_API_KEY = previousDeepgramKey;
    }
    if (previousDeepgramModel === undefined) {
      delete process.env.DEEPGRAM_VOICE_RENDER_MODEL;
    } else {
      process.env.DEEPGRAM_VOICE_RENDER_MODEL = previousDeepgramModel;
    }
    jest.restoreAllMocks();
  });

  test('throws not configured error when Deepgram API key is missing', async () => {
    process.env.DEEPGRAM_API_KEY = '';
    const recordExecution = jest.fn().mockResolvedValue(undefined);
    const service = new VoiceLaneServiceImpl({
      providerRouting: {
        recordExecution,
        resolveRoute: jest.fn().mockReturnValue(createRoute()),
      } as unknown as ProviderRoutingService,
      queryable: {
        query: jest.fn(),
      },
      storageService: {
        deleteObject: jest.fn(),
        generateSignedUrl: jest.fn(),
        uploadObject: jest.fn(),
        uploadVersion: jest.fn(),
      } as unknown as StorageService,
    });

    await expect(
      service.renderArtifact({
        createdByType: 'admin',
        scope: 'admin_preview',
        script: 'Preview script',
      }),
    ).rejects.toMatchObject<ServiceError>({
      code: 'VOICE_RENDER_NOT_CONFIGURED',
      status: 503,
    });
    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: 'voice_render',
        operation: 'voice_render_preview',
        provider: 'deepgram',
        status: 'failed',
        userType: 'admin',
      }),
    );
  });

  test('renders, stores, and persists Deepgram voice artifacts', async () => {
    process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';
    process.env.DEEPGRAM_VOICE_RENDER_MODEL = 'aura-2-thalia-en';
    const recordExecution = jest.fn().mockResolvedValue(undefined);
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          artifact_url: 'http://localhost:9000/test-bucket/voice-render/admin-previews/test.wav',
          content_type: 'audio/wav',
          created_at: new Date('2026-03-07T12:00:00.000Z'),
          created_by_id: null,
          created_by_type: 'admin',
          draft_id: 'draft-1',
          duration_ms: 2100,
          id: 'artifact-1',
          lane: 'voice_render',
          live_session_id: null,
          metadata: {
            deepgramRequestId: 'dg-request-1',
            sourceRoute: '/api/admin/provider-lanes/voice-render/preview',
          },
          model: 'aura-2-luna-en',
          provider: 'deepgram',
          scope: 'admin_preview',
          script: 'Ship the recap clip',
          storage_key: 'voice-render/admin-previews/test.wav',
          transcript: 'Ship the recap clip',
          voice: 'luna',
        },
      ],
    });
    const uploadObject = jest.fn().mockResolvedValue({
      key: 'voice-render/admin-previews/test.wav',
      url: 'http://localhost:9000/test-bucket/voice-render/admin-previews/test.wav',
    });
    const storageService = {
      deleteObject: jest.fn(),
      generateSignedUrl: jest.fn(),
      uploadObject,
      uploadVersion: jest.fn(),
    } as unknown as StorageService;
    const fetchMock = jest.fn().mockResolvedValue({
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
      headers: new Headers({
        'content-duration': '2.1',
        'content-type': 'audio/wav',
        'dg-request-id': 'dg-request-1',
      }),
      ok: true,
      status: 200,
      text: async () => '',
    } as Response);
    const service = new VoiceLaneServiceImpl({
      fetchImpl: fetchMock as unknown as typeof fetch,
      providerRouting: {
        recordExecution,
        resolveRoute: jest.fn().mockReturnValue(createRoute()),
      } as unknown as ProviderRoutingService,
      queryable: { query },
      storageService,
    });

    const artifact = await service.renderArtifact({
      createdByType: 'admin',
      draftId: 'draft-1',
      metadata: {
        sourceRoute: '/api/admin/provider-lanes/voice-render/preview',
      },
      scope: 'admin_preview',
      script: 'Ship the recap clip',
      voice: 'luna',
    });

    expect(artifact).toEqual(
      expect.objectContaining({
        artifactUrl: 'http://localhost:9000/test-bucket/voice-render/admin-previews/test.wav',
        durationMs: 2100,
        id: 'artifact-1',
        model: 'aura-2-luna-en',
        provider: 'deepgram',
        scope: 'admin_preview',
        voice: 'luna',
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.deepgram.com/v1/speak?model=aura-2-luna-en');
    expect(calledInit.method).toBe('POST');
    expect(calledInit.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Token test-deepgram-key',
        'Content-Type': 'application/json',
      }),
    );
    expect(JSON.parse(String(calledInit.body))).toEqual({
      text: 'Ship the recap clip',
    });
    expect(uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.any(Buffer),
        contentType: 'audio/wav',
      }),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO voice_render_artifacts'),
      expect.arrayContaining([
        'admin_preview',
        null,
        'draft-1',
        'Ship the recap clip',
        'Ship the recap clip',
        'deepgram',
        'aura-2-luna-en',
        'luna',
        2100,
      ]),
    );
    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: 'voice_render',
        operation: 'voice_render_preview',
        provider: 'deepgram',
        status: 'ok',
        userType: 'admin',
      }),
    );
  });
});
