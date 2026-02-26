/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import useSWR from 'swr';
import {
  LIVE_SESSION_REALTIME_CLIENT_EVENT,
  LIVE_SESSION_REALTIME_SERVER_EVENT,
  LiveStudioSessionsRail,
} from '../components/LiveStudioSessionsRail';
import { LanguageProvider } from '../contexts/LanguageContext';
import { apiClient } from '../lib/api';
import {
  connectOpenAIRealtimeConnection,
  type OpenAIRealtimeConnection,
} from '../lib/openaiRealtimeWebRtc';
import { handleRealtimeToolCallsFromResponseDone } from '../lib/realtimeToolBridge';

jest.mock('swr');
jest.mock('../lib/api', () => ({
  apiClient: {
    post: jest.fn(),
    defaults: {
      headers: {
        common: {},
      },
    },
  },
}));
jest.mock('../lib/realtimeToolBridge', () => ({
  handleRealtimeToolCallsFromResponseDone: jest.fn(),
}));
jest.mock('../lib/openaiRealtimeWebRtc', () => ({
  connectOpenAIRealtimeConnection: jest.fn(),
}));

const mockedUseSWR = useSWR as jest.MockedFunction<typeof useSWR>;
const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockedHandleRealtimeToolCallsFromResponseDone =
  handleRealtimeToolCallsFromResponseDone as jest.MockedFunction<
    typeof handleRealtimeToolCallsFromResponseDone
  >;
const mockedConnectOpenAIRealtimeConnection =
  connectOpenAIRealtimeConnection as jest.MockedFunction<
    typeof connectOpenAIRealtimeConnection
  >;

const createMockRealtimeConnection = (
  overrides: Partial<OpenAIRealtimeConnection> = {},
): OpenAIRealtimeConnection => ({
  liveSessionId: 'live-session-1',
  sessionId: 'rt-session-1',
  pushToTalkEnabled: true,
  sendClientEvent: jest.fn(),
  startPushToTalk: jest.fn(),
  stopPushToTalk: jest.fn(),
  interrupt: jest.fn(),
  close: jest.fn(),
  ...overrides,
});

describe('LiveStudioSessionsRail', () => {
  beforeEach(() => {
    mockedUseSWR.mockReset();
    mockedApiClient.post.mockReset();
    mockedConnectOpenAIRealtimeConnection.mockReset();
    mockedHandleRealtimeToolCallsFromResponseDone.mockReset();
    mockedHandleRealtimeToolCallsFromResponseDone.mockResolvedValue({
      processed: 0,
    });
    mockedConnectOpenAIRealtimeConnection.mockImplementation(
      async ({ liveSessionId, bootstrap }) =>
        createMockRealtimeConnection({
          liveSessionId,
          sessionId: bootstrap.sessionId,
        }),
    );
    (
      mockedApiClient.defaults as {
        headers?: {
          common?: Record<string, unknown>;
        };
      }
    ).headers = {
      common: {},
    };
    window.localStorage.removeItem('finishit-language');
  });

  test('renders live studio sessions summary', () => {
    mockedUseSWR.mockReturnValue({
      data: [
        {
          id: 'live-session-1',
          title: 'Live typography pass',
          objective: 'Fix spacing and hierarchy for feed cards',
          status: 'live',
          participantCount: 22,
          messageCount: 17,
          lastActivityAt: new Date().toISOString(),
          overlay: {
            humanCount: 15,
            agentCount: 7,
            latestMessage:
              'Merge momentum is rising after the latest revision.',
            mergeSignalPct: 64,
            rejectSignalPct: 36,
            recapSummary: null,
            recapClipUrl: null,
          },
        },
      ],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);

    render(<LiveStudioSessionsRail />);

    expect(screen.getByText(/Live studio sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/Live typography pass/i)).toBeInTheDocument();
    expect(screen.getByText(/22 joined/i)).toBeInTheDocument();
    expect(screen.getByText(/17 messages/i)).toBeInTheDocument();
    expect(screen.getByText(/Session overlay/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Start realtime copilot/i }),
    ).toBeInTheDocument();
  });

  test('uses RU locale copy from language context', async () => {
    window.localStorage.setItem('finishit-language', 'ru');
    mockedUseSWR.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);

    render(
      <LanguageProvider>
        <LiveStudioSessionsRail />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Живые сессии студий/i)).toBeInTheDocument();
      expect(screen.getByText(/Сейчас нет живых сессий/i)).toBeInTheDocument();
    });
  });

  test('uses localized RU fallback session content when data is unavailable', async () => {
    window.localStorage.setItem('finishit-language', 'ru');
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);

    render(
      <LanguageProvider>
        <LiveStudioSessionsRail />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Живой разбор промпта/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /Аудитория склоняется к слиянию после последнего прохода агентов/i,
        ),
      ).toBeInTheDocument();
    });
  });

  test('starts realtime copilot bootstrap and shows ready status', async () => {
    (
      mockedApiClient.defaults as {
        headers?: { common?: Record<string, unknown> };
      }
    ).headers = {
      common: {
        Authorization: 'Bearer token',
      },
    };
    mockedUseSWR.mockReturnValue({
      data: [
        {
          id: 'live-session-1',
          title: 'Live typography pass',
          objective: 'Fix spacing and hierarchy for feed cards',
          status: 'live',
          participantCount: 22,
          messageCount: 17,
          lastActivityAt: new Date().toISOString(),
          overlay: {
            humanCount: 15,
            agentCount: 7,
            latestMessage:
              'Merge momentum is rising after the latest revision.',
            mergeSignalPct: 64,
            rejectSignalPct: 36,
            recapSummary: null,
            recapClipUrl: null,
          },
        },
      ],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);
    mockedApiClient.post.mockResolvedValue({
      data: {
        provider: 'openai',
        sessionId: 'rt-session-1',
        clientSecret: 'secret-1',
      },
    });

    render(<LiveStudioSessionsRail />);

    fireEvent.click(
      screen.getByRole('button', { name: /Start realtime copilot/i }),
    );

    await waitFor(() => {
      expect(mockedApiClient.post).toHaveBeenCalledWith(
        '/live-sessions/live-session-1/realtime/session',
        expect.objectContaining({
          outputModalities: ['audio'],
          voice: 'marin',
          pushToTalk: true,
        }),
      );
      expect(mockedConnectOpenAIRealtimeConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          liveSessionId: 'live-session-1',
          bootstrap: expect.objectContaining({
            provider: 'openai',
            sessionId: 'rt-session-1',
            clientSecret: 'secret-1',
          }),
        }),
      );
    });
    expect(
      screen.getByText(/Copilot ready: session rt-session-1/i),
    ).toBeVisible();
    expect(screen.getByText(/Tool bridge: 0 processed/i)).toBeVisible();
  });

  test('shows sign in hint and auth error on bootstrap failure', async () => {
    mockedUseSWR.mockReturnValue({
      data: [
        {
          id: 'live-session-2',
          title: 'Live auth check',
          objective: 'Need observer login',
          status: 'live',
          participantCount: 5,
          messageCount: 2,
          lastActivityAt: new Date().toISOString(),
          overlay: {
            humanCount: 2,
            agentCount: 3,
            latestMessage: null,
            mergeSignalPct: 0,
            rejectSignalPct: 0,
            recapSummary: null,
            recapClipUrl: null,
          },
        },
      ],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);
    mockedApiClient.post.mockRejectedValue({
      response: {
        status: 401,
        data: {
          error: 'AUTH_REQUIRED',
        },
      },
    });

    render(<LiveStudioSessionsRail />);

    expect(
      screen.getByRole('link', { name: /Sign in required/i }),
    ).toHaveAttribute('href', '/login');

    fireEvent.click(
      screen.getByRole('button', { name: /Start realtime copilot/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Sign in as observer to start realtime copilot\./i),
      ).toBeVisible();
    });
  });

  test('routes realtime server events into tool bridge and publishes client events', async () => {
    (
      mockedApiClient.defaults as {
        headers?: { common?: Record<string, unknown> };
      }
    ).headers = {
      common: {
        Authorization: 'Bearer token',
      },
    };
    mockedUseSWR.mockReturnValue({
      data: [
        {
          id: 'live-session-1',
          title: 'Live tool bridge',
          objective: 'Execute tool calls from response.done',
          status: 'live',
          participantCount: 11,
          messageCount: 9,
          lastActivityAt: new Date().toISOString(),
          overlay: {
            humanCount: 5,
            agentCount: 6,
            latestMessage: 'Tool call ready.',
            mergeSignalPct: 50,
            rejectSignalPct: 50,
            recapSummary: null,
            recapClipUrl: null,
          },
        },
      ],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);
    mockedApiClient.post.mockResolvedValue({
      data: {
        provider: 'openai',
        sessionId: 'rt-session-tools',
        clientSecret: 'secret-tools',
      },
    });
    const sendClientEvent = jest.fn();
    const startPushToTalk = jest.fn();
    const stopPushToTalk = jest.fn();
    const interrupt = jest.fn();
    mockedConnectOpenAIRealtimeConnection.mockResolvedValueOnce({
      liveSessionId: 'live-session-1',
      sessionId: 'rt-session-tools',
      pushToTalkEnabled: true,
      sendClientEvent,
      startPushToTalk,
      stopPushToTalk,
      interrupt,
      close: jest.fn(),
    });

    const emittedClientEvents: Record<string, unknown>[] = [];
    const onClientEvent = (event: Event) => {
      emittedClientEvents.push(
        ((event as CustomEvent).detail ?? {}) as Record<string, unknown>,
      );
    };
    window.addEventListener(LIVE_SESSION_REALTIME_CLIENT_EVENT, onClientEvent);
    mockedHandleRealtimeToolCallsFromResponseDone.mockImplementationOnce(
      ({ sendClientEvent }) => {
        sendClientEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: 'call_1',
          },
        });
        return { processed: 1 };
      },
    );

    render(<LiveStudioSessionsRail />);

    fireEvent.click(
      screen.getByRole('button', { name: /Start realtime copilot/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Copilot ready: session rt-session-tools/i),
      ).toBeVisible();
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(LIVE_SESSION_REALTIME_SERVER_EVENT, {
          detail: {
            liveSessionId: 'live-session-1',
            serverEvent: {
              type: 'response.done',
              response: {
                output: [
                  {
                    type: 'function_call',
                    name: 'follow_studio',
                    call_id: 'call_1',
                    arguments:
                      '{"studioId":"00000000-0000-0000-0000-000000000002"}',
                  },
                ],
              },
            },
          },
        }),
      );
    });

    await waitFor(() => {
      expect(mockedHandleRealtimeToolCallsFromResponseDone).toHaveBeenCalled();
      expect(screen.getByText(/Tool bridge: 1 processed/i)).toBeVisible();
      expect(emittedClientEvents).toContainEqual({
        liveSessionId: 'live-session-1',
        clientEvent: {
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: 'call_1',
          },
        },
      });
      expect(sendClientEvent).toHaveBeenCalledWith({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: 'call_1',
        },
      });
    });

    window.removeEventListener(
      LIVE_SESSION_REALTIME_CLIENT_EVENT,
      onClientEvent,
    );
  });

  test('supports push-to-talk hold and interrupt controls', async () => {
    (
      mockedApiClient.defaults as {
        headers?: { common?: Record<string, unknown> };
      }
    ).headers = {
      common: {
        Authorization: 'Bearer token',
      },
    };
    mockedUseSWR.mockReturnValue({
      data: [
        {
          id: 'live-session-voice',
          title: 'Live voice room',
          objective: 'Validate push-to-talk controls',
          status: 'live',
          participantCount: 9,
          messageCount: 12,
          lastActivityAt: new Date().toISOString(),
          overlay: {
            humanCount: 6,
            agentCount: 3,
            latestMessage: 'Voice control armed.',
            mergeSignalPct: 58,
            rejectSignalPct: 42,
            recapSummary: null,
            recapClipUrl: null,
          },
        },
      ],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);
    mockedApiClient.post.mockResolvedValue({
      data: {
        provider: 'openai',
        sessionId: 'rt-session-voice',
        clientSecret: 'secret-voice',
      },
    });

    const startPushToTalk = jest.fn();
    const stopPushToTalk = jest.fn();
    const interrupt = jest.fn();
    mockedConnectOpenAIRealtimeConnection.mockResolvedValueOnce(
      createMockRealtimeConnection({
        liveSessionId: 'live-session-voice',
        sessionId: 'rt-session-voice',
        startPushToTalk,
        stopPushToTalk,
        interrupt,
        pushToTalkEnabled: true,
      }),
    );

    render(<LiveStudioSessionsRail />);

    fireEvent.click(
      screen.getByRole('button', { name: /Start realtime copilot/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Copilot ready: session rt-session-voice/i),
      ).toBeVisible();
    });

    const holdButton = screen.getByRole('button', { name: /Hold to talk/i });
    fireEvent.pointerDown(holdButton);
    await waitFor(() => {
      expect(startPushToTalk).toHaveBeenCalledTimes(1);
    });
    fireEvent.pointerUp(holdButton);
    expect(stopPushToTalk).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', { name: /Interrupt response/i }),
    );
    expect(interrupt).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    await waitFor(() => {
      expect(startPushToTalk).toHaveBeenCalledTimes(2);
    });
    fireEvent.keyUp(window, { code: 'Space', key: ' ' });
    expect(stopPushToTalk).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Keyboard: hold/i)).toBeVisible();
  });

  test('renders live transcript deltas from realtime server events', async () => {
    (
      mockedApiClient.defaults as {
        headers?: { common?: Record<string, unknown> };
      }
    ).headers = {
      common: {
        Authorization: 'Bearer token',
      },
    };
    mockedUseSWR.mockReturnValue({
      data: [
        {
          id: 'live-session-transcript',
          title: 'Live transcript room',
          objective: 'Stream transcript deltas',
          status: 'live',
          participantCount: 4,
          messageCount: 3,
          lastActivityAt: new Date().toISOString(),
          overlay: {
            humanCount: 2,
            agentCount: 2,
            latestMessage: 'Transcript incoming.',
            mergeSignalPct: 50,
            rejectSignalPct: 50,
            recapSummary: null,
            recapClipUrl: null,
          },
        },
      ],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);
    mockedApiClient.post.mockImplementation((url) => {
      if (url === '/live-sessions/live-session-transcript/realtime/session') {
        return Promise.resolve({
          data: {
            provider: 'openai',
            sessionId: 'rt-session-transcript',
            clientSecret: 'secret-transcript',
          },
        });
      }
      if (url === '/live-sessions/live-session-transcript/messages/observer') {
        return Promise.resolve({
          data: {
            id: 'live-message-voice',
          },
        });
      }
      throw new Error(`Unexpected url: ${url}`);
    });
    mockedConnectOpenAIRealtimeConnection.mockResolvedValueOnce(
      createMockRealtimeConnection({
        liveSessionId: 'live-session-transcript',
        sessionId: 'rt-session-transcript',
      }),
    );

    render(<LiveStudioSessionsRail />);

    fireEvent.click(
      screen.getByRole('button', { name: /Start realtime copilot/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Copilot ready: session rt-session-transcript/i),
      ).toBeVisible();
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(LIVE_SESSION_REALTIME_SERVER_EVENT, {
          detail: {
            liveSessionId: 'live-session-transcript',
            serverEvent: {
              type: 'input_audio_buffer.speech_started',
            },
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent(LIVE_SESSION_REALTIME_SERVER_EVENT, {
          detail: {
            liveSessionId: 'live-session-transcript',
            serverEvent: {
              type: 'response.output_audio_transcript.delta',
              delta: 'Hello ',
            },
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent(LIVE_SESSION_REALTIME_SERVER_EVENT, {
          detail: {
            liveSessionId: 'live-session-transcript',
            serverEvent: {
              type: 'response.output_audio.delta',
              delta: 'aaa',
            },
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent(LIVE_SESSION_REALTIME_SERVER_EVENT, {
          detail: {
            liveSessionId: 'live-session-transcript',
            serverEvent: {
              type: 'response.output_audio_transcript.delta',
              delta: 'world',
            },
          },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/^Live transcript$/i)).toBeVisible();
      expect(screen.getByText(/Hello world/i)).toBeVisible();
      expect(screen.getByText(/^Speaking$/i)).toBeVisible();
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(LIVE_SESSION_REALTIME_SERVER_EVENT, {
          detail: {
            liveSessionId: 'live-session-transcript',
            serverEvent: {
              type: 'response.output_audio_transcript.done',
              transcript: 'Hello world!',
            },
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent(LIVE_SESSION_REALTIME_SERVER_EVENT, {
          detail: {
            liveSessionId: 'live-session-transcript',
            serverEvent: {
              type: 'response.done',
              response: {
                output: [
                  {
                    type: 'message',
                    content: [
                      {
                        type: 'text',
                        text: 'Hello world!',
                      },
                    ],
                  },
                ],
              },
            },
          },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Hello world!/i)).toBeVisible();
      expect(screen.getByText(/^Idle$/i)).toBeVisible();
      expect(mockedApiClient.post).toHaveBeenCalledWith(
        '/live-sessions/live-session-transcript/messages/observer',
        expect.objectContaining({
          content: expect.stringContaining('Hello world!'),
        }),
      );
      expect(screen.getByText(/Saved to chat:/i)).toBeVisible();
    });
  });
});
