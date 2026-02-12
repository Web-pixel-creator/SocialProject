/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { SWRConfig } from 'swr';
import { ObserverRightRail } from '../components/ObserverRightRail';
import { useRealtimeRoom } from '../hooks/useRealtimeRoom';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
  },
}));

jest.mock('../hooks/useRealtimeRoom', () => ({
  useRealtimeRoom: jest.fn(() => ({
    events: [],
    needsResync: false,
    isResyncing: false,
    lastResyncAt: null,
    requestResync: jest.fn(),
  })),
}));

const renderObserverRail = () =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ObserverRightRail />
    </SWRConfig>,
  );

describe('ObserverRightRail', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockClear();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
    window.localStorage.removeItem('finishit-observer-rail-panels');
    (useRealtimeRoom as jest.Mock).mockReset();
    (useRealtimeRoom as jest.Mock).mockReturnValue({
      events: [],
      needsResync: false,
      isResyncing: false,
      lastResyncAt: null,
      requestResync: jest.fn(),
    });
  });

  test('shows resync controls and triggers manual resync', async () => {
    const requestResync = jest.fn();
    (useRealtimeRoom as jest.Mock).mockReturnValue({
      events: [],
      needsResync: true,
      isResyncing: false,
      lastResyncAt: null,
      requestResync,
    });

    renderObserverRail();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.getByText(/Resync required/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Resync now/i }));
    expect(requestResync).toHaveBeenCalledTimes(1);
  });

  test('disables resync button while manual resync is running', async () => {
    (useRealtimeRoom as jest.Mock).mockReturnValue({
      events: [],
      needsResync: true,
      isResyncing: true,
      lastResyncAt: null,
      requestResync: jest.fn(),
    });

    renderObserverRail();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    const resyncButton = screen.getByRole('button', { name: /Resync now/i });
    expect(resyncButton).toBeDisabled();
    expect(resyncButton).toHaveTextContent(/Resyncing/i);
  });

  test('shows success toast and last sync label after manual resync', async () => {
    const requestResync = jest.fn();
    const realtimeState = {
      events: [],
      needsResync: true,
      isResyncing: false,
      lastResyncAt: null as string | null,
      requestResync,
    };
    (useRealtimeRoom as jest.Mock).mockImplementation(() => realtimeState);

    const { rerender } = renderObserverRail();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Resync now/i }));
    expect(requestResync).toHaveBeenCalledTimes(1);

    realtimeState.needsResync = false;
    realtimeState.lastResyncAt = new Date().toISOString();
    rerender(
      <SWRConfig value={{ provider: () => new Map() }}>
        <ObserverRightRail />
      </SWRConfig>,
    );

    expect(await screen.findByText(/Resync completed/i)).toBeInTheDocument();
    expect(screen.getByText(/Last sync/i)).toBeInTheDocument();
  });

  test('renders realtime draft activity events in live activity list', async () => {
    (useRealtimeRoom as jest.Mock).mockReturnValue({
      events: [
        {
          id: 'evt-1',
          scope: 'feed:live',
          type: 'draft_activity',
          sequence: 1,
          payload: { draftId: '12345678-abcd' },
        },
      ],
      needsResync: false,
      isResyncing: false,
      lastResyncAt: null,
      requestResync: jest.fn(),
    });

    renderObserverRail();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(
      screen.getAllByText(/Draft activity: 12345678/i).length,
    ).toBeGreaterThan(0);
  });

  test('keeps available API data when one feed endpoint fails', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/feeds/battles') {
        return Promise.reject(new Error('battles unavailable'));
      }
      if (url === '/feeds/glowups') {
        return Promise.resolve({
          data: [{ id: 'abcdef12-0000', glowUpScore: 12.5 }],
        });
      }
      if (url === '/feeds/studios') {
        return Promise.resolve({
          data: [{ id: 'studio-1', studioName: 'Live Studio', impact: 91 }],
        });
      }
      if (url === '/feeds/live-drafts') {
        return Promise.resolve({
          data: [{ id: 'draft-1' }, { id: 'draft-2' }],
        });
      }
      if (url === '/feeds/hot-now') {
        return Promise.resolve({
          data: [{ id: 'hot-1', prPendingCount: 3 }],
        });
      }
      if (url === '/feeds/changes') {
        return Promise.resolve({
          data: [
            {
              id: 'change-1',
              draftTitle: 'Pipeline Draft',
              description: 'Merged',
              occurredAt: new Date().toISOString(),
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderObserverRail();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.getAllByText('Design vs Function').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Draft abcdef12').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Live Studio').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Pipeline Draft: Merged').length,
    ).toBeGreaterThan(0);

    const liveDraftTile = screen.getByText(/Live drafts/i).closest('div');
    expect(liveDraftTile).toHaveTextContent('2');

    const pendingTile = screen.getByText(/PR pending/i).closest('div');
    expect(pendingTile).toHaveTextContent('3');
  });

  test('keeps previous rail data when all feed endpoints fail on refresh', async () => {
    const cache = new Map();
    let phase: 'initial' | 'failed' = 'initial';

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (phase === 'failed') {
        return Promise.reject(new Error('rail refresh failed'));
      }
      if (url === '/feeds/battles') {
        return Promise.resolve({
          data: [{ id: 'battle-1', glowUpScore: 8.4 }],
        });
      }
      if (url === '/feeds/glowups') {
        return Promise.resolve({
          data: [{ id: 'glow-1', glowUpScore: 12.5 }],
        });
      }
      if (url === '/feeds/studios') {
        return Promise.resolve({
          data: [
            {
              id: 'studio-1',
              studioName: 'Stable Studio',
              impact: 91,
              signal: 76,
            },
          ],
        });
      }
      if (url === '/feeds/live-drafts') {
        return Promise.resolve({
          data: [{ id: 'draft-1' }, { id: 'draft-2' }, { id: 'draft-3' }],
        });
      }
      if (url === '/feeds/hot-now') {
        return Promise.resolve({
          data: [{ id: 'hot-1', prPendingCount: 9 }],
        });
      }
      if (url === '/feeds/changes') {
        return Promise.resolve({
          data: [
            {
              id: 'change-1',
              draftTitle: 'Stable Draft',
              description: 'Merged',
              occurredAt: new Date().toISOString(),
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const firstRender = render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <ObserverRightRail />
      </SWRConfig>,
    );

    await waitFor(() =>
      expect(screen.getAllByText('Stable Studio').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText('Stable Draft: Merged').length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/Live drafts/i).closest('div')).toHaveTextContent(
      '3',
    );
    expect(screen.getByText(/PR pending/i).closest('div')).toHaveTextContent(
      '9',
    );

    phase = 'failed';
    firstRender.unmount();

    render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <ObserverRightRail />
      </SWRConfig>,
    );

    await waitFor(() =>
      expect(
        (apiClient.get as jest.Mock).mock.calls.length,
      ).toBeGreaterThanOrEqual(12),
    );

    expect(screen.getAllByText('Stable Studio').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Stable Draft: Merged').length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/Live drafts/i).closest('div')).toHaveTextContent(
      '3',
    );
    expect(screen.getByText(/PR pending/i).closest('div')).toHaveTextContent(
      '9',
    );
    expect(screen.queryByText('Design vs Function')).toBeNull();
  });

  test('toggles desktop panel visibility buttons', async () => {
    renderObserverRail();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());

    const desktopControls = screen.getByTestId(
      'observer-rail-desktop-controls',
    );
    const battlesToggle = within(desktopControls).getByRole('button', {
      name: /Trending battles/i,
    });
    expect(battlesToggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(battlesToggle);
    expect(battlesToggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(battlesToggle);
    expect(battlesToggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('hydrates panel visibility from localStorage and persists updates', async () => {
    window.localStorage.setItem(
      'finishit-observer-rail-panels',
      JSON.stringify({
        battles: false,
        activity: true,
        glowUps: false,
        studios: true,
      }),
    );

    renderObserverRail();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());

    const desktopControls = screen.getByTestId(
      'observer-rail-desktop-controls',
    );
    const battlesToggle = within(desktopControls).getByRole('button', {
      name: /Trending battles/i,
    });
    const activityToggle = within(desktopControls).getByRole('button', {
      name: /Live activity stream/i,
    });
    const glowUpsToggle = within(desktopControls).getByRole('button', {
      name: /Top GlowUps/i,
    });
    const studiosToggle = within(desktopControls).getByRole('button', {
      name: /Top studios/i,
    });

    await waitFor(() => {
      expect(battlesToggle).toHaveAttribute('aria-pressed', 'false');
      expect(activityToggle).toHaveAttribute('aria-pressed', 'true');
      expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'false');
      expect(studiosToggle).toHaveAttribute('aria-pressed', 'true');
    });

    fireEvent.click(glowUpsToggle);

    await waitFor(() => {
      const rawValue = window.localStorage.getItem(
        'finishit-observer-rail-panels',
      );
      expect(rawValue).not.toBeNull();
      const parsed = JSON.parse(rawValue ?? '{}') as {
        battles?: boolean;
        activity?: boolean;
        glowUps?: boolean;
        studios?: boolean;
      };
      expect(parsed.battles).toBe(false);
      expect(parsed.activity).toBe(true);
      expect(parsed.glowUps).toBe(true);
      expect(parsed.studios).toBe(true);
    });
  });
});
