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
    const fetchMock = jest.fn().mockResolvedValue({
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
    global.fetch = fetchMock as typeof fetch;

    render(
      await AdminUxObserverEngagementPage({
        searchParams: Promise.resolve({ hours: '24' }),
      }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Feed preference KPIs/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Engagement health/i)).toBeInTheDocument();
    expect(screen.getByText('Watch')).toBeInTheDocument();

    expect(screen.getAllByText('33.3%').length).toBeGreaterThan(0);
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    expect(screen.getByText(/observer: 1 \| focus: 2/i)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/admin/ux/observer-engagement?hours=24',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'x-admin-token': 'test-admin-token',
        }),
      }),
    );
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
