import type { Pool } from 'pg';
import { env } from '../../config/env';
import { logger } from '../../logging/logger';
import { buildEmbeddingSignal, generateEmbedding } from './embeddingUtils';

interface EmbeddingInput {
  draftId?: string;
  source?: string;
  imageUrl?: string;
  metadata?: Record<string, any>;
}

interface JinaEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
  embedding?: number[];
}

const normalizeEmbedding = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
};

const fetchWithTimeout = async (
  input: RequestInfo,
  init: RequestInit,
  timeoutMs: number,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

export class EmbeddingServiceImpl {
  constructor(private readonly pool?: Pool) {}

  async generateEmbedding(input: EmbeddingInput): Promise<number[] | null> {
    const signal = buildEmbeddingSignal(input.imageUrl, input.metadata);
    if (!signal) {
      return null;
    }

    const startedAt = Date.now();
    let providerUsed = 'hash';
    let fallbackUsed = false;
    let errorCode: string | null = null;

    if (env.EMBEDDING_PROVIDER === 'jina' && env.EMBEDDING_API_KEY) {
      const remote = await this.fetchJinaEmbedding(input.imageUrl);
      if (remote && remote.length > 0) {
        providerUsed = 'jina';
        await this.recordEvent({
          draftId: input.draftId,
          source: input.source ?? 'auto',
          provider: providerUsed,
          success: true,
          fallbackUsed,
          embeddingLength: remote.length,
          durationMs: Date.now() - startedAt,
          errorCode,
        });
        return remote;
      }
      fallbackUsed = true;
      errorCode = 'REMOTE_FAILED';
    }

    const embedding = generateEmbedding(signal, env.EMBEDDING_DIMENSIONS);
    providerUsed = 'hash';
    await this.recordEvent({
      draftId: input.draftId,
      source: input.source ?? 'auto',
      provider: providerUsed,
      success: embedding.length > 0,
      fallbackUsed,
      embeddingLength: embedding.length,
      durationMs: Date.now() - startedAt,
      errorCode,
    });

    return embedding.length > 0 ? embedding : null;
  }

  private async fetchJinaEmbedding(
    imageUrl?: string,
  ): Promise<number[] | null> {
    if (!imageUrl) {
      return null;
    }
    try {
      const response = await fetchWithTimeout(
        env.EMBEDDING_API_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.EMBEDDING_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: env.EMBEDDING_MODEL,
            input: [{ image: imageUrl }],
            dimensions: env.EMBEDDING_DIMENSIONS,
            embedding_format: 'float',
          }),
        },
        env.EMBEDDING_TIMEOUT_MS,
      );

      if (!response.ok) {
        throw new Error(`Embedding provider responded ${response.status}`);
      }

      const payload = (await response.json()) as
        | JinaEmbeddingResponse
        | number[];
      const embedding = Array.isArray(payload)
        ? normalizeEmbedding(payload)
        : normalizeEmbedding(
            payload?.embedding ?? payload?.data?.[0]?.embedding,
          );

      return embedding.length > 0 ? embedding : null;
    } catch (error) {
      logger.warn({ err: error }, 'Remote embedding fetch failed');
      return null;
    }
  }

  private async recordEvent(input: {
    draftId?: string;
    source: string;
    provider: string;
    success: boolean;
    fallbackUsed: boolean;
    embeddingLength: number;
    durationMs: number;
    errorCode: string | null;
  }) {
    if (!this.pool) {
      return;
    }
    try {
      await this.pool.query(
        `INSERT INTO embedding_events
         (draft_id, source, provider, success, fallback_used, embedding_length, duration_ms, error_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.draftId ?? null,
          input.source,
          input.provider,
          input.success,
          input.fallbackUsed,
          input.embeddingLength,
          input.durationMs,
          input.errorCode,
        ],
      );
    } catch (error) {
      logger.warn({ err: error }, 'Embedding telemetry insert failed');
    }
  }
}
