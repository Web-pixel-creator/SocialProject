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

  test('renders orchestration realtime events from feed stream', async () => {
    (useRealtimeRoom as jest.Mock).mockReturnValue({
      events: [
        {
          id: 'evt-orch-step',
          scope: 'feed:live',
          type: 'agent_gateway_orchestration_step',
          sequence: 2,
          payload: {
            source: 'agent_gateway',
            data: {
              draftId: 'abcdef12-3456-7890-abcd-ef1234567890',
              role: 'critic',
              failed: false,
            },
          },
        },
        {
          id: 'evt-orch-completed',
          scope: 'feed:live',
          type: 'agent_gateway_orchestration_completed',
          sequence: 3,
          payload: {
            source: 'agent_gateway',
            data: {
              draftId: 'abcdef12-3456-7890-abcd-ef1234567890',
              completed: true,
              stepCount: 3,
            },
          },
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
      screen.getAllByText(/Orchestration step: abcdef12 \(critic\)/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Orchestration completed: abcdef12/i).length,
    ).toBeGreaterThan(0);
  });

  test('renders live pressure meter with derived values', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
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
          data: [{ id: 'studio-1', studioName: 'Live Studio', impact: 91 }],
        });
      }
      if (url === '/feeds/live-drafts') {
        return Promise.resolve({
          data: [{ id: 'draft-1' }, { id: 'draft-2' }, { id: 'draft-3' }],
        });
      }
      if (url === '/feeds/hot-now') {
        return Promise.resolve({
          data: [{ id: 'hot-1', prPendingCount: 2 }],
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
    const meterTitle = screen.getByText(/Live pressure meter/i);
    const meterPanel = meterTitle.closest('div');

    expect(meterPanel).not.toBeNull();
    const panel = meterPanel as HTMLElement;

    expect(within(panel).getByText(/PR pressure/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Audience/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Fuel/i)).toBeInTheDocument();
    expect(within(panel).getByText('67%')).toBeInTheDocument();
    expect(within(panel).getByText('18%')).toBeInTheDocument();
    expect(within(panel).getByText('63%')).toBeInTheDocument();
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
      if (url === '/me/following') {
        return Promise.resolve({
          data: [
            {
              id: 'studio-followed-1',
              studioName: 'Followed Studio',
              impact: 88,
              signal: 81,
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
    expect(screen.getAllByText('Followed Studio').length).toBeGreaterThan(0);

    const liveDraftTile = screen.getByText(/Live drafts/i).closest('div');
    expect(liveDraftTile).toHaveTextContent('2');

    const pendingTile = screen.getByText(/PR pending/i).closest('div');
    expect(pendingTile).toHaveTextContent('3');
  });

  test('shows empty following studios state when no subscriptions exist', async () => {
    renderObserverRail();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.getAllByText(/Following studios/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Follow studios to pin them here/i).length,
    ).toBeGreaterThan(0);
  });

  test('renders followed studios as profile links and includes following feed CTA', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/me/following') {
        return Promise.resolve({
          data: [
            {
              id: 'studio-followed-1',
              studioName: 'Followed Studio',
              impact: 88,
              signal: 81,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderObserverRail();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());

    const studioLinks = screen.getAllByRole('link', {
      name: /Followed Studio/i,
    });
    expect(studioLinks.length).toBeGreaterThan(0);
    expect(
      studioLinks.some(
        (link) => link.getAttribute('href') === '/studios/studio-followed-1',
      ),
    ).toBe(true);

    const openFollowingFeedLinks = screen.getAllByRole('link', {
      name: /Open following feed/i,
    });
    expect(openFollowingFeedLinks.length).toBeGreaterThan(0);
    expect(
      openFollowingFeedLinks.every(
        (link) => link.getAttribute('href') === '/feed?tab=Following',
      ),
    ).toBe(true);
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

  test('shows only show-all and hide-all buttons in desktop controls', async () => {
    renderObserverRail();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());

    const desktopControls = screen.getByTestId(
      'observer-rail-desktop-controls',
    );
    const controlButtons = within(desktopControls).getAllByRole('button');
    expect(controlButtons).toHaveLength(2);
    expect(
      within(desktopControls).getByRole('button', { name: /Show all/i }),
    ).toBeInTheDocument();
    expect(
      within(desktopControls).getByRole('button', { name: /Hide all/i }),
    ).toBeInTheDocument();
    expect(
      within(desktopControls).queryByRole('button', {
        name: /Trending battles/i,
      }),
    ).toBeNull();
  });

  test('supports hide-all and restore-defaults panel actions', async () => {
    renderObserverRail();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());

    const desktopControls = screen.getByTestId(
      'observer-rail-desktop-controls',
    );
    const showAllButton = within(desktopControls).getByRole('button', {
      name: /Show all/i,
    });
    const hideAllButton = within(desktopControls).getByRole('button', {
      name: /Hide all/i,
    });

    expect(
      screen.queryAllByRole('button', { name: /Restore defaults/i }),
    ).toHaveLength(0);

    fireEvent.click(hideAllButton);

    expect(screen.getByText(/Panels: 0\/4/i)).toBeInTheDocument();
    expect(showAllButton).toBeEnabled();
    expect(hideAllButton).toBeDisabled();
    expect(
      screen.getAllByRole('button', { name: /Restore defaults/i }).length,
    ).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole('button', { name: /Restore defaults/i })[0],
    );

    expect(screen.getByText(/Panels: 2\/4/i)).toBeInTheDocument();
    expect(showAllButton).toBeEnabled();
    expect(hideAllButton).toBeEnabled();
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
    const showAllButton = within(desktopControls).getByRole('button', {
      name: /Show all/i,
    });
    const hideAllButton = within(desktopControls).getByRole('button', {
      name: /Hide all/i,
    });

    await waitFor(() => {
      expect(screen.getByText(/Panels: 2\/4/i)).toBeInTheDocument();
      expect(showAllButton).toBeEnabled();
      expect(hideAllButton).toBeEnabled();
    });

    fireEvent.click(showAllButton);

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
      expect(parsed.battles).toBe(true);
      expect(parsed.activity).toBe(true);
      expect(parsed.glowUps).toBe(true);
      expect(parsed.studios).toBe(true);
    });

    fireEvent.click(hideAllButton);

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
      expect(parsed.activity).toBe(false);
      expect(parsed.glowUps).toBe(false);
      expect(parsed.studios).toBe(false);
    });
  });
});
