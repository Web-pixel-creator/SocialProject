import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/pool';
import { logger } from '../logging/logger';

export const OTEL_HTTP_SERVER_REQUEST_EVENT_TYPE = 'otel_http_server_request';
export const OTEL_HTTP_SERVER_SOURCE = 'otel_http_server';

type ObservabilityUserType = 'admin' | 'system';

interface ObservabilityRouteDefinition {
  method: 'GET' | 'POST';
  path: string;
  routeKey: string;
  userType: ObservabilityUserType;
}

interface ObservabilityQueryable {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
}

const OBSERVABILITY_ROUTE_DEFINITIONS: ObservabilityRouteDefinition[] = [
  {
    method: 'GET',
    path: '/health',
    routeKey: 'health',
    userType: 'system',
  },
  {
    method: 'GET',
    path: '/ready',
    routeKey: 'ready',
    userType: 'system',
  },
  {
    method: 'GET',
    path: '/api/admin/ai-runtime/health',
    routeKey: 'admin.ai_runtime.health',
    userType: 'admin',
  },
  {
    method: 'POST',
    path: '/api/admin/ai-runtime/dry-run',
    routeKey: 'admin.ai_runtime.dry_run',
    userType: 'admin',
  },
  {
    method: 'GET',
    path: '/api/admin/agent-gateway/telemetry',
    routeKey: 'admin.agent_gateway.telemetry',
    userType: 'admin',
  },
  {
    method: 'GET',
    path: '/api/admin/sandbox-execution/metrics',
    routeKey: 'admin.sandbox_execution.metrics',
    userType: 'admin',
  },
  {
    method: 'POST',
    path: '/api/admin/release-health/external-channel-alerts',
    routeKey: 'admin.release_health.external_channel_alerts',
    userType: 'admin',
  },
];

const normalizeValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }
  if (Array.isArray(value) && value.length === 1) {
    return normalizeValue(value[0]);
  }
  return null;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveObservedRoute = (
  req: Request,
): ObservabilityRouteDefinition | null => {
  const method = req.method.toUpperCase();
  const path = req.path;
  return (
    OBSERVABILITY_ROUTE_DEFINITIONS.find(
      (route) => route.method === method && route.path === path,
    ) ?? null
  );
};

const extractRequestCorrelationMetadata = (
  req: Request,
): {
  auditSessionId: string | null;
  correlationId: string | null;
  executionSessionId: string | null;
  releaseRunId: string | null;
  workflowRunId: number | null;
} => {
  const body =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : null;
  const query =
    req.query && typeof req.query === 'object' && !Array.isArray(req.query)
      ? (req.query as Record<string, unknown>)
      : null;
  const runBody =
    body?.run && typeof body.run === 'object' && !Array.isArray(body.run)
      ? (body.run as Record<string, unknown>)
      : null;

  return {
    auditSessionId:
      normalizeValue(body?.auditSessionId) ??
      normalizeValue(query?.auditSessionId),
    correlationId:
      normalizeValue(body?.correlationId) ??
      normalizeValue(query?.correlationId),
    executionSessionId:
      normalizeValue(body?.executionSessionId) ??
      normalizeValue(query?.executionSessionId),
    releaseRunId:
      normalizeValue(body?.releaseRunId) ?? normalizeValue(query?.releaseRunId),
    workflowRunId: normalizeNumber(runBody?.id),
  };
};

const toRequestStatus = (statusCode: number): 'failed' | 'ok' =>
  statusCode >= 400 ? 'failed' : 'ok';

const toStatusClass = (statusCode: number): string => {
  if (!Number.isInteger(statusCode) || statusCode < 100) {
    return 'unknown';
  }
  return `${Math.floor(statusCode / 100)}xx`;
};

const recordRequestTelemetry = async ({
  durationMs,
  queryable,
  req,
  res,
  route,
}: {
  durationMs: number;
  queryable: ObservabilityQueryable;
  req: Request;
  res: Response;
  route: ObservabilityRouteDefinition;
}) => {
  const correlation = extractRequestCorrelationMetadata(req);
  const metadata = {
    auditSessionId: correlation.auditSessionId,
    correlationId: correlation.correlationId,
    executionSessionId: correlation.executionSessionId,
    httpMethod: route.method,
    httpStatusClass: toStatusClass(res.statusCode),
    httpStatusCode: res.statusCode,
    releaseRunId: correlation.releaseRunId,
    routeKey: route.routeKey,
    routePath: route.path,
    workflowRunId: correlation.workflowRunId,
  };
  await queryable.query(
    `INSERT INTO ux_events (event_type, user_type, status, timing_ms, source, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      OTEL_HTTP_SERVER_REQUEST_EVENT_TYPE,
      route.userType,
      toRequestStatus(res.statusCode),
      durationMs,
      OTEL_HTTP_SERVER_SOURCE,
      JSON.stringify(metadata),
    ],
  );
};

export const createObservabilityMiddleware = (
  queryable: ObservabilityQueryable = db,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const route = resolveObservedRoute(req);
    if (!route) {
      next();
      return;
    }

    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Math.max(0, Date.now() - startedAt);
      recordRequestTelemetry({
        durationMs,
        queryable,
        req,
        res,
        route,
      }).catch((error: unknown) => {
        logger.warn(
          {
            error,
            routeKey: route.routeKey,
            statusCode: res.statusCode,
          },
          'request observability telemetry write failed',
        );
      });
    });

    next();
  };
};

export const observabilityMiddleware = createObservabilityMiddleware();
