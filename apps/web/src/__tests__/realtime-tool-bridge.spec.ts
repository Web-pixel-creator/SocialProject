import {
  executeRealtimeToolCall,
  extractRealtimeToolCalls,
  handleRealtimeToolCallsFromResponseDone,
} from '../lib/realtimeToolBridge';

describe('realtimeToolBridge', () => {
  test('extractRealtimeToolCalls parses allowlisted function calls from response.done', () => {
    const calls = extractRealtimeToolCalls({
      type: 'response.done',
      response: {
        output: [
          {
            type: 'function_call',
            name: 'place_prediction',
            call_id: 'call_1',
            arguments:
              '{"draftId":"00000000-0000-0000-0000-000000000001","outcome":"merge","stakePoints":20}',
          },
          {
            type: 'function_call',
            name: 'follow_studio',
            callId: 'call_2',
            arguments: '{"studioId":"00000000-0000-0000-0000-000000000002"}',
          },
          {
            type: 'function_call',
            name: 'unknown_tool',
            call_id: 'call_3',
            arguments: '{}',
          },
          {
            type: 'function_call',
            name: 'place_prediction',
            call_id: 'call_4',
            arguments: 'not-json',
          },
          {
            type: 'message',
            role: 'assistant',
          },
        ],
      },
    });

    expect(calls).toEqual([
      {
        name: 'place_prediction',
        callId: 'call_1',
        argumentsJson:
          '{"draftId":"00000000-0000-0000-0000-000000000001","outcome":"merge","stakePoints":20}',
      },
      {
        name: 'follow_studio',
        callId: 'call_2',
        argumentsJson: '{"studioId":"00000000-0000-0000-0000-000000000002"}',
      },
    ]);
  });

  test('extractRealtimeToolCalls parses allowlisted function call from response.output_item.done', () => {
    const calls = extractRealtimeToolCalls({
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        name: 'follow_studio',
        call_id: 'call_7',
        arguments: '{"studioId":"00000000-0000-0000-0000-000000000007"}',
      },
    });

    expect(calls).toEqual([
      {
        name: 'follow_studio',
        callId: 'call_7',
        argumentsJson: '{"studioId":"00000000-0000-0000-0000-000000000007"}',
      },
    ]);
  });

  test('executeRealtimeToolCall posts to realtime tool endpoint', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        callId: 'call_1',
        toolName: 'place_prediction',
        output: {
          prediction: {
            pullRequestId: 'pr_1',
          },
        },
      },
    });

    const result = await executeRealtimeToolCall({
      liveSessionId: 'session_1',
      toolCall: {
        name: 'place_prediction',
        callId: 'call_1',
        argumentsJson:
          '{"draftId":"00000000-0000-0000-0000-000000000001","outcome":"merge","stakePoints":20}',
      },
      client: { post },
    });

    expect(post).toHaveBeenCalledWith(
      '/live-sessions/session_1/realtime/tool',
      {
        callId: 'call_1',
        name: 'place_prediction',
        arguments:
          '{"draftId":"00000000-0000-0000-0000-000000000001","outcome":"merge","stakePoints":20}',
      },
    );
    expect(result).toEqual({
      callId: 'call_1',
      toolName: 'place_prediction',
      output: {
        prediction: {
          pullRequestId: 'pr_1',
        },
      },
    });
  });

  test('handleRealtimeToolCallsFromResponseDone sends function_call_output on success', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        callId: 'call_1',
        toolName: 'follow_studio',
        output: {
          studioId: '00000000-0000-0000-0000-000000000002',
          isFollowing: true,
        },
      },
    });
    const sendClientEvent = jest.fn();

    const result = await handleRealtimeToolCallsFromResponseDone({
      liveSessionId: 'session_1',
      serverEvent: {
        type: 'response.done',
        response: {
          output: [
            {
              type: 'function_call',
              name: 'follow_studio',
              call_id: 'call_1',
              arguments: '{"studioId":"00000000-0000-0000-0000-000000000002"}',
            },
          ],
        },
      },
      sendClientEvent,
      client: { post },
    });

    expect(result).toEqual({ processed: 1 });
    expect(sendClientEvent).toHaveBeenCalledTimes(2);
    expect(sendClientEvent.mock.calls[0][0]).toEqual({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: 'call_1',
        output:
          '{"studioId":"00000000-0000-0000-0000-000000000002","isFollowing":true}',
      },
    });
    expect(sendClientEvent.mock.calls[1][0]).toEqual({
      type: 'response.create',
    });
  });

  test('handleRealtimeToolCallsFromResponseDone sends structured error output on failure', async () => {
    const post = jest.fn().mockRejectedValue({
      response: {
        data: {
          error: 'PREDICTION_NO_PENDING_PR',
          message: 'No pending pull request for prediction.',
        },
      },
    });
    const sendClientEvent = jest.fn();

    const result = await handleRealtimeToolCallsFromResponseDone({
      liveSessionId: 'session_1',
      serverEvent: {
        type: 'response.done',
        response: {
          output: [
            {
              type: 'function_call',
              name: 'place_prediction',
              call_id: 'call_1',
              arguments:
                '{"draftId":"00000000-0000-0000-0000-000000000001","outcome":"merge","stakePoints":20}',
            },
          ],
        },
      },
      sendClientEvent,
      client: { post },
    });

    expect(result).toEqual({ processed: 1 });
    expect(sendClientEvent).toHaveBeenCalledTimes(2);
    expect(sendClientEvent.mock.calls[0][0]).toEqual({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: 'call_1',
        output:
          '{"error":"PREDICTION_NO_PENDING_PR","message":"No pending pull request for prediction."}',
      },
    });
    expect(sendClientEvent.mock.calls[1][0]).toEqual({
      type: 'response.create',
    });
  });

  test('handleRealtimeToolCallsFromResponseDone deduplicates repeated call ids', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        callId: 'call_9',
        toolName: 'follow_studio',
        output: {
          studioId: '00000000-0000-0000-0000-000000000009',
          isFollowing: true,
        },
      },
    });
    const sendClientEvent = jest.fn();
    const processedCallIds = new Set<string>();

    const first = await handleRealtimeToolCallsFromResponseDone({
      liveSessionId: 'session_1',
      serverEvent: {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          name: 'follow_studio',
          call_id: 'call_9',
          arguments: '{"studioId":"00000000-0000-0000-0000-000000000009"}',
        },
      },
      sendClientEvent,
      processedCallIds,
      client: { post },
    });

    const second = await handleRealtimeToolCallsFromResponseDone({
      liveSessionId: 'session_1',
      serverEvent: {
        type: 'response.done',
        response: {
          output: [
            {
              type: 'function_call',
              name: 'follow_studio',
              call_id: 'call_9',
              arguments: '{"studioId":"00000000-0000-0000-0000-000000000009"}',
            },
          ],
        },
      },
      sendClientEvent,
      processedCallIds,
      client: { post },
    });

    expect(first).toEqual({ processed: 1 });
    expect(second).toEqual({ processed: 0 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(sendClientEvent).toHaveBeenCalledTimes(2);
  });
});
