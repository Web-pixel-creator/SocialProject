/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { useRealtimeRoom } from '../hooks/useRealtimeRoom';

jest.mock('../lib/socket', () => {
  const handlers: Record<string, Array<(payload: any) => void>> = {};
  const socket = {
    emit: jest.fn(),
    on: jest.fn((event: string, cb: (payload: any) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(cb);
    }),
    off: jest.fn((event: string, cb: (payload: any) => void) => {
      handlers[event] = (handlers[event] ?? []).filter((handler) => handler !== cb);
    }),
    __trigger: (event: string, payload: any) => {
      (handlers[event] ?? []).forEach((handler) => handler(payload));
    }
  };
  return { getSocket: () => socket, __socket: socket };
});

const Harness = ({ scope }: { scope: string }) => {
  const { events, needsResync, requestResync } = useRealtimeRoom(scope);
  return (
    <div>
      <span data-testid="count">{events.length}</span>
      <span data-testid="needs">{needsResync ? 'yes' : 'no'}</span>
      <button onClick={requestResync}>resync</button>
    </div>
  );
};

describe('useRealtimeRoom', () => {
  test('subscribes and handles events + resync', async () => {
    render(<Harness scope="post:1" />);

    const { __socket } = jest.requireMock('../lib/socket');
    expect(__socket.emit).toHaveBeenCalledWith('subscribe', 'post:1');
    expect(__socket.emit).toHaveBeenCalledWith('resync', { scope: 'post:1', sinceSequence: 0 });

    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-1',
        scope: 'post:1',
        type: 'fix_request',
        sequence: 1,
        payload: {}
      });
    });

    expect(screen.getByTestId('count')).toHaveTextContent('1');

    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-1',
        scope: 'post:1',
        type: 'fix_request',
        sequence: 2,
        payload: {}
      });
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-2',
        scope: 'post:2',
        type: 'fix_request',
        sequence: 1,
        payload: {}
      });
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    await act(async () => {
      __socket.__trigger('resync', {
        scope: 'post:1',
        resyncRequired: true,
        events: []
      });
    });

    expect(screen.getByTestId('needs')).toHaveTextContent('yes');

    fireEvent.click(screen.getByText('resync'));
    expect(__socket.emit).toHaveBeenLastCalledWith('resync', { scope: 'post:1', sinceSequence: 2 });
    expect(screen.getByTestId('needs')).toHaveTextContent('no');

    await act(async () => {
      __socket.__trigger('resync', {
        scope: 'post:1',
        events: [
          { id: 'evt-3', scope: 'post:1', type: 'pull_request', sequence: 3, payload: {} }
        ],
        latestSequence: 3
      });
    });

    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  test('ignores resync events for other scopes', async () => {
    render(<Harness scope="post:1" />);

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      __socket.__trigger('resync', {
        scope: 'post:2',
        resyncRequired: true,
        events: [{ id: 'evt-x', scope: 'post:2', type: 'fix_request', sequence: 1, payload: {} }]
      });
    });

    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('needs')).toHaveTextContent('no');
  });

  test('merges resync events without duplicates and keeps latest sequence', async () => {
    render(<Harness scope="post:1" />);

    const { __socket } = jest.requireMock('../lib/socket');

    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-1',
        scope: 'post:1',
        type: 'fix_request',
        sequence: 5,
        payload: {}
      });
    });

    await act(async () => {
      __socket.__trigger('resync', {
        scope: 'post:1',
        events: [
          { id: 'evt-1', scope: 'post:1', type: 'fix_request', sequence: 4, payload: {} },
          { id: 'evt-2', scope: 'post:1', type: 'pull_request', sequence: 6, payload: {} }
        ]
      });
    });

    expect(screen.getByTestId('count')).toHaveTextContent('2');

    fireEvent.click(screen.getByText('resync'));
    expect(__socket.emit).toHaveBeenLastCalledWith('resync', { scope: 'post:1', sinceSequence: 5 });
  });
});
