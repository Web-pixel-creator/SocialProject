/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import PullRequestReviewPage from '../app/pull-requests/[id]/page';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

describe('pull request review page', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockReset();
  });

  const baseReviewPayload = {
    pullRequest: {
      id: 'pr-1',
      draftId: 'draft-1',
      makerId: 'maker-1',
      proposedVersion: 2,
      description: 'Improve layout',
      severity: 'minor' as const,
      status: 'pending' as const,
      addressedFixRequests: ['fix-1'],
    },
    draft: {
      id: 'draft-1',
      authorId: 'author-1',
      status: 'draft' as const,
      currentVersion: 1,
      glowUpScore: 2.5,
    },
    authorStudio: 'Studio A',
    makerStudio: 'Studio B',
    beforeImageUrl: 'before.png',
    afterImageUrl: 'after.png',
    metrics: {
      currentGlowUp: 2.5,
      predictedGlowUp: 3.5,
      glowUpDelta: 1.0,
      impactDelta: 3,
    },
  };

  const baseFixRequests = [
    {
      id: 'fix-1',
      category: 'Layout',
      description: 'Fix spacing',
      criticId: 'critic-1',
    },
    {
      id: 'fix-2',
      category: 'Color',
      description: 'Adjust palette',
      criticId: 'critic-2',
    },
  ];

  const mockSuccessfulLoad = (overrides?: {
    review?: Partial<typeof baseReviewPayload> | null;
    fixRequests?: typeof baseFixRequests;
    telemetryReject?: boolean;
  }) => {
    const review =
      overrides?.review === null
        ? null
        : {
            ...baseReviewPayload,
            ...(overrides?.review ?? {}),
          };
    const fixRequests = overrides?.fixRequests ?? baseFixRequests;

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/pull-requests/')) {
        return Promise.resolve({ data: review });
      }
      return Promise.resolve({ data: fixRequests });
    });

    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url === '/telemetry/ux') {
        if (overrides?.telemetryReject) {
          return Promise.reject(new Error('telemetry down'));
        }
        return Promise.resolve({ data: { ok: true } });
      }
      return Promise.resolve({ data: { ok: true } });
    });
  };

  const renderReviewPage = async (id: string) => {
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <PullRequestReviewPage params={{ id }} />
      </SWRConfig>,
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/Loading pull request/i),
      ).not.toBeInTheDocument(),
    );
  };

  test('renders review data and metrics', async () => {
    mockSuccessfulLoad();

    await renderReviewPage('pr-1');

    await waitFor(() =>
      expect(screen.getByText(/PR Review/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Studio B\s+->\s+Studio A/i)).toBeInTheDocument();
    expect(screen.getByText(/Improve layout/i)).toBeInTheDocument();
    expect(screen.getByText(/Current GlowUp/i)).toBeInTheDocument();
    expect(screen.getByText(/Predicted GlowUp/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact .*maker/i)).toBeInTheDocument();
    expect(screen.getByText(/Fix spacing/i)).toBeInTheDocument();
    expect(screen.queryByText(/Adjust palette/i)).toBeNull();
  });

  test('requires rejection reason', async () => {
    mockSuccessfulLoad({
      review: {
        pullRequest: {
          ...baseReviewPayload.pullRequest,
          id: 'pr-2',
          draftId: 'draft-2',
          makerId: 'maker-2',
          description: 'Improve color',
          addressedFixRequests: [],
        },
        draft: {
          ...baseReviewPayload.draft,
          id: 'draft-2',
          authorId: 'author-2',
          glowUpScore: 1.2,
        },
        metrics: {
          currentGlowUp: 1.2,
          predictedGlowUp: 2.2,
          glowUpDelta: 1,
          impactDelta: 3,
        },
      },
      fixRequests: [],
    });

    await renderReviewPage('pr-2');

    const rejectButton = await screen.findByRole('button', { name: /Reject/i });
    fireEvent.click(rejectButton);

    await waitFor(() =>
      expect(
        screen.getByText(/Rejection reason is required/i),
      ).toBeInTheDocument(),
    );
  });

  test('shows not-found state when review payload is empty', async () => {
    mockSuccessfulLoad({ review: null });
    await renderReviewPage('missing-pr');
    expect(screen.getByText(/Pull request not found/i)).toBeInTheDocument();
  });

  test('shows load error when initial request fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Load failed from API' } },
    });

    await renderReviewPage('pr-load-error');
    expect(screen.getByText(/Load failed from API/i)).toBeInTheDocument();
  });

  test('keeps review page available when fix requests endpoint fails', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/pull-requests/')) {
        return Promise.resolve({ data: baseReviewPayload });
      }
      if (url.includes('/drafts/') && url.includes('/fix-requests')) {
        return Promise.reject({
          response: { data: { message: 'Fix request load failed' } },
        });
      }
      return Promise.resolve({ data: [] });
    });
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { ok: true } });

    await renderReviewPage('pr-fix-fallback');

    expect(screen.getByText(/PR Review/i)).toBeInTheDocument();
    expect(screen.getByText(/Improve layout/i)).toBeInTheDocument();
    expect(screen.queryByText(/Fix request load failed/i)).toBeNull();
  });

  test('keeps previous fix requests visible when post-decision refresh fails', async () => {
    let fixRequestFetchCount = 0;
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/pull-requests/')) {
        return Promise.resolve({ data: baseReviewPayload });
      }
      if (url.includes('/drafts/') && url.includes('/fix-requests')) {
        fixRequestFetchCount += 1;
        if (fixRequestFetchCount === 1) {
          return Promise.resolve({ data: baseFixRequests });
        }
        return Promise.reject({
          response: { data: { message: 'Fix refresh failed' } },
        });
      }
      return Promise.resolve({ data: [] });
    });
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { ok: true } });

    await renderReviewPage('pr-fix-refresh');

    expect(screen.getByText(/Fix spacing/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Request changes/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/pull-requests/pr-1/decide',
        {
          decision: 'request_changes',
          rejectionReason: undefined,
          feedback: undefined,
        },
      );
    });

    expect(screen.getByText(/Fix spacing/i)).toBeInTheDocument();
    expect(screen.queryByText(/Fix refresh failed/i)).toBeNull();
  });

  test('submits request changes without telemetry decision event', async () => {
    mockSuccessfulLoad();

    await renderReviewPage('pr-1');
    fireEvent.change(
      screen.getByPlaceholderText(/Add feedback \(optional\)/i),
      {
        target: { value: 'Please tighten spacing and typography rhythm.' },
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /Request changes/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/pull-requests/pr-1/decide',
        {
          decision: 'request_changes',
          rejectionReason: undefined,
          feedback: 'Please tighten spacing and typography rhythm.',
        },
      );
    });

    const telemetryCalls = (apiClient.post as jest.Mock).mock.calls.filter(
      (call) =>
        call[0] === '/telemetry/ux' &&
        ['pr_merge', 'pr_reject'].includes(call[1]?.eventType),
    );
    expect(telemetryCalls).toHaveLength(0);
  });

  test('supports keyboard shortcuts and ignores them in text inputs', async () => {
    mockSuccessfulLoad({ telemetryReject: true });

    await renderReviewPage('pr-1');

    fireEvent.keyDown(window, { key: 'm' });
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/pull-requests/pr-1/decide',
        {
          decision: 'merge',
          rejectionReason: undefined,
          feedback: undefined,
        },
      );
    });

    const rejectInput = screen.getByPlaceholderText(
      /Rejection reason \(required for reject\)/i,
    );
    fireEvent.change(rejectInput, {
      target: { value: 'Need stronger proof.' },
    });
    fireEvent.keyDown(rejectInput, { key: 'r' });

    const rejectCallsAfterInputKeydown = (
      apiClient.post as jest.Mock
    ).mock.calls.filter(
      (call) =>
        call[0] === '/pull-requests/pr-1/decide' &&
        call[1]?.decision === 'reject',
    );
    expect(rejectCallsAfterInputKeydown).toHaveLength(0);

    fireEvent.keyDown(window, { key: 'r' });
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/pull-requests/pr-1/decide',
        {
          decision: 'reject',
          rejectionReason: 'Need stronger proof.',
          feedback: undefined,
        },
      );
    });
  });

  test('shows decision error when decision request fails', async () => {
    mockSuccessfulLoad();
    (apiClient.post as jest.Mock).mockImplementation(
      (url: string, payload: unknown) => {
        if (url === '/telemetry/ux') {
          return Promise.resolve({ data: { ok: true } });
        }
        if (
          url === '/pull-requests/pr-1/decide' &&
          typeof payload === 'object' &&
          payload !== null &&
          (payload as { decision?: string }).decision === 'merge'
        ) {
          return Promise.reject({
            response: { data: { message: 'Decision API failed' } },
          });
        }
        return Promise.resolve({ data: { ok: true } });
      },
    );

    await renderReviewPage('pr-1');
    fireEvent.click(screen.getByRole('button', { name: /Merge \(M\)/i }));

    expect(await screen.findByText(/Decision API failed/i)).toBeInTheDocument();
  });
});
