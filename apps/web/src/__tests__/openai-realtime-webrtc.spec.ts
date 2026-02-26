/**
 * @jest-environment jsdom
 */
import {
  connectOpenAIRealtimeConnection,
  type RealtimeCopilotBootstrapPayload,
} from '../lib/openaiRealtimeWebRtc';

describe('openaiRealtimeWebRtc', () => {
  const bootstrap: RealtimeCopilotBootstrapPayload = {
    provider: 'openai',
    sessionId: 'rt-session-1',
    clientSecret: 'secret-1',
    model: 'gpt-realtime',
    voice: 'marin',
    outputModalities: ['audio'],
    pushToTalk: true,
  };

  test('fails fast when WebRTC is unavailable', async () => {
    const previousRtc = (globalThis as { RTCPeerConnection?: unknown })
      .RTCPeerConnection;
    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection =
      undefined;

    await expect(
      connectOpenAIRealtimeConnection({
        liveSessionId: 'live-1',
        bootstrap,
        onServerEvent: jest.fn(),
      }),
    ).rejects.toThrow('WebRTC is not available');

    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection =
      previousRtc;
  });

  test('connects via WebRTC, forwards server events, and sends client events', async () => {
    const sendMock = jest.fn();
    const closeChannelMock = jest.fn();
    const addTrack = jest.fn();
    const channel: {
      readyState: string;
      onmessage: null | ((event: { data: string }) => void);
      onopen: null | (() => void);
      onerror: null | (() => void);
      onclose: null | (() => void);
      send: jest.Mock;
      close: jest.Mock;
    } = {
      readyState: 'connecting',
      onmessage: null,
      onopen: null,
      onerror: null,
      onclose: null,
      send: sendMock,
      close: closeChannelMock,
    };

    const setLocalDescription = jest.fn();
    const setRemoteDescription = jest.fn();
    const closePeerConnection = jest.fn();
    const peerConnection = {
      iceGatheringState: 'complete',
      localDescription: {
        type: 'offer',
        sdp: 'offer-sdp',
      },
      createDataChannel: jest.fn(() => channel),
      createOffer: jest.fn(async () => ({
        type: 'offer',
        sdp: 'offer-sdp',
      })),
      setLocalDescription,
      setRemoteDescription,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addTrack,
      ontrack: null as null | ((event: { streams: unknown[] }) => void),
      close: closePeerConnection,
    };
    const mockTrack = {
      enabled: true,
      readyState: 'live',
      stop: jest.fn(),
    };
    const mockStream = {
      getAudioTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    };

    const previousRtc = (globalThis as { RTCPeerConnection?: unknown })
      .RTCPeerConnection;
    const previousFetch = globalThis.fetch;
    const previousMediaDevices = (
      navigator as Navigator & {
        mediaDevices?: {
          getUserMedia?: (
            constraints: MediaStreamConstraints,
          ) => Promise<unknown>;
        };
      }
    ).mediaDevices;

    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = jest.fn(
      () => peerConnection,
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: jest.fn(async () => mockStream),
      },
    });
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => 'answer-sdp',
    })) as unknown as typeof fetch;

    const onServerEvent = jest.fn();
    const connection = await connectOpenAIRealtimeConnection({
      liveSessionId: 'live-1',
      bootstrap,
      onServerEvent,
    });

    connection.sendClientEvent({
      type: 'response.create',
    });
    expect(sendMock).not.toHaveBeenCalled();

    channel.readyState = 'open';
    channel.onopen?.();
    expect(sendMock.mock.calls[0][0]).toEqual(
      JSON.stringify({
        type: 'session.update',
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          output_modalities: ['audio'],
          audio: {
            output: {
              voice: 'marin',
            },
            input: {
              turn_detection: null,
            },
          },
        },
      }),
    );
    expect(sendMock.mock.calls[1][0]).toEqual(
      JSON.stringify({
        type: 'response.create',
      }),
    );

    channel.onmessage?.({
      data: '{"type":"response.done"}',
    });
    expect(onServerEvent).toHaveBeenCalledWith({
      type: 'response.done',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime?model=gpt-realtime',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(setLocalDescription).toHaveBeenCalled();
    expect(setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp',
    });
    expect(addTrack).toHaveBeenCalled();

    connection.startPushToTalk();
    connection.stopPushToTalk();
    connection.interrupt();
    expect(sendMock).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'input_audio_buffer.clear',
      }),
    );
    expect(sendMock).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'input_audio_buffer.commit',
      }),
    );
    expect(sendMock).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'output_audio_buffer.clear',
      }),
    );

    connection.close();
    expect(closeChannelMock).toHaveBeenCalled();
    expect(closePeerConnection).toHaveBeenCalled();
    expect(mockTrack.stop).toHaveBeenCalled();

    globalThis.fetch = previousFetch;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: previousMediaDevices,
    });
    (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection =
      previousRtc;
  });
});
