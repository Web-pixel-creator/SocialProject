/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor, act } from '@testing-library/react';
import DraftDetailPage from '../app/drafts/[id]/page';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn()
  },
  setAuthToken: jest.fn()
}));

jest.mock('next/dynamic', () => {
  return (_loader: any, options?: any) => {
    const Loading = options?.loading;
    if (Loading) {
      return (props: any) => <Loading {...props} />;
    }
    return () => null;
  };
});

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

describe('draft detail page', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
  });

  test('renders loading then draft content', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/fix-requests')) {
        return Promise.resolve({
          data: [{ id: 'fix-1', category: 'Focus', description: 'Fix it', criticId: 'critic-123456' }]
        });
      }
      if (url.includes('/pull-requests')) {
        return Promise.resolve({
          data: [{ id: 'pr-1', status: 'pending', description: 'PR desc', makerId: 'maker-abcdef' }]
        });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-1',
            currentVersion: 2,
            glowUpScore: 4.2,
            status: 'draft',
            updatedAt: new Date().toISOString()
          },
          versions: [
            { versionNumber: 1, imageUrl: 'https://example.com/v1.png' },
            { versionNumber: 2, imageUrl: 'https://example.com/v2.png' }
          ]
        }
      });
    });

    await act(async () => {
      render(<DraftDetailPage params={{ id: 'draft-1' }} />);
    });

    await waitFor(() => expect(screen.getByText(/Draft draft-1/i)).toBeInTheDocument());
    expect(screen.getByText(/GlowUp 4.2/i)).toBeInTheDocument();
  });

  test('shows error when load fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Boom' } }
    });

    await act(async () => {
      render(<DraftDetailPage params={{ id: 'draft-2' }} />);
    });

    await waitFor(() => expect(screen.getByText(/Boom/i)).toBeInTheDocument());
  });

  test('responds to realtime events', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: { id: 'draft-3', glowUpScore: 1, currentVersion: 1, status: 'draft', updatedAt: new Date().toISOString() },
          versions: []
        }
      });
    });

    await act(async () => {
      render(<DraftDetailPage params={{ id: 'draft-3' }} />);
    });

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-1',
        scope: 'post:draft-3',
        type: 'fix_request',
        sequence: 1,
        payload: {}
      });
    });

    expect(apiClient.get).toHaveBeenCalled();
  });
});
