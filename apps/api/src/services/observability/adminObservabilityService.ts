import { db } from '../../db/pool';
import {
  OTEL_HTTP_SERVER_REQUEST_EVENT_TYPE,
  OTEL_HTTP_SERVER_SOURCE,
} from '../../middleware/observability';
import {
  SANDBOX_EXECUTION_TELEMETRY_EVENT_TYPE,
  SANDBOX_EXECUTION_TELEMETRY_SOURCE,
} from '../sandboxExecution/sandboxExecutionService';

type ObservabilityHealthLevel = 'critical' | 'healthy' | 'unknown' | 'watch';

interface ObservabilityQueryable {
  query: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: TRow[] }>;
}

interface ObservabilityThresholdsAbove {
  criticalAbove: number;
  watchAbove: number;
}

export interface AdminObservabilitySnapshotFilters {
  correlationId: string | null;
  executionSessionId: string | null;
  hours: number;
  releaseRunId: string | null;
  routeKey: string | null;
}

const RELEASE_EXTERNAL_CHANNEL_ALERT_EVENT =
  'release_external_channel_failure_mode_alert';
const RELEASE_EXTERNAL_CHANNEL_ALERT_SOURCE = 'release_health_gate_webhook';

const HTTP_ERROR_RATE_THRESHOLDS = {
  criticalAbove: 0.2,
  watchAbove: 0.05,
} as const;
const HTTP_LATENCY_P95_THRESHOLDS = {
  criticalAbove: 1500,
  watchAbove: 800,
} as const;
const RUNTIME_FAILURE_RATE_THRESHOLDS = {
  criticalAbove: 0.25,
  watchAbove: 0.1,
} as const;
const RELEASE_ALERT_COUNT_THRESHOLDS = {
  criticalAbove: 3,
  watchAbove: 1,
} as const;

const toNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toNullableNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

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

const toRate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Number((numerator / denominator).toFixed(3)) : null;

const resolveAboveRiskLevel = (
  value: number | null,
  thresholds: ObservabilityThresholdsAbove,
): ObservabilityHealthLevel => {
  if (!(typeof value === 'number' && Number.isFinite(value))) {
    return 'unknown';
  }
  if (value >= thresholds.criticalAbove) {
    return 'critical';
  }
  if (value >= thresholds.watchAbove) {
    return 'watch';
  }
  return 'healthy';
};

const mergeRiskLevels = (
  levels: ObservabilityHealthLevel[],
): ObservabilityHealthLevel => {
  if (levels.includes('critical')) {
    return 'critical';
  }
  if (levels.includes('watch')) {
    return 'watch';
  }
  if (levels.includes('healthy')) {
    return 'healthy';
  }
  return 'unknown';
};

const buildRequestWhere = ({
  correlationId,
  executionSessionId,
  hours,
  releaseRunId,
  routeKey,
}: AdminObservabilitySnapshotFilters) => {
  const params: unknown[] = [
    hours,
    OTEL_HTTP_SERVER_REQUEST_EVENT_TYPE,
    OTEL_HTTP_SERVER_SOURCE,
  ];
  const clauses = [
    "created_at >= NOW() - ($1 || ' hours')::interval",
    'event_type = $2',
    'source = $3',
  ];

  if (routeKey) {
    params.push(routeKey);
    clauses.push(`metadata->>'routeKey' = $${params.length}`);
  }
  if (correlationId) {
    params.push(correlationId);
    clauses.push(`metadata->>'correlationId' = $${params.length}`);
  }
  if (releaseRunId) {
    params.push(releaseRunId);
    clauses.push(`metadata->>'releaseRunId' = $${params.length}`);
  }
  if (executionSessionId) {
    params.push(executionSessionId);
    clauses.push(`metadata->>'executionSessionId' = $${params.length}`);
  }

  return {
    params,
    whereClause: clauses.join(' AND '),
  };
};

const buildRuntimeWhere = ({
  correlationId,
  executionSessionId,
  hours,
  releaseRunId,
}: Omit<AdminObservabilitySnapshotFilters, 'routeKey'>) => {
  const params: unknown[] = [
    hours,
    SANDBOX_EXECUTION_TELEMETRY_EVENT_TYPE,
    SANDBOX_EXECUTION_TELEMETRY_SOURCE,
  ];
  const clauses = [
    "created_at >= NOW() - ($1 || ' hours')::interval",
    'event_type = $2',
    'source = $3',
  ];

  if (correlationId) {
    params.push(correlationId);
    clauses.push(`metadata->'audit'->>'correlationId' = $${params.length}`);
  }
  if (releaseRunId) {
    params.push(releaseRunId);
    clauses.push(`metadata->'audit'->>'releaseRunId' = $${params.length}`);
  }
  if (executionSessionId) {
    params.push(executionSessionId);
    clauses.push(`metadata->>'executionSessionId' = $${params.length}`);
  }

  return {
    params,
    whereClause: clauses.join(' AND '),
  };
};

const buildReleaseWhere = ({
  hours,
  releaseRunId,
}: Pick<AdminObservabilitySnapshotFilters, 'hours' | 'releaseRunId'>) => {
  const params: unknown[] = [
    hours,
    RELEASE_EXTERNAL_CHANNEL_ALERT_EVENT,
    RELEASE_EXTERNAL_CHANNEL_ALERT_SOURCE,
  ];
  const clauses = [
    "created_at >= NOW() - ($1 || ' hours')::interval",
    'event_type = $2',
    'source = $3',
  ];

  if (releaseRunId) {
    params.push(releaseRunId);
    clauses.push(`metadata->'run'->>'id' = $${params.length}`);
  }

  return {
    params,
    whereClause: clauses.join(' AND '),
  };
};

export class AdminObservabilityService {
  private readonly queryable: ObservabilityQueryable;

  constructor(queryable: ObservabilityQueryable = db) {
    this.queryable = queryable;
  }

  async getSnapshot(filters: AdminObservabilitySnapshotFilters) {
    const requestWhere = buildRequestWhere(filters);
    const runtimeWhere = buildRuntimeWhere(filters);
    const releaseWhere = buildReleaseWhere(filters);

    const [
      httpSummaryResult,
      httpRoutesResult,
      httpStatusBreakdownResult,
      httpTopFailuresResult,
      runtimeSummaryResult,
      runtimeModeBreakdownResult,
      releaseSummaryResult,
      releaseLatestResult,
    ] = await Promise.all([
      this.queryable.query<{
        avg_timing_ms: number | null;
        correlated_count: number;
        execution_linked_count: number;
        failed_count: number;
        last_observed_at: Date | string | null;
        p95_timing_ms: number | null;
        release_linked_count: number;
        success_count: number;
        total: number;
      }>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'ok')::int AS success_count,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
           AVG(timing_ms)::float AS avg_timing_ms,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY timing_ms)::float AS p95_timing_ms,
           MAX(created_at) AS last_observed_at,
           COUNT(*) FILTER (WHERE NULLIF(metadata->>'correlationId', '') IS NOT NULL)::int AS correlated_count,
           COUNT(*) FILTER (WHERE NULLIF(metadata->>'releaseRunId', '') IS NOT NULL)::int AS release_linked_count,
           COUNT(*) FILTER (WHERE NULLIF(metadata->>'executionSessionId', '') IS NOT NULL)::int AS execution_linked_count
         FROM ux_events
         WHERE ${requestWhere.whereClause}`,
        requestWhere.params,
      ),
      this.queryable.query<{
        avg_timing_ms: number | null;
        failed_count: number;
        last_observed_at: Date | string | null;
        method: string;
        p95_timing_ms: number | null;
        route_key: string;
        success_count: number;
        total: number;
      }>(
        `SELECT
           COALESCE(NULLIF(metadata->>'routeKey', ''), 'unknown') AS route_key,
           COALESCE(NULLIF(metadata->>'httpMethod', ''), 'unknown') AS method,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'ok')::int AS success_count,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
           AVG(timing_ms)::float AS avg_timing_ms,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY timing_ms)::float AS p95_timing_ms,
           MAX(created_at) AS last_observed_at
         FROM ux_events
         WHERE ${requestWhere.whereClause}
         GROUP BY route_key, method
         ORDER BY total DESC, route_key ASC
         LIMIT 12`,
        requestWhere.params,
      ),
      this.queryable.query<{
        count: number;
        http_status_code: string;
      }>(
        `SELECT
           COALESCE(NULLIF(metadata->>'httpStatusCode', ''), 'unknown') AS http_status_code,
           COUNT(*)::int AS count
         FROM ux_events
         WHERE ${requestWhere.whereClause}
         GROUP BY http_status_code
         ORDER BY count DESC, http_status_code ASC
         LIMIT 10`,
        requestWhere.params,
      ),
      this.queryable.query<{
        count: number;
        http_status_code: string;
        last_observed_at: Date | string | null;
        route_key: string;
      }>(
        `SELECT
           COALESCE(NULLIF(metadata->>'routeKey', ''), 'unknown') AS route_key,
           COALESCE(NULLIF(metadata->>'httpStatusCode', ''), 'unknown') AS http_status_code,
           COUNT(*)::int AS count,
           MAX(created_at) AS last_observed_at
         FROM ux_events
         WHERE ${requestWhere.whereClause}
           AND status = 'failed'
         GROUP BY route_key, http_status_code
         ORDER BY count DESC, route_key ASC
         LIMIT 10`,
        requestWhere.params,
      ),
      this.queryable.query<{
        avg_timing_ms: number | null;
        correlated_count: number;
        egress_deny_count: number;
        failed_count: number;
        fallback_only_count: number;
        fallback_path_used_count: number;
        last_observed_at: Date | string | null;
        limits_deny_count: number;
        p95_timing_ms: number | null;
        sandbox_enabled_count: number;
        success_count: number;
        total: number;
      }>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'ok')::int AS success_count,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
           AVG(timing_ms)::float AS avg_timing_ms,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY timing_ms)::float AS p95_timing_ms,
           COUNT(*) FILTER (WHERE COALESCE(metadata->>'mode', '') = 'fallback_only')::int AS fallback_only_count,
           COUNT(*) FILTER (WHERE COALESCE(metadata->>'mode', '') = 'sandbox_enabled')::int AS sandbox_enabled_count,
           COUNT(*) FILTER (WHERE COALESCE(metadata->>'fallbackPathUsed', 'false') = 'true')::int AS fallback_path_used_count,
           COUNT(*) FILTER (WHERE COALESCE(metadata->>'egressDecision', '') = 'deny')::int AS egress_deny_count,
           COUNT(*) FILTER (WHERE COALESCE(metadata->>'limitsDecision', '') = 'deny')::int AS limits_deny_count,
           COUNT(*) FILTER (WHERE NULLIF(metadata->'audit'->>'correlationId', '') IS NOT NULL)::int AS correlated_count,
           MAX(created_at) AS last_observed_at
         FROM ux_events
         WHERE ${runtimeWhere.whereClause}`,
        runtimeWhere.params,
      ),
      this.queryable.query<{
        count: number;
        mode: string;
        status: string;
      }>(
        `SELECT
           COALESCE(NULLIF(metadata->>'mode', ''), 'unknown') AS mode,
           COALESCE(NULLIF(status, ''), 'unknown') AS status,
           COUNT(*)::int AS count
         FROM ux_events
         WHERE ${runtimeWhere.whereClause}
         GROUP BY mode, status
         ORDER BY count DESC, mode ASC, status ASC
         LIMIT 12`,
        runtimeWhere.params,
      ),
      this.queryable.query<{
        first_appearance_count: number;
        last_alert_at: Date | string | null;
        total_alerts: number;
        unique_runs: number;
      }>(
        `SELECT
           COUNT(*)::int AS total_alerts,
           COUNT(DISTINCT NULLIF(metadata->'run'->>'id', ''))::int AS unique_runs,
           COALESCE(
             SUM(
               CASE
                 WHEN jsonb_typeof(metadata->'firstAppearances') = 'array'
                   THEN jsonb_array_length(metadata->'firstAppearances')
                 ELSE 0
               END
             )::int,
             0
           ) AS first_appearance_count,
           MAX(created_at) AS last_alert_at
         FROM ux_events
         WHERE ${releaseWhere.whereClause}`,
        releaseWhere.params,
      ),
      this.queryable.query<{
        received_at_utc: string | null;
        run_id: string | null;
        run_number: string | null;
        run_url: string | null;
      }>(
        `SELECT
           NULLIF(metadata->>'receivedAtUtc', '') AS received_at_utc,
           NULLIF(metadata->'run'->>'id', '') AS run_id,
           NULLIF(metadata->'run'->>'number', '') AS run_number,
           NULLIF(metadata->'run'->>'htmlUrl', '') AS run_url
         FROM ux_events
         WHERE ${releaseWhere.whereClause}
         ORDER BY created_at DESC
         LIMIT 1`,
        releaseWhere.params,
      ),
    ]);

    const httpSummaryRow = httpSummaryResult.rows[0];
    const runtimeSummaryRow = runtimeSummaryResult.rows[0];
    const releaseSummaryRow = releaseSummaryResult.rows[0];
    const releaseLatestRow = releaseLatestResult.rows[0];

    const httpSummary = {
      total: toNumber(httpSummaryRow?.total),
      successCount: toNumber(httpSummaryRow?.success_count),
      failedCount: toNumber(httpSummaryRow?.failed_count),
      avgTimingMs: toNullableNumber(httpSummaryRow?.avg_timing_ms),
      p95TimingMs: toNullableNumber(httpSummaryRow?.p95_timing_ms),
      errorRate: toRate(
        toNumber(httpSummaryRow?.failed_count),
        toNumber(httpSummaryRow?.total),
      ),
      lastObservedAt: toNullableIsoTimestamp(httpSummaryRow?.last_observed_at),
      correlatedCount: toNumber(httpSummaryRow?.correlated_count),
      releaseLinkedCount: toNumber(httpSummaryRow?.release_linked_count),
      executionLinkedCount: toNumber(httpSummaryRow?.execution_linked_count),
      correlationCoverageRate: toRate(
        toNumber(httpSummaryRow?.correlated_count),
        toNumber(httpSummaryRow?.total),
      ),
    };

    const runtimeSummary = {
      total: toNumber(runtimeSummaryRow?.total),
      successCount: toNumber(runtimeSummaryRow?.success_count),
      failedCount: toNumber(runtimeSummaryRow?.failed_count),
      avgTimingMs: toNullableNumber(runtimeSummaryRow?.avg_timing_ms),
      p95TimingMs: toNullableNumber(runtimeSummaryRow?.p95_timing_ms),
      failureRate: toRate(
        toNumber(runtimeSummaryRow?.failed_count),
        toNumber(runtimeSummaryRow?.total),
      ),
      fallbackOnlyCount: toNumber(runtimeSummaryRow?.fallback_only_count),
      sandboxEnabledCount: toNumber(runtimeSummaryRow?.sandbox_enabled_count),
      fallbackPathUsedCount: toNumber(
        runtimeSummaryRow?.fallback_path_used_count,
      ),
      fallbackPathUsedRate: toRate(
        toNumber(runtimeSummaryRow?.fallback_path_used_count),
        toNumber(runtimeSummaryRow?.total),
      ),
      egressDenyCount: toNumber(runtimeSummaryRow?.egress_deny_count),
      limitsDenyCount: toNumber(runtimeSummaryRow?.limits_deny_count),
      correlatedCount: toNumber(runtimeSummaryRow?.correlated_count),
      correlationCoverageRate: toRate(
        toNumber(runtimeSummaryRow?.correlated_count),
        toNumber(runtimeSummaryRow?.total),
      ),
      lastObservedAt: toNullableIsoTimestamp(
        runtimeSummaryRow?.last_observed_at,
      ),
    };

    const releaseSummary = {
      totalAlerts: toNumber(releaseSummaryRow?.total_alerts),
      uniqueRuns: toNumber(releaseSummaryRow?.unique_runs),
      firstAppearanceCount: toNumber(releaseSummaryRow?.first_appearance_count),
      lastAlertAt: toNullableIsoTimestamp(releaseSummaryRow?.last_alert_at),
    };

    const httpErrorRateLevel = resolveAboveRiskLevel(
      httpSummary.errorRate,
      HTTP_ERROR_RATE_THRESHOLDS,
    );
    const httpLatencyLevel = resolveAboveRiskLevel(
      httpSummary.p95TimingMs,
      HTTP_LATENCY_P95_THRESHOLDS,
    );
    const runtimeFailureLevel = resolveAboveRiskLevel(
      runtimeSummary.failureRate,
      RUNTIME_FAILURE_RATE_THRESHOLDS,
    );
    const releaseAlertLevel = resolveAboveRiskLevel(
      releaseSummary.totalAlerts,
      RELEASE_ALERT_COUNT_THRESHOLDS,
    );

    return {
      generatedAt: new Date().toISOString(),
      windowHours: filters.hours,
      filters: {
        correlationId: filters.correlationId,
        executionSessionId: filters.executionSessionId,
        releaseRunId: filters.releaseRunId,
        routeKey: filters.routeKey,
        requestEventType: OTEL_HTTP_SERVER_REQUEST_EVENT_TYPE,
        requestSource: OTEL_HTTP_SERVER_SOURCE,
        runtimeEventType: SANDBOX_EXECUTION_TELEMETRY_EVENT_TYPE,
        runtimeSource: SANDBOX_EXECUTION_TELEMETRY_SOURCE,
        releaseEventType: RELEASE_EXTERNAL_CHANNEL_ALERT_EVENT,
        releaseSource: RELEASE_EXTERNAL_CHANNEL_ALERT_SOURCE,
      },
      http: {
        summary: httpSummary,
        routes: httpRoutesResult.rows.map((row) => ({
          avgTimingMs: toNullableNumber(row.avg_timing_ms),
          failedCount: toNumber(row.failed_count),
          lastObservedAt: toNullableIsoTimestamp(row.last_observed_at),
          method: row.method,
          p95TimingMs: toNullableNumber(row.p95_timing_ms),
          routeKey: row.route_key,
          successCount: toNumber(row.success_count),
          total: toNumber(row.total),
        })),
        statusBreakdown: httpStatusBreakdownResult.rows.map((row) => ({
          count: toNumber(row.count),
          httpStatusCode: row.http_status_code,
        })),
        topFailures: httpTopFailuresResult.rows.map((row) => ({
          count: toNumber(row.count),
          httpStatusCode: row.http_status_code,
          lastObservedAt: toNullableIsoTimestamp(row.last_observed_at),
          routeKey: row.route_key,
        })),
      },
      runtime: {
        summary: runtimeSummary,
        modeBreakdown: runtimeModeBreakdownResult.rows.map((row) => ({
          count: toNumber(row.count),
          mode: row.mode,
          status: row.status,
        })),
      },
      release: {
        summary: releaseSummary,
        latest: releaseLatestRow?.run_id
          ? {
              receivedAtUtc: toNullableIsoTimestamp(
                releaseLatestRow.received_at_utc,
              ),
              runId: releaseLatestRow.run_id,
              runNumber: releaseLatestRow.run_number,
              runUrl: releaseLatestRow.run_url,
            }
          : null,
      },
      health: {
        level: mergeRiskLevels([
          httpErrorRateLevel,
          httpLatencyLevel,
          runtimeFailureLevel,
          releaseAlertLevel,
        ]),
        httpErrorRateLevel,
        httpLatencyLevel,
        releaseAlertLevel,
        runtimeFailureLevel,
      },
    };
  }
}

export const adminObservabilityService = new AdminObservabilityService();
