import { env } from '../../config/env';
import { db } from '../../db/pool';
import { ServiceError } from '../common/errors';
import { providerRoutingService } from '../providerRouting/providerRoutingService';
import type { ProviderLaneResolvedRoute, ProviderRoutingService } from '../providerRouting/types';
import type {
  LongContextAnalysisJob,
  LongContextAnalysisUseCase,
  LongContextCacheTtl,
  LongContextService,
  LongContextServiceTier,
  RunLongContextAnalysisInput,
} from './types';

interface LongContextQueryable {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

interface LongContextServiceOptions {
  anthropicVersion?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  providerRouting?: ProviderRoutingService;
  queryable?: LongContextQueryable;
}

interface LongContextJobRow {
  cache_creation_input_tokens: number | string | null;
  cache_read_input_tokens: number | string | null;
  cache_ttl: string | null;
  completed_at: Date | null;
  created_at: Date;
  draft_id: string | null;
  estimated_cost_usd: number | string | null;
  failure_code: string | null;
  failure_message: string | null;
  id: string;
  input_tokens: number | string | null;
  lane: 'long_context';
  max_output_tokens: number | string | null;
  metadata: Record<string, unknown> | null;
  model: string | null;
  output_tokens: number | string | null;
  prompt_text: string;
  provider: string | null;
  requested_by_id: string | null;
  requested_by_type: 'admin' | 'agent' | 'observer' | 'system';
  result_text: string | null;
  service_tier: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  system_prompt: string | null;
  updated_at: Date;
  use_case: LongContextAnalysisUseCase;
}

interface AnthropicUsageMetrics {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  serviceTier: string | null;
}

interface AnthropicResult {
  model: string;
  responseId: string | null;
  resultText: string;
  serviceTier: string | null;
  stopReason: string | null;
  usage: AnthropicUsageMetrics;
}

const ANTHROPIC_PROVIDER = 'claude-4';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_ANTHROPIC_TIMEOUT_MS = 30_000;
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_CACHE_TTL: LongContextCacheTtl = '5m';
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const MAX_OUTPUT_TOKENS = 64_000;
const DEFAULT_SERVICE_TIER: LongContextServiceTier = 'auto';
const EXTENDED_CACHE_TTL_BETA = 'extended-cache-ttl-2025-04-11';
const DEFAULT_INPUT_COST_PER_MTOKENS = 3;
const DEFAULT_OUTPUT_COST_PER_MTOKENS = 15;
const DEFAULT_CACHE_WRITE_5M_COST_PER_MTOKENS = 3.75;
const DEFAULT_CACHE_WRITE_1H_COST_PER_MTOKENS = 6;
const DEFAULT_CACHE_READ_COST_PER_MTOKENS = 0.3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const toJsonString = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
};

const toNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toInteger = (value: unknown) => {
  const parsed = toNullableNumber(value);
  if (!(typeof parsed === 'number' && Number.isFinite(parsed))) {
    return 0;
  }
  return Math.max(0, Math.round(parsed));
};

const parseMetadata = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const buildUseCaseSystemPrompt = (useCase: LongContextAnalysisUseCase): string => {
  switch (useCase) {
    case 'autopsy_report':
      return [
        "You are FinishIt's internal autopsy analyst.",
        'Identify repeated failure patterns, likely root causes, and the next highest-leverage fixes.',
        'Return markdown with sections: Summary, Patterns, Root Causes, Recommended Fixes.',
      ].join(' ');
    case 'style_fusion_plan':
      return [
        "You are FinishIt's internal style-fusion planner.",
        'Synthesize reusable design cues into a practical fusion brief without generic filler.',
        'Return markdown with sections: Core Signal, Fusion Moves, Constraints, Suggested Prompt.',
      ].join(' ');
    case 'moderation_review_summary':
      return [
        "You are FinishIt's moderation review analyst.",
        'Summarize risk clusters, policy mismatches, and recommended queue actions.',
        'Return markdown with sections: Summary, Risk Buckets, Escalations, Recommended Actions.',
      ].join(' ');
    case 'roadmap_spec_analysis':
      return [
        "You are FinishIt's roadmap and spec analyst.",
        'Spot missing implementation seams, hidden risks, and the shortest reliable execution order.',
        'Return markdown with sections: Summary, Gaps, Risks, Execution Order.',
      ].join(' ');
    case 'custom':
    default:
      return [
        "You are FinishIt's internal long-context analysis lane.",
        'Be concise, concrete, and implementation oriented.',
        'Use only the provided context and avoid generic advice.',
      ].join(' ');
  }
};

const buildSystemPrompt = ({
  systemPrompt,
  useCase,
}: {
  systemPrompt?: string | null;
  useCase: LongContextAnalysisUseCase;
}) => {
  const basePrompt = buildUseCaseSystemPrompt(useCase);
  const customPrompt = systemPrompt?.trim();
  return customPrompt ? `${basePrompt}\n\n${customPrompt}` : basePrompt;
};

const extractTextFromAnthropicContent = (value: unknown): string =>
  asArray(value)
    .map((entry) => {
      const block = asRecord(entry);
      if (block?.type === 'text') {
        return asString(block.text) ?? '';
      }
      return '';
    })
    .filter((segment) => segment.length > 0)
    .join('\n')
    .trim();

const parseAnthropicUsage = (payload: unknown): AnthropicUsageMetrics => {
  const usage = asRecord(asRecord(payload)?.usage);
  const cacheCreation = asRecord(usage?.cache_creation);
  const cacheRead = asRecord(usage?.cache_read);
  const cacheCreationInputTokens =
    toInteger(usage?.cache_creation_input_tokens) ||
    (Object.values(cacheCreation ?? {}) as unknown[]).reduce<number>(
      (total, value) => total + toInteger(value),
      0,
    );
  const cacheReadInputTokens =
    toInteger(usage?.cache_read_input_tokens) ||
    (Object.values(cacheRead ?? {}) as unknown[]).reduce<number>(
      (total, value) => total + toInteger(value),
      0,
    );

  return {
    cacheCreationInputTokens,
    cacheReadInputTokens,
    inputTokens: toInteger(usage?.input_tokens),
    outputTokens: toInteger(usage?.output_tokens),
    serviceTier: asString(usage?.service_tier) ?? null,
  };
};

const parseAnthropicResult = (payload: unknown): AnthropicResult => {
  const body = asRecord(payload);
  const resultText = extractTextFromAnthropicContent(body?.content);
  if (!resultText) {
    throw new ServiceError(
      'LONG_CONTEXT_EMPTY_RESPONSE',
      'Anthropic long-context response did not include text output.',
      502,
    );
  }

  const usage = parseAnthropicUsage(body);
  return {
    model: asString(body?.model) ?? DEFAULT_ANTHROPIC_MODEL,
    responseId: asString(body?.id),
    resultText,
    serviceTier: usage.serviceTier ?? asString(body?.service_tier) ?? null,
    stopReason: asString(body?.stop_reason),
    usage,
  };
};

const estimateCostUsd = ({
  cacheCreationInputTokens,
  cacheReadInputTokens,
  cacheTtl,
  inputTokens,
  outputTokens,
}: {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheTtl: LongContextCacheTtl;
  inputTokens: number;
  outputTokens: number;
}) => {
  const inputRate = Number(
    process.env.ANTHROPIC_LONG_CONTEXT_INPUT_COST_PER_MTOKENS ??
      env.ANTHROPIC_LONG_CONTEXT_INPUT_COST_PER_MTOKENS ??
      DEFAULT_INPUT_COST_PER_MTOKENS,
  );
  const outputRate = Number(
    process.env.ANTHROPIC_LONG_CONTEXT_OUTPUT_COST_PER_MTOKENS ??
      env.ANTHROPIC_LONG_CONTEXT_OUTPUT_COST_PER_MTOKENS ??
      DEFAULT_OUTPUT_COST_PER_MTOKENS,
  );
  const cacheWriteRate = Number(
    cacheTtl === '1h'
      ? (process.env.ANTHROPIC_LONG_CONTEXT_CACHE_WRITE_1H_COST_PER_MTOKENS ??
          env.ANTHROPIC_LONG_CONTEXT_CACHE_WRITE_1H_COST_PER_MTOKENS ??
          DEFAULT_CACHE_WRITE_1H_COST_PER_MTOKENS)
      : (process.env.ANTHROPIC_LONG_CONTEXT_CACHE_WRITE_5M_COST_PER_MTOKENS ??
          env.ANTHROPIC_LONG_CONTEXT_CACHE_WRITE_5M_COST_PER_MTOKENS ??
          DEFAULT_CACHE_WRITE_5M_COST_PER_MTOKENS),
  );
  const cacheReadRate = Number(
    process.env.ANTHROPIC_LONG_CONTEXT_CACHE_READ_COST_PER_MTOKENS ??
      env.ANTHROPIC_LONG_CONTEXT_CACHE_READ_COST_PER_MTOKENS ??
      DEFAULT_CACHE_READ_COST_PER_MTOKENS,
  );

  const total =
    (inputTokens / 1_000_000) * inputRate +
    (outputTokens / 1_000_000) * outputRate +
    (cacheCreationInputTokens / 1_000_000) * cacheWriteRate +
    (cacheReadInputTokens / 1_000_000) * cacheReadRate;

  return Number(total.toFixed(6));
};

const toServiceError = (
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
  status = 502,
) => {
  if (error instanceof ServiceError) {
    return error;
  }
  if (error instanceof Error) {
    return new ServiceError(fallbackCode, error.message, status);
  }
  return new ServiceError(fallbackCode, fallbackMessage, status);
};

const mapJob = (row: LongContextJobRow): LongContextAnalysisJob => {
  const metadata = parseMetadata(row.metadata);
  const route = asRecord(metadata.route) as ProviderLaneResolvedRoute | null;

  return {
    cacheCreationInputTokens: toInteger(row.cache_creation_input_tokens),
    cacheReadInputTokens: toInteger(row.cache_read_input_tokens),
    cacheTtl: (row.cache_ttl === '1h' ? '1h' : '5m') as LongContextCacheTtl,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    draftId: row.draft_id,
    estimatedCostUsd: toNullableNumber(row.estimated_cost_usd),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    id: row.id,
    inputTokens: toInteger(row.input_tokens),
    lane: row.lane,
    maxOutputTokens: toInteger(row.max_output_tokens) || DEFAULT_MAX_OUTPUT_TOKENS,
    metadata,
    model: row.model,
    outputTokens: toInteger(row.output_tokens),
    prompt: row.prompt_text,
    provider: row.provider,
    requestedById: row.requested_by_id,
    requestedByType: row.requested_by_type,
    resultText: row.result_text,
    route,
    serviceTier: row.service_tier,
    status: row.status,
    systemPrompt: row.system_prompt,
    updatedAt: row.updated_at,
    useCase: row.use_case,
  };
};

export class LongContextServiceImpl implements LongContextService {
  private readonly anthropicVersion: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;
  private readonly providerRouting: ProviderRoutingService;
  private readonly queryable: LongContextQueryable;
  private readonly timeoutMs: number;

  constructor(options: LongContextServiceOptions = {}) {
    this.anthropicVersion =
      (
        options.anthropicVersion ??
        process.env.ANTHROPIC_VERSION ??
        env.ANTHROPIC_VERSION ??
        DEFAULT_ANTHROPIC_VERSION
      ).trim() || DEFAULT_ANTHROPIC_VERSION;
    this.baseUrl = (
      options.baseUrl ??
      process.env.ANTHROPIC_BASE_URL ??
      env.ANTHROPIC_BASE_URL ??
      DEFAULT_ANTHROPIC_BASE_URL
    ).replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.model =
      (process.env.ANTHROPIC_LONG_CONTEXT_MODEL ?? env.ANTHROPIC_LONG_CONTEXT_MODEL).trim() ||
      DEFAULT_ANTHROPIC_MODEL;
    this.providerRouting = options.providerRouting ?? providerRoutingService;
    this.queryable = options.queryable ?? db;
    this.timeoutMs = Number(
      process.env.ANTHROPIC_LONG_CONTEXT_TIMEOUT_MS ??
        env.ANTHROPIC_LONG_CONTEXT_TIMEOUT_MS ??
        DEFAULT_ANTHROPIC_TIMEOUT_MS,
    );
  }

  async getJob(jobId: string): Promise<LongContextAnalysisJob | null> {
    const result = await this.queryable.query<LongContextJobRow>(
      `SELECT *
         FROM long_context_analysis_jobs
        WHERE id = $1
        LIMIT 1`,
      [jobId],
    );
    return result.rows[0] ? mapJob(result.rows[0]) : null;
  }

  async runAnalysis(input: RunLongContextAnalysisInput): Promise<LongContextAnalysisJob> {
    const prompt = input.prompt.trim();
    if (!prompt) {
      throw new ServiceError('LONG_CONTEXT_INVALID_INPUT', 'prompt is required.', 400);
    }

    const route = this.providerRouting.resolveRoute({
      lane: 'long_context',
      preferredProviders: input.preferredProviders,
    });
    const cacheTtl = input.cacheTtl ?? DEFAULT_CACHE_TTL;
    const maxOutputTokens = Math.max(
      1,
      Math.min(Math.floor(input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS), MAX_OUTPUT_TOKENS),
    );
    const serviceTier =
      input.serviceTier ??
      ((process.env.ANTHROPIC_SERVICE_TIER ??
        env.ANTHROPIC_SERVICE_TIER ??
        DEFAULT_SERVICE_TIER) as LongContextServiceTier);
    const systemPrompt = buildSystemPrompt({
      systemPrompt: input.systemPrompt,
      useCase: input.useCase,
    });
    const selectedProvider =
      route.resolvedProviders.find((provider) => provider.provider === ANTHROPIC_PROVIDER) ?? null;
    const queuedJob = await this.insertQueuedJob({
      cacheTtl,
      draftId: input.draftId ?? null,
      maxOutputTokens,
      metadata: input.metadata ?? {},
      prompt,
      provider: selectedProvider?.provider ?? route.resolvedProviders[0]?.provider ?? null,
      requestedById: input.requestedById ?? null,
      requestedByType: input.requestedByType ?? 'system',
      route,
      serviceTier,
      systemPrompt,
      useCase: input.useCase,
    });

    await this.updateStatus(queuedJob.id, 'processing');

    try {
      if (!selectedProvider) {
        throw new ServiceError(
          'LONG_CONTEXT_PROVIDER_UNAVAILABLE',
          'No implemented long_context provider is enabled for this lane.',
          503,
        );
      }
      if (selectedProvider.provider !== ANTHROPIC_PROVIDER) {
        throw new ServiceError(
          'LONG_CONTEXT_PROVIDER_UNSUPPORTED',
          `long_context provider ${selectedProvider.provider} is not implemented yet.`,
          503,
        );
      }

      const result = await this.runAnthropicAnalysis({
        cacheTtl,
        maxOutputTokens,
        prompt,
        serviceTier,
        systemPrompt,
      });
      const estimatedCostUsd = estimateCostUsd({
        cacheCreationInputTokens: result.usage.cacheCreationInputTokens,
        cacheReadInputTokens: result.usage.cacheReadInputTokens,
        cacheTtl,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
      const completedJob = await this.completeJob({
        cacheCreationInputTokens: result.usage.cacheCreationInputTokens,
        cacheReadInputTokens: result.usage.cacheReadInputTokens,
        estimatedCostUsd,
        inputTokens: result.usage.inputTokens,
        jobId: queuedJob.id,
        metadata: {
          ...(input.metadata ?? {}),
          cacheTtl,
          preferredProviders: input.preferredProviders ?? [],
          responseId: result.responseId,
          route,
          stopReason: result.stopReason,
        },
        model: result.model,
        outputTokens: result.usage.outputTokens,
        provider: ANTHROPIC_PROVIDER,
        resultText: result.resultText,
        serviceTier: result.serviceTier ?? serviceTier,
      });
      await this.providerRouting.recordExecution({
        durationMs: completedJob.completedAt
          ? completedJob.completedAt.valueOf() - completedJob.createdAt.valueOf()
          : null,
        draftId: completedJob.draftId,
        lane: 'long_context',
        metadata: {
          cacheCreationInputTokens: completedJob.cacheCreationInputTokens,
          cacheReadInputTokens: completedJob.cacheReadInputTokens,
          cacheTtl: completedJob.cacheTtl,
          estimatedCostUsd: completedJob.estimatedCostUsd,
          inputTokens: completedJob.inputTokens,
          jobId: completedJob.id,
          outputTokens: completedJob.outputTokens,
          serviceTier: completedJob.serviceTier,
          useCase: completedJob.useCase,
        },
        model: completedJob.model,
        operation: `long_context_${completedJob.useCase}`,
        provider: completedJob.provider,
        route,
        status: 'ok',
        userId: completedJob.requestedById,
        userType: completedJob.requestedByType,
      });
      return completedJob;
    } catch (error) {
      const serviceError = toServiceError(
        error,
        'LONG_CONTEXT_REQUEST_FAILED',
        'Long-context analysis failed.',
      );
      const failedJob = await this.failJob({
        error: serviceError,
        jobId: queuedJob.id,
        metadata: {
          ...(input.metadata ?? {}),
          cacheTtl,
          preferredProviders: input.preferredProviders ?? [],
          route,
        },
      });
      await this.providerRouting.recordExecution({
        durationMs: failedJob.updatedAt.valueOf() - failedJob.createdAt.valueOf(),
        draftId: failedJob.draftId,
        lane: 'long_context',
        metadata: {
          cacheTtl: failedJob.cacheTtl,
          errorCode: failedJob.failureCode,
          errorMessage: failedJob.failureMessage,
          failureStatus: failedJob.metadata.failureStatus ?? serviceError.status,
          jobId: failedJob.id,
          useCase: failedJob.useCase,
        },
        model: failedJob.model,
        operation: `long_context_${failedJob.useCase}`,
        provider: failedJob.provider,
        route,
        status: 'failed',
        userId: failedJob.requestedById,
        userType: failedJob.requestedByType,
      });
      return failedJob;
    }
  }

  private async runAnthropicAnalysis({
    cacheTtl,
    maxOutputTokens,
    prompt,
    serviceTier,
    systemPrompt,
  }: {
    cacheTtl: LongContextCacheTtl;
    maxOutputTokens: number;
    prompt: string;
    serviceTier: LongContextServiceTier;
    systemPrompt: string;
  }): Promise<AnthropicResult> {
    const apiKey = (process.env.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY ?? '').trim();
    if (!apiKey) {
      throw new ServiceError(
        'LONG_CONTEXT_NOT_CONFIGURED',
        'Anthropic API key is not configured.',
        503,
      );
    }

    const headers: Record<string, string> = {
      'anthropic-version': this.anthropicVersion,
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    };
    if (cacheTtl === '1h') {
      headers['anthropic-beta'] = EXTENDED_CACHE_TTL_BETA;
    }

    const cacheControl =
      cacheTtl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
    const payload = {
      max_tokens: maxOutputTokens,
      messages: [
        {
          content: [
            {
              cache_control: cacheControl,
              text: prompt,
              type: 'text',
            },
          ],
          role: 'user',
        },
      ],
      model: this.model,
      service_tier: serviceTier,
      system: [
        {
          cache_control: cacheControl,
          text: systemPrompt,
          type: 'text',
        },
      ],
      temperature: 0.2,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/messages`, {
        body: JSON.stringify(payload),
        headers,
        method: 'POST',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ServiceError(
          'LONG_CONTEXT_REQUEST_FAILED',
          await this.parseProviderError(response),
          response.status >= 500 ? 502 : response.status,
        );
      }
      return parseAnthropicResult((await response.json()) as unknown);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseProviderError(response: Response) {
    const fallback = `Anthropic long-context request failed with status ${response.status}.`;
    try {
      const raw = (await response.text()).trim();
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw) as unknown;
      const errorBody = asRecord(asRecord(parsed)?.error);
      return asString(errorBody?.message) ?? asString(errorBody?.type) ?? raw;
    } catch {
      return fallback;
    }
  }

  private async insertQueuedJob({
    cacheTtl,
    draftId,
    maxOutputTokens,
    metadata,
    prompt,
    provider,
    requestedById,
    requestedByType,
    route,
    serviceTier,
    systemPrompt,
    useCase,
  }: {
    cacheTtl: LongContextCacheTtl;
    draftId: string | null;
    maxOutputTokens: number;
    metadata: Record<string, unknown>;
    prompt: string;
    provider: string | null;
    requestedById: string | null;
    requestedByType: 'admin' | 'agent' | 'observer' | 'system';
    route: ProviderLaneResolvedRoute;
    serviceTier: LongContextServiceTier;
    systemPrompt: string;
    useCase: LongContextAnalysisUseCase;
  }) {
    const result = await this.queryable.query<LongContextJobRow>(
      `INSERT INTO long_context_analysis_jobs (
         lane,
         use_case,
         prompt_text,
         system_prompt,
         provider,
         model,
         status,
         requested_by_type,
         requested_by_id,
         draft_id,
         cache_ttl,
         max_output_tokens,
         service_tier,
         metadata
       )
       VALUES (
         'long_context',
         $1,
         $2,
         $3,
         $4,
         $5,
         'queued',
         $6,
         $7,
         $8,
         $9,
         $10,
         $11,
         $12::jsonb
       )
       RETURNING *`,
      [
        useCase,
        prompt,
        systemPrompt,
        provider,
        provider === ANTHROPIC_PROVIDER ? this.model : null,
        requestedByType,
        requestedById,
        draftId,
        cacheTtl,
        maxOutputTokens,
        serviceTier,
        toJsonString({
          ...metadata,
          cacheTtl,
          preferredProviders: route.requestedProviders,
          route,
        }),
      ],
    );
    return mapJob(result.rows[0]);
  }

  private async updateStatus(jobId: string, status: 'processing'): Promise<LongContextAnalysisJob> {
    const result = await this.queryable.query<LongContextJobRow>(
      `UPDATE long_context_analysis_jobs
          SET status = $2,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [jobId, status],
    );
    return mapJob(result.rows[0]);
  }

  private async completeJob({
    cacheCreationInputTokens,
    cacheReadInputTokens,
    estimatedCostUsd,
    inputTokens,
    jobId,
    metadata,
    model,
    outputTokens,
    provider,
    resultText,
    serviceTier,
  }: {
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
    estimatedCostUsd: number;
    inputTokens: number;
    jobId: string;
    metadata: Record<string, unknown>;
    model: string;
    outputTokens: number;
    provider: string;
    resultText: string;
    serviceTier: string;
  }) {
    const result = await this.queryable.query<LongContextJobRow>(
      `UPDATE long_context_analysis_jobs
          SET status = 'completed',
              provider = $2,
              model = $3,
              result_text = $4,
              input_tokens = $5,
              output_tokens = $6,
              cache_creation_input_tokens = $7,
              cache_read_input_tokens = $8,
              estimated_cost_usd = $9,
              service_tier = $10,
              metadata = $11::jsonb,
              failure_code = NULL,
              failure_message = NULL,
              completed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        jobId,
        provider,
        model,
        resultText,
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        estimatedCostUsd,
        serviceTier,
        toJsonString(metadata),
      ],
    );
    return mapJob(result.rows[0]);
  }

  private async failJob({
    error,
    jobId,
    metadata,
  }: {
    error: ServiceError;
    jobId: string;
    metadata: Record<string, unknown>;
  }) {
    const result = await this.queryable.query<LongContextJobRow>(
      `UPDATE long_context_analysis_jobs
          SET status = 'failed',
              failure_code = $2,
              failure_message = $3,
              metadata = $4::jsonb,
              completed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        jobId,
        error.code,
        error.message,
        toJsonString({
          ...metadata,
          failureStatus: error.status,
        }),
      ],
    );
    return mapJob(result.rows[0]);
  }
}

export const longContextService = new LongContextServiceImpl();
