import {
  GATEWAY_CHANNEL_QUERY_PATTERN,
  GATEWAY_PROVIDER_QUERY_PATTERN,
  GATEWAY_SESSION_STATUS_QUERY_PATTERN,
  GATEWAY_SESSION_STATUS_VALUES,
  parseOptionalFilteredQueryString,
} from './gateway-query-state';

const DEFAULT_API_BASE = 'http://localhost:4000/api';
const TRAILING_SLASH_REGEX = /\/$/;
const MISSING_ADMIN_TOKEN_ERROR =
  'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.';

const toNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toStringValue = (value: unknown, fallback = 'n/a'): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

export interface ObserverEngagementResponse {
  windowHours: number;
  kpis?: {
    observerSessionTimeSec?: number | null;
    sessionCount?: number | null;
    followRate?: number | null;
    digestOpenRate?: number | null;
    return24h?: number | null;
    return7d?: number | null;
    viewModeObserverRate?: number | null;
    viewModeFocusRate?: number | null;
    densityComfortRate?: number | null;
    densityCompactRate?: number | null;
    hintDismissRate?: number | null;
    predictionParticipationRate?: number | null;
    predictionAccuracyRate?: number | null;
    predictionSettlementRate?: number | null;
    predictionFilterSwitchShare?: number | null;
    predictionSortSwitchShare?: number | null;
    predictionNonDefaultSortRate?: number | null;
    predictionPoolPoints?: number | null;
    payoutToStakeRatio?: number | null;
    multimodalCoverageRate?: number | null;
    multimodalErrorRate?: number | null;
    releaseHealthAlertCount?: number | null;
    releaseHealthFirstAppearanceCount?: number | null;
    releaseHealthAlertedRunCount?: number | null;
  };
  releaseHealthAlerts?: {
    totalAlerts?: number;
    uniqueRuns?: number;
    firstAppearanceCount?: number;
    byChannel?: Array<{
      channel?: string;
      count?: number;
      rate?: number | null;
    }>;
    byFailureMode?: Array<{
      failureMode?: string;
      count?: number;
      rate?: number | null;
    }>;
    hourlyTrend?: Array<{
      hour?: string;
      alerts?: number;
      firstAppearances?: number;
    }>;
    latest?: {
      receivedAtUtc?: string | null;
      runId?: number | null;
      runNumber?: number | null;
      runUrl?: string | null;
    } | null;
  };
  predictionMarket?: {
    totals?: {
      predictions?: number;
      predictors?: number;
      markets?: number;
      stakePoints?: number;
      payoutPoints?: number;
      averageStakePoints?: number | null;
      resolvedPredictions?: number;
      correctPredictions?: number;
    };
    outcomes?: Array<{
      predictedOutcome?: string;
      predictions?: number;
      stakePoints?: number;
    }>;
    cohorts?: {
      byOutcome?: Array<{
        predictedOutcome?: string;
        predictions?: number;
        resolvedPredictions?: number;
        correctPredictions?: number;
        settlementRate?: number | null;
        accuracyRate?: number | null;
        netPoints?: number;
      }>;
      byStakeBand?: Array<{
        stakeBand?: string;
        predictions?: number;
        resolvedPredictions?: number;
        correctPredictions?: number;
        settlementRate?: number | null;
        accuracyRate?: number | null;
        netPoints?: number;
      }>;
    };
    hourlyTrend?: Array<{
      hour?: string;
      predictions?: number;
      predictors?: number;
      markets?: number;
      stakePoints?: number;
      payoutPoints?: number;
      avgStakePoints?: number | null;
      resolvedPredictions?: number;
      correctPredictions?: number;
      accuracyRate?: number | null;
      payoutToStakeRatio?: number | null;
    }>;
    resolutionWindows?: {
      d7?: {
        days?: number;
        predictors?: number;
        resolvedPredictions?: number;
        correctPredictions?: number;
        accuracyRate?: number | null;
        netPoints?: number;
        riskLevel?: string | null;
      };
      d30?: {
        days?: number;
        predictors?: number;
        resolvedPredictions?: number;
        correctPredictions?: number;
        accuracyRate?: number | null;
        netPoints?: number;
        riskLevel?: string | null;
      };
    };
    thresholds?: {
      resolutionWindows?: {
        accuracyRate?: {
          criticalBelow?: number;
          watchBelow?: number;
        };
        minResolvedPredictions?: number;
      };
      cohorts?: {
        settlementRate?: {
          criticalBelow?: number;
          watchBelow?: number;
        };
        accuracyRate?: {
          criticalBelow?: number;
          watchBelow?: number;
        };
        minResolvedPredictions?: number;
      };
    };
  };
  predictionFilterTelemetry?: {
    totalSwitches?: number;
    byScope?: Array<{
      scope?: string;
      count?: number;
      rate?: number | null;
    }>;
    byFilter?: Array<{
      filter?: string;
      count?: number;
      rate?: number | null;
    }>;
    byScopeAndFilter?: Array<{
      scope?: string;
      filter?: string;
      count?: number;
    }>;
  };
  predictionSortTelemetry?: {
    totalSwitches?: number;
    byScope?: Array<{
      scope?: string;
      count?: number;
      rate?: number | null;
    }>;
    bySort?: Array<{
      sort?: string;
      count?: number;
      rate?: number | null;
    }>;
    byScopeAndSort?: Array<{
      scope?: string;
      sort?: string;
      count?: number;
    }>;
  };
  predictionHistoryStateTelemetry?: {
    byScope?: Array<{
      scope?: string;
      activeFilter?: string | null;
      activeSort?: string | null;
      filterChangedAt?: string | null;
      sortChangedAt?: string | null;
      lastChangedAt?: string | null;
    }>;
  };
  multimodal?: {
    views?: number;
    emptyStates?: number;
    errors?: number;
    attempts?: number;
    totalEvents?: number;
    coverageRate?: number | null;
    errorRate?: number | null;
    providerBreakdown?: Array<{
      provider?: string;
      count?: number;
    }>;
    emptyReasonBreakdown?: Array<{
      reason?: string;
      count?: number;
    }>;
    errorReasonBreakdown?: Array<{
      reason?: string;
      count?: number;
    }>;
    guardrails?: {
      invalidQueryErrors?: number;
      invalidQueryRate?: number | null;
    };
    hourlyTrend?: Array<{
      hour?: string;
      views?: number;
      emptyStates?: number;
      errors?: number;
      attempts?: number;
      totalEvents?: number;
      coverageRate?: number | null;
      errorRate?: number | null;
    }>;
  };
  feedPreferences?: {
    viewMode?: {
      observer?: number;
      focus?: number;
      unknown?: number;
      total?: number;
      observerRate?: number | null;
      focusRate?: number | null;
      unknownRate?: number | null;
    };
    density?: {
      comfort?: number;
      compact?: number;
      unknown?: number;
      total?: number;
      comfortRate?: number | null;
      compactRate?: number | null;
      unknownRate?: number | null;
    };
    hint?: {
      dismissCount?: number;
      switchCount?: number;
      totalInteractions?: number;
      dismissRate?: number | null;
    };
  };
  segments?: Array<{
    mode?: string;
    draftStatus?: string;
    eventType?: string;
    count?: number;
  }>;
}

export interface SimilarSearchMetricsResponse {
  windowHours: number;
  styleFusion?: {
    total?: number;
    success?: number;
    errors?: number;
    successRate?: number | null;
    avgSampleCount?: number | null;
    errorBreakdown?: Array<{
      errorCode?: string;
      count?: number;
    }>;
  };
  styleFusionCopy?: {
    total?: number;
    success?: number;
    errors?: number;
    successRate?: number | null;
    errorBreakdown?: Array<{
      errorCode?: string;
      count?: number;
    }>;
  };
}

export interface AgentGatewaySessionListItem {
  id?: unknown;
  channel?: unknown;
  draftId?: unknown;
  draft_id?: unknown;
  status?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
}

interface AgentGatewaySessionListResponse {
  source?: unknown;
  filters?: {
    channel?: unknown;
    provider?: unknown;
    status?: unknown;
  };
  sessions?: AgentGatewaySessionListItem[];
}

export interface AgentGatewayTelemetryResponse {
  windowHours?: unknown;
  sampleLimit?: unknown;
  generatedAt?: unknown;
  filters?: {
    channel?: unknown;
    provider?: unknown;
  };
  sessions?: {
    total?: unknown;
    active?: unknown;
    closed?: unknown;
    attention?: unknown;
    compacted?: unknown;
    autoCompacted?: unknown;
    attentionRate?: unknown;
    compactionRate?: unknown;
    autoCompactedRate?: unknown;
  };
  events?: {
    total?: unknown;
    draftCycleStepEvents?: unknown;
    failedStepEvents?: unknown;
    compactionEvents?: unknown;
    autoCompactionEvents?: unknown;
    manualCompactionEvents?: unknown;
    autoCompactionShare?: unknown;
    autoCompactionRiskLevel?: unknown;
    prunedEventCount?: unknown;
    compactionHourlyTrend?: unknown;
    failedStepRate?: unknown;
  };
  attempts?: {
    total?: unknown;
    success?: unknown;
    failed?: unknown;
    skippedCooldown?: unknown;
    successRate?: unknown;
    failureRate?: unknown;
    skippedRate?: unknown;
  };
  health?: {
    level?: unknown;
    failedStepLevel?: unknown;
    runtimeSuccessLevel?: unknown;
    cooldownSkipLevel?: unknown;
    autoCompactionLevel?: unknown;
  };
  thresholds?: {
    autoCompactionShare?: unknown;
    failedStepRate?: unknown;
    runtimeSuccessRate?: unknown;
    cooldownSkipRate?: unknown;
  };
  providerUsage?: Array<{
    provider?: unknown;
    count?: unknown;
  }>;
  channelUsage?: Array<{
    channel?: unknown;
    count?: unknown;
  }>;
}

interface AgentGatewayCompactResponse {
  source?: unknown;
  result?: {
    session?: {
      id?: unknown;
      draftId?: unknown;
      status?: unknown;
    };
    keepRecent?: unknown;
    prunedCount?: unknown;
    totalBefore?: unknown;
    totalAfter?: unknown;
  };
}

interface AgentGatewayCloseResponse {
  source?: unknown;
  session?: {
    id?: unknown;
    draftId?: unknown;
    status?: unknown;
  };
}

interface AgentGatewaySummaryResponse {
  source?: unknown;
  summary?: {
    session?: {
      id?: unknown;
      channel?: unknown;
      draftId?: unknown;
      status?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
    };
    totals?: {
      eventCount?: unknown;
      failedStepCount?: unknown;
      cycleCompletedCount?: unknown;
      cycleFailedCount?: unknown;
      durationMs?: unknown;
    };
    providerUsage?: Record<string, unknown>;
    compaction?: {
      compactCount?: unknown;
      prunedCountTotal?: unknown;
      lastCompactedAt?: unknown;
    };
    lastEvent?: {
      type?: unknown;
      createdAt?: unknown;
    };
  };
}

interface AgentGatewayEventsResponse {
  source?: unknown;
  events?: Array<{
    id?: unknown;
    sessionId?: unknown;
    fromRole?: unknown;
    toRole?: unknown;
    type?: unknown;
    payload?: unknown;
    createdAt?: unknown;
  }>;
}

interface AgentGatewayStatusResponse {
  source?: unknown;
  status?: {
    sessionId?: unknown;
    status?: unknown;
    health?: unknown;
    needsAttention?: unknown;
    eventCount?: unknown;
    lastEventType?: unknown;
  };
}

export interface AgentGatewayOverview {
  source: string;
  session: {
    id: string;
    channel: string;
    draftId: string;
    status: string;
    updatedAt: string | null;
  };
  summary: {
    totals: {
      eventCount: number;
      failedStepCount: number;
      cycleCompletedCount: number;
      cycleFailedCount: number;
      durationMs: number | null;
    };
    providerUsage: Record<string, number>;
    compaction: {
      compactCount: number;
      prunedCountTotal: number;
      lastCompactedAt: string | null;
    };
    lastEventType: string | null;
  };
  status: {
    health: string;
    needsAttention: boolean;
  };
}

export interface AdminObservabilitySnapshotResponse {
  generatedAt?: unknown;
  windowHours?: unknown;
  filters?: {
    correlationId?: unknown;
    executionSessionId?: unknown;
    releaseRunId?: unknown;
    routeKey?: unknown;
    requestEventType?: unknown;
    requestSource?: unknown;
    runtimeEventType?: unknown;
    runtimeSource?: unknown;
    releaseEventType?: unknown;
    releaseSource?: unknown;
  };
  http?: {
    summary?: {
      total?: unknown;
      successCount?: unknown;
      failedCount?: unknown;
      avgTimingMs?: unknown;
      p95TimingMs?: unknown;
      errorRate?: unknown;
      correlatedCount?: unknown;
      releaseLinkedCount?: unknown;
      executionLinkedCount?: unknown;
      correlationCoverageRate?: unknown;
      lastObservedAt?: unknown;
    };
    routes?: Array<{
      routeKey?: unknown;
      method?: unknown;
      total?: unknown;
      successCount?: unknown;
      failedCount?: unknown;
      avgTimingMs?: unknown;
      p95TimingMs?: unknown;
      lastObservedAt?: unknown;
    }>;
    statusBreakdown?: Array<{
      httpStatusCode?: unknown;
      count?: unknown;
    }>;
    topFailures?: Array<{
      routeKey?: unknown;
      httpStatusCode?: unknown;
      count?: unknown;
      lastObservedAt?: unknown;
    }>;
  };
  runtime?: {
    summary?: {
      total?: unknown;
      successCount?: unknown;
      failedCount?: unknown;
      avgTimingMs?: unknown;
      p95TimingMs?: unknown;
      failureRate?: unknown;
      fallbackOnlyCount?: unknown;
      sandboxEnabledCount?: unknown;
      fallbackPathUsedCount?: unknown;
      fallbackPathUsedRate?: unknown;
      egressDenyCount?: unknown;
      limitsDenyCount?: unknown;
      correlatedCount?: unknown;
      correlationCoverageRate?: unknown;
      lastObservedAt?: unknown;
    };
    modeBreakdown?: Array<{
      mode?: unknown;
      status?: unknown;
      count?: unknown;
    }>;
  };
  release?: {
    summary?: {
      totalAlerts?: unknown;
      uniqueRuns?: unknown;
      firstAppearanceCount?: unknown;
      lastAlertAt?: unknown;
    };
    latest?: {
      receivedAtUtc?: unknown;
      runId?: unknown;
      runNumber?: unknown;
      runUrl?: unknown;
    } | null;
  };
  health?: {
    level?: unknown;
    httpErrorRateLevel?: unknown;
    httpLatencyLevel?: unknown;
    runtimeFailureLevel?: unknown;
    releaseAlertLevel?: unknown;
  };
}

export interface AgentGatewayRecentEvent {
  id: string;
  fromRole: string;
  toRole: string;
  type: string;
  createdAt: string;
}

const normalizeGatewaySessionFilters = (
  value: unknown,
): {
  channel: string | null;
  provider: string | null;
  status: string | null;
} => {
  const row = value && typeof value === 'object' ? value : {};
  const status = parseOptionalFilteredQueryString(
    (row as Record<string, unknown>).status,
    {
      maxLength: 16,
      pattern: GATEWAY_SESSION_STATUS_QUERY_PATTERN,
    },
  );
  return {
    channel: parseOptionalFilteredQueryString(
      (row as Record<string, unknown>).channel,
      {
        maxLength: 64,
        pattern: GATEWAY_CHANNEL_QUERY_PATTERN,
      },
    ),
    provider: parseOptionalFilteredQueryString(
      (row as Record<string, unknown>).provider,
      {
        maxLength: 64,
        pattern: GATEWAY_PROVIDER_QUERY_PATTERN,
      },
    ),
    status: status && GATEWAY_SESSION_STATUS_VALUES.has(status) ? status : null,
  };
};

export const resolveAdminApiBaseUrl = (): string =>
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE).replace(
    TRAILING_SLASH_REGEX,
    '',
  );

export const resolveAdminToken = (): string =>
  process.env.ADMIN_API_TOKEN ??
  process.env.NEXT_ADMIN_API_TOKEN ??
  process.env.FINISHIT_ADMIN_API_TOKEN ??
  '';

export const fetchObserverEngagement = async (
  hours: number,
): Promise<{
  data: ObserverEngagementResponse | null;
  error: string | null;
}> => {
  const token = resolveAdminToken();
  if (!token) {
    return {
      data: null,
      error: MISSING_ADMIN_TOKEN_ERROR,
    };
  }

  const endpoint = `${resolveAdminApiBaseUrl()}/admin/ux/observer-engagement?hours=${hours}`;

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        'x-admin-token': token,
      },
    });

    if (!response.ok) {
      return {
        data: null,
        error: `Admin API responded with ${response.status}. Check token and api availability.`,
      };
    }

    const payload = (await response.json()) as ObserverEngagementResponse;
    return { data: payload, error: null };
  } catch {
    return {
      data: null,
      error:
        'Unable to reach admin API. Verify NEXT_PUBLIC_API_BASE_URL and api service status.',
    };
  }
};

export const fetchSimilarSearchMetrics = async (
  hours: number,
): Promise<{
  data: SimilarSearchMetricsResponse | null;
}> => {
  const token = resolveAdminToken();
  if (!token) {
    return {
      data: null,
    };
  }

  const endpoint = `${resolveAdminApiBaseUrl()}/admin/ux/similar-search?hours=${hours}`;

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        'x-admin-token': token,
      },
    });

    if (!response.ok) {
      return {
        data: null,
      };
    }

    const payload = (await response.json()) as SimilarSearchMetricsResponse;
    return { data: payload };
  } catch {
    return {
      data: null,
    };
  }
};

export const fetchAgentGatewaySessions = async (
  limit: number,
  {
    source,
    channel,
    provider,
    status,
  }: {
    source: string | null;
    channel: string | null;
    provider: string | null;
    status: string | null;
  },
): Promise<{
  data: AgentGatewaySessionListItem[];
  error: string | null;
  filters: {
    channel: string | null;
    provider: string | null;
    status: string | null;
  };
  source: string;
}> => {
  const token = resolveAdminToken();
  if (!token) {
    return {
      data: [],
      error: MISSING_ADMIN_TOKEN_ERROR,
      filters: {
        channel: null,
        provider: null,
        status: null,
      },
      source: 'db',
    };
  }

  const base = resolveAdminApiBaseUrl();
  const requestInit = {
    cache: 'no-store' as const,
    headers: {
      'x-admin-token': token,
    },
  };

  try {
    const queryParams = new URLSearchParams({
      limit: `${Math.max(1, Math.floor(limit))}`,
    });
    if (source) {
      queryParams.set('source', source);
    }
    if (channel) {
      queryParams.set('channel', channel);
    }
    if (provider) {
      queryParams.set('provider', provider);
    }
    if (status) {
      queryParams.set('status', status);
    }
    const sessionsResponse = await fetch(
      `${base}/admin/agent-gateway/sessions?${queryParams.toString()}`,
      requestInit,
    );
    if (!sessionsResponse.ok) {
      return {
        data: [],
        error: `Agent gateway sessions request failed with ${sessionsResponse.status}.`,
        filters: {
          channel: null,
          provider: null,
          status: null,
        },
        source: 'db',
      };
    }
    const sessionsPayload =
      (await sessionsResponse.json()) as AgentGatewaySessionListResponse;
    const sessions = Array.isArray(sessionsPayload.sessions)
      ? sessionsPayload.sessions
      : [];
    return {
      data: sessions,
      error: null,
      filters: normalizeGatewaySessionFilters(sessionsPayload.filters),
      source: toStringValue(sessionsPayload.source, 'db'),
    };
  } catch {
    return {
      data: [],
      error: 'Unable to load agent gateway sessions from admin API.',
      filters: {
        channel: null,
        provider: null,
        status: null,
      },
      source: 'db',
    };
  }
};

export const fetchAgentGatewayTelemetry = async (
  hours: number,
  {
    channel,
    provider,
  }: {
    channel: string | null;
    provider: string | null;
  },
): Promise<{
  data: AgentGatewayTelemetryResponse | null;
  error: string | null;
}> => {
  const token = resolveAdminToken();
  if (!token) {
    return {
      data: null,
      error: MISSING_ADMIN_TOKEN_ERROR,
    };
  }

  try {
    const queryParams = new URLSearchParams({
      hours: `${Math.max(1, Math.floor(hours))}`,
      limit: '200',
    });
    if (channel) {
      queryParams.set('channel', channel);
    }
    if (provider) {
      queryParams.set('provider', provider);
    }
    const response = await fetch(
      `${resolveAdminApiBaseUrl()}/admin/agent-gateway/telemetry?${queryParams.toString()}`,
      {
        cache: 'no-store',
        headers: {
          'x-admin-token': token,
        },
      },
    );
    if (!response.ok) {
      return {
        data: null,
        error: `Agent gateway telemetry request failed with ${response.status}.`,
      };
    }
    const payload = (await response.json()) as AgentGatewayTelemetryResponse;
    return {
      data: payload,
      error: null,
    };
  } catch {
    return {
      data: null,
      error: 'Unable to load agent gateway telemetry from admin API.',
    };
  }
};

export const fetchAdminObservabilitySnapshot = async (
  hours: number,
  {
    correlationId,
    executionSessionId,
    releaseRunId,
    routeKey,
  }: {
    correlationId?: string | null;
    executionSessionId?: string | null;
    releaseRunId?: string | null;
    routeKey?: string | null;
  } = {},
): Promise<{
  data: AdminObservabilitySnapshotResponse | null;
  error: string | null;
}> => {
  const token = resolveAdminToken();
  if (!token) {
    return {
      data: null,
      error: MISSING_ADMIN_TOKEN_ERROR,
    };
  }

  try {
    const queryParams = new URLSearchParams({
      hours: `${Math.max(1, Math.floor(hours))}`,
    });
    if (routeKey) {
      queryParams.set('routeKey', routeKey);
    }
    if (correlationId) {
      queryParams.set('correlationId', correlationId);
    }
    if (releaseRunId) {
      queryParams.set('releaseRunId', releaseRunId);
    }
    if (executionSessionId) {
      queryParams.set('executionSessionId', executionSessionId);
    }
    const response = await fetch(
      `${resolveAdminApiBaseUrl()}/admin/observability/otel?${queryParams.toString()}`,
      {
        cache: 'no-store',
        headers: {
          'x-admin-token': token,
        },
      },
    );
    if (!response.ok) {
      return {
        data: null,
        error: null,
      };
    }
    const payload =
      (await response.json()) as AdminObservabilitySnapshotResponse;
    return {
      data: payload,
      error: null,
    };
  } catch {
    return {
      data: null,
      error: null,
    };
  }
};

export const compactAgentGatewaySession = async (
  sessionId: string,
  keepRecent?: number,
): Promise<{
  message: string | null;
  error: string | null;
}> => {
  const token = resolveAdminToken();
  if (!token) {
    return {
      message: null,
      error: MISSING_ADMIN_TOKEN_ERROR,
    };
  }

  const body: Record<string, number> = {};
  if (typeof keepRecent === 'number' && Number.isFinite(keepRecent)) {
    body.keepRecent = Math.max(1, Math.floor(keepRecent));
  }

  try {
    const response = await fetch(
      `${resolveAdminApiBaseUrl()}/admin/agent-gateway/sessions/${encodeURIComponent(sessionId)}/compact`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      return {
        message: null,
        error: `Agent gateway compaction failed with ${response.status}.`,
      };
    }
    const payload = (await response.json()) as AgentGatewayCompactResponse;
    const result = payload.result;
    if (!result) {
      return {
        message: 'Session compacted.',
        error: null,
      };
    }
    const pruned = toNumber(result.prunedCount);
    const before = toNumber(result.totalBefore);
    const after = toNumber(result.totalAfter);
    return {
      message: `Session compacted: pruned ${pruned} (events ${before} -> ${after}).`,
      error: null,
    };
  } catch {
    return {
      message: null,
      error: 'Unable to compact agent gateway session via admin API.',
    };
  }
};

export const closeAgentGatewaySession = async (
  sessionId: string,
): Promise<{
  message: string | null;
  error: string | null;
}> => {
  const token = resolveAdminToken();
  if (!token) {
    return {
      message: null,
      error: MISSING_ADMIN_TOKEN_ERROR,
    };
  }

  try {
    const response = await fetch(
      `${resolveAdminApiBaseUrl()}/admin/agent-gateway/sessions/${encodeURIComponent(sessionId)}/close`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'x-admin-token': token,
        },
      },
    );
    if (!response.ok) {
      return {
        message: null,
        error: `Agent gateway close request failed with ${response.status}.`,
      };
    }
    const payload = (await response.json()) as AgentGatewayCloseResponse;
    const status = toStringValue(payload.session?.status, 'closed');
    return {
      message: `Session closed (status: ${status}).`,
      error: null,
    };
  } catch {
    return {
      message: null,
      error: 'Unable to close agent gateway session via admin API.',
    };
  }
};

export const fetchAgentGatewayRecentEvents = async (
  sessionId: string,
  limit: number,
  {
    source,
    eventType,
    eventQuery,
    provider,
  }: {
    source: string | null;
    eventType: string | null;
    eventQuery: string | null;
    provider: string | null;
  },
): Promise<{
  data: AgentGatewayRecentEvent[] | null;
  error: string | null;
}> => {
  const token = resolveAdminToken();
  if (!token) {
    return {
      data: null,
      error: MISSING_ADMIN_TOKEN_ERROR,
    };
  }

  try {
    const params = new URLSearchParams({
      limit: `${Math.max(1, Math.floor(limit))}`,
    });
    if (eventType && eventType !== 'all') {
      params.set('eventType', eventType);
    }
    if (eventQuery) {
      params.set('eventQuery', eventQuery);
    }
    if (provider) {
      params.set('provider', provider);
    }
    if (source) {
      params.set('source', source);
    }
    const response = await fetch(
      `${resolveAdminApiBaseUrl()}/admin/agent-gateway/sessions/${encodeURIComponent(sessionId)}/events?${params.toString()}`,
      {
        cache: 'no-store',
        headers: {
          'x-admin-token': token,
        },
      },
    );
    if (!response.ok) {
      return {
        data: null,
        error: `Agent gateway events request failed with ${response.status}.`,
      };
    }

    const payload = (await response.json()) as AgentGatewayEventsResponse;
    const eventsRaw = Array.isArray(payload.events) ? payload.events : [];
    const events = eventsRaw
      .filter((item): item is NonNullable<(typeof eventsRaw)[number]> =>
        Boolean(item),
      )
      .map((item, index) => ({
        id: toStringValue(item.id, `event-${index + 1}`),
        fromRole: toStringValue(item.fromRole),
        toRole: toStringValue(item.toRole),
        type: toStringValue(item.type),
        createdAt: toStringValue(item.createdAt),
      }));

    return { data: events, error: null };
  } catch {
    return {
      data: null,
      error: 'Unable to load agent gateway events from admin API.',
    };
  }
};

export const fetchAgentGatewayOverview = async (
  sessionId: string,
  source: string | null,
): Promise<{
  data: AgentGatewayOverview | null;
  error: string | null;
}> => {
  const token = resolveAdminToken();
  if (!token) {
    return {
      data: null,
      error: MISSING_ADMIN_TOKEN_ERROR,
    };
  }

  const base = resolveAdminApiBaseUrl();
  const requestInit = {
    cache: 'no-store' as const,
    headers: {
      'x-admin-token': token,
    },
  };

  try {
    const encodedSessionId = encodeURIComponent(sessionId);
    const queryParams = new URLSearchParams();
    if (source) {
      queryParams.set('source', source);
    }
    const querySuffix =
      queryParams.size > 0 ? `?${queryParams.toString()}` : '';
    const summaryResponse = await fetch(
      `${base}/admin/agent-gateway/sessions/${encodedSessionId}/summary${querySuffix}`,
      requestInit,
    );
    if (!summaryResponse.ok) {
      return {
        data: null,
        error: `Agent gateway summary request failed with ${summaryResponse.status}.`,
      };
    }
    const summaryPayload =
      (await summaryResponse.json()) as AgentGatewaySummaryResponse;

    const statusResponse = await fetch(
      `${base}/admin/agent-gateway/sessions/${encodedSessionId}/status${querySuffix}`,
      requestInit,
    );
    if (!statusResponse.ok) {
      return {
        data: null,
        error: `Agent gateway status request failed with ${statusResponse.status}.`,
      };
    }
    const statusPayload =
      (await statusResponse.json()) as AgentGatewayStatusResponse;

    const providerUsageRaw = summaryPayload.summary?.providerUsage ?? {};
    const providerUsage: Record<string, number> = {};
    for (const [provider, value] of Object.entries(providerUsageRaw)) {
      providerUsage[provider] = toNumber(value, 0);
    }

    return {
      data: {
        source: toStringValue(
          statusPayload.source ?? summaryPayload.source,
          'db',
        ),
        session: {
          id: toStringValue(summaryPayload.summary?.session?.id),
          channel: toStringValue(summaryPayload.summary?.session?.channel),
          draftId: toStringValue(summaryPayload.summary?.session?.draftId),
          status: toStringValue(summaryPayload.summary?.session?.status),
          updatedAt:
            typeof summaryPayload.summary?.session?.updatedAt === 'string'
              ? summaryPayload.summary.session.updatedAt
              : null,
        },
        summary: {
          totals: {
            eventCount: toNumber(summaryPayload.summary?.totals?.eventCount),
            failedStepCount: toNumber(
              summaryPayload.summary?.totals?.failedStepCount,
            ),
            cycleCompletedCount: toNumber(
              summaryPayload.summary?.totals?.cycleCompletedCount,
            ),
            cycleFailedCount: toNumber(
              summaryPayload.summary?.totals?.cycleFailedCount,
            ),
            durationMs:
              typeof summaryPayload.summary?.totals?.durationMs === 'number'
                ? summaryPayload.summary.totals.durationMs
                : null,
          },
          providerUsage,
          compaction: {
            compactCount: toNumber(
              summaryPayload.summary?.compaction?.compactCount,
            ),
            prunedCountTotal: toNumber(
              summaryPayload.summary?.compaction?.prunedCountTotal,
            ),
            lastCompactedAt:
              typeof summaryPayload.summary?.compaction?.lastCompactedAt ===
              'string'
                ? summaryPayload.summary.compaction.lastCompactedAt
                : null,
          },
          lastEventType:
            typeof summaryPayload.summary?.lastEvent?.type === 'string'
              ? summaryPayload.summary.lastEvent.type
              : null,
        },
        status: {
          health: toStringValue(statusPayload.status?.health),
          needsAttention: statusPayload.status?.needsAttention === true,
        },
      },
      error: null,
    };
  } catch {
    return {
      data: null,
      error: 'Unable to load agent gateway overview from admin API.',
    };
  }
};
