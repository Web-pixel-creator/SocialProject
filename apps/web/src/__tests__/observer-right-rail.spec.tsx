/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('ObserverRightRail', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockClear();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
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

    render(<ObserverRightRail />);

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

    render(<ObserverRightRail />);

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

    const { rerender } = render(<ObserverRightRail />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Resync now/i }));
    expect(requestResync).toHaveBeenCalledTimes(1);

    realtimeState.needsResync = false;
    realtimeState.lastResyncAt = new Date().toISOString();
    rerender(<ObserverRightRail />);

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

    render(<ObserverRightRail />);

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(
      screen.getAllByText(/Draft activity: 12345678/i).length,
    ).toBeGreaterThan(0);
  });
});
