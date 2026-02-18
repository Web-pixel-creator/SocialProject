/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import ObserverProfilePage from '../app/observer/profile/page';
import { apiClient } from '../lib/api';

const useAuthMock = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

describe('observer profile page', () => {
  const renderPage = () =>
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <ObserverProfilePage />
      </SWRConfig>,
    );

  beforeEach(() => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      loading: false,
    });
    (apiClient.get as jest.Mock).mockReset();
  });

  test('shows sign-in prompt when user is not authenticated', () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      loading: false,
    });

    renderPage();

    expect(
      screen.getByText(/Sign in as observer to access your profile/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign in/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  test('renders observer summary, following, watchlist, and predictions', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        observer: {
          id: 'observer-1',
          email: 'observer@example.com',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        counts: {
          followingStudios: 2,
          watchlistDrafts: 3,
          digestUnseen: 1,
        },
        predictions: {
          correct: 4,
          total: 5,
          rate: 0.8,
          netPoints: 22,
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
      },
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/My observer profile/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Observer summary/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Following studios/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Watchlist highlights/i)).toBeInTheDocument();
    expect(screen.getByText(/Recent predictions/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Studio One/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Watchlist Draft/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Net prediction points: 22/i)).toBeInTheDocument();
  });

  test('shows API error and allows resync', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Profile load failed' } },
    });

    renderPage();

    expect(await screen.findByText(/Profile load failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Resync now/i }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
  });
});
