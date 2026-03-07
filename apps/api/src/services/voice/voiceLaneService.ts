import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { db } from '../../db/pool';
import { ServiceError } from '../common/errors';
import { providerRoutingService } from '../providerRouting/providerRoutingService';
import type { ProviderLaneResolvedRoute, ProviderRoutingService } from '../providerRouting/types';
import { StorageServiceImpl } from '../storage/storageService';
import type { StorageService } from '../storage/types';
import type {
  CreateVoiceRenderArtifactInput,
  VoiceLaneService,
  VoiceRenderArtifact,
} from './types';

interface VoiceLaneServiceQueryable {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

interface VoiceLaneServiceOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  providerRouting?: ProviderRoutingService;
  queryable?: VoiceLaneServiceQueryable;
  storageService?: StorageService;
}

interface VoiceRenderArtifactRow {
  artifact_url: string;
  content_type: string;
  created_at: Date;
  created_by_id: string | null;
  created_by_type: 'admin' | 'agent' | 'observer' | 'system';
  draft_id: string | null;
  duration_ms: number | string | null;
  id: string;
  lane: 'voice_render';
  live_session_id: string | null;
  metadata: Record<string, unknown> | null;
  model: string;
  provider: string;
  scope: 'admin_preview' | 'live_session_recap';
  script: string;
  storage_key: string;
  transcript: string;
  voice: string;
}

const DEFAULT_BASE_URL = 'https://api.deepgram.com/v1';
const DEFAULT_MODEL = 'aura-2-thalia-en';
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_VOICE = 'thalia';
const VOICE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/i;
const TRAILING_SLASH_PATTERN = /\/$/;

const parseNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseNullableObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const parseNullableIsoDurationMs = (value: string | null): number | null => {
  if (!(typeof value === 'string' && value.trim().length > 0)) {
    return null;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.round(parsed * 1000));
  }
  return null;
};

const normalizeVoice = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!VOICE_IDENTIFIER_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
};

const deriveVoiceFromModel = (model: string): string => {
  const parts = model.split('-');
  if (parts.length >= 4 && parts[0] === 'aura' && parts[1] === '2') {
    return parts.slice(2, parts.length - 1).join('-') || DEFAULT_VOICE;
  }
  return DEFAULT_VOICE;
};

const buildRequestedModel = ({
  configuredLanguage,
  configuredModel,
  voice,
}: {
  configuredLanguage: string;
  configuredModel: string;
  voice: string | null;
}) => {
  if (!voice) {
    return configuredModel;
  }
  if (/^aura-2-[a-z0-9-]+-[a-z]{2,8}$/i.test(configuredModel)) {
    return `aura-2-${voice}-${configuredLanguage}`;
  }
  return configuredModel;
};

const parseDeepgramErrorMessage = async (response: Response) => {
  const fallback = `Deepgram voice render request failed with status ${response.status}.`;
  try {
    const raw = (await response.text()).trim();
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const body = parsed as Record<string, unknown>;
      if (typeof body.err_msg === 'string' && body.err_msg.trim().length > 0) {
        return body.err_msg.trim();
      }
      if (typeof body.message === 'string' && body.message.trim().length > 0) {
        return body.message.trim();
      }
      if (typeof body.error === 'string' && body.error.trim().length > 0) {
        return body.error.trim();
      }
    }
    return raw;
  } catch {
    return fallback;
  }
};

const buildStorageKey = ({
  extension,
  liveSessionId,
  scope,
}: {
  extension: string;
  liveSessionId: string | null;
  scope: 'admin_preview' | 'live_session_recap';
}) => {
  const scopePath = scope === 'live_session_recap' ? 'live-session-recaps' : 'admin-previews';
  const stableId = liveSessionId ?? randomUUID();
  return `voice-render/${scopePath}/${stableId}/${Date.now()}-${randomUUID()}.${extension}`;
};

const getContentTypeExtension = (contentType: string) => {
  const normalized = contentType.trim().toLowerCase();
  switch (normalized) {
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/flac':
      return 'flac';
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
    default:
      return 'wav';
  }
};

const mapArtifact = (row: VoiceRenderArtifactRow): VoiceRenderArtifact => ({
  artifactUrl: row.artifact_url,
  contentType: row.content_type,
  createdAt: row.created_at,
  createdById: row.created_by_id,
  createdByType: row.created_by_type,
  draftId: row.draft_id,
  durationMs: parseNullableNumber(row.duration_ms),
  id: row.id,
  lane: row.lane,
  liveSessionId: row.live_session_id,
  metadata: parseNullableObject(row.metadata),
  model: row.model,
  provider: row.provider,
  scope: row.scope,
  script: row.script,
  storageKey: row.storage_key,
  transcript: row.transcript,
  voice: row.voice,
});

export class VoiceLaneServiceImpl implements VoiceLaneService {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly language: string;
  private readonly model: string;
  private readonly providerRouting: ProviderRoutingService;
  private readonly queryable: VoiceLaneServiceQueryable;
  private readonly storageService: StorageService;
  private readonly timeoutMs: number;

  constructor(options: VoiceLaneServiceOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.DEEPGRAM_VOICE_RENDER_BASE_URL ??
      env.DEEPGRAM_VOICE_RENDER_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(TRAILING_SLASH_PATTERN, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.language =
      (process.env.DEEPGRAM_VOICE_RENDER_LANGUAGE ?? env.DEEPGRAM_VOICE_RENDER_LANGUAGE).trim() ||
      DEFAULT_LANGUAGE;
    this.model =
      (process.env.DEEPGRAM_VOICE_RENDER_MODEL ?? env.DEEPGRAM_VOICE_RENDER_MODEL).trim() ||
      DEFAULT_MODEL;
    this.providerRouting = options.providerRouting ?? providerRoutingService;
    this.queryable = options.queryable ?? db;
    this.storageService = options.storageService ?? new StorageServiceImpl();
    this.timeoutMs = Number(
      process.env.DEEPGRAM_VOICE_RENDER_TIMEOUT_MS ??
        env.DEEPGRAM_VOICE_RENDER_TIMEOUT_MS ??
        DEFAULT_TIMEOUT_MS,
    );
  }

  async renderArtifact(input: CreateVoiceRenderArtifactInput): Promise<VoiceRenderArtifact> {
    const script = input.script.trim();
    if (!script) {
      throw new ServiceError(
        'VOICE_RENDER_INVALID_INPUT',
        'script is required for voice render.',
        400,
      );
    }

    const transcript = input.transcript?.trim() || script;
    const requestedVoice = normalizeVoice(input.voice);
    if (input.voice && !requestedVoice) {
      throw new ServiceError(
        'VOICE_RENDER_INVALID_INPUT',
        'voice must be a simple Deepgram voice identifier.',
        400,
      );
    }

    const route = this.providerRouting.resolveRoute({
      lane: 'voice_render',
      preferredProviders: input.preferredProviders,
    });
    const selectedProvider = route.resolvedProviders[0]?.provider ?? null;
    const requestedModel = buildRequestedModel({
      configuredLanguage: this.language,
      configuredModel: this.model,
      voice: requestedVoice,
    });
    const persistedVoice = requestedVoice ?? deriveVoiceFromModel(requestedModel);
    const startedAt = Date.now();

    try {
      if (!selectedProvider) {
        throw new ServiceError(
          'VOICE_RENDER_PROVIDER_UNAVAILABLE',
          'No enabled voice render provider is configured for this lane.',
          503,
        );
      }
      if (selectedProvider !== 'deepgram') {
        throw new ServiceError(
          'VOICE_RENDER_PROVIDER_UNSUPPORTED',
          `voice_render provider ${selectedProvider} is not implemented yet.`,
          503,
        );
      }
      const apiKey = (process.env.DEEPGRAM_API_KEY ?? env.DEEPGRAM_API_KEY ?? '').trim();
      if (!apiKey) {
        throw new ServiceError(
          'VOICE_RENDER_NOT_CONFIGURED',
          'Deepgram API key is not configured.',
          503,
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(
          `${this.baseUrl}/speak?model=${encodeURIComponent(requestedModel)}`,
          {
            body: JSON.stringify({
              text: script,
            }),
            headers: {
              Authorization: `Token ${apiKey}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const message = await parseDeepgramErrorMessage(response);
        throw new ServiceError(
          'VOICE_RENDER_REQUEST_FAILED',
          message,
          response.status >= 500 ? 502 : response.status,
        );
      }

      const contentType = response.headers.get('content-type')?.trim() || 'audio/wav';
      const storageKey = buildStorageKey({
        extension: getContentTypeExtension(contentType),
        liveSessionId: input.liveSessionId ?? null,
        scope: input.scope,
      });
      const artifactBuffer = Buffer.from(await response.arrayBuffer());
      if (artifactBuffer.byteLength === 0) {
        throw new ServiceError(
          'VOICE_RENDER_INVALID_RESPONSE',
          'Deepgram voice render returned an empty audio payload.',
          502,
        );
      }

      const uploaded = await this.storageService.uploadObject({
        body: artifactBuffer,
        contentType,
        key: storageKey,
      });
      const durationMs = parseNullableIsoDurationMs(response.headers.get('content-duration'));
      const metadata = {
        ...(input.metadata ?? {}),
        contentLengthBytes: artifactBuffer.byteLength,
        deepgramRequestId:
          response.headers.get('dg-request-id') ?? response.headers.get('x-request-id') ?? null,
        routeRequestedProviders: route.requestedProviders,
        routeResolvedProviders: route.resolvedProviders.map((provider) => provider.provider),
      };
      const inserted = await this.queryable.query<VoiceRenderArtifactRow>(
        `INSERT INTO voice_render_artifacts (
           lane,
           scope,
           live_session_id,
           draft_id,
           script,
           transcript,
           provider,
           model,
           voice,
           duration_ms,
           content_type,
           storage_key,
           artifact_url,
           created_by_type,
           created_by_id,
           metadata
         )
         VALUES (
           'voice_render',
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14,
           $15::jsonb
         )
         RETURNING *`,
        [
          input.scope,
          input.liveSessionId ?? null,
          input.draftId ?? null,
          script,
          transcript,
          selectedProvider,
          requestedModel,
          persistedVoice,
          durationMs,
          contentType,
          uploaded.key,
          uploaded.url,
          input.createdByType ?? 'system',
          input.createdById ?? null,
          JSON.stringify(metadata),
        ],
      );

      const artifact = mapArtifact(inserted.rows[0]);
      await this.providerRouting.recordExecution({
        draftId: input.draftId ?? null,
        durationMs: Date.now() - startedAt,
        lane: 'voice_render',
        metadata: {
          artifactId: artifact.id,
          contentType,
          durationMs,
          liveSessionId: input.liveSessionId ?? null,
          scope: input.scope,
          storageKey: artifact.storageKey,
          voice: persistedVoice,
        },
        model: requestedModel,
        operation:
          input.scope === 'live_session_recap'
            ? 'live_session_recap_render'
            : 'voice_render_preview',
        provider: selectedProvider,
        route,
        status: 'ok',
        userId: input.createdById ?? null,
        userType: input.createdByType ?? 'system',
      });

      return artifact;
    } catch (error) {
      await this.recordFailure({
        error,
        input,
        requestedModel,
        requestedVoice: persistedVoice,
        route,
        selectedProvider,
        startedAt,
      });
      throw error;
    }
  }

  private async recordFailure({
    error,
    input,
    requestedModel,
    requestedVoice,
    route,
    selectedProvider,
    startedAt,
  }: {
    error: unknown;
    input: CreateVoiceRenderArtifactInput;
    requestedModel: string;
    requestedVoice: string;
    route: ProviderLaneResolvedRoute;
    selectedProvider: string | null;
    startedAt: number;
  }) {
    const serviceError =
      error instanceof ServiceError
        ? error
        : new ServiceError(
            'VOICE_RENDER_FAILED',
            error instanceof Error ? error.message : 'Unknown voice render failure.',
            502,
          );
    await this.providerRouting.recordExecution({
      draftId: input.draftId ?? null,
      durationMs: Date.now() - startedAt,
      lane: 'voice_render',
      metadata: {
        errorCode: serviceError.code,
        errorMessage: serviceError.message,
        liveSessionId: input.liveSessionId ?? null,
        scope: input.scope,
        voice: requestedVoice,
      },
      model: requestedModel,
      operation:
        input.scope === 'live_session_recap' ? 'live_session_recap_render' : 'voice_render_preview',
      provider: selectedProvider,
      route,
      status: 'failed',
      userId: input.createdById ?? null,
      userType: input.createdByType ?? 'system',
    });
  }
}

export const voiceLaneService = new VoiceLaneServiceImpl();
