import type { NextFunction, Request, Response } from 'express';
import {
  createObservabilityMiddleware,
  OTEL_HTTP_SERVER_REQUEST_EVENT_TYPE,
  OTEL_HTTP_SERVER_SOURCE,
} from '../middleware/observability';

describe('observability middleware', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('records monitored request telemetry with correlation metadata', () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const middleware = createObservabilityMiddleware({ query });
    const finishHandlers: Array<() => void> = [];
    const req = {
      body: {
        correlationId: 'rel.production-launch-gate.20260306.corr',
        releaseRunId: 'rel.production-launch-gate.20260306',
        auditSessionId: 'audit-session-1',
      },
      method: 'POST',
      path: '/api/admin/ai-runtime/dry-run',
      query: {},
    } as unknown as Request;
    const res = {
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'finish') {
          finishHandlers.push(handler);
        }
        return res;
      }),
      statusCode: 200,
    } as unknown as Response;
    const next = jest.fn() as NextFunction;
    jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(145);

    middleware(req, res, next);
    finishHandlers[0]?.();

    expect(next).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ux_events'),
      [
        OTEL_HTTP_SERVER_REQUEST_EVENT_TYPE,
        'admin',
        'ok',
        45,
        OTEL_HTTP_SERVER_SOURCE,
        expect.stringContaining('"routeKey":"admin.ai_runtime.dry_run"'),
      ],
    );
    const metadata = JSON.parse(query.mock.calls[0][1][5] as string) as Record<
      string,
      unknown
    >;
    expect(metadata).toMatchObject({
      auditSessionId: 'audit-session-1',
      correlationId: 'rel.production-launch-gate.20260306.corr',
      httpMethod: 'POST',
      httpStatusClass: '2xx',
      httpStatusCode: 200,
      releaseRunId: 'rel.production-launch-gate.20260306',
      routeKey: 'admin.ai_runtime.dry_run',
      routePath: '/api/admin/ai-runtime/dry-run',
    });
  });

  test('skips untracked routes', () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const middleware = createObservabilityMiddleware({ query });
    const req = {
      body: {},
      method: 'GET',
      path: '/api/feeds',
      query: {},
    } as unknown as Request;
    const res = {
      on: jest.fn(),
      statusCode: 200,
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    expect(res.on).not.toHaveBeenCalled();
  });
});
