import { env } from '../../config/env';
import { db } from '../../db/pool';
import { ServiceError } from '../common/errors';
import { providerRoutingService } from '../providerRouting/providerRoutingService';
import type { ProviderLaneResolvedRoute, ProviderRoutingService } from '../providerRouting/types';
import type {
  GroundedResearchCitation,
  GroundedResearchCitationStage,
  GroundedResearchRunResult,
  GroundedResearchService,
  RunGroundedResearchInput,
} from './groundedResearchTypes';

interface GroundedResearchQueryable {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

interface GroundedResearchServiceOptions {
  fetchImpl?: typeof fetch;
  providerRouting?: ProviderRoutingService;
  queryable?: GroundedResearchQueryable;
}

interface PersistedRunRow {
  created_at: Date;
  id: string;
}

interface PerplexitySearchResultRow {
  date?: unknown;
  last_updated?: unknown;
  snippet?: unknown;
  title?: unknown;
  url?: unknown;
}

interface GroundedAnswerResult {
  answer: string;
  citations: GroundedResearchCitation[];
  model: string;
  provider: string;
  searchQueries: string[];
}

const PERPLEXITY_SEARCH_PROVIDER = 'perplexity-search-api';
const PERPLEXITY_SONAR_PROVIDER = 'perplexity-sonar';
const GEMINI_GROUNDED_PROVIDER = 'gemini-search-grounded';
const DEFAULT_PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';
const DEFAULT_PERPLEXITY_SONAR_MODEL = 'sonar-pro';
const DEFAULT_PERPLEXITY_TIMEOUT_MS = 20_000;
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_GEMINI_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RESULTS = 5;
const MIN_MAX_RESULTS = 1;
const MAX_MAX_RESULTS = 8;
const URL_PROTOCOLS = new Set(['http:', 'https:']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const normalizeUrl = (value: unknown): string | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    return URL_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const clampMaxResults = (value: number | null | undefined) => {
  if (!(typeof value === 'number' && Number.isFinite(value))) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.min(Math.max(Math.floor(value), MIN_MAX_RESULTS), MAX_MAX_RESULTS);
};

const toJsonString = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
};

const normalizeCitation = ({
  metadata = {},
  position,
  provider,
  publishedAt = null,
  snippet = null,
  sourceStage,
  title = null,
  url,
}: {
  metadata?: Record<string, unknown>;
  position: number;
  provider: string;
  publishedAt?: string | null;
  snippet?: string | null;
  sourceStage: GroundedResearchCitationStage;
  title?: string | null;
  url: string;
}): GroundedResearchCitation => ({
  metadata,
  position,
  provider,
  publishedAt,
  snippet,
  sourceStage,
  title,
  url,
});

const dedupeCitations = (citations: GroundedResearchCitation[]): GroundedResearchCitation[] => {
  const seen = new Set<string>();
  const normalized: GroundedResearchCitation[] = [];
  for (const citation of citations) {
    const key = `${citation.sourceStage}:${citation.url}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({
      ...citation,
      position: normalized.length + 1,
    });
  }
  return normalized;
};

const extractTextFromOpenAIMessageContent = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  const segments = asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      if (record?.type === 'output_text' || record?.type === 'text') {
        return asString(record.text) ?? '';
      }
      return '';
    })
    .filter((segment) => segment.length > 0);
  return segments.join('\n').trim();
};

const extractGeminiText = (parts: unknown): string => {
  return asArray(parts)
    .map((part) => asString(asRecord(part)?.text) ?? '')
    .filter((segment) => segment.length > 0)
    .join('\n')
    .trim();
};

const parsePerplexitySearchResults = (payload: unknown): GroundedResearchCitation[] => {
  const results = asArray(asRecord(payload)?.results);
  return dedupeCitations(
    results
      .map((entry, index) => {
        const row = asRecord(entry) as PerplexitySearchResultRow | null;
        const url = normalizeUrl(row?.url);
        if (!url) {
          return null;
        }
        return normalizeCitation({
          metadata: {
            lastUpdated: asString(row?.last_updated),
          },
          position: index + 1,
          provider: PERPLEXITY_SEARCH_PROVIDER,
          publishedAt: asString(row?.date) ?? asString(row?.last_updated),
          snippet: asString(row?.snippet),
          sourceStage: 'retrieval',
          title: asString(row?.title),
          url,
        });
      })
      .filter((citation): citation is GroundedResearchCitation => citation !== null),
  );
};

const parsePerplexitySonarPayload = (payload: unknown, model: string): GroundedAnswerResult => {
  const body = asRecord(payload);
  const choices = asArray(body?.choices);
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  const answer = extractTextFromOpenAIMessageContent(message?.content);
  if (!answer) {
    throw new ServiceError(
      'GROUNDED_RESEARCH_INVALID_RESPONSE',
      'Perplexity Sonar did not return answer text.',
      502,
    );
  }

  const searchResults = dedupeCitations(
    asArray(body?.search_results)
      .map((entry, index) => {
        const row = asRecord(entry);
        const url = normalizeUrl(row?.url);
        if (!url) {
          return null;
        }
        return normalizeCitation({
          metadata: {},
          position: index + 1,
          provider: PERPLEXITY_SONAR_PROVIDER,
          publishedAt: asString(row?.date),
          snippet: asString(row?.snippet),
          sourceStage: 'answer',
          title: asString(row?.title),
          url,
        });
      })
      .filter((citation): citation is GroundedResearchCitation => citation !== null),
  );

  const citationUrls = dedupeCitations(
    asArray(body?.citations)
      .map((entry, index) => {
        const record = asRecord(entry);
        const url = normalizeUrl(record?.url ?? entry);
        if (!url) {
          return null;
        }
        return normalizeCitation({
          metadata: {},
          position: index + 1,
          provider: PERPLEXITY_SONAR_PROVIDER,
          sourceStage: 'answer',
          title: asString(record?.title),
          url,
        });
      })
      .filter((citation): citation is GroundedResearchCitation => citation !== null),
  );

  return {
    answer,
    citations: searchResults.length > 0 ? searchResults : citationUrls,
    model,
    provider: PERPLEXITY_SONAR_PROVIDER,
    searchQueries: [],
  };
};

const parseGeminiGroundedPayload = (payload: unknown, model: string): GroundedAnswerResult => {
  const body = asRecord(payload);
  const candidates = asArray(body?.candidates);
  const firstCandidate = asRecord(candidates[0]);
  const content = asRecord(firstCandidate?.content);
  const answer = extractGeminiText(content?.parts);
  if (!answer) {
    throw new ServiceError(
      'GROUNDED_RESEARCH_INVALID_RESPONSE',
      'Gemini grounded search did not return answer text.',
      502,
    );
  }
  const groundingMetadata =
    asRecord(firstCandidate?.groundingMetadata) ?? asRecord(body?.groundingMetadata);
  const groundingChunks = asArray(groundingMetadata?.groundingChunks);
  const citations = dedupeCitations(
    groundingChunks
      .map((chunk, index) => {
        const web = asRecord(asRecord(chunk)?.web);
        const url = normalizeUrl(web?.uri);
        if (!url) {
          return null;
        }
        return normalizeCitation({
          metadata: {},
          position: index + 1,
          provider: GEMINI_GROUNDED_PROVIDER,
          sourceStage: 'answer',
          title: asString(web?.title),
          url,
        });
      })
      .filter((citation): citation is GroundedResearchCitation => citation !== null),
  );
  const searchQueries = asArray(groundingMetadata?.webSearchQueries)
    .map((entry) => asString(entry))
    .filter((entry): entry is string => entry !== null);

  return {
    answer,
    citations,
    model,
    provider: GEMINI_GROUNDED_PROVIDER,
    searchQueries,
  };
};

const buildSonarMessages = (query: string) => [
  {
    role: 'system',
    content:
      'You are the FinishIt grounded research assistant. Answer only from retrieved web evidence and keep the response concise and source-backed.',
  },
  {
    role: 'user',
    content: query,
  },
];

const buildGeminiPrompt = (query: string) =>
  `Answer the following request with web-grounded evidence only. Keep the answer concise and factual.\n\n${query}`;

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

export class GroundedResearchServiceImpl implements GroundedResearchService {
  private readonly fetchImpl: typeof fetch;
  private readonly geminiBaseUrl: string;
  private readonly geminiModel: string;
  private readonly geminiTimeoutMs: number;
  private readonly perplexityBaseUrl: string;
  private readonly perplexitySonarModel: string;
  private readonly perplexityTimeoutMs: number;
  private readonly providerRouting: ProviderRoutingService;
  private readonly queryable: GroundedResearchQueryable;

  constructor(options: GroundedResearchServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.geminiBaseUrl = (
      process.env.GEMINI_GROUNDED_RESEARCH_BASE_URL ??
      env.GEMINI_GROUNDED_RESEARCH_BASE_URL ??
      DEFAULT_GEMINI_BASE_URL
    ).replace(/\/$/, '');
    this.geminiModel =
      (process.env.GEMINI_GROUNDED_RESEARCH_MODEL ?? env.GEMINI_GROUNDED_RESEARCH_MODEL).trim() ||
      DEFAULT_GEMINI_MODEL;
    this.geminiTimeoutMs = Number(
      process.env.GEMINI_GROUNDED_RESEARCH_TIMEOUT_MS ??
        env.GEMINI_GROUNDED_RESEARCH_TIMEOUT_MS ??
        DEFAULT_GEMINI_TIMEOUT_MS,
    );
    this.perplexityBaseUrl = (
      process.env.PERPLEXITY_BASE_URL ??
      env.PERPLEXITY_BASE_URL ??
      DEFAULT_PERPLEXITY_BASE_URL
    ).replace(/\/$/, '');
    this.perplexitySonarModel =
      (process.env.PERPLEXITY_SONAR_MODEL ?? env.PERPLEXITY_SONAR_MODEL).trim() ||
      DEFAULT_PERPLEXITY_SONAR_MODEL;
    this.perplexityTimeoutMs = Number(
      process.env.PERPLEXITY_TIMEOUT_MS ??
        env.PERPLEXITY_TIMEOUT_MS ??
        DEFAULT_PERPLEXITY_TIMEOUT_MS,
    );
    this.providerRouting = options.providerRouting ?? providerRoutingService;
    this.queryable = options.queryable ?? db;
  }

  async runResearch(input: RunGroundedResearchInput): Promise<GroundedResearchRunResult> {
    const query = input.query.trim();
    if (!query) {
      throw new ServiceError('GROUNDED_RESEARCH_INVALID_INPUT', 'query is required.', 400);
    }

    const maxResults = clampMaxResults(input.maxResults);
    const route = this.providerRouting.resolveRoute({
      lane: 'grounded_research',
      preferredProviders: input.preferredProviders,
    });
    const retrievalProvider = route.resolvedProviders.find(
      (provider) => provider.provider === PERPLEXITY_SEARCH_PROVIDER,
    );
    let rawSources: GroundedResearchCitation[] = [];
    let retrievalFailure: { errorCode: string; errorMessage: string } | null = null;

    if (retrievalProvider) {
      try {
        rawSources = await this.runPerplexitySearch({
          input,
          maxResults,
          route,
        });
      } catch (error) {
        const serviceError = toServiceError(
          error,
          'GROUNDED_RESEARCH_RETRIEVAL_FAILED',
          'Grounded research retrieval failed.',
        );
        retrievalFailure = {
          errorCode: serviceError.code,
          errorMessage: serviceError.message,
        };
      }
    }

    const answerProviders = route.resolvedProviders.filter((provider) =>
      [PERPLEXITY_SONAR_PROVIDER, GEMINI_GROUNDED_PROVIDER].includes(provider.provider),
    );
    if (answerProviders.length === 0) {
      throw new ServiceError(
        'GROUNDED_RESEARCH_PROVIDER_UNAVAILABLE',
        'No grounded research answer provider is configured for this lane.',
        503,
      );
    }

    let answerResult: GroundedAnswerResult | null = null;
    let lastError: ServiceError | null = null;
    for (const provider of answerProviders) {
      if (
        provider.provider === GEMINI_GROUNDED_PROVIDER &&
        (input.domainAllowlist?.length || input.recency || input.country)
      ) {
        lastError = new ServiceError(
          'GROUNDED_RESEARCH_UNSUPPORTED_FILTERS',
          'Gemini grounded search does not support domain/country/recency filters in this slice.',
          400,
        );
        continue;
      }

      try {
        if (provider.provider === PERPLEXITY_SONAR_PROVIDER) {
          answerResult = await this.runPerplexitySonar({
            input,
            maxResults,
            route,
          });
          break;
        }
        if (provider.provider === GEMINI_GROUNDED_PROVIDER) {
          answerResult = await this.runGeminiGrounded({
            input,
            route,
          });
          break;
        }
      } catch (error) {
        lastError = toServiceError(
          error,
          'GROUNDED_RESEARCH_ANSWER_FAILED',
          'Grounded research answer generation failed.',
        );
      }
    }

    if (!answerResult) {
      throw (
        lastError ??
        new ServiceError(
          'GROUNDED_RESEARCH_ANSWER_FAILED',
          'Grounded research answer generation failed.',
          502,
        )
      );
    }

    const persistedRun = await this.persistRun({
      answerResult,
      input,
      query,
      rawSources,
      retrievalFailure,
      route,
    });

    return {
      answer: answerResult.answer,
      answerProvider: answerResult.provider,
      citations: answerResult.citations,
      createdAt: persistedRun.created_at,
      model: answerResult.model,
      query,
      rawSources,
      retrievalProvider: retrievalProvider?.provider ?? null,
      route,
      runId: persistedRun.id,
      searchQueries:
        answerResult.searchQueries.length > 0
          ? answerResult.searchQueries
          : rawSources.length > 0
            ? [query]
            : [],
    };
  }

  private async runPerplexitySearch({
    input,
    maxResults,
    route,
  }: {
    input: RunGroundedResearchInput;
    maxResults: number;
    route: ProviderLaneResolvedRoute;
  }): Promise<GroundedResearchCitation[]> {
    const startedAt = Date.now();
    try {
      const apiKey = (process.env.PERPLEXITY_API_KEY ?? env.PERPLEXITY_API_KEY ?? '').trim();
      if (!apiKey) {
        throw new ServiceError(
          'GROUNDED_RESEARCH_NOT_CONFIGURED',
          'Perplexity API key is not configured.',
          503,
        );
      }
      const payload = await this.fetchJson({
        body: {
          country: input.country ?? undefined,
          max_results: maxResults,
          query: input.query,
          search_domain_filter: input.domainAllowlist ?? undefined,
          search_recency_filter: input.recency ?? undefined,
        },
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeoutMs: this.perplexityTimeoutMs,
        url: `${this.perplexityBaseUrl}/search`,
      });
      const results = parsePerplexitySearchResults(payload);
      await this.providerRouting.recordExecution({
        durationMs: Date.now() - startedAt,
        lane: 'grounded_research',
        metadata: {
          domainAllowlist: input.domainAllowlist ?? null,
          queryLength: input.query.length,
          rawSourcesCount: results.length,
          recency: input.recency ?? null,
        },
        model: 'search-api',
        operation: 'grounded_research_retrieval',
        provider: PERPLEXITY_SEARCH_PROVIDER,
        route,
        status: 'ok',
        userId: input.requestedById ?? null,
        userType: input.requestedByType ?? 'system',
      });
      return results;
    } catch (error) {
      const serviceError = toServiceError(
        error,
        'GROUNDED_RESEARCH_RETRIEVAL_FAILED',
        'Grounded research retrieval failed.',
      );
      await this.providerRouting.recordExecution({
        durationMs: Date.now() - startedAt,
        lane: 'grounded_research',
        metadata: {
          errorCode: serviceError.code,
          errorMessage: serviceError.message,
          operationSource: 'perplexity-search',
        },
        model: 'search-api',
        operation: 'grounded_research_retrieval',
        provider: PERPLEXITY_SEARCH_PROVIDER,
        route,
        status: 'failed',
        userId: input.requestedById ?? null,
        userType: input.requestedByType ?? 'system',
      });
      throw serviceError;
    }
  }

  private async runPerplexitySonar({
    input,
    maxResults,
    route,
  }: {
    input: RunGroundedResearchInput;
    maxResults: number;
    route: ProviderLaneResolvedRoute;
  }): Promise<GroundedAnswerResult> {
    const startedAt = Date.now();
    try {
      const apiKey = (process.env.PERPLEXITY_API_KEY ?? env.PERPLEXITY_API_KEY ?? '').trim();
      if (!apiKey) {
        throw new ServiceError(
          'GROUNDED_RESEARCH_NOT_CONFIGURED',
          'Perplexity API key is not configured.',
          503,
        );
      }
      const payload = await this.fetchJson({
        body: {
          messages: buildSonarMessages(input.query),
          model: this.perplexitySonarModel,
          search_domain_filter: input.domainAllowlist ?? undefined,
          search_recency_filter: input.recency ?? undefined,
          stream: false,
          web_search_options: {
            search_context_size: maxResults <= 3 ? 'medium' : 'high',
          },
        },
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeoutMs: this.perplexityTimeoutMs,
        url: `${this.perplexityBaseUrl}/chat/completions`,
      });
      const result = parsePerplexitySonarPayload(payload, this.perplexitySonarModel);
      await this.providerRouting.recordExecution({
        durationMs: Date.now() - startedAt,
        lane: 'grounded_research',
        metadata: {
          citationCount: result.citations.length,
          domainAllowlist: input.domainAllowlist ?? null,
          queryLength: input.query.length,
          recency: input.recency ?? null,
        },
        model: this.perplexitySonarModel,
        operation: 'grounded_research_answer',
        provider: PERPLEXITY_SONAR_PROVIDER,
        route,
        status: 'ok',
        userId: input.requestedById ?? null,
        userType: input.requestedByType ?? 'system',
      });
      return result;
    } catch (error) {
      const serviceError = toServiceError(
        error,
        'GROUNDED_RESEARCH_ANSWER_FAILED',
        'Perplexity Sonar grounded answer failed.',
      );
      await this.providerRouting.recordExecution({
        durationMs: Date.now() - startedAt,
        lane: 'grounded_research',
        metadata: {
          errorCode: serviceError.code,
          errorMessage: serviceError.message,
          operationSource: 'perplexity-sonar',
        },
        model: this.perplexitySonarModel,
        operation: 'grounded_research_answer',
        provider: PERPLEXITY_SONAR_PROVIDER,
        route,
        status: 'failed',
        userId: input.requestedById ?? null,
        userType: input.requestedByType ?? 'system',
      });
      throw serviceError;
    }
  }

  private async runGeminiGrounded({
    input,
    route,
  }: {
    input: RunGroundedResearchInput;
    route: ProviderLaneResolvedRoute;
  }): Promise<GroundedAnswerResult> {
    const startedAt = Date.now();
    try {
      const apiKey = (process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY ?? '').trim();
      if (!apiKey) {
        throw new ServiceError(
          'GROUNDED_RESEARCH_NOT_CONFIGURED',
          'Gemini API key is not configured.',
          503,
        );
      }
      const payload = await this.fetchJson({
        body: {
          contents: [
            {
              parts: [{ text: buildGeminiPrompt(input.query) }],
              role: 'user',
            },
          ],
          tools: [{ google_search: {} }],
        },
        headers: {
          'Content-Type': 'application/json',
        },
        timeoutMs: this.geminiTimeoutMs,
        url: `${this.geminiBaseUrl}/models/${encodeURIComponent(this.geminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      });
      const result = parseGeminiGroundedPayload(payload, this.geminiModel);
      await this.providerRouting.recordExecution({
        durationMs: Date.now() - startedAt,
        lane: 'grounded_research',
        metadata: {
          citationCount: result.citations.length,
          queryLength: input.query.length,
          searchQueries: result.searchQueries,
        },
        model: this.geminiModel,
        operation: 'grounded_research_answer',
        provider: GEMINI_GROUNDED_PROVIDER,
        route,
        status: 'ok',
        userId: input.requestedById ?? null,
        userType: input.requestedByType ?? 'system',
      });
      return result;
    } catch (error) {
      const serviceError = toServiceError(
        error,
        'GROUNDED_RESEARCH_ANSWER_FAILED',
        'Gemini grounded answer failed.',
      );
      await this.providerRouting.recordExecution({
        durationMs: Date.now() - startedAt,
        lane: 'grounded_research',
        metadata: {
          errorCode: serviceError.code,
          errorMessage: serviceError.message,
          operationSource: 'gemini-grounded',
        },
        model: this.geminiModel,
        operation: 'grounded_research_answer',
        provider: GEMINI_GROUNDED_PROVIDER,
        route,
        status: 'failed',
        userId: input.requestedById ?? null,
        userType: input.requestedByType ?? 'system',
      });
      throw serviceError;
    }
  }

  private async fetchJson({
    body,
    headers,
    timeoutMs,
    url,
  }: {
    body: Record<string, unknown>;
    headers: Record<string, string>;
    timeoutMs: number;
    url: string;
  }): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        body: JSON.stringify(body),
        headers,
        method: 'POST',
        signal: controller.signal,
      });
      if (!response.ok) {
        const raw = (await response.text()).trim();
        throw new ServiceError(
          'GROUNDED_RESEARCH_REQUEST_FAILED',
          raw || `Provider request failed with status ${response.status}.`,
          response.status >= 500 ? 502 : response.status,
        );
      }
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async persistRun({
    answerResult,
    input,
    query,
    rawSources,
    retrievalFailure,
    route,
  }: {
    answerResult: GroundedAnswerResult;
    input: RunGroundedResearchInput;
    query: string;
    rawSources: GroundedResearchCitation[];
    retrievalFailure: { errorCode: string; errorMessage: string } | null;
    route: ProviderLaneResolvedRoute;
  }): Promise<PersistedRunRow> {
    const metadata = {
      country: input.country ?? null,
      domainAllowlist: input.domainAllowlist ?? [],
      preferredProviders: input.preferredProviders ?? [],
      rawSourcesCount: rawSources.length,
      recency: input.recency ?? null,
      requestedProviders: route.requestedProviders,
      resolvedProviders: route.resolvedProviders.map((provider) => provider.provider),
      retrievalFailure,
      searchQueries:
        answerResult.searchQueries.length > 0
          ? answerResult.searchQueries
          : rawSources.length > 0
            ? [query]
            : [],
    };
    const runResult = await this.queryable.query<PersistedRunRow>(
      `INSERT INTO grounded_research_runs (
         lane,
         query_text,
         answer_text,
         retrieval_provider,
         answer_provider,
         model,
         search_query_count,
         raw_sources_count,
         citation_count,
         requested_by_type,
         requested_by_id,
         metadata
       )
       VALUES (
         'grounded_research',
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
         $11::jsonb
       )
       RETURNING id, created_at`,
      [
        query,
        answerResult.answer,
        rawSources.length > 0 ? PERPLEXITY_SEARCH_PROVIDER : null,
        answerResult.provider,
        answerResult.model,
        metadata.searchQueries.length,
        rawSources.length,
        rawSources.length + answerResult.citations.length,
        input.requestedByType ?? 'system',
        input.requestedById ?? null,
        toJsonString(metadata),
      ],
    );
    const run = runResult.rows[0];
    const citationsToPersist = [
      ...rawSources,
      ...answerResult.citations.map((citation) => ({
        ...citation,
        position: citation.position + rawSources.length,
      })),
    ];
    if (citationsToPersist.length > 0) {
      const values: unknown[] = [];
      const rowsSql: string[] = [];
      for (const citation of citationsToPersist) {
        values.push(
          run.id,
          citation.sourceStage,
          citation.position,
          citation.title,
          citation.url,
          citation.snippet,
          citation.provider,
          citation.publishedAt,
          toJsonString(citation.metadata),
        );
        const offset = values.length - 8;
        rowsSql.push(
          `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::jsonb)`,
        );
      }
      await this.queryable.query(
        `INSERT INTO grounded_research_citations (
           run_id,
           source_stage,
           position,
           title,
           url,
           snippet,
           provider,
           published_at,
           metadata
         )
         VALUES ${rowsSql.join(', ')}`,
        values,
      );
    }
    return run;
  }
}

export const groundedResearchService = new GroundedResearchServiceImpl();
