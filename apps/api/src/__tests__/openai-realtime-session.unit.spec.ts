import type { ServiceError } from '../services/common/errors';
import { OpenAIRealtimeSessionServiceImpl } from '../services/openaiRealtime/openaiRealtimeSessionService';

describe('OpenAIRealtimeSessionServiceImpl', () => {
  const previousFetch = globalThis.fetch;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    globalThis.fetch = previousFetch;
    process.env.OPENAI_API_KEY = previousOpenAiKey;
    jest.restoreAllMocks();
  });

  test('throws not configured error when api key is missing', async () => {
    process.env.OPENAI_API_KEY = '';
    const service = new OpenAIRealtimeSessionServiceImpl();

    await expect(
      service.createSession({
        liveSessionId: 'session-1',
        draftId: 'draft-1',
        liveTitle: 'Realtime title',
        liveObjective: 'Realtime objective',
        observerId: 'observer-1',
        outputModalities: ['audio'],
        voice: 'marin',
        pushToTalk: false,
      }),
    ).rejects.toMatchObject<ServiceError>({
      code: 'OPENAI_REALTIME_NOT_CONFIGURED',
      status: 503,
    });
  });

  test('creates realtime session and returns normalized bootstrap payload', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'rt_session_abc',
        expires_at: '2026-02-25T12:00:00.000Z',
        client_secret: {
          value: 'secret_abc',
          expires_at: '2026-02-25T11:30:00.000Z',
        },
      }),
      text: async () => '',
    } as Response);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const service = new OpenAIRealtimeSessionServiceImpl();

    const result = await service.createSession({
      liveSessionId: 'session-1',
      draftId: 'draft-1',
      liveTitle: 'Realtime title',
      liveObjective: 'Realtime objective',
      observerId: 'observer-1',
      outputModalities: ['audio', 'audio'],
      voice: 'marin',
      pushToTalk: true,
      topicHint: 'Keep it concise',
      metadata: { source: 'unit-test' },
    });

    expect(result).toEqual({
      provider: 'openai',
      sessionId: 'rt_session_abc',
      clientSecret: 'secret_abc',
      clientSecretExpiresAt: '2026-02-25T11:30:00.000Z',
      expiresAt: '2026-02-25T12:00:00.000Z',
      model: 'gpt-realtime',
      outputModalities: ['audio'],
      voice: 'marin',
      transportHints: {
        recommended: 'webrtc',
        websocketSupported: true,
        pushToTalk: true,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/realtime/sessions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer test-openai-key',
        'Content-Type': 'application/json',
      }),
    );
    const body = JSON.parse(String(init.body)) as {
      audio?: { input?: { turn_detection?: unknown } };
      output_modalities?: string[];
      metadata?: Record<string, string>;
    };
    expect(body.audio?.input?.turn_detection).toBeNull();
    expect(body.output_modalities).toEqual(['audio']);
    expect(body.metadata).toEqual(
      expect.objectContaining({
        source: 'unit-test',
        live_session_id: 'session-1',
      }),
    );
  });
});
