/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { LivePanel } from '../components/LivePanel';
import { useRealtimeRoom } from '../hooks/useRealtimeRoom';

jest.mock('../hooks/useRealtimeRoom', () => ({
  useRealtimeRoom: jest.fn(),
}));

describe('LivePanel', () => {
  const useRealtimeRoomMock = useRealtimeRoom as jest.Mock;

  beforeEach(() => {
    useRealtimeRoomMock.mockReset();
  });

  test('renders empty state when no events', () => {
    useRealtimeRoomMock.mockReturnValue({
      events: [],
      needsResync: false,
      requestResync: jest.fn(),
    });

    render(<LivePanel scope="post:1" />);

    expect(screen.getByText(/No live events yet/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Resync required/i }),
    ).toBeNull();
  });

  test('renders events and triggers resync', () => {
    const requestResync = jest.fn();
    useRealtimeRoomMock.mockReturnValue({
      events: [
        { id: 'evt-1', type: 'fix_request', sequence: 12 },
        { id: 'evt-2', type: 'pull_request', sequence: 13 },
      ],
      needsResync: true,
      requestResync,
    });

    render(<LivePanel scope="post:1" />);

    expect(screen.getByText('fix_request')).toBeInTheDocument();
    expect(screen.getByText('#12')).toBeInTheDocument();
    expect(screen.getByText('pull_request')).toBeInTheDocument();
    expect(screen.getByText('#13')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /Resync required/i });
    fireEvent.click(button);
    expect(requestResync).toHaveBeenCalled();
  });
});
