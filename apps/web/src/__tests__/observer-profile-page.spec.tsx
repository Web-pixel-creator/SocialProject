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
    put: jest.fn(),
    delete: jest.fn(),
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
    (apiClient.put as jest.Mock).mockReset();
    (apiClient.delete as jest.Mock).mockReset();
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
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/observers/me/profile') {
        return Promise.resolve({
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
              streak: {
                current: 3,
                best: 7,
              },
              recentWindow: {
                size: 10,
                resolved: 5,
                correct: 4,
                rate: 0.8,
              },
              timeWindows: {
                d7: {
                  days: 7,
                  resolved: 3,
                  correct: 2,
                  rate: 0.67,
                  netPoints: 9,
                  riskLevel: 'watch',
                },
                d30: {
                  days: 30,
                  resolved: 8,
                  correct: 6,
                  rate: 0.75,
                  netPoints: 24,
                  riskLevel: 'critical',
                },
              },
              thresholds: {
                resolutionWindows: {
                  accuracyRate: {
                    criticalBelow: 0.47,
                    watchBelow: 0.62,
                  },
                  minResolvedPredictions: 2,
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
          },
        });
      }
      if (url === '/observers/digest') {
        return Promise.resolve({
          data: [
            {
              id: 'digest-1',
              draftId: 'draft-1',
              title: 'Studio One updated draft',
              summary: 'Merged PR and improved GlowUp',
              latestMilestone: 'Draft released',
              studioId: 'studio-1',
              studioName: 'Studio One',
              fromFollowingStudio: true,
              isSeen: false,
              createdAt: '2026-02-01T12:00:00.000Z',
            },
          ],
        });
      }
      if (url === '/observers/me/preferences') {
        return Promise.resolve({
          data: {
            digest: {
              unseenOnly: false,
              followingOnly: false,
              updatedAt: '2026-02-01T12:00:00.000Z',
            },
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    (apiClient.put as jest.Mock).mockResolvedValue({
      data: {
        digest: {
          unseenOnly: true,
          followingOnly: false,
          updatedAt: '2026-02-01T12:05:00.000Z',
        },
      },
    });
    (apiClient.delete as jest.Mock).mockResolvedValue({ data: { ok: true } });

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
    expect(screen.getByText(/From studios you follow/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Studio One updated draft/i }),
    ).toHaveAttribute('href', '/drafts/draft-1');
    expect(screen.getByRole('link', { name: /^Studio One$/i })).toHaveAttribute(
      'href',
      '/studios/studio-1',
    );
    expect(
      screen.getByRole('link', { name: /Open following feed/i }),
    ).toHaveAttribute('href', '/feed?tab=Following');
    expect(
      screen.getByRole('link', { name: /Open public profile/i }),
    ).toHaveAttribute('href', '/observers/observer-1');
    expect(screen.getAllByText(/Watchlist Draft/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Net prediction points: 22/i)).toBeInTheDocument();
    expect(screen.getByText(/Current streak/i)).toBeInTheDocument();
    expect(screen.getByText(/Best:\s*7/i)).toBeInTheDocument();
    expect(screen.getByText(/Prediction tier: Trusted/i)).toBeInTheDocument();
    expect(screen.getByText(/Daily stake:\s*180\/1000/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Recent resolved accuracy \(10\):\s*80% \(4\/5\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /7d:\s*67% \(2\/3\),\s*Net:\s*\+9 \| 30d:\s*75% \(6\/8\),\s*Net:\s*\+24/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /7d risk:\s*Watch \|\s*30d risk:\s*Critical \|\s*min sample:\s*2 \|\s*thresholds:\s*watch <62%,\s*critical <47%/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Last resolved:\s*Correct \|\s*Net:\s*\+8 \|\s*Watchlist Draft/i,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Unseen only/i }));
    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith('/observers/me/preferences', {
        digest: {
          unseenOnly: true,
        },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Unfollow studio/i }));
    await waitFor(() =>
      expect(apiClient.delete).toHaveBeenCalledWith('/studios/studio-1/follow'),
    );
  });

  test('shows API error and allows resync', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/observers/me/profile') {
        return Promise.reject({
          response: { data: { message: 'Profile load failed' } },
        });
      }
      if (url === '/observers/me/preferences') {
        return Promise.resolve({
          data: {
            digest: {
              unseenOnly: false,
              followingOnly: false,
              updatedAt: '2026-02-01T12:00:00.000Z',
            },
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderPage();

    expect(await screen.findByText(/Profile load failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Resync now/i }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(6));
  });

  test('filters recent predictions by pending and resolved status', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/observers/me/profile') {
        return Promise.resolve({
          data: {
            observer: {
              id: 'observer-2',
              email: 'observer2@example.com',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            counts: {
              followingStudios: 0,
              watchlistDrafts: 0,
              digestUnseen: 0,
            },
            predictions: {
              correct: 1,
              total: 1,
              rate: 1,
              netPoints: 6,
              streak: {
                current: 1,
                best: 3,
              },
              recentWindow: {
                size: 10,
                resolved: 1,
                correct: 1,
                rate: 1,
              },
              timeWindows: {
                d7: {
                  days: 7,
                  resolved: 1,
                  correct: 1,
                  rate: 1,
                  netPoints: 6,
                },
                d30: {
                  days: 30,
                  resolved: 2,
                  correct: 1,
                  rate: 0.5,
                  netPoints: 4,
                },
              },
              thresholds: {
                resolutionWindows: {
                  accuracyRate: {
                    criticalBelow: 0.45,
                    watchBelow: 0.6,
                  },
                  minResolvedPredictions: 3,
                },
              },
              lastResolved: {
                id: 'pred-resolved',
                pullRequestId: 'pr-resolved',
                draftId: 'draft-resolved',
                draftTitle: 'Resolved Draft',
                predictedOutcome: 'merge',
                resolvedOutcome: 'merge',
                isCorrect: true,
                stakePoints: 10,
                payoutPoints: 16,
                createdAt: '2026-02-01T10:00:00.000Z',
                resolvedAt: '2026-02-01T11:00:00.000Z',
                netPoints: 6,
              },
            },
            followingStudios: [],
            watchlistHighlights: [],
            recentPredictions: [
              {
                id: 'pred-resolved',
                pullRequestId: 'pr-resolved',
                draftId: 'draft-resolved',
                draftTitle: 'Resolved Draft',
                predictedOutcome: 'merge',
                resolvedOutcome: 'merge',
                isCorrect: true,
                stakePoints: 10,
                payoutPoints: 16,
                createdAt: '2026-02-01T10:00:00.000Z',
                resolvedAt: '2026-02-01T11:00:00.000Z',
              },
              {
                id: 'pred-pending',
                pullRequestId: 'pr-pending',
                draftId: 'draft-pending',
                draftTitle: 'Pending Draft',
                predictedOutcome: 'reject',
                resolvedOutcome: null,
                isCorrect: null,
                stakePoints: 12,
                payoutPoints: 0,
                createdAt: '2026-02-01T12:00:00.000Z',
                resolvedAt: null,
              },
            ],
          },
        });
      }
      if (url === '/observers/digest') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/observers/me/preferences') {
        return Promise.resolve({
          data: {
            digest: {
              unseenOnly: false,
              followingOnly: false,
              updatedAt: '2026-02-01T12:00:00.000Z',
            },
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Pending/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: /^Resolved Draft$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /^Pending Draft$/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pending/i }));
    expect(
      screen.queryByRole('link', { name: /^Resolved Draft$/i }),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: /^Pending Draft$/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Resolved/i }));
    expect(
      screen.getByRole('link', { name: /^Resolved Draft$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Pending Draft$/i })).toBeNull();
  });
});
