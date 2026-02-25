import type { AxiosInstance } from 'axios';
import { apiClient } from './api';

type RealtimeToolName = 'place_prediction' | 'follow_studio';

interface RealtimeResponseDoneEvent {
  type: string;
  response?: {
    output?: unknown[];
  };
}

interface RealtimeToolCall {
  name: RealtimeToolName;
  callId: string;
  argumentsJson: string;
}

interface RealtimeToolExecutionResult {
  callId: string;
  toolName: RealtimeToolName;
  output: Record<string, unknown>;
}

interface ExecuteRealtimeToolInput {
  liveSessionId: string;
  toolCall: RealtimeToolCall;
  client?: Pick<AxiosInstance, 'post'>;
}

interface HandleRealtimeToolCallsInput {
  liveSessionId: string;
  serverEvent: unknown;
  sendClientEvent: (event: Record<string, unknown>) => void;
  client?: Pick<AxiosInstance, 'post'>;
}

const REALTIME_TOOL_NAMES: ReadonlySet<string> = new Set([
  'place_prediction',
  'follow_studio',
]);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;

const normalizeCallId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeArgumentsJson = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  try {
    JSON.parse(normalized);
    return normalized;
  } catch {
    return null;
  }
};

const stringifyOutput = (output: Record<string, unknown>) =>
  JSON.stringify(output);

const buildFunctionCallOutputItemEvent = (
  callId: string,
  output: Record<string, unknown>,
) => ({
  type: 'conversation.item.create',
  item: {
    type: 'function_call_output',
    call_id: callId,
    output: stringifyOutput(output),
  },
});

const buildFollowupResponseEvent = () => ({
  type: 'response.create',
});

const mapFunctionCallItem = (item: unknown): RealtimeToolCall | null => {
  const record = asRecord(item);
  if (!record) {
    return null;
  }
  if (record.type !== 'function_call') {
    return null;
  }
  const rawName = typeof record.name === 'string' ? record.name.trim() : '';
  if (!REALTIME_TOOL_NAMES.has(rawName)) {
    return null;
  }
  const callId = normalizeCallId(record.call_id ?? record.callId);
  const argumentsJson = normalizeArgumentsJson(record.arguments);
  if (!(callId && argumentsJson)) {
    return null;
  }
  return {
    name: rawName as RealtimeToolName,
    callId,
    argumentsJson,
  };
};

export const extractRealtimeToolCalls = (
  event: unknown,
): RealtimeToolCall[] => {
  const record = asRecord(event) as RealtimeResponseDoneEvent | null;
  if (!(record && record.type === 'response.done')) {
    return [];
  }
  const output = Array.isArray(record.response?.output)
    ? record.response?.output
    : [];
  const parsed = output.map((item) => mapFunctionCallItem(item));
  return parsed.filter((item): item is RealtimeToolCall => item !== null);
};

export const executeRealtimeToolCall = async (
  input: ExecuteRealtimeToolInput,
): Promise<RealtimeToolExecutionResult> => {
  const client = input.client ?? apiClient;
  const response = await client.post(
    `/live-sessions/${input.liveSessionId}/realtime/tool`,
    {
      callId: input.toolCall.callId,
      name: input.toolCall.name,
      arguments: input.toolCall.argumentsJson,
    },
  );
  const payload = asRecord(response.data);
  const toolName =
    typeof payload?.toolName === 'string' &&
    REALTIME_TOOL_NAMES.has(payload.toolName)
      ? (payload.toolName as RealtimeToolName)
      : input.toolCall.name;
  const callId = normalizeCallId(payload?.callId) ?? input.toolCall.callId;
  const output = asRecord(payload?.output) ?? {};
  return {
    callId,
    toolName,
    output,
  };
};

const normalizeRealtimeToolError = (
  error: unknown,
): { code: string; message: string } => {
  const fallback = {
    code: 'LIVE_SESSION_REALTIME_TOOL_EXECUTION_FAILED',
    message: 'Realtime tool execution failed.',
  };
  if (!error || typeof error !== 'object') {
    return fallback;
  }
  const maybeResponse = (
    error as {
      response?: {
        data?: { error?: unknown; message?: unknown };
      };
      message?: unknown;
    }
  ).response;
  const code =
    typeof maybeResponse?.data?.error === 'string'
      ? maybeResponse.data.error
      : fallback.code;
  let message = fallback.message;
  if (typeof maybeResponse?.data?.message === 'string') {
    message = maybeResponse.data.message;
  } else if (typeof (error as { message?: unknown }).message === 'string') {
    message = (error as { message: string }).message;
  }
  return {
    code,
    message,
  };
};

export const handleRealtimeToolCallsFromResponseDone = async (
  input: HandleRealtimeToolCallsInput,
) => {
  const toolCalls = extractRealtimeToolCalls(input.serverEvent);
  if (toolCalls.length === 0) {
    return {
      processed: 0,
    };
  }

  for (const toolCall of toolCalls) {
    try {
      const execution = await executeRealtimeToolCall({
        liveSessionId: input.liveSessionId,
        toolCall,
        client: input.client,
      });
      input.sendClientEvent(
        buildFunctionCallOutputItemEvent(execution.callId, execution.output),
      );
      input.sendClientEvent(buildFollowupResponseEvent());
    } catch (error) {
      const normalized = normalizeRealtimeToolError(error);
      input.sendClientEvent(
        buildFunctionCallOutputItemEvent(toolCall.callId, {
          error: normalized.code,
          message: normalized.message,
        }),
      );
      input.sendClientEvent(buildFollowupResponseEvent());
    }
  }

  return {
    processed: toolCalls.length,
  };
};
