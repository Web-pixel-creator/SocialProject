/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DraftDetailPage from '../app/drafts/[id]/page';
import { apiClient } from '../lib/api';

let mockParams: { id?: string | string[] } = {};

jest.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, onClick, scroll: _scroll, children, ...props }: any) => {
    const resolvedHref = typeof href === 'string' ? href : (href?.pathname ?? '');
    return (
      <a
        href={resolvedHref}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
        {...props}
      >
        {children}
      </a>
    );
  },
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(() => Promise.resolve({ data: { status: 'ok' } })),
    delete: jest.fn(() => Promise.resolve({ data: { status: 'ok' } })),
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
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { status: 'ok' } });
    (apiClient.delete as jest.Mock).mockReset();
    (apiClient.delete as jest.Mock).mockResolvedValue({
      data: { status: 'ok' },
    });
  });

  const flushAsyncState = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  afterEach(async () => {
    await flushAsyncState();
  });

  const renderDraftDetailPage = async (id: string) => {
    mockParams = { id };
    await act(async () => {
      render(<DraftDetailPage />);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.queryByText(/Loading draft/i)).not.toBeInTheDocument(),
    );
    await flushAsyncState();
  };

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

    await renderDraftDetailPage('draft-1');

    expect(screen.getByText(/Draft draft-1/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp 4.2/i)).toBeInTheDocument();
  });

  test('shows error when load fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Boom' } },
    });

    await renderDraftDetailPage('draft-2');

    expect(screen.getAllByText(/Boom/i).length).toBeGreaterThan(0);
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

    await renderDraftDetailPage('draft-3');

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-1',
        scope: 'post:draft-3',
        type: 'fix_request',
        sequence: 1,
        payload: {},
      });
      await Promise.resolve();
    });
    await flushAsyncState();

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

    await renderDraftDetailPage('draft-4');

    expect(screen.getByText(/Draft draft-4/i)).toBeInTheDocument();
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

    await renderDraftDetailPage('draft-5');

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
      await Promise.resolve();
    });
    await flushAsyncState();

    await waitFor(() =>
      expect(screen.getByText(/GlowUp 9.5/i)).toBeInTheDocument(),
    );
  });

  test('shows fallback error when load fails without response payload', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Network down'));

    await renderDraftDetailPage('draft-6');

    expect(screen.getAllByText(/Network down/i).length).toBeGreaterThan(0);
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

    await renderDraftDetailPage('draft-7');

    expect(screen.getByText(/Similar drafts/i)).toBeInTheDocument();
    expect(screen.getByText('Similar Draft')).toBeInTheDocument();
  });

  test('handles missing draft id and shows similar fallback status', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/observers/digest')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    mockParams = {};
    await act(async () => {
      render(<DraftDetailPage />);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.queryByText(/Loading draft/i)).not.toBeInTheDocument(),
    );

    expect(screen.getByText(/^Draft$/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft id missing/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run demo flow/i })).toBeDisabled();
    expect(screen.queryByText(/Next best action/i)).toBeNull();
  });

  test('shows observer auth-required states when watchlist and digest are unauthorized', async () => {
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
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (url.includes('/observers/watchlist') || url.includes('/observers/digest')) {
        return Promise.reject({ response: { status: 401 } });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-auth',
            currentVersion: 1,
            glowUpScore: 1.5,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-auth');

    expect(
      screen.getByText(/Sign in as observer to follow drafts/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sign in as observer to see digest updates/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sign in as observer to submit predictions/i),
    ).toBeInTheDocument();
  });

  test('runs demo flow from CTA and shows completion status', async () => {
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
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (url.includes('/observers/watchlist') || url.includes('/observers/digest')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-demo',
            currentVersion: 1,
            glowUpScore: 1.2,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });
    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url === '/demo/flow') {
        return Promise.resolve({ data: { status: 'ok' } });
      }
      return Promise.resolve({ data: { status: 'ok' } });
    });

    await renderDraftDetailPage('draft-demo');
    fireEvent.click(screen.getAllByRole('button', { name: /Run demo flow/i })[0]);

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/demo/flow', {
        draftId: 'draft-demo',
      }),
    );
    expect(
      await screen.findByText(/Demo flow complete\. New fix request and PR created/i),
    ).toBeInTheDocument();
  });

  test('shows copy draft id CTA and handles clipboard failure', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.reject(new Error('clipboard denied'))),
      },
    });

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({
          data: [
            {
              id: 'fix-copy',
              category: 'Focus',
              description: 'Improve focus',
              criticId: 'critic-copy',
            },
          ],
        });
      }
      if (url.includes('/pull-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (url.includes('/observers/watchlist') || url.includes('/observers/digest')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-copy',
            currentVersion: 1,
            glowUpScore: 2.2,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-copy');

    const copyButton = screen.getByRole('button', { name: /Copy draft ID/i });
    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('draft-copy'),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Copy failed/i }),
      ).toBeInTheDocument(),
    );
  });

  test('supports prediction submit, follow toggle, digest seen, and event notifications', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests') && !url.includes('/predictions')) {
        return Promise.resolve({
          data: [
            {
              id: 'pr-pending',
              status: 'pending',
              description: 'Pending PR for prediction',
              makerId: 'maker-predict',
            },
          ],
        });
      }
      if (url.includes('/predictions')) {
        return Promise.resolve({
          data: {
            pullRequestId: 'pr-pending',
            pullRequestStatus: 'pending',
            consensus: { merge: 2, reject: 1, total: 3 },
            observerPrediction: null,
            accuracy: { correct: 4, total: 8, rate: 0.5 },
          },
        });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({
          data: {
            summary: {
              draftId: 'draft-follow',
              state: 'ready_for_review',
              latestMilestone: 'PR pending',
              fixOpenCount: 1,
              prPendingCount: 1,
              lastMergeAt: null,
              updatedAt: new Date().toISOString(),
            },
            recap24h: {
              fixRequests: 1,
              prSubmitted: 1,
              prMerged: 0,
              prRejected: 0,
              glowUpDelta: 0.2,
              hasChanges: true,
            },
          },
        });
      }
      if (url.includes('/observers/watchlist')) {
        return Promise.resolve({
          data: [{ draft_id: 'draft-follow' }, 'invalid-entry'],
        });
      }
      if (url.includes('/observers/digest')) {
        return Promise.resolve({
          data: [
            {
              id: 'entry-1',
              observerId: 'observer-1',
              draftId: 'draft-follow',
              title: 'Digest update',
              summary: 'A new PR arrived.',
              latestMilestone: 'PR pending',
              isSeen: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-follow',
            currentVersion: 1,
            glowUpScore: 3.4,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-follow');

    fireEvent.click(screen.getByRole('button', { name: /Predict merge/i }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/pull-requests/pr-pending/predict',
        {
          predictedOutcome: 'merge',
        },
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Mark seen/i }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/observers/digest/entry-1/seen'),
    );

    fireEvent.click(screen.getByRole('button', { name: /Following/i }));
    await waitFor(() =>
      expect(apiClient.delete).toHaveBeenCalledWith(
        '/observers/watchlist/draft-follow',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Follow chain/i }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/observers/watchlist/draft-follow'),
    );

    fireEvent.click(screen.getByRole('link', { name: /See more similar/i }));
    await waitFor(() => {
      const telemetryCall = (apiClient.post as jest.Mock).mock.calls.find(
        (call) =>
          call[0] === '/telemetry/ux' &&
          call[1]?.eventType === 'similar_search_clicked',
      );
      expect(telemetryCall).toBeTruthy();
      expect(telemetryCall?.[1]).toMatchObject({ draftId: 'draft-follow' });
    });

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-fix',
        scope: 'post:draft-follow',
        type: 'fix_request',
        sequence: 1,
        payload: {},
      });
      __socket.__trigger('event', {
        id: 'evt-pr',
        scope: 'post:draft-follow',
        type: 'pull_request',
        sequence: 2,
        payload: {},
      });
      __socket.__trigger('event', {
        id: 'evt-decision',
        scope: 'post:draft-follow',
        type: 'pull_request_decision',
        sequence: 3,
        payload: { decision: 'changes_requested' },
      });
      __socket.__trigger('event', {
        id: 'evt-glow',
        scope: 'post:draft-follow',
        type: 'glowup_update',
        sequence: 4,
        payload: {},
      });
      __socket.__trigger('event', {
        id: 'evt-release',
        scope: 'post:draft-follow',
        type: 'draft_released',
        sequence: 5,
        payload: {},
      });
      await Promise.resolve();
    });
    await flushAsyncState();

    expect(screen.getByText(/New fix request submitted/i)).toBeInTheDocument();
    expect(screen.getByText(/New pull request submitted/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Pull request changes requested/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/GlowUp score updated/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft released/i)).toBeInTheDocument();
  });

  test('handles similar-search and prediction failures gracefully', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.reject({
          response: { status: 400, data: { error: 'EMBEDDING_NOT_FOUND' } },
        });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests') && !url.includes('/predictions')) {
        return Promise.resolve({
          data: [
            {
              id: 'pr-error',
              status: 'pending',
              description: 'Pending PR',
              makerId: 'maker-error',
            },
          ],
        });
      }
      if (url.includes('/predictions')) {
        return Promise.reject({
          response: { status: 401, data: { message: 'Auth required' } },
        });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (url.includes('/observers/watchlist') || url.includes('/observers/digest')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-errors',
            currentVersion: 1,
            glowUpScore: 0.5,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });
    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/predict')) {
        return Promise.reject({
          response: { status: 500, data: { message: 'Prediction failed' } },
        });
      }
      return Promise.resolve({ data: { status: 'ok' } });
    });

    await renderDraftDetailPage('draft-errors');
    expect(
      screen.getByText(/Similar works available after analysis/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sign in as observer to submit predictions/i),
    ).toBeInTheDocument();
  });
});
