import { env } from '../../config/env';
import { ServiceError } from '../common/errors';
import type {
  CreateOpenAIRealtimeSessionInput,
  OpenAIRealtimeSessionBootstrap,
  OpenAIRealtimeSessionService,
  RealtimeOutputModality,
  RealtimeVoice,
} from './types';

const DEFAULT_MODEL = 'gpt-realtime';
const DEFAULT_VOICE: RealtimeVoice = 'marin';
const DEFAULT_TIMEOUT_MS = 12_000;
const TRAILING_SLASH_PATTERN = /\/$/;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const buildRealtimeInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const lines = [
    'You are the FinishIt Observer Realtime Copilot.',
    `Live session id: ${input.liveSessionId}.`,
    `Session title: ${input.liveTitle}.`,
    `Session objective: ${input.liveObjective}.`,
    'Be concise and factual.',
    'If an action is requested, prefer calling an available function tool.',
    'Never claim an action was executed unless tool output confirms success.',
  ];
  if (input.topicHint) {
    lines.push(`User topic hint: ${input.topicHint}.`);
  }
  return lines.join(' ');
};

const parseOpenAIErrorMessage = async (response: Response) => {
  const fallback = `OpenAI realtime session request failed with status ${response.status}.`;
  try {
    const raw = (await response.text()).trim();
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    const body = asRecord(parsed);
    const nestedError = asRecord(body?.error);
    const message =
      asString(nestedError?.message) ??
      asString(body?.message) ??
      asString(body?.error) ??
      raw;
    return message;
  } catch {
    return fallback;
  }
};

const dedupeOutputModalities = (
  values: RealtimeOutputModality[],
): RealtimeOutputModality[] => [...new Set(values)];

export class OpenAIRealtimeSessionServiceImpl
  implements OpenAIRealtimeSessionService
{
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly defaultVoice: RealtimeVoice;
  private readonly timeoutMs: number;

  constructor() {
    const configuredBaseUrl =
      process.env.OPENAI_REALTIME_BASE_URL ?? env.OPENAI_REALTIME_BASE_URL;
    this.baseUrl = configuredBaseUrl.replace(TRAILING_SLASH_PATTERN, '');
    this.model = process.env.OPENAI_REALTIME_MODEL ?? env.OPENAI_REALTIME_MODEL;
    this.defaultVoice =
      (process.env.OPENAI_REALTIME_VOICE as RealtimeVoice | undefined) ??
      env.OPENAI_REALTIME_VOICE;
    this.timeoutMs = Number(
      process.env.OPENAI_REALTIME_TIMEOUT_MS ??
        env.OPENAI_REALTIME_TIMEOUT_MS ??
        DEFAULT_TIMEOUT_MS,
    );
  }

  async createSession(
    input: CreateOpenAIRealtimeSessionInput,
  ): Promise<OpenAIRealtimeSessionBootstrap> {
    const apiKey = (
      process.env.OPENAI_API_KEY ??
      env.OPENAI_API_KEY ??
      ''
    ).trim();
    if (!apiKey) {
      throw new ServiceError(
        'OPENAI_REALTIME_NOT_CONFIGURED',
        'OpenAI Realtime API key is not configured.',
        503,
      );
    }

    const outputModalities = dedupeOutputModalities(input.outputModalities);
    const selectedVoice = input.voice ?? this.defaultVoice ?? DEFAULT_VOICE;
    const endpoint = `${this.baseUrl}/realtime/sessions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model || DEFAULT_MODEL,
          output_modalities: outputModalities,
          instructions: buildRealtimeInstructions(input),
          audio: {
            input: {
              format: {
                type: 'audio/pcm',
                rate: 24_000,
              },
              turn_detection: input.pushToTalk
                ? null
                : {
                    type: 'semantic_vad',
                    create_response: true,
                    interrupt_response: true,
                  },
            },
            output: {
              format: {
                type: 'audio/pcm',
              },
              voice: selectedVoice,
            },
          },
          tool_choice: 'auto',
          tools: [
            {
              type: 'function',
              name: 'place_prediction',
              description:
                'Place a virtual FIN points prediction on draft merge or reject outcome.',
              parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  draftId: { type: 'string' },
                  outcome: {
                    type: 'string',
                    enum: ['merge', 'reject'],
                  },
                  stakePoints: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 1000,
                  },
                },
                required: ['draftId', 'outcome', 'stakePoints'],
              },
            },
            {
              type: 'function',
              name: 'follow_studio',
              description:
                'Follow a studio to prioritize it in observer digest and feed.',
              parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  studioId: { type: 'string' },
                },
                required: ['studioId'],
              },
            },
          ],
          metadata: {
            live_session_id: input.liveSessionId,
            observer_id: input.observerId,
            draft_id: input.draftId ?? '',
            source: 'finishit_live_session',
            ...input.metadata,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await parseOpenAIErrorMessage(response);
        throw new ServiceError(
          'OPENAI_REALTIME_SESSION_FAILED',
          message,
          response.status >= 500 ? 502 : response.status,
        );
      }

      const payload = (await response.json()) as unknown;
      const payloadRecord = asRecord(payload);
      const sessionId = asString(payloadRecord?.id);
      const clientSecretRecord = asRecord(payloadRecord?.client_secret);
      const clientSecret = asString(clientSecretRecord?.value);
      const expiresAt = asString(payloadRecord?.expires_at);
      const clientSecretExpiresAt = asString(clientSecretRecord?.expires_at);

      if (!(sessionId && clientSecret)) {
        throw new ServiceError(
          'OPENAI_REALTIME_INVALID_RESPONSE',
          'OpenAI Realtime response did not include session id or client secret.',
          502,
        );
      }

      return {
        provider: 'openai',
        sessionId,
        clientSecret,
        clientSecretExpiresAt,
        expiresAt,
        model: this.model || DEFAULT_MODEL,
        outputModalities,
        voice: selectedVoice,
        transportHints: {
          recommended: 'webrtc',
          websocketSupported: true,
          pushToTalk: input.pushToTalk,
        },
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'AbortError' &&
        !(error instanceof ServiceError)
      ) {
        throw new ServiceError(
          'OPENAI_REALTIME_TIMEOUT',
          `OpenAI Realtime session request timed out after ${this.timeoutMs}ms.`,
          504,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
