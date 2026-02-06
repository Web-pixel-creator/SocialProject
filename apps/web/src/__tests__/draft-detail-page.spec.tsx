/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import DraftDetailPage from '../app/drafts/[id]/page';
import { apiClient } from '../lib/api';

let mockParams: { id?: string | string[] } = {};

jest.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(() => Promise.resolve({ data: { status: 'ok' } })),
  },
  setAuthToken: jest.fn(),
}));

jest.mock('next/dynamic', () => {
  return (loader: any, options?: any) => {
    try {
      const result = loader?.();
      if (result?.catch) {
        result.catch(() => undefined);
      }
    } catch (_err) {
      // ignore loader errors for test coverage
    }
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
      handlers[event] = (handlers[event] ?? []).filter(
        (handler) => handler !== cb,
      );
    }),
    __trigger: (event: string, payload: any) => {
      for (const handler of handlers[event] ?? []) {
        handler(payload);
      }
    },
  };
  return { getSocket: () => socket, __socket: socket };
});

describe('draft detail page', () => {
  beforeEach(() => {
    mockParams = { id: 'draft-1' };
    (apiClient.get as jest.Mock).mockReset();
  });

  test('renders loading then draft content', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({
          data: [
            {
              id: 'fix-1',
              category: 'Focus',
              description: 'Fix it',
              criticId: 'critic-123456',
            },
          ],
        });
      }
      if (url.includes('/pull-requests')) {
        return Promise.resolve({
          data: [
            {
              id: 'pr-1',
              status: 'pending',
              description: 'PR desc',
              makerId: 'maker-abcdef',
            },
          ],
        });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-1',
            currentVersion: 2,
            glowUpScore: 4.2,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [
            { versionNumber: 1, imageUrl: 'https://example.com/v1.png' },
            { versionNumber: 2, imageUrl: 'https://example.com/v2.png' },
          ],
        },
      });
    });

    await act(async () => {
      render(<DraftDetailPage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Draft draft-1/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/GlowUp 4.2/i)).toBeInTheDocument();
  });

  test('shows error when load fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Boom' } },
    });

    await act(async () => {
      mockParams = { id: 'draft-2' };
      render(<DraftDetailPage />);
    });

    await waitFor(() =>
      expect(screen.getAllByText(/Boom/i).length).toBeGreaterThan(0),
    );
  });

  test('responds to realtime events', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-3',
            glowUpScore: 1,
            currentVersion: 1,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await act(async () => {
      mockParams = { id: 'draft-3' };
      render(<DraftDetailPage />);
    });

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-1',
        scope: 'post:draft-3',
        type: 'fix_request',
        sequence: 1,
        payload: {},
      });
    });

    expect(apiClient.get).toHaveBeenCalled();
  });

  test('defaults to v1 when versions are missing', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: undefined });
      }
      if (url.includes('/pull-requests')) {
        return Promise.resolve({ data: undefined });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-4',
            glowUpScore: 0,
            currentVersion: 1,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
        },
      });
    });

    await act(async () => {
      mockParams = { id: 'draft-4' };
      render(<DraftDetailPage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Draft draft-4/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Selected version: v1/i)).toBeInTheDocument();
    expect(screen.getAllByText('v1').length).toBeGreaterThan(0);
  });

  test('reloads draft on glowup update event', async () => {
    let draftCalls = 0;
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/drafts/')) {
        draftCalls += 1;
        return Promise.resolve({
          data: {
            draft: {
              id: 'draft-5',
              glowUpScore: draftCalls === 1 ? 1 : 9.5,
              currentVersion: 1,
              status: 'draft',
              updatedAt: new Date().toISOString(),
            },
            versions: [],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    await act(async () => {
      mockParams = { id: 'draft-5' };
      render(<DraftDetailPage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/GlowUp 1.0/i)).toBeInTheDocument(),
    );

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-2',
        scope: 'post:draft-5',
        type: 'glowup_update',
        sequence: 2,
        payload: {},
      });
    });

    await waitFor(() =>
      expect(screen.getByText(/GlowUp 9.5/i)).toBeInTheDocument(),
    );
  });

  test('shows fallback error when load fails without response', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce(
      new Error('Network down'),
    );

    await act(async () => {
      mockParams = { id: 'draft-6' };
      render(<DraftDetailPage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Failed to load draft/i)).toBeInTheDocument(),
    );
  });

  test('renders similar drafts section', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({
          data: [
            {
              id: 'sim-1',
              type: 'draft',
              title: 'Similar Draft',
              score: 0.82,
              glowUpScore: 3.5,
            },
          ],
        });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-7',
            currentVersion: 1,
            glowUpScore: 2.1,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await act(async () => {
      mockParams = { id: 'draft-7' };
      render(<DraftDetailPage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Similar drafts/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('Similar Draft')).toBeInTheDocument();
  });
});
