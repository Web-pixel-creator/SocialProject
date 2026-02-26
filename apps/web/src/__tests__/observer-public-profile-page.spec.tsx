/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import ObserverPublicProfilePage from '../app/observers/[id]/page';
import { apiClient } from '../lib/api';

let mockParams: Record<string, string | undefined> = { id: 'observer-1' };

jest.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

const profilePayload = {
  observer: {
    id: 'observer-1',
    handle: 'observer-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  counts: {
    followingStudios: 2,
    watchlistDrafts: 3,
  },
  predictions: {
    correct: 4,
    total: 5,
    rate: 0.8,
    netPoints: 22,
    streak: {
      current: 2,
      best: 5,
    },
    recentWindow: {
      size: 10,
      resolved: 4,
      correct: 3,
      rate: 0.75,
    },
    timeWindows: {
      d7: {
        days: 7,
        resolved: 2,
        correct: 1,
        rate: 0.5,
        netPoints: 5,
      },
      d30: {
        days: 30,
        resolved: 9,
        correct: 7,
        rate: 0.78,
        netPoints: 31,
      },
    },
    lastResolved: {
      id: 'pred-1',
      pullRequestId: 'pr-1',
      draftId: 'draft-1',
      draftTitle: 'Watchlist Draft',
      predictedOutcome: 'merge',
      resolvedOutcome: 'merge',
      isCorrect: true,
      stakePoints: 20,
      payoutPoints: 28,
      createdAt: '2026-02-01T10:00:00.000Z',
      resolvedAt: '2026-02-01T11:00:00.000Z',
      netPoints: 8,
    },
    market: {
      trustTier: 'trusted',
      minStakePoints: 5,
      maxStakePoints: 320,
      dailyStakeCapPoints: 1000,
      dailyStakeUsedPoints: 180,
      dailyStakeRemainingPoints: 820,
      dailySubmissionCap: 30,
      dailySubmissionsUsed: 4,
      dailySubmissionsRemaining: 26,
    },
  },
  followingStudios: [
    {
      id: 'studio-1',
      studioName: 'Studio One',
      impact: 12,
      signal: 71,
      followerCount: 10,
      followedAt: '2026-02-01T10:00:00.000Z',
    },
  ],
  watchlistHighlights: [
    {
      draftId: 'draft-1',
      draftTitle: 'Watchlist Draft',
      updatedAt: '2026-02-01T10:00:00.000Z',
      glowUpScore: 18.5,
      studioId: 'studio-1',
      studioName: 'Studio One',
    },
  ],
  recentPredictions: [
    {
      id: 'pred-1',
      pullRequestId: 'pr-1',
      draftId: 'draft-1',
      draftTitle: 'Watchlist Draft',
      predictedOutcome: 'merge',
      resolvedOutcome: 'merge',
      isCorrect: true,
      stakePoints: 20,
      payoutPoints: 28,
      createdAt: '2026-02-01T10:00:00.000Z',
      resolvedAt: '2026-02-01T11:00:00.000Z',
    },
  ],
};

describe('observer public profile page', () => {
  const renderPage = () =>
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <ObserverPublicProfilePage />
      </SWRConfig>,
    );

  beforeEach(() => {
    mockParams = { id: 'observer-1' };
    (apiClient.get as jest.Mock).mockReset();
  });

  test('renders observer public profile data', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: profilePayload });

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Observer profile/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Observer summary/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Following studios/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Watchlist highlights/i)).toBeInTheDocument();
    expect(screen.getByText(/Recent predictions/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Studio One/i })).toHaveAttribute(
      'href',
      '/studios/studio-1',
    );
    expect(
      screen.getAllByRole('link', { name: /Watchlist Draft/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Prediction tier/i)).toBeInTheDocument();
    expect(screen.getByText(/Trusted/i)).toBeInTheDocument();
    expect(screen.getByText(/Current streak/i)).toBeInTheDocument();
    expect(screen.getByText(/Best:\s*5/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Recent resolved accuracy \(10\):\s*75% \(3\/4\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /7d:\s*50% \(1\/2\),\s*Net:\s*\+5 \| 30d:\s*78% \(7\/9\),\s*Net:\s*\+31/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Last resolved:\s*Correct \|\s*Net:\s*\+8 \|\s*Watchlist Draft/i,
      ),
    ).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith(
      '/observers/observer-1/profile',
      {
        params: {
          followingLimit: 8,
          watchlistLimit: 8,
          predictionLimit: 8,
        },
      },
    );
  });

  test('shows API error and supports retry', async () => {
    (apiClient.get as jest.Mock)
      .mockRejectedValueOnce({
        response: { data: { message: 'Public profile load failed' } },
      })
      .mockResolvedValueOnce({ data: profilePayload });

    renderPage();

    expect(
      await screen.findByText(/Public profile load failed/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Resync now/i }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
  });

  test('renders not found fallback when observer profile does not exist', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { status: 404, data: { message: 'Observer not found.' } },
    });

    renderPage();

    expect(
      await screen.findByText(/Observer profile not found/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Explore feeds/i }),
    ).toHaveAttribute('href', '/feed');
    expect(
      screen.getByRole('link', { name: /My observer profile/i }),
    ).toHaveAttribute('href', '/observer/profile');
  });

  test('renders fallback state when observer id is missing', () => {
    mockParams = {};

    renderPage();

    expect(
      screen.getByRole('heading', { name: /Observer profile/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Explore feeds/i }),
    ).toHaveAttribute('href', '/feed');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  test('filters public recent predictions by pending and resolved status', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        ...profilePayload,
        recentPredictions: [
          {
            id: 'pred-resolved',
            pullRequestId: 'pr-resolved',
            draftId: 'draft-resolved',
            draftTitle: 'Resolved Draft Public',
            predictedOutcome: 'merge',
            resolvedOutcome: 'merge',
            isCorrect: true,
            stakePoints: 20,
            payoutPoints: 30,
            createdAt: '2026-02-01T10:00:00.000Z',
            resolvedAt: '2026-02-01T11:00:00.000Z',
          },
          {
            id: 'pred-pending',
            pullRequestId: 'pr-pending',
            draftId: 'draft-pending',
            draftTitle: 'Pending Draft Public',
            predictedOutcome: 'reject',
            resolvedOutcome: null,
            isCorrect: null,
            stakePoints: 14,
            payoutPoints: 0,
            createdAt: '2026-02-01T12:00:00.000Z',
            resolvedAt: null,
          },
        ],
      },
    });

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Pending/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Resolved Draft Public/i)).toBeInTheDocument();
    expect(screen.getByText(/Pending Draft Public/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pending/i }));
    expect(screen.queryByText(/Resolved Draft Public/i)).toBeNull();
    expect(screen.getByText(/Pending Draft Public/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Resolved/i }));
    expect(screen.getByText(/Resolved Draft Public/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pending Draft Public/i)).toBeNull();
  });
});
