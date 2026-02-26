/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import AdminUxObserverEngagementPage from '../app/admin/ux/page';

const originalFetch = global.fetch;
const originalAdminApiToken = process.env.ADMIN_API_TOKEN;
const originalNextAdminApiToken = process.env.NEXT_ADMIN_API_TOKEN;
const originalFinishitAdminApiToken = process.env.FINISHIT_ADMIN_API_TOKEN;
const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

describe('admin ux observer engagement page', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:4000/api';
    process.env.ADMIN_API_TOKEN = 'test-admin-token';
    Reflect.deleteProperty(process.env, 'NEXT_ADMIN_API_TOKEN');
    Reflect.deleteProperty(process.env, 'FINISHIT_ADMIN_API_TOKEN');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    if (originalAdminApiToken === undefined) {
      Reflect.deleteProperty(process.env, 'ADMIN_API_TOKEN');
    } else {
      process.env.ADMIN_API_TOKEN = originalAdminApiToken;
    }
    if (originalNextAdminApiToken === undefined) {
      Reflect.deleteProperty(process.env, 'NEXT_ADMIN_API_TOKEN');
    } else {
      process.env.NEXT_ADMIN_API_TOKEN = originalNextAdminApiToken;
    }
    if (originalFinishitAdminApiToken === undefined) {
      Reflect.deleteProperty(process.env, 'FINISHIT_ADMIN_API_TOKEN');
    } else {
      process.env.FINISHIT_ADMIN_API_TOKEN = originalFinishitAdminApiToken;
    }
    if (originalApiBaseUrl === undefined) {
      Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_API_BASE_URL');
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }
  });

  test('renders missing token state', async () => {
    Reflect.deleteProperty(process.env, 'ADMIN_API_TOKEN');
    Reflect.deleteProperty(process.env, 'NEXT_ADMIN_API_TOKEN');
    Reflect.deleteProperty(process.env, 'FINISHIT_ADMIN_API_TOKEN');

    render(await AdminUxObserverEngagementPage({}));

    expect(screen.getByText(/Missing admin token/i)).toBeInTheDocument();
  });

  test('renders feed preference kpis from admin API', async () => {
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/admin/ux/observer-engagement')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            windowHours: 24,
            kpis: {
              sessionCount: 12,
              observerSessionTimeSec: 38.2,
              followRate: 0.5,
              digestOpenRate: 0.4,
              return24h: 0.3,
              viewModeObserverRate: 0.333,
              viewModeFocusRate: 0.667,
              densityComfortRate: 0.25,
              densityCompactRate: 0.75,
              hintDismissRate: 0.5,
              predictionParticipationRate: 0.5,
              predictionAccuracyRate: 0.5,
              predictionSettlementRate: 0.5,
              predictionFilterSwitchShare: 0.571,
              predictionSortSwitchShare: 0.429,
              predictionNonDefaultSortRate: 0.667,
              predictionPoolPoints: 65,
              payoutToStakeRatio: 0.677,
              multimodalCoverageRate: 0.75,
              multimodalErrorRate: 0.2,
            },
            predictionMarket: {
              totals: {
                predictions: 2,
                predictors: 1,
                markets: 1,
                stakePoints: 65,
                payoutPoints: 44,
                averageStakePoints: 32.5,
                resolvedPredictions: 2,
                correctPredictions: 1,
              },
              outcomes: [
                { predictedOutcome: 'merge', predictions: 1, stakePoints: 40 },
                { predictedOutcome: 'reject', predictions: 1, stakePoints: 25 },
              ],
              resolutionWindows: {
                d7: {
                  days: 7,
                  predictors: 2,
                  resolvedPredictions: 2,
                  correctPredictions: 1,
                  accuracyRate: 0.5,
                  netPoints: 19,
                },
                d30: {
                  days: 30,
                  predictors: 3,
                  resolvedPredictions: 3,
                  correctPredictions: 2,
                  accuracyRate: 0.667,
                  netPoints: 31,
                },
              },
              hourlyTrend: [
                {
                  hour: '2026-02-22T10:00:00Z',
                  predictions: 1,
                  predictors: 1,
                  markets: 1,
                  stakePoints: 40,
                  payoutPoints: 44,
                  avgStakePoints: 40,
                  resolvedPredictions: 1,
                  correctPredictions: 1,
                  accuracyRate: 1,
                  payoutToStakeRatio: 1.1,
                },
                {
                  hour: '2026-02-22T11:00:00Z',
                  predictions: 1,
                  predictors: 1,
                  markets: 1,
                  stakePoints: 25,
                  payoutPoints: 0,
                  avgStakePoints: 25,
                  resolvedPredictions: 1,
                  correctPredictions: 0,
                  accuracyRate: 0,
                  payoutToStakeRatio: 0,
                },
              ],
            },
            predictionFilterTelemetry: {
              totalSwitches: 4,
              byScope: [
                { scope: 'self', count: 2, rate: 0.5 },
                { scope: 'public', count: 1, rate: 0.25 },
                { scope: 'unknown', count: 1, rate: 0.25 },
              ],
              byFilter: [
                { filter: 'all', count: 1, rate: 0.25 },
                { filter: 'resolved', count: 1, rate: 0.25 },
                { filter: 'pending', count: 1, rate: 0.25 },
                { filter: 'unknown', count: 1, rate: 0.25 },
              ],
              byScopeAndFilter: [
                { scope: 'self', filter: 'all', count: 1 },
                { scope: 'self', filter: 'resolved', count: 1 },
                { scope: 'public', filter: 'pending', count: 1 },
                { scope: 'unknown', filter: 'unknown', count: 1 },
              ],
            },
            predictionSortTelemetry: {
              totalSwitches: 3,
              byScope: [
                { scope: 'self', count: 1, rate: 0.333 },
                { scope: 'public', count: 1, rate: 0.333 },
                { scope: 'unknown', count: 1, rate: 0.333 },
              ],
              bySort: [
                { sort: 'recent', count: 1, rate: 0.333 },
                { sort: 'stake_desc', count: 1, rate: 0.333 },
                { sort: 'unknown', count: 1, rate: 0.333 },
              ],
              byScopeAndSort: [
                { scope: 'self', sort: 'recent', count: 1 },
                { scope: 'public', sort: 'stake_desc', count: 1 },
                { scope: 'unknown', sort: 'unknown', count: 1 },
              ],
            },
            multimodal: {
              views: 3,
              emptyStates: 1,
              errors: 1,
              attempts: 4,
              totalEvents: 5,
              coverageRate: 0.75,
              errorRate: 0.2,
              providerBreakdown: [{ provider: 'gemini-2', count: 3 }],
              emptyReasonBreakdown: [{ reason: 'not_available', count: 1 }],
              errorReasonBreakdown: [{ reason: 'network', count: 1 }],
              guardrails: {
                invalidQueryErrors: 2,
                invalidQueryRate: 0.667,
              },
              hourlyTrend: [
                {
                  hour: '2026-02-22T10:00:00Z',
                  views: 2,
                  emptyStates: 1,
                  errors: 0,
                  attempts: 3,
                  totalEvents: 3,
                  coverageRate: 0.667,
                  errorRate: 0,
                },
                {
                  hour: '2026-02-22T11:00:00Z',
                  views: 1,
                  emptyStates: 0,
                  errors: 1,
                  attempts: 1,
                  totalEvents: 2,
                  coverageRate: 1,
                  errorRate: 0.5,
                },
              ],
            },
            feedPreferences: {
              viewMode: { observer: 1, focus: 2, unknown: 0, total: 3 },
              density: { comfort: 1, compact: 3, unknown: 0, total: 4 },
              hint: { dismissCount: 1, switchCount: 1, totalInteractions: 2 },
            },
            segments: [
              {
                mode: 'hot_now',
                draftStatus: 'draft',
                eventType: 'draft_arc_view',
                count: 4,
              },
            ],
          }),
        } as Response);
      }
      if (url.includes('/admin/ux/similar-search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            windowHours: 24,
            styleFusion: {
              total: 3,
              success: 2,
              errors: 1,
              successRate: 0.667,
              avgSampleCount: 2.5,
              errorBreakdown: [
                {
                  errorCode: 'STYLE_FUSION_NOT_ENOUGH_MATCHES',
                  count: 1,
                },
              ],
            },
          }),
        } as Response);
      }
      if (url.includes('/admin/agent-gateway/sessions?limit=25')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            source: 'db',
            sessions: [
              {
                id: 'ags-summary-1',
                channel: 'draft_cycle',
                draftId: 'draft-1',
                status: 'active',
              },
            ],
          }),
        } as Response);
      }
      if (url.includes('/admin/agent-gateway/telemetry')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            windowHours: 24,
            sampleLimit: 200,
            sessions: {
              total: 2,
              active: 1,
              closed: 1,
              attention: 1,
              compacted: 1,
              autoCompacted: 1,
              attentionRate: 0.5,
              compactionRate: 0.5,
              autoCompactedRate: 0.5,
            },
            events: {
              total: 4,
              draftCycleStepEvents: 2,
              failedStepEvents: 1,
              compactionEvents: 1,
              autoCompactionEvents: 1,
              manualCompactionEvents: 0,
              autoCompactionShare: 1,
              autoCompactionRiskLevel: 'critical',
              prunedEventCount: 3,
              compactionHourlyTrend: [
                {
                  hour: '2026-02-22T12:00:00Z',
                  compactions: 1,
                  autoCompactions: 1,
                  manualCompactions: 0,
                  autoCompactionShare: 1,
                  autoCompactionRiskLevel: 'critical',
                  prunedEventCount: 3,
                },
              ],
              failedStepRate: 0.5,
            },
            attempts: {
              total: 3,
              success: 1,
              failed: 1,
              skippedCooldown: 1,
              successRate: 0.333,
              failureRate: 0.333,
              skippedRate: 0.333,
            },
            health: {
              level: 'critical',
              failedStepLevel: 'critical',
              runtimeSuccessLevel: 'critical',
              cooldownSkipLevel: 'watch',
              autoCompactionLevel: 'critical',
            },
            thresholds: {
              autoCompactionShare: {
                watchAbove: 0.45,
                criticalAbove: 0.75,
              },
              failedStepRate: {
                watchAbove: 0.3,
                criticalAbove: 0.6,
              },
              runtimeSuccessRate: {
                watchBelow: 0.8,
                criticalBelow: 0.55,
              },
              cooldownSkipRate: {
                watchAbove: 0.15,
                criticalAbove: 0.35,
              },
            },
            providerUsage: [{ provider: 'gpt-4.1', count: 2 }],
            channelUsage: [{ channel: 'draft_cycle', count: 2 }],
          }),
        } as Response);
      }
      if (url.includes('/admin/agent-gateway/sessions/ags-summary-1/summary')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            source: 'db',
            summary: {
              totals: {
                eventCount: 6,
                failedStepCount: 0,
                cycleCompletedCount: 1,
                cycleFailedCount: 0,
                durationMs: 1840,
              },
              providerUsage: {
                'gpt-4.1': 2,
              },
              compaction: {
                compactCount: 1,
                prunedCountTotal: 3,
              },
              lastEvent: {
                type: 'session_compacted',
              },
            },
          }),
        } as Response);
      }
      if (url.includes('/admin/agent-gateway/sessions/ags-summary-1/status')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            source: 'db',
            status: {
              sessionId: 'ags-summary-1',
              status: 'active',
              health: 'ok',
              needsAttention: false,
              eventCount: 6,
              lastEventType: 'session_compacted',
            },
          }),
        } as Response);
      }
      if (url.includes('/admin/agent-gateway/sessions/ags-summary-1/events')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            source: 'db',
            events: [
              {
                id: 'evt-summary-1',
                fromRole: 'critic',
                toRole: 'maker',
                type: 'draft_cycle_critic_completed',
                createdAt: '2026-02-20T10:00:00.000Z',
              },
            ],
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);
    });
    global.fetch = fetchMock as typeof fetch;

    render(
      await AdminUxObserverEngagementPage({
        searchParams: Promise.resolve({
          hours: '24',
          gatewayChannel: 'ws-control-plane',
          gatewayProvider: 'gpt-4.1',
          gatewayStatus: 'active',
        }),
      }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Feed preference KPIs/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Multimodal GlowUp telemetry/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Provider usage$/i)).toBeInTheDocument();
    expect(screen.getByText(/gemini-2/i)).toBeInTheDocument();
    expect(screen.getByText(/Empty-state reasons/i)).toBeInTheDocument();
    expect(screen.getByText(/not_available/i)).toBeInTheDocument();
    expect(screen.getByText(/Error reasons/i)).toBeInTheDocument();
    expect(screen.getByText(/network/i)).toBeInTheDocument();
    expect(screen.getByText(/Invalid query errors/i)).toBeInTheDocument();
    expect(screen.getByText(/Invalid query share/i)).toBeInTheDocument();
    expect(screen.getByText(/^Hourly trend \(UTC\)$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2026-02-22 10:00 UTC/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/2026-02-22 11:00 UTC/i).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText(/Prediction market telemetry/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Filter switches$/i)).toBeInTheDocument();
    expect(screen.getByText(/Filter scope mix/i)).toBeInTheDocument();
    expect(screen.getByText(/Filter value mix/i)).toBeInTheDocument();
    expect(screen.getByText(/Scope x filter matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/^Sort switches$/i)).toBeInTheDocument();
    expect(screen.getByText(/Sort scope mix/i)).toBeInTheDocument();
    expect(screen.getByText(/Sort value mix/i)).toBeInTheDocument();
    expect(screen.getByText(/Scope x sort matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/^Filter switch share$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Sort switch share/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Non-default sort share/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Prediction sort share/i)).toBeInTheDocument();
    expect(screen.getByText(/Settlement rate/i)).toBeInTheDocument();
    expect(
      screen.getByText(/^Prediction hourly trend \(UTC\)$/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Outcome mix/i)).toBeInTheDocument();
    expect(screen.getByText(/Participation snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/Resolved windows/i)).toBeInTheDocument();
    expect(screen.getByText(/7d risk:\s*n\/a/i)).toBeInTheDocument();
    expect(screen.getByText(/30d risk:\s*Healthy/i)).toBeInTheDocument();
    expect(screen.getByText(/7d:/i)).toBeInTheDocument();
    expect(screen.getByText(/30d:/i)).toBeInTheDocument();
    expect(screen.getByText(/Style fusion metrics/i)).toBeInTheDocument();
    expect(screen.getByText(/Fusion attempts/i)).toBeInTheDocument();
    expect(screen.getByText(/Fusion errors/i)).toBeInTheDocument();
    expect(screen.getByText(/Agent gateway live session/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Agent gateway control-plane telemetry/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Gateway compaction trend \(UTC\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/2026-02-22 12:00 UTC/i)).toBeInTheDocument();
    expect(screen.getByText(/Auto compacted sessions/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/Auto compaction share/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/Auto compaction risk:\s*Critical/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Failed-step risk:\s*Critical/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Runtime success:\s*Critical/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Cooldown skip risk:\s*Watch/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Telemetry health:\s*Critical/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Scope:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ws-control-plane/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/gpt-4\.1/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /Apply scope/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Runtime success rate/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/Provider usage \(sample\)/i)).toBeInTheDocument();
    expect(screen.getByText(/^Telemetry thresholds$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Watch >= 30\.0% \| Critical >= 60\.0%/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Session status/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Compactions$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/gpt-4.1 \(2\)/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Close session/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Events limit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Event type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Search events/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open draft/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Export JSON/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Export CSV/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Recent events/i)).toBeInTheDocument();
    expect(
      screen.getByRole('cell', { name: /draft_cycle_critic_completed/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Engagement health/i)).toBeInTheDocument();
    expect(screen.getByText('Watch')).toBeInTheDocument();

    expect(screen.getAllByText('33.3%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('66.7%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('75.0%').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/observer: 1 \| legacy focus: 2/i),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/ux/observer-engagement?hours=24',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'x-admin-token': 'test-admin-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/agent-gateway/sessions?limit=25&channel=ws-control-plane&provider=gpt-4.1&status=active',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'x-admin-token': 'test-admin-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/ux/similar-search?hours=24',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'x-admin-token': 'test-admin-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/agent-gateway/telemetry?hours=24&limit=200&channel=ws-control-plane&provider=gpt-4.1',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'x-admin-token': 'test-admin-token',
        }),
      }),
    );
  });

  test('compacts selected gateway session when compact query is provided', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation((url: string, _init?: RequestInit) => {
        if (url.includes('/admin/ux/observer-engagement')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              windowHours: 24,
              kpis: {},
              feedPreferences: {},
              segments: [],
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions?limit=25')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              sessions: [
                {
                  id: 'ags-compact-1',
                  channel: 'draft_cycle',
                  draftId: 'draft-compact',
                  status: 'active',
                },
              ],
            }),
          } as Response);
        }
        if (
          url.includes('/admin/agent-gateway/sessions/ags-compact-1/compact')
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              result: {
                session: { id: 'ags-compact-1', draftId: 'draft-compact' },
                keepRecent: 40,
                prunedCount: 8,
                totalBefore: 56,
                totalAfter: 48,
              },
            }),
          } as Response);
        }
        if (
          url.includes('/admin/agent-gateway/sessions/ags-compact-1/summary')
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              summary: {
                session: {
                  id: 'ags-compact-1',
                  channel: 'draft_cycle',
                  draftId: 'draft-compact',
                  status: 'active',
                  updatedAt: '2026-02-20T10:00:00.000Z',
                },
                totals: {
                  eventCount: 48,
                  failedStepCount: 0,
                  cycleCompletedCount: 1,
                  cycleFailedCount: 0,
                  durationMs: 1200,
                },
                providerUsage: {
                  'gpt-4.1': 3,
                },
                compaction: {
                  compactCount: 2,
                  prunedCountTotal: 12,
                },
                lastEvent: {
                  type: 'session_compacted',
                },
              },
            }),
          } as Response);
        }
        if (
          url.includes('/admin/agent-gateway/sessions/ags-compact-1/status')
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              status: {
                sessionId: 'ags-compact-1',
                status: 'active',
                health: 'ok',
                needsAttention: false,
              },
            }),
          } as Response);
        }
        if (
          url.includes('/admin/agent-gateway/sessions/ags-compact-1/events')
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              events: [
                {
                  id: 'evt-compact-1',
                  fromRole: 'system',
                  toRole: 'n/a',
                  type: 'session_compacted',
                  createdAt: '2026-02-20T10:00:00.000Z',
                },
              ],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({}),
        } as Response);
      });
    global.fetch = fetchMock as typeof fetch;

    render(
      await AdminUxObserverEngagementPage({
        searchParams: Promise.resolve({
          hours: '24',
          session: 'ags-compact-1',
          compact: '1',
          keepRecent: '40',
        }),
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Session compacted: pruned 8/i),
      ).toBeInTheDocument(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/agent-gateway/sessions/ags-compact-1/compact',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-admin-token': 'test-admin-token',
        }),
        body: JSON.stringify({ keepRecent: 40 }),
      }),
    );
  });

  test('closes selected gateway session when close query is provided', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation((url: string, _init?: RequestInit) => {
        if (url.includes('/admin/ux/observer-engagement')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              windowHours: 24,
              kpis: {},
              feedPreferences: {},
              segments: [],
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions?limit=25')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              sessions: [
                {
                  id: 'ags-close-1',
                  channel: 'draft_cycle',
                  draftId: 'draft-close',
                  status: 'active',
                },
              ],
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions/ags-close-1/close')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              session: {
                id: 'ags-close-1',
                draftId: 'draft-close',
                status: 'closed',
              },
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions/ags-close-1/summary')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              summary: {
                session: {
                  id: 'ags-close-1',
                  channel: 'draft_cycle',
                  draftId: 'draft-close',
                  status: 'closed',
                  updatedAt: '2026-02-20T10:00:00.000Z',
                },
                totals: {
                  eventCount: 4,
                  failedStepCount: 0,
                  cycleCompletedCount: 1,
                  cycleFailedCount: 0,
                  durationMs: 1100,
                },
                providerUsage: {},
                compaction: {
                  compactCount: 0,
                  prunedCountTotal: 0,
                },
                lastEvent: {
                  type: 'draft_cycle_completed',
                },
              },
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions/ags-close-1/status')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              status: {
                sessionId: 'ags-close-1',
                status: 'closed',
                health: 'ok',
                needsAttention: false,
              },
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions/ags-close-1/events')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              events: [
                {
                  id: 'evt-close-1',
                  fromRole: 'judge',
                  toRole: 'system',
                  type: 'draft_cycle_completed',
                  createdAt: '2026-02-20T10:00:00.000Z',
                },
              ],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({}),
        } as Response);
      });
    global.fetch = fetchMock as typeof fetch;

    render(
      await AdminUxObserverEngagementPage({
        searchParams: Promise.resolve({
          hours: '24',
          session: 'ags-close-1',
          close: '1',
        }),
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Session closed \(status: closed\)\./i),
      ).toBeInTheDocument(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/agent-gateway/sessions/ags-close-1/close',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({
          'x-admin-token': 'test-admin-token',
        }),
      }),
    );
  });

  test('disables compact and close actions for sessions already closed', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation((url: string, _init?: RequestInit) => {
        if (url.includes('/admin/ux/observer-engagement')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              windowHours: 24,
              kpis: {},
              feedPreferences: {},
              segments: [],
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions?limit=25')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              sessions: [
                {
                  id: 'ags-closed-1',
                  channel: 'draft_cycle',
                  draftId: 'draft-closed',
                  status: 'closed',
                },
              ],
            }),
          } as Response);
        }
        if (
          url.includes('/admin/agent-gateway/sessions/ags-closed-1/summary')
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              summary: {
                session: {
                  id: 'ags-closed-1',
                  channel: 'draft_cycle',
                  draftId: 'draft-closed',
                  status: 'closed',
                  updatedAt: '2026-02-20T10:00:00.000Z',
                },
                totals: {
                  eventCount: 3,
                  failedStepCount: 0,
                  cycleCompletedCount: 1,
                  cycleFailedCount: 0,
                  durationMs: 980,
                },
                providerUsage: {},
                compaction: {
                  compactCount: 0,
                  prunedCountTotal: 0,
                },
                lastEvent: {
                  type: 'draft_cycle_completed',
                },
              },
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions/ags-closed-1/status')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              status: {
                sessionId: 'ags-closed-1',
                status: 'closed',
                health: 'ok',
                needsAttention: false,
              },
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions/ags-closed-1/events')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              events: [
                {
                  id: 'evt-closed-1',
                  fromRole: 'judge',
                  toRole: 'system',
                  type: 'draft_cycle_completed',
                  createdAt: '2026-02-20T10:00:00.000Z',
                },
              ],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({}),
        } as Response);
      });
    global.fetch = fetchMock as typeof fetch;

    render(
      await AdminUxObserverEngagementPage({
        searchParams: Promise.resolve({
          hours: '24',
          session: 'ags-closed-1',
        }),
      }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Recent events/i)).toBeInTheDocument(),
    );

    expect(screen.getByRole('button', { name: /Compact now/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Close session/i }),
    ).toBeDisabled();
  });

  test('filters recent events by selected event type and query', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation((url: string, _init?: RequestInit) => {
        if (url.includes('/admin/ux/observer-engagement')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              windowHours: 24,
              kpis: {},
              feedPreferences: {},
              segments: [],
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions?limit=25')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              sessions: [
                {
                  id: 'ags-filter-1',
                  channel: 'draft_cycle',
                  draftId: 'draft-filter',
                  status: 'active',
                },
              ],
            }),
          } as Response);
        }
        if (
          url.includes('/admin/agent-gateway/sessions/ags-filter-1/summary')
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              summary: {
                session: {
                  id: 'ags-filter-1',
                  channel: 'draft_cycle',
                  draftId: 'draft-filter',
                  status: 'active',
                  updatedAt: '2026-02-20T10:00:00.000Z',
                },
                totals: {
                  eventCount: 3,
                  failedStepCount: 0,
                  cycleCompletedCount: 1,
                  cycleFailedCount: 0,
                  durationMs: 1240,
                },
                providerUsage: {},
                compaction: {
                  compactCount: 0,
                  prunedCountTotal: 0,
                },
                lastEvent: {
                  type: 'draft_cycle_maker_completed',
                },
              },
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions/ags-filter-1/status')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              status: {
                sessionId: 'ags-filter-1',
                status: 'active',
                health: 'ok',
                needsAttention: false,
              },
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions/ags-filter-1/events')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              events: [
                {
                  id: 'evt-filter-1',
                  fromRole: 'critic',
                  toRole: 'maker',
                  type: 'draft_cycle_critic_completed',
                  createdAt: '2026-02-20T10:00:00.000Z',
                },
                {
                  id: 'evt-filter-2',
                  fromRole: 'maker',
                  toRole: 'judge',
                  type: 'draft_cycle_maker_completed',
                  createdAt: '2026-02-20T10:01:00.000Z',
                },
              ],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({}),
        } as Response);
      });
    global.fetch = fetchMock as typeof fetch;

    render(
      await AdminUxObserverEngagementPage({
        searchParams: Promise.resolve({
          hours: '24',
          session: 'ags-filter-1',
          eventsLimit: '20',
          eventType: 'draft_cycle_critic_completed',
          eventQuery: 'critic',
        }),
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('cell', {
          name: /draft_cycle_critic_completed/i,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('cell', {
        name: /draft_cycle_maker_completed/i,
      }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/agent-gateway/sessions/ags-filter-1/events?limit=20&eventType=draft_cycle_critic_completed&eventQuery=critic&source=db',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'x-admin-token': 'test-admin-token',
        }),
      }),
    );
  });

  test('runs ai runtime dry-run and renders failover details', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation((url: string, _init?: RequestInit) => {
        if (url.includes('/admin/ux/observer-engagement')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              windowHours: 24,
              kpis: {},
              feedPreferences: {},
              segments: [],
            }),
          } as Response);
        }
        if (url.includes('/admin/agent-gateway/sessions?limit=25')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              source: 'db',
              sessions: [],
            }),
          } as Response);
        }
        if (url.includes('/admin/ai-runtime/health')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              generatedAt: '2026-02-21T10:00:00.000Z',
              roleStates: [
                {
                  role: 'critic',
                  providers: ['claude-4', 'gpt-4.1', 'gemini-2'],
                  availableProviders: ['gpt-4.1', 'gemini-2'],
                  blockedProviders: ['claude-4'],
                  hasAvailableProvider: true,
                },
              ],
              providers: [
                {
                  provider: 'claude-4',
                  cooldownUntil: '2026-02-21T10:00:00.000Z',
                  coolingDown: true,
                },
                {
                  provider: 'gpt-4.1',
                  cooldownUntil: null,
                  coolingDown: false,
                },
                {
                  provider: 'gemini-2',
                  cooldownUntil: null,
                  coolingDown: false,
                },
              ],
              summary: {
                roleCount: 1,
                providerCount: 3,
                rolesBlocked: 0,
                providersCoolingDown: 1,
                providersReady: 2,
                health: 'ok',
              },
            }),
          } as Response);
        }
        if (url.includes('/admin/ai-runtime/dry-run')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              result: {
                role: 'critic',
                selectedProvider: 'gpt-4.1',
                output: '[gpt-4.1] Reasoning: runtime health ok',
                failed: false,
                attempts: [
                  {
                    provider: 'claude-4',
                    status: 'failed',
                    latencyMs: 110,
                    errorCode: 'AI_PROVIDER_UNAVAILABLE',
                    errorMessage: 'Provider claude-4 is unavailable.',
                  },
                  {
                    provider: 'gpt-4.1',
                    status: 'success',
                    latencyMs: 45,
                    errorCode: null,
                    errorMessage: null,
                  },
                ],
              },
              providers: [
                {
                  provider: 'claude-4',
                  cooldownUntil: '2026-02-21T10:00:00.000Z',
                },
                {
                  provider: 'gpt-4.1',
                  cooldownUntil: null,
                },
              ],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({}),
        } as Response);
      });
    global.fetch = fetchMock as typeof fetch;

    render(
      await AdminUxObserverEngagementPage({
        searchParams: Promise.resolve({
          hours: '24',
          aiDryRun: '1',
          aiRole: 'critic',
          aiPrompt: 'runtime health check',
          aiProviders: 'claude-4,gpt-4.1,gemini-2',
          aiFailures: 'claude-4',
          aiTimeoutMs: '9000',
        }),
      }),
    );

    await waitFor(() =>
      expect(screen.getByText(/AI runtime failover/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Dry-run completed via gpt-4.1\./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Runtime health: ok/i)).toBeInTheDocument();
    expect(
      screen.getByText(/provider\(s\) are in cooldown/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/cooldown active/i)).toBeInTheDocument();
    expect(
      screen.getByText(/\[gpt-4.1\] Reasoning: runtime health ok/i),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/ai-runtime/health',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'x-admin-token': 'test-admin-token',
        }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/ai-runtime/dry-run',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-admin-token': 'test-admin-token',
        }),
        body: JSON.stringify({
          role: 'critic',
          prompt: 'runtime health check',
          providersOverride: ['claude-4', 'gpt-4.1', 'gemini-2'],
          simulateFailures: ['claude-4'],
          timeoutMs: 9000,
        }),
      }),
    );
  });

  test('renders critical alert when roles are blocked in runtime chain', async () => {
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/admin/ux/observer-engagement')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            windowHours: 24,
            kpis: {},
            feedPreferences: {},
            segments: [],
          }),
        } as Response);
      }
      if (url.includes('/admin/agent-gateway/sessions?limit=25')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            source: 'db',
            sessions: [],
          }),
        } as Response);
      }
      if (url.includes('/admin/ai-runtime/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            generatedAt: '2026-02-21T11:00:00.000Z',
            roleStates: [
              {
                role: 'critic',
                providers: ['claude-4'],
                availableProviders: [],
                blockedProviders: ['claude-4'],
                hasAvailableProvider: false,
              },
            ],
            providers: [
              {
                provider: 'claude-4',
                cooldownUntil: '2026-02-21T11:05:00.000Z',
                coolingDown: true,
              },
            ],
            summary: {
              roleCount: 1,
              providerCount: 1,
              rolesBlocked: 1,
              providersCoolingDown: 1,
              providersReady: 0,
              health: 'degraded',
            },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);
    });
    global.fetch = fetchMock as typeof fetch;

    render(
      await AdminUxObserverEngagementPage({
        searchParams: Promise.resolve({ hours: '24' }),
      }),
    );

    await waitFor(() =>
      expect(screen.getByText(/AI runtime failover/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Critical alert/i)).toBeInTheDocument();
    expect(
      screen.getByText(/role\(s\) are blocked with no available providers/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Critical$/i)).toBeInTheDocument();
  });

  test('renders API error state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response) as typeof fetch;

    render(
      await AdminUxObserverEngagementPage({
        searchParams: Promise.resolve({ hours: '24' }),
      }),
    );

    expect(
      screen.getByText(/Admin API responded with 403/i),
    ).toBeInTheDocument();
  });
});
