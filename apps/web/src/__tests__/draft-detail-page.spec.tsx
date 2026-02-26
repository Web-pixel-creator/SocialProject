/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { SWRConfig } from 'swr';
import DraftDetailPage from '../app/drafts/[id]/page';
import { apiClient } from '../lib/api';

let mockParams: { id?: string | string[] } = {};

jest.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, onClick, scroll: _scroll, children, ...props }: any) => {
    const resolvedHref =
      typeof href === 'string' ? href : (href?.pathname ?? '');
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
      render(
        <SWRConfig value={{ provider: () => new Map() }}>
          <DraftDetailPage />
        </SWRConfig>,
      );
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

  test('does not re-fetch fix requests again when dependencies change without new realtime events', async () => {
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
      if (url.includes('/observers/watchlist')) {
        return Promise.resolve({ data: [{ draft_id: 'draft-rt-dup' }] });
      }
      if (url.includes('/observers/digest')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-rt-dup',
            glowUpScore: 1.2,
            currentVersion: 1,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-rt-dup');

    const fixCallsBeforeRealtime = (apiClient.get as jest.Mock).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/fix-requests')).length;

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-dup-1',
        scope: 'post:draft-rt-dup',
        type: 'fix_request',
        sequence: 1,
        payload: {},
      });
      await Promise.resolve();
    });
    await flushAsyncState();

    const fixCallsAfterRealtime = (apiClient.get as jest.Mock).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/fix-requests')).length;

    expect(fixCallsAfterRealtime).toBeGreaterThan(fixCallsBeforeRealtime);

    fireEvent.click(screen.getByRole('button', { name: /Following/i }));

    await waitFor(() =>
      expect(apiClient.delete).toHaveBeenCalledWith(
        '/observers/watchlist/draft-rt-dup',
      ),
    );

    const fixCallsAfterDependencyChange = (
      apiClient.get as jest.Mock
    ).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/fix-requests')).length;

    expect(fixCallsAfterDependencyChange).toBe(fixCallsAfterRealtime);
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

  test('renders multimodal glowup panel when score is available', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/glowup/multimodal')) {
        return Promise.resolve({
          data: {
            provider: 'gemini-2',
            score: 84.6,
            confidence: 0.92,
            visualScore: 88.1,
            narrativeScore: 81.4,
            audioScore: null,
            videoScore: 79.8,
            updatedAt: '2026-02-22T11:02:00.000Z',
          },
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
            id: 'draft-mm',
            currentVersion: 1,
            glowUpScore: 5.2,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-mm');

    expect(screen.getByTestId('multimodal-glowup-card')).toBeInTheDocument();
    expect(screen.getByText(/Multimodal GlowUp/i)).toBeInTheDocument();
    expect(screen.getByText(/gemini-2/i)).toBeInTheDocument();
    expect(screen.getByText('84.6')).toBeInTheDocument();
    expect(screen.getByText('92.0%')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        (apiClient.post as jest.Mock).mock.calls.some(
          (call: unknown[]) =>
            call[0] === '/telemetry/ux' &&
            (call[1] as { eventType?: string })?.eventType ===
              'draft_multimodal_glowup_view',
        ),
      ).toBe(true),
    );
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
      render(
        <SWRConfig value={{ provider: () => new Map() }}>
          <DraftDetailPage />
        </SWRConfig>,
      );
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.queryByText(/Loading draft/i)).not.toBeInTheDocument(),
    );

    expect(screen.getByText(/^Draft$/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft id missing/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Run demo flow/i }),
    ).toBeDisabled();
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
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest')
      ) {
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
    const predictionAuthCard = screen
      .getByText(/Sign in as observer to submit predictions/i)
      .closest('.card');
    expect(predictionAuthCard).not.toBeNull();
    expect(
      within(predictionAuthCard as HTMLElement).getByRole('link', {
        name: /Sign in/i,
      }),
    ).toHaveAttribute('href', '/login');
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
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest')
      ) {
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
    fireEvent.click(
      screen.getAllByRole('button', { name: /Run demo flow/i })[0],
    );

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/demo/flow', {
        draftId: 'draft-demo',
      }),
    );
    expect(
      await screen.findByText(
        /Demo flow complete\. New fix request and PR created/i,
      ),
    ).toBeInTheDocument();
  });

  test('keeps demo success status when post-demo refresh partially fails', async () => {
    let arcCalls = 0;
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
        arcCalls += 1;
        if (arcCalls > 1) {
          return Promise.reject({
            response: { data: { message: 'Arc refresh failed' } },
          });
        }
        return Promise.resolve({ data: null });
      }
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest')
      ) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-demo-refresh',
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

    await renderDraftDetailPage('draft-demo-refresh');
    fireEvent.click(
      screen.getAllByRole('button', { name: /Run demo flow/i })[0],
    );

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/demo/flow', {
        draftId: 'draft-demo-refresh',
      }),
    );
    await waitFor(() => expect(arcCalls).toBeGreaterThan(1));

    expect(
      screen.getByText(/Demo flow complete\. New fix request and PR created/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Failed to run demo flow\./i),
    ).not.toBeInTheDocument();
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
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest')
      ) {
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
          stakePoints: 10,
        },
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Mark seen/i }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/observers/digest/entry-1/seen',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Following/i }));
    await waitFor(() =>
      expect(apiClient.delete).toHaveBeenCalledWith(
        '/observers/watchlist/draft-follow',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Follow chain/i }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/observers/watchlist/draft-follow',
      ),
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

  test('uses cooldown after summary refresh throttling on prediction submit', async () => {
    let predictionSummaryRequestCount = 0;

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
              id: 'pr-cooldown',
              status: 'pending',
              description: 'Pending PR for cooldown',
              makerId: 'maker-cooldown',
            },
          ],
        });
      }
      if (url.includes('/predictions')) {
        predictionSummaryRequestCount += 1;
        if (predictionSummaryRequestCount === 1) {
          return Promise.resolve({
            data: {
              pullRequestId: 'pr-cooldown',
              pullRequestStatus: 'pending',
              consensus: { merge: 4, reject: 2, total: 6 },
              observerPrediction: null,
              accuracy: { correct: 2, total: 5, rate: 0.4 },
              market: { minStakePoints: 5, maxStakePoints: 500 },
            },
          });
        }
        return Promise.reject({
          response: { status: 429, data: { message: 'Too many requests' } },
        });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest') ||
        url.includes('/me/following')
      ) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-prediction-cooldown',
            currentVersion: 1,
            glowUpScore: 0.9,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-prediction-cooldown');

    fireEvent.click(screen.getByRole('button', { name: /Predict merge/i }));

    await waitFor(() =>
      expect(
        screen.getByText(
          /Too many prediction requests\. Please try again shortly\./i,
        ),
      ).toBeInTheDocument(),
    );
    expect(predictionSummaryRequestCount).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: /Predict reject/i }));

    await waitFor(() => {
      const predictionSubmitCalls = (apiClient.post as jest.Mock).mock.calls
        .map((call) => call[0])
        .filter(
          (url) =>
            typeof url === 'string' &&
            url.includes('/pull-requests/pr-cooldown/predict'),
        );
      expect(predictionSubmitCalls).toHaveLength(2);
    });
    expect(predictionSummaryRequestCount).toBe(2);
  });

  test('maps prediction submit stake validation code to localized range message', async () => {
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
            market: {
              minStakePoints: 5,
              maxStakePoints: 120,
            },
            accuracy: { correct: 4, total: 8, rate: 0.5 },
          },
        });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest')
      ) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-prediction-error',
            currentVersion: 1,
            glowUpScore: 2.1,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });
    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/pull-requests/pr-pending/predict')) {
        return Promise.reject({
          response: {
            status: 400,
            data: {
              error: 'PREDICTION_STAKE_INVALID',
              message: 'raw backend stake error',
            },
          },
        });
      }
      return Promise.resolve({ data: { status: 'ok' } });
    });

    await renderDraftDetailPage('draft-prediction-error');

    fireEvent.click(screen.getByRole('button', { name: /Predict merge/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/pull-requests/pr-pending/predict',
        {
          predictedOutcome: 'merge',
          stakePoints: 10,
        },
      ),
    );

    expect(
      await screen.findByText(/Stake must be in range:\s*5-120 FIN\./i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/raw backend stake error/i)).toBeNull();
  });

  test('renders orchestration notifications from nested realtime payloads', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests') && !url.includes('/predictions')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (url.includes('/observers/watchlist')) {
        return Promise.resolve({ data: [{ draft_id: 'draft-orch-events' }] });
      }
      if (url.includes('/observers/digest')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-orch-events',
            currentVersion: 1,
            glowUpScore: 2.9,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-orch-events');

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-orch-step',
        scope: 'post:draft-orch-events',
        type: 'agent_gateway_orchestration_step',
        sequence: 1,
        payload: {
          data: {
            role: 'maker',
            failed: false,
            selectedProvider: 'gpt-4.1',
            attempts: [
              {
                provider: 'claude-4',
                status: 'failed',
                latencyMs: 920,
                errorCode: 'AI_PROVIDER_TIMEOUT',
              },
              {
                provider: 'gpt-4.1',
                status: 'success',
                latencyMs: 340,
                errorCode: null,
              },
            ],
          },
        },
      });
      __socket.__trigger('event', {
        id: 'evt-orch-complete',
        scope: 'post:draft-orch-events',
        type: 'agent_gateway_orchestration_completed',
        sequence: 2,
        payload: {
          data: {
            stepCount: 3,
          },
        },
      });
      __socket.__trigger('event', {
        id: 'evt-orch-compact',
        scope: 'post:draft-orch-events',
        type: 'agent_gateway_session_compacted',
        sequence: 3,
        payload: {
          data: {
            keepRecent: 2,
            prunedCount: 4,
            totalBefore: 6,
            totalAfter: 3,
          },
        },
      });
      await Promise.resolve();
    });
    await flushAsyncState();

    expect(
      screen.getAllByText(/Orchestration step \(maker\)/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Orchestration cycle completed \(3\)/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Orchestration context compacted \(4\)/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Orchestration timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Provider:\s+gpt-4.1/i)).toBeInTheDocument();
    expect(screen.getByText(/Attempts:\s+2/i)).toBeInTheDocument();
    expect(
      screen.getByText(/claude-4 • failed • 920ms • AI_PROVIDER_TIMEOUT/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/gpt-4.1 • success • 340ms/i)).toBeInTheDocument();
    expect(screen.getByText(/Steps:\s+3/i)).toBeInTheDocument();
    expect(screen.getByText(/Pruned events:\s+4/i)).toBeInTheDocument();
    expect(screen.getByText(/Kept recent:\s+2/i)).toBeInTheDocument();
  });

  test('filters orchestration timeline by type, query, and limit', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests') && !url.includes('/predictions')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (url.includes('/observers/watchlist')) {
        return Promise.resolve({ data: [{ draft_id: 'draft-orch-filters' }] });
      }
      if (url.includes('/observers/digest')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-orch-filters',
            currentVersion: 1,
            glowUpScore: 2.1,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-orch-filters');

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      const stepRoles = ['critic', 'maker', 'author', 'judge', 'planner'];
      for (const [index, role] of stepRoles.entries()) {
        __socket.__trigger('event', {
          id: `evt-orch-filter-step-${index + 1}`,
          scope: 'post:draft-orch-filters',
          type: 'agent_gateway_orchestration_step',
          sequence: index + 1,
          payload: {
            data: {
              role,
              failed: false,
              selectedProvider: `provider-${role}`,
              attempts: [],
            },
          },
        });
      }
      __socket.__trigger('event', {
        id: 'evt-orch-filter-completed',
        scope: 'post:draft-orch-filters',
        type: 'agent_gateway_orchestration_completed',
        sequence: 6,
        payload: { data: { stepCount: 5 } },
      });
      await Promise.resolve();
    });
    await flushAsyncState();

    const orchestrationCard = screen.getByTestId('orchestration-card');
    const card = within(orchestrationCard);

    expect(
      card.getByText(/Orchestration cycle completed/i),
    ).toBeInTheDocument();
    expect(
      card.getByText(/Orchestration step \(critic\)/i),
    ).toBeInTheDocument();

    fireEvent.change(card.getByTestId('orchestration-type-filter'), {
      target: { value: 'step' },
    });
    expect(
      card.queryByText(/Orchestration cycle completed/i),
    ).not.toBeInTheDocument();

    fireEvent.change(card.getByTestId('orchestration-query-filter'), {
      target: { value: 'judge' },
    });
    expect(card.getByText(/Orchestration step \(judge\)/i)).toBeInTheDocument();
    expect(card.queryByText(/Orchestration step \(maker\)/i)).toBeNull();

    fireEvent.change(card.getByTestId('orchestration-query-filter'), {
      target: { value: '' },
    });
    fireEvent.change(card.getByTestId('orchestration-limit-filter'), {
      target: { value: '4' },
    });
    expect(card.queryByText(/Orchestration step \(critic\)/i)).toBeNull();
    expect(card.getByText(/Orchestration step \(maker\)/i)).toBeInTheDocument();
  });

  test('shows followed studios section and streams updates for followed studio drafts', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests') && !url.includes('/predictions')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (url.includes('/observers/watchlist')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/observers/digest')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/me/following')) {
        return Promise.resolve({
          data: [
            {
              id: 'studio-followed',
              studioName: 'Studio Followed',
              impact: 88,
              signal: 92,
              followerCount: 14,
            },
          ],
        });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-studio-follow',
            authorId: 'studio-followed',
            currentVersion: 1,
            glowUpScore: 2.4,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-studio-follow');

    expect(screen.getByText(/From studios you follow/i)).toBeInTheDocument();
    expect(screen.getByText(/Studio Followed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/You follow the studio behind this draft/i),
    ).toBeInTheDocument();

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-studio-followed',
        scope: 'post:draft-studio-follow',
        type: 'fix_request',
        sequence: 1,
        payload: {},
      });
      await Promise.resolve();
    });
    await flushAsyncState();

    expect(screen.getByText(/New fix request submitted/i)).toBeInTheDocument();
  });

  test('keeps fix and pull request data when realtime refresh fails', async () => {
    let fixCalls = 0;
    let pullCalls = 0;

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/fix-requests')) {
        fixCalls += 1;
        if (fixCalls === 1) {
          return Promise.resolve({
            data: [
              {
                id: 'fix-keep',
                category: 'Focus',
                description: 'Keep this fix request',
                criticId: 'critic-keep',
              },
            ],
          });
        }
        return Promise.reject({
          response: { data: { message: 'Fix refresh failed' } },
        });
      }
      if (url.includes('/pull-requests') && !url.includes('/predictions')) {
        pullCalls += 1;
        if (pullCalls === 1) {
          return Promise.resolve({
            data: [
              {
                id: 'pr-keep',
                status: 'pending',
                description: 'Keep this pull request',
                makerId: 'maker-keep',
              },
            ],
          });
        }
        return Promise.reject({
          response: { data: { message: 'Pull refresh failed' } },
        });
      }
      if (url.includes('/predictions')) {
        return Promise.resolve({
          data: {
            pullRequestId: 'pr-keep',
            pullRequestStatus: 'pending',
            consensus: { merge: 0, reject: 0, total: 0 },
            observerPrediction: null,
            accuracy: { correct: 0, total: 0, rate: 0 },
          },
        });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest')
      ) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-refresh-failure',
            currentVersion: 1,
            glowUpScore: 1.1,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-refresh-failure');

    expect(screen.getByText(/Keep this fix request/i)).toBeInTheDocument();
    expect(screen.getByText(/Keep this pull request/i)).toBeInTheDocument();

    const { __socket } = jest.requireMock('../lib/socket');
    await act(async () => {
      __socket.__trigger('event', {
        id: 'evt-refresh-failure',
        scope: 'post:draft-refresh-failure',
        type: 'fix_request',
        sequence: 1,
        payload: {},
      });
      await Promise.resolve();
    });
    await flushAsyncState();

    await waitFor(() => expect(fixCalls).toBeGreaterThan(1));
    await waitFor(() => expect(pullCalls).toBeGreaterThan(1));

    expect(screen.getByText(/Keep this fix request/i)).toBeInTheDocument();
    expect(screen.getByText(/Keep this pull request/i)).toBeInTheDocument();
    expect(screen.queryByText(/Fix refresh failed/i)).toBeNull();
    expect(screen.queryByText(/Pull refresh failed/i)).toBeNull();
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
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest')
      ) {
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

  test('shows localized rate-limit hint when prediction summary is throttled', async () => {
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
              id: 'pr-rate-limit',
              status: 'pending',
              description: 'Pending PR',
              makerId: 'maker-rate-limit',
            },
          ],
        });
      }
      if (url.includes('/predictions')) {
        return Promise.reject({
          response: { status: 429, data: { message: 'Too many requests' } },
        });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest')
      ) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-prediction-summary-rate-limit',
            currentVersion: 1,
            glowUpScore: 0.5,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });

    await renderDraftDetailPage('draft-prediction-summary-rate-limit');

    expect(
      screen.getByText(
        /Too many prediction requests\. Please try again shortly\./i,
      ),
    ).toBeInTheDocument();
  });

  test('generates style fusion from similar drafts and shows result', async () => {
    const writeTextMock = jest.fn(() => Promise.resolve());
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({
          data: [
            {
              id: 'sim-a',
              title: 'Similar Draft A',
              score: 0.91,
              glowUpScore: 4.2,
              type: 'draft',
            },
            {
              id: 'sim-b',
              title: 'Similar Draft B',
              score: 0.87,
              glowUpScore: 3.9,
              type: 'draft',
            },
          ],
        });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests') && !url.includes('/predictions')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest') ||
        url.includes('/me/following')
      ) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-style-fusion',
            currentVersion: 1,
            glowUpScore: 1.4,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });
    (apiClient.post as jest.Mock).mockImplementation(
      (url: string, payload?: Record<string, unknown>) => {
        if (url === '/search/style-fusion') {
          return Promise.resolve({
            data: {
              draftId: 'draft-style-fusion',
              generatedAt: new Date().toISOString(),
              titleSuggestion: 'Fusion: Similar Draft A x Similar Draft B',
              styleDirectives: ['Preserve composition anchors.'],
              winningPrHints: ['Reuse merged PR sequencing.'],
              sample: [
                {
                  id: 'sim-a',
                  title: 'Similar Draft A',
                  score: 0.91,
                  glowUpScore: 4.2,
                  type: 'draft',
                },
                {
                  id: 'sim-b',
                  title: 'Similar Draft B',
                  score: 0.87,
                  glowUpScore: 3.9,
                  type: 'draft',
                },
              ],
            },
          });
        }
        if (url === '/telemetry/ux') {
          return Promise.resolve({ data: { status: 'ok', payload } });
        }
        return Promise.resolve({ data: { status: 'ok' } });
      },
    );

    await renderDraftDetailPage('draft-style-fusion');

    fireEvent.click(
      screen.getByRole('button', { name: /Generate style fusion/i }),
    );

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/search/style-fusion', {
        draftId: 'draft-style-fusion',
        limit: 3,
        type: 'draft',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Fusion: Similar Draft A x Similar Draft B/i),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Preserve composition anchors\./i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Sample drafts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Similar Draft A/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Copy fusion brief/i }));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(1));
    expect(writeTextMock.mock.calls[0]?.[0]).toContain(
      'Fusion: Similar Draft A x Similar Draft B',
    );
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('Style directives');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('Sample drafts');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Fusion brief copied/i }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/telemetry/ux',
        expect.objectContaining({
          draftId: 'draft-style-fusion',
          eventType: 'style_fusion_copy_brief',
          metadata: expect.objectContaining({
            sampleCount: 2,
            status: 'success',
          }),
          source: 'draft_detail',
        }),
      ),
    );
  });

  test('shows copy error and emits failed style fusion copy telemetry', async () => {
    const writeTextMock = jest.fn(() => Promise.reject(new Error('denied')));
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({
          data: [
            {
              id: 'sim-a',
              title: 'Similar Draft A',
              score: 0.91,
              glowUpScore: 4.2,
              type: 'draft',
            },
          ],
        });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests') && !url.includes('/predictions')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest') ||
        url.includes('/me/following')
      ) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-style-fusion-copy-failed',
            currentVersion: 1,
            glowUpScore: 1.4,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });
    (apiClient.post as jest.Mock).mockImplementation(
      (url: string, payload?: Record<string, unknown>) => {
        if (url === '/search/style-fusion') {
          return Promise.resolve({
            data: {
              draftId: 'draft-style-fusion-copy-failed',
              generatedAt: new Date().toISOString(),
              titleSuggestion: 'Fusion: Similar Draft A',
              styleDirectives: ['Preserve composition anchors.'],
              winningPrHints: ['Reuse merged PR sequencing.'],
              sample: [
                {
                  id: 'sim-a',
                  title: 'Similar Draft A',
                  score: 0.91,
                  glowUpScore: 4.2,
                  type: 'draft',
                },
              ],
            },
          });
        }
        if (url === '/telemetry/ux') {
          return Promise.resolve({ data: { status: 'ok', payload } });
        }
        return Promise.resolve({ data: { status: 'ok' } });
      },
    );

    await renderDraftDetailPage('draft-style-fusion-copy-failed');

    fireEvent.click(
      screen.getByRole('button', { name: /Generate style fusion/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Fusion: Similar Draft A/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /Copy fusion brief/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Copy failed/i }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/telemetry/ux',
        expect.objectContaining({
          draftId: 'draft-style-fusion-copy-failed',
          eventType: 'style_fusion_copy_brief',
          metadata: expect.objectContaining({
            errorCode: 'CLIPBOARD_WRITE_FAILED',
            sampleCount: 1,
            status: 'failed',
          }),
          source: 'draft_detail',
        }),
      ),
    );
  });

  test('shows style fusion error when generation fails', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/search/similar')) {
        return Promise.resolve({
          data: [
            {
              id: 'sim-x',
              title: 'Similar X',
              score: 0.81,
              glowUpScore: 2.6,
              type: 'draft',
            },
            {
              id: 'sim-y',
              title: 'Similar Y',
              score: 0.79,
              glowUpScore: 2.4,
              type: 'draft',
            },
          ],
        });
      }
      if (url.includes('/fix-requests')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/pull-requests') && !url.includes('/predictions')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/arc')) {
        return Promise.resolve({ data: null });
      }
      if (
        url.includes('/observers/watchlist') ||
        url.includes('/observers/digest') ||
        url.includes('/me/following')
      ) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          draft: {
            id: 'draft-style-fusion-error',
            currentVersion: 1,
            glowUpScore: 1.1,
            status: 'draft',
            updatedAt: new Date().toISOString(),
          },
          versions: [],
        },
      });
    });
    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url === '/search/style-fusion') {
        return Promise.reject({
          response: { status: 500, data: { message: 'Fusion failed' } },
        });
      }
      return Promise.resolve({ data: { status: 'ok' } });
    });

    await renderDraftDetailPage('draft-style-fusion-error');

    fireEvent.click(
      screen.getByRole('button', { name: /Generate style fusion/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Fusion failed/i)).toBeInTheDocument(),
    );
  });
});
