import { env } from '../../config/env';
import { db } from '../../db/pool';
import type {
  ProviderLane,
  ProviderLaneConfig,
  ProviderLaneExecutionRecordInput,
  ProviderLaneExecutionStatus,
  ProviderLaneProviderConfig,
  ProviderLaneProviderRole,
  ProviderLaneResolveInput,
  ProviderLaneResolvedRoute,
  ProviderLaneRoute,
  ProviderLaneStage,
  ProviderLaneTelemetryFilters,
  ProviderLaneTelemetryLaneBreakdown,
  ProviderLaneTelemetryOperationBreakdown,
  ProviderLaneTelemetryProviderBreakdown,
  ProviderLaneTelemetrySnapshot,
  ProviderLaneTelemetrySummary,
  ProviderRoutingService,
} from './types';
import {
  PROVIDER_LANES,
  PROVIDER_LANE_EXECUTION_STATUSES,
  PROVIDER_LANE_PROVIDER_ROLES,
  PROVIDER_LANE_STAGES,
} from './types';

interface ProviderRoutingQueryable {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

interface ProviderRoutingServiceOptions {
  queryable?: ProviderRoutingQueryable;
  rawLaneConfigs?: string;
  rawDisabledProviders?: string;
}

interface TelemetryBreakdownRow {
  avg_timing_ms: number | string | null;
  failed_count: number | string | null;
  key: string | null;
  last_event_at: Date | string | null;
  ok_count: number | string | null;
  total: number | string | null;
}

interface TelemetryRecentRow {
  created_at: Date | string | null;
  metadata: Record<string, unknown> | null;
  status: string | null;
  timing_ms: number | string | null;
  user_id: string | null;
  user_type: string | null;
}

interface TelemetrySummaryRow {
  avg_timing_ms: number | string | null;
  failed_count: number | string | null;
  last_event_at: Date | string | null;
  ok_count: number | string | null;
  p95_timing_ms: number | string | null;
  total: number | string | null;
}

const PROVIDER_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const PROVIDER_LANE_TELEMETRY_SOURCE = 'provider_routing';
export const PROVIDER_LANE_EXECUTION_EVENT_TYPE = 'provider_lane_execution';

const DEFAULT_PROVIDER_LANE_CONFIGS: Record<ProviderLane, ProviderLaneConfig> = {
  voice_live: {
    stage: 'ga',
    grounded: false,
    cacheEligible: false,
    budgetCapUsd: null,
    providers: [
      {
        provider: 'openai',
        model: 'gpt-realtime',
        role: 'primary',
      },
    ],
  },
  voice_render: {
    stage: 'pilot',
    grounded: false,
    cacheEligible: false,
    budgetCapUsd: null,
    providers: [
      {
        provider: 'deepgram',
        model: 'aura-2',
        role: 'primary',
      },
    ],
  },
  grounded_research: {
    stage: 'pilot',
    grounded: true,
    cacheEligible: false,
    budgetCapUsd: null,
    providers: [
      {
        provider: 'perplexity-search-api',
        model: 'search-api',
        role: 'primary',
      },
      {
        provider: 'perplexity-sonar',
        model: 'sonar-pro',
        role: 'secondary',
      },
      {
        provider: 'gemini-search-grounded',
        model: 'gemini-2.0-flash',
        role: 'fallback',
      },
    ],
  },
  image_edit: {
    stage: 'pilot',
    grounded: false,
    cacheEligible: false,
    budgetCapUsd: null,
    providers: [
      {
        provider: 'fal-nano-banana-2-edit',
        model: 'nano-banana-2-edit',
        role: 'primary',
      },
      {
        provider: 'gpt-image-1',
        model: 'gpt-image-1',
        role: 'fallback',
      },
      {
        provider: 'sd3',
        model: 'sd3',
        role: 'secondary',
      },
      {
        provider: 'dalle-3',
        model: 'dalle-3',
        role: 'secondary',
      },
    ],
  },
  long_context: {
    stage: 'pilot',
    grounded: false,
    cacheEligible: true,
    budgetCapUsd: null,
    providers: [
      {
        provider: 'claude-4',
        model: 'claude-sonnet-4-20250514',
        role: 'primary',
      },
      {
        provider: 'gpt-4.1',
        model: 'gpt-4.1',
        role: 'fallback',
      },
      {
        provider: 'gemini-2',
        model: 'gemini-2',
        role: 'fallback',
      },
      {
        provider: 'kimi-k2',
        model: 'kimi-k2',
        role: 'secondary',
      },
      {
        provider: 'deepseek-v3.2',
        model: 'deepseek-v3.2',
        role: 'budget',
      },
    ],
  },
  browser_operator: {
    stage: 'planned',
    grounded: false,
    cacheEligible: false,
    budgetCapUsd: null,
    providers: [
      {
        provider: 'anthropic-computer-use',
        model: 'claude-computer-use',
        role: 'primary',
      },
      {
        provider: 'openclaw-browser-operator',
        model: 'openclaw',
        role: 'fallback',
      },
    ],
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isProviderLane = (value: string): value is ProviderLane =>
  PROVIDER_LANES.includes(value as ProviderLane);

const isProviderLaneStage = (value: string): value is ProviderLaneStage =>
  PROVIDER_LANE_STAGES.includes(value as ProviderLaneStage);

const isProviderLaneProviderRole = (value: string): value is ProviderLaneProviderRole =>
  PROVIDER_LANE_PROVIDER_ROLES.includes(value as ProviderLaneProviderRole);

const isProviderLaneExecutionStatus = (value: string): value is ProviderLaneExecutionStatus =>
  PROVIDER_LANE_EXECUTION_STATUSES.includes(value as ProviderLaneExecutionStatus);

const cloneProviderConfig = (provider: ProviderLaneProviderConfig): ProviderLaneProviderConfig => ({
  model: provider.model,
  provider: provider.provider,
  role: provider.role,
});

const cloneLaneConfig = (config: ProviderLaneConfig): ProviderLaneConfig => ({
  budgetCapUsd: config.budgetCapUsd,
  cacheEligible: config.cacheEligible,
  grounded: config.grounded,
  providers: config.providers.map(cloneProviderConfig),
  stage: config.stage,
});

const parseJsonObject = (rawValue: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const toNullableIsoTimestamp = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value.toISOString();
  }
  return null;
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

const toRate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Number((numerator / denominator).toFixed(3)) : null;

const toJsonString = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
};

const normalizeProviderIdentifier = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!PROVIDER_IDENTIFIER_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
};

const normalizeUniqueProviderIdentifiers = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const identifier = normalizeProviderIdentifier(value);
    if (!(identifier && !seen.has(identifier))) {
      continue;
    }
    seen.add(identifier);
    normalized.push(identifier);
  }
  return normalized;
};

const parseProviderConfig = (value: unknown): ProviderLaneProviderConfig | null => {
  if (!isRecord(value)) {
    return null;
  }
  const provider = normalizeProviderIdentifier(value.provider);
  if (!provider) {
    return null;
  }

  let model: string | null = null;
  if (typeof value.model === 'string' && value.model.trim().length > 0) {
    model = value.model.trim();
  }

  const roleValue = typeof value.role === 'string' ? value.role.trim().toLowerCase() : '';
  const role = isProviderLaneProviderRole(roleValue) ? roleValue : ('fallback' as const);

  return {
    model,
    provider,
    role,
  };
};

const parseProviderConfigArray = (value: unknown): ProviderLaneProviderConfig[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed = value
    .map(parseProviderConfig)
    .filter((entry): entry is ProviderLaneProviderConfig => entry !== null);
  return parsed.length > 0 ? parsed : [];
};

const mergeLaneConfigs = (rawValue: string): Record<ProviderLane, ProviderLaneConfig> => {
  const configs = Object.fromEntries(
    PROVIDER_LANES.map((lane) => [lane, cloneLaneConfig(DEFAULT_PROVIDER_LANE_CONFIGS[lane])]),
  ) as Record<ProviderLane, ProviderLaneConfig>;

  const parsed = parseJsonObject(rawValue);
  if (!parsed) {
    return configs;
  }

  for (const lane of PROVIDER_LANES) {
    const override = parsed[lane];
    if (!isRecord(override)) {
      continue;
    }
    const next = cloneLaneConfig(configs[lane]);
    if (typeof override.stage === 'string') {
      const stage = override.stage.trim().toLowerCase();
      if (isProviderLaneStage(stage)) {
        next.stage = stage;
      }
    }
    if (typeof override.grounded === 'boolean') {
      next.grounded = override.grounded;
    }
    if (typeof override.cacheEligible === 'boolean') {
      next.cacheEligible = override.cacheEligible;
    }
    if (
      override.budgetCapUsd === null ||
      (typeof override.budgetCapUsd === 'number' &&
        Number.isFinite(override.budgetCapUsd) &&
        override.budgetCapUsd >= 0)
    ) {
      next.budgetCapUsd = override.budgetCapUsd;
    }
    const providers = parseProviderConfigArray(override.providers);
    if (providers.length > 0) {
      next.providers = providers;
    }
    configs[lane] = next;
  }

  return configs;
};

const parseDisabledProviders = (rawValue: string): Record<ProviderLane, string[]> => {
  const disabled = Object.fromEntries(
    PROVIDER_LANES.map((lane) => [lane, [] as string[]]),
  ) as Record<ProviderLane, string[]>;
  const trimmed = rawValue.trim();
  if (trimmed.length < 1) {
    return disabled;
  }

  const parsed = parseJsonObject(trimmed);
  if (parsed) {
    for (const lane of PROVIDER_LANES) {
      disabled[lane] = normalizeUniqueProviderIdentifiers(parsed[lane]);
    }
    return disabled;
  }

  for (const token of trimmed.split(',')) {
    const normalized = token.trim().toLowerCase();
    if (normalized.length < 1) {
      continue;
    }
    const separatorIndex = normalized.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }
    const lane = normalized.slice(0, separatorIndex).trim();
    const provider = normalizeProviderIdentifier(normalized.slice(separatorIndex + 1).trim());
    if (!(isProviderLane(lane) && provider)) {
      continue;
    }
    if (!disabled[lane].includes(provider)) {
      disabled[lane].push(provider);
    }
  }

  return disabled;
};

const createProviderBreakdown = <T extends string>(
  key: T,
  row: TelemetryBreakdownRow,
):
  | ProviderLaneTelemetryLaneBreakdown
  | ProviderLaneTelemetryOperationBreakdown
  | ProviderLaneTelemetryProviderBreakdown => {
  const total = Math.max(0, Math.trunc(toNullableNumber(row.total) ?? 0));
  const okCount = Math.max(0, Math.trunc(toNullableNumber(row.ok_count) ?? 0));
  const failedCount = Math.max(0, Math.trunc(toNullableNumber(row.failed_count) ?? 0));
  const breakdown = {
    avgTimingMs: toNullableNumber(row.avg_timing_ms),
    failedCount,
    lastEventAt: toNullableIsoTimestamp(row.last_event_at),
    okCount,
    successRate: toRate(okCount, total),
    total,
  };
  if (key === 'lane') {
    return {
      lane: row.key ?? 'unknown',
      ...breakdown,
    };
  }
  if (key === 'provider') {
    return {
      provider: row.key ?? 'unknown',
      ...breakdown,
    };
  }
  return {
    operation: row.key ?? 'unknown',
    ...breakdown,
  };
};

export class ProviderRoutingServiceImpl implements ProviderRoutingService {
  private readonly disabledProvidersByLane: Record<ProviderLane, string[]>;
  private readonly laneConfigs: Record<ProviderLane, ProviderLaneConfig>;
  private readonly queryable: ProviderRoutingQueryable;

  constructor({
    queryable = db,
    rawDisabledProviders = process.env.AI_PROVIDER_LANE_DISABLED_PROVIDERS ??
      env.AI_PROVIDER_LANE_DISABLED_PROVIDERS,
    rawLaneConfigs = process.env.AI_PROVIDER_LANE_CONFIGS ?? env.AI_PROVIDER_LANE_CONFIGS,
  }: ProviderRoutingServiceOptions = {}) {
    this.queryable = queryable;
    this.laneConfigs = mergeLaneConfigs(rawLaneConfigs);
    this.disabledProvidersByLane = parseDisabledProviders(rawDisabledProviders);
  }

  getLaneRoutes(): ProviderLaneRoute[] {
    return PROVIDER_LANES.map((lane) => this.resolveRoute({ lane }));
  }

  resolveRoute(input: ProviderLaneResolveInput): ProviderLaneResolvedRoute {
    const config = this.laneConfigs[input.lane];
    const configuredProvidersById = new Map(
      config.providers.map((provider) => [provider.provider, provider]),
    );
    const requestedProviders = normalizeUniqueProviderIdentifiers(input.preferredProviders);
    const baseProviders =
      requestedProviders.length > 0
        ? requestedProviders.map((provider) =>
            cloneProviderConfig(
              configuredProvidersById.get(provider) ?? {
                provider,
                model: provider,
                role: 'requested',
              },
            ),
          )
        : config.providers.map(cloneProviderConfig);
    const disabledProviders = [...this.disabledProvidersByLane[input.lane]].sort((left, right) =>
      left.localeCompare(right),
    );
    const disabledProviderSet = new Set(disabledProviders);
    const providers = baseProviders.map((provider) => ({
      ...provider,
      enabled: !disabledProviderSet.has(provider.provider),
    }));

    return {
      budgetCapUsd: config.budgetCapUsd,
      cacheEligible: config.cacheEligible,
      disabledProviders,
      grounded: config.grounded,
      lane: input.lane,
      providers,
      requestedProviders,
      resolvedProviders: providers
        .filter((provider) => provider.enabled)
        .map(({ enabled: _enabled, ...provider }) => provider),
      stage: config.stage,
    };
  }

  async recordExecution(input: ProviderLaneExecutionRecordInput): Promise<void> {
    const durationMs =
      typeof input.durationMs === 'number' &&
      Number.isFinite(input.durationMs) &&
      input.durationMs >= 0
        ? Math.round(input.durationMs)
        : null;
    const userType =
      input.userType === 'admin' ||
      input.userType === 'agent' ||
      input.userType === 'observer' ||
      input.userType === 'system'
        ? input.userType
        : 'system';
    try {
      await this.queryable.query(
        `INSERT INTO ux_events
           (event_type, user_type, user_id, draft_id, status, timing_ms, source, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          PROVIDER_LANE_EXECUTION_EVENT_TYPE,
          userType,
          input.userId ?? null,
          input.draftId ?? null,
          input.status,
          durationMs,
          PROVIDER_LANE_TELEMETRY_SOURCE,
          toJsonString(this.buildExecutionMetadata(input)),
        ],
      );
    } catch (error) {
      console.error('provider routing telemetry write failed', error);
    }
  }

  async getTelemetrySnapshot(
    filters: ProviderLaneTelemetryFilters,
  ): Promise<ProviderLaneTelemetrySnapshot> {
    const { clauses, params } = this.buildTelemetryWhereClause(filters);

    const summaryResult = await this.queryable.query<TelemetrySummaryRow>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'ok')::int AS ok_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
         AVG(timing_ms)::float AS avg_timing_ms,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY timing_ms) AS p95_timing_ms,
         MAX(created_at) AS last_event_at
       FROM ux_events
       WHERE ${clauses.join(' AND ')}`,
      params,
    );

    const byLaneResult = await this.queryable.query<TelemetryBreakdownRow>(
      `SELECT
         LOWER(COALESCE(metadata->>'lane', 'unknown')) AS key,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'ok')::int AS ok_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
         AVG(timing_ms)::float AS avg_timing_ms,
         MAX(created_at) AS last_event_at
       FROM ux_events
       WHERE ${clauses.join(' AND ')}
       GROUP BY key
       ORDER BY total DESC, key ASC`,
      params,
    );

    const byProviderResult = await this.queryable.query<TelemetryBreakdownRow>(
      `SELECT
         LOWER(COALESCE(metadata->>'provider', 'unknown')) AS key,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'ok')::int AS ok_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
         AVG(timing_ms)::float AS avg_timing_ms,
         MAX(created_at) AS last_event_at
       FROM ux_events
       WHERE ${clauses.join(' AND ')}
       GROUP BY key
       ORDER BY total DESC, key ASC`,
      params,
    );

    const byOperationResult = await this.queryable.query<TelemetryBreakdownRow>(
      `SELECT
         LOWER(COALESCE(metadata->>'operation', 'unknown')) AS key,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'ok')::int AS ok_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
         AVG(timing_ms)::float AS avg_timing_ms,
         MAX(created_at) AS last_event_at
       FROM ux_events
       WHERE ${clauses.join(' AND ')}
       GROUP BY key
       ORDER BY total DESC, key ASC`,
      params,
    );

    const recentParams = [...params, filters.limit];
    const recentResult = await this.queryable.query<TelemetryRecentRow>(
      `SELECT
         status,
         timing_ms,
         user_type,
         user_id,
         created_at,
         metadata
       FROM ux_events
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${recentParams.length}`,
      recentParams,
    );

    const summaryRow = summaryResult.rows[0] ?? {
      avg_timing_ms: null,
      failed_count: 0,
      last_event_at: null,
      ok_count: 0,
      p95_timing_ms: null,
      total: 0,
    };
    const total = Math.max(0, Math.trunc(toNullableNumber(summaryRow.total) ?? 0));
    const okCount = Math.max(0, Math.trunc(toNullableNumber(summaryRow.ok_count) ?? 0));
    const failedCount = Math.max(0, Math.trunc(toNullableNumber(summaryRow.failed_count) ?? 0));
    const summary: ProviderLaneTelemetrySummary = {
      avgTimingMs: toNullableNumber(summaryRow.avg_timing_ms),
      failedCount,
      lastEventAt: toNullableIsoTimestamp(summaryRow.last_event_at),
      okCount,
      p95TimingMs: toNullableNumber(summaryRow.p95_timing_ms),
      successRate: toRate(okCount, total),
      total,
    };

    return {
      byLane: byLaneResult.rows.map((row) =>
        createProviderBreakdown('lane', row),
      ) as ProviderLaneTelemetryLaneBreakdown[],
      byOperation: byOperationResult.rows.map((row) =>
        createProviderBreakdown('operation', row),
      ) as ProviderLaneTelemetryOperationBreakdown[],
      byProvider: byProviderResult.rows.map((row) =>
        createProviderBreakdown('provider', row),
      ) as ProviderLaneTelemetryProviderBreakdown[],
      filters: {
        lane: filters.lane ?? null,
        limit: filters.limit,
        provider: filters.provider ?? null,
        status: filters.status ?? null,
      },
      recent: recentResult.rows.map((row) => {
        const metadata = isRecord(row.metadata) ? row.metadata : {};
        return {
          createdAt: toNullableIsoTimestamp(row.created_at),
          lane:
            typeof metadata.lane === 'string' && metadata.lane.length > 0
              ? metadata.lane
              : 'unknown',
          metadata,
          model:
            typeof metadata.model === 'string' && metadata.model.length > 0 ? metadata.model : null,
          operation:
            typeof metadata.operation === 'string' && metadata.operation.length > 0
              ? metadata.operation
              : 'unknown',
          provider:
            typeof metadata.provider === 'string' && metadata.provider.length > 0
              ? metadata.provider
              : 'unknown',
          status: row.status,
          timingMs: toNullableNumber(row.timing_ms),
          userId: row.user_id,
          userType: row.user_type,
        };
      }),
      summary,
      windowHours: filters.hours,
    };
  }

  private buildExecutionMetadata(input: ProviderLaneExecutionRecordInput): Record<string, unknown> {
    const route = input.route;
    const metadata: Record<string, unknown> = {
      budgetCapUsd: route?.budgetCapUsd ?? null,
      cacheEligible: route?.cacheEligible ?? null,
      grounded: route?.grounded ?? null,
      lane: input.lane,
      model: input.model ?? null,
      operation: input.operation,
      provider: input.provider ?? 'unknown',
      requestedProviders: route?.requestedProviders ?? [],
      resolvedProviders: route?.resolvedProviders.map((provider) => provider.provider) ?? [],
      routeStage: route?.stage ?? null,
    };
    if (route) {
      metadata.disabledProviders = route.disabledProviders;
    }
    if (input.metadata && Object.keys(input.metadata).length > 0) {
      metadata.context = input.metadata;
    }
    return metadata;
  }

  private buildTelemetryWhereClause(filters: ProviderLaneTelemetryFilters): {
    clauses: string[];
    params: unknown[];
  } {
    const clauses = [
      `source = $1`,
      `event_type = $2`,
      `created_at >= NOW() - ($3 || ' hours')::interval`,
    ];
    const params: unknown[] = [
      PROVIDER_LANE_TELEMETRY_SOURCE,
      PROVIDER_LANE_EXECUTION_EVENT_TYPE,
      filters.hours,
    ];

    if (filters.lane) {
      params.push(filters.lane);
      clauses.push(`LOWER(COALESCE(metadata->>'lane', '')) = $${params.length}`);
    }
    if (filters.provider) {
      params.push(filters.provider);
      clauses.push(`LOWER(COALESCE(metadata->>'provider', '')) = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }

    return { clauses, params };
  }
}

export const providerRoutingService = new ProviderRoutingServiceImpl();

export const isProviderLaneIdentifier = isProviderLane;
export const isProviderLaneExecutionStatusValue = isProviderLaneExecutionStatus;
