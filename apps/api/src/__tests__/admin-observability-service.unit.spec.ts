import {
  AdminObservabilityService,
  type AdminObservabilitySnapshotFilters,
} from '../services/observability/adminObservabilityService';

describe('admin observability service', () => {
  test('builds observability snapshot with derived rates and health levels', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            avg_timing_ms: 195,
            correlated_count: 3,
            execution_linked_count: 2,
            failed_count: 1,
            last_observed_at: '2026-03-06T06:00:00.000Z',
            p95_timing_ms: 420,
            release_linked_count: 3,
            success_count: 3,
            total: 4,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            avg_timing_ms: 210,
            failed_count: 1,
            last_observed_at: '2026-03-06T06:00:00.000Z',
            method: 'GET',
            p95_timing_ms: 420,
            route_key: 'admin.ai_runtime.health',
            success_count: 3,
            total: 4,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            count: 3,
            http_status_code: '200',
          },
          {
            count: 1,
            http_status_code: '503',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            count: 1,
            http_status_code: '503',
            last_observed_at: '2026-03-06T06:00:00.000Z',
            route_key: 'ready',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            avg_timing_ms: 150,
            correlated_count: 2,
            egress_deny_count: 1,
            failed_count: 1,
            fallback_only_count: 2,
            fallback_path_used_count: 2,
            last_observed_at: '2026-03-06T06:01:00.000Z',
            limits_deny_count: 1,
            p95_timing_ms: 280,
            sandbox_enabled_count: 0,
            success_count: 1,
            total: 2,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            count: 2,
            mode: 'fallback_only',
            status: 'ok',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            first_appearance_count: 2,
            last_alert_at: '2026-03-06T06:02:00.000Z',
            total_alerts: 1,
            unique_runs: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            received_at_utc: '2026-03-06T06:02:00.000Z',
            run_id: '22548544748',
            run_number: '52',
            run_url:
              'https://github.com/Web-pixel-creator/SocialProject/actions/runs/22548544748',
          },
        ],
      });
    const service = new AdminObservabilityService({ query });
    const filters: AdminObservabilitySnapshotFilters = {
      correlationId: null,
      executionSessionId: null,
      hours: 24,
      releaseRunId: null,
      routeKey: null,
    };

    const snapshot = await service.getSnapshot(filters);

    expect(query).toHaveBeenCalledTimes(8);
    expect(snapshot.windowHours).toBe(24);
    expect(snapshot.http.summary).toMatchObject({
      total: 4,
      successCount: 3,
      failedCount: 1,
      errorRate: 0.25,
      correlationCoverageRate: 0.75,
    });
    expect(snapshot.runtime.summary).toMatchObject({
      total: 2,
      failureRate: 0.5,
      fallbackPathUsedRate: 1,
      egressDenyCount: 1,
      limitsDenyCount: 1,
    });
    expect(snapshot.release.summary).toMatchObject({
      totalAlerts: 1,
      uniqueRuns: 1,
      firstAppearanceCount: 2,
    });
    expect(snapshot.release.latest).toMatchObject({
      runId: '22548544748',
      runNumber: '52',
    });
    expect(snapshot.health).toMatchObject({
      level: 'critical',
      httpErrorRateLevel: 'critical',
      releaseAlertLevel: 'watch',
      runtimeFailureLevel: 'critical',
    });
  });
});
