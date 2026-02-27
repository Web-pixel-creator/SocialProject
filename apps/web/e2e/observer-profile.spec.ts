import { expect, test } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const withJson = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

test.describe('Observer profile page', () => {
  test('shows auth-required prompt for anonymous user', async ({ page }) => {
    await navigateWithRetry(page, '/observer/profile');

    await expect(
      page.getByRole('heading', { name: /My observer profile/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Sign in as observer to access your profile/i),
    ).toBeVisible();
    await expect(
      page.locator('main').getByRole('link', { name: /^Sign in$/i }),
    ).toBeVisible();
  });

  test('renders observer profile summary and supports resync', async ({
    page,
  }) => {
    let profileRequests = 0;
    let digestRequests = 0;
    let digestPreferencesUpdates = 0;
    let studioUnfollowRequests = 0;
    let isFollowingStudio = true;

    await page.addInitScript(() => {
      window.localStorage.setItem('finishit_token', 'e2e-token');
      window.localStorage.setItem(
        'finishit_user',
        JSON.stringify({
          user: {
            id: 'observer-e2e',
            email: 'observer@example.com',
          },
        }),
      );
    });

    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const method = route.request().method();
      const path = requestUrl.pathname;

      if (method === 'GET' && path === '/api/auth/me') {
        return route.fulfill(
          withJson({
            user: {
              id: 'observer-e2e',
              email: 'observer@example.com',
            },
          }),
        );
      }

      if (method === 'GET' && path === '/api/observers/me/profile') {
        profileRequests += 1;
        const followingStudios = isFollowingStudio
          ? [
              {
                id: 'studio-e2e-1',
                studioName: 'Studio One',
                impact: 12,
                signal: 71,
                followerCount: 10,
                followedAt: '2026-02-01T10:00:00.000Z',
              },
            ]
          : [];
        return route.fulfill(
          withJson({
            observer: {
              id: 'observer-e2e',
              email: 'observer@example.com',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            counts: {
              followingStudios: isFollowingStudio ? 1 : 0,
              watchlistDrafts: 3,
              digestUnseen: 1,
            },
            predictions: {
              correct: 4,
              total: 5,
              rate: 0.8,
              netPoints: 22,
              market: {
                trustTier: 'trusted',
                minStakePoints: 20,
                maxStakePoints: 400,
                dailyStakeCapPoints: 1000,
                dailyStakeUsedPoints: 180,
                dailyStakeRemainingPoints: 820,
                dailySubmissionCap: 8,
                dailySubmissionsUsed: 3,
                dailySubmissionsRemaining: 5,
              },
            },
            followingStudios,
            watchlistHighlights: [
              {
                draftId: 'draft-e2e-1',
                draftTitle: 'Watchlist Draft',
                updatedAt: '2026-02-01T10:00:00.000Z',
                glowUpScore: 18.5,
                studioId: 'studio-e2e-1',
                studioName: 'Studio One',
              },
            ],
            recentPredictions: [
              {
                id: 'pred-e2e-1',
                pullRequestId: 'pr-e2e-1',
                draftId: 'draft-e2e-1',
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
          }),
        );
      }

      if (method === 'GET' && path === '/api/observers/digest') {
        digestRequests += 1;
        return route.fulfill(
          withJson([
            {
              id: 'digest-e2e-1',
              observerId: 'observer-e2e',
              draftId: 'draft-e2e-1',
              title: 'Studio One updated draft',
              summary: 'Merged PR and improved GlowUp',
              latestMilestone: 'Draft released',
              studioId: 'studio-e2e-1',
              studioName: 'Studio One',
              fromFollowingStudio: true,
              isSeen: false,
              createdAt: '2026-02-01T10:30:00.000Z',
              updatedAt: '2026-02-01T10:30:00.000Z',
            },
          ]),
        );
      }

      if (method === 'GET' && path === '/api/observers/me/preferences') {
        return route.fulfill(
          withJson({
            digest: {
              unseenOnly: false,
              followingOnly: false,
              updatedAt: '2026-02-01T10:00:00.000Z',
            },
          }),
        );
      }

      if (method === 'PUT' && path === '/api/observers/me/preferences') {
        digestPreferencesUpdates += 1;
        const payload = route.request().postDataJSON() as {
          digest?: { unseenOnly?: boolean; followingOnly?: boolean };
        };
        return route.fulfill(
          withJson({
            digest: {
              unseenOnly: Boolean(payload?.digest?.unseenOnly),
              followingOnly: Boolean(payload?.digest?.followingOnly),
              updatedAt: '2026-02-01T10:40:00.000Z',
            },
          }),
        );
      }

      if (method === 'DELETE' && path === '/api/studios/studio-e2e-1/follow') {
        studioUnfollowRequests += 1;
        isFollowingStudio = false;
        return route.fulfill(withJson({ following: false }));
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill(withJson({ ok: true }));
      }

      return route.fulfill(withJson({}));
    });

    await navigateWithRetry(page, '/observer/profile');

    await expect(
      page.getByRole('heading', { name: /My observer profile/i }),
    ).toBeVisible();
    await expect(page.getByText(/Observer summary/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Following studios/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Open following feed/i }),
    ).toHaveAttribute('href', '/feed?tab=Following');
    await expect(page.getByText(/Watchlist highlights/i)).toBeVisible();
    await expect(page.getByText(/Recent predictions/i)).toBeVisible();
    await expect(page.getByText(/From studios you follow/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Studio One updated draft/i }),
    ).toBeVisible();
    await expect(page.getByText(/Net prediction points:\s*22/i)).toBeVisible();
    await expect(page.getByText(/Prediction tier:\s*Trusted/i)).toBeVisible();
    await expect(page.getByText(/Max stake:\s*400/i)).toBeVisible();
    await expect(
      page.getByText(/Daily stake:\s*180\/1000/i),
    ).toBeVisible();
    await page.getByRole('button', { name: /Unseen only/i }).click();
    await expect.poll(() => digestPreferencesUpdates).toBeGreaterThan(0);
    await page.getByRole('button', { name: /Unfollow studio/i }).click();
    await expect.poll(() => studioUnfollowRequests).toBe(1);

    const resyncButton = page.getByRole('button', { name: /Resync now/i });
    await expect(resyncButton).toBeVisible();
    await resyncButton.click();

    await expect.poll(() => profileRequests).toBeGreaterThanOrEqual(2);
    await expect.poll(() => digestRequests).toBeGreaterThanOrEqual(2);
  });

  test('persists prediction history controls per scope (self/public)', async ({
    page,
  }) => {
    const telemetryPayloads: Array<{
      eventType?: string;
      metadata?: Record<string, unknown>;
    }> = [];

    const observerProfilePayload = {
      observer: {
        id: 'observer-e2e',
        email: 'observer@example.com',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      counts: {
        followingStudios: 1,
        watchlistDrafts: 2,
        digestUnseen: 0,
      },
      predictions: {
        correct: 1,
        total: 1,
        rate: 1,
        netPoints: 10,
        streak: {
          current: 1,
          best: 2,
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
            netPoints: 10,
            riskLevel: 'healthy',
          },
          d30: {
            days: 30,
            resolved: 1,
            correct: 1,
            rate: 1,
            netPoints: 10,
            riskLevel: 'healthy',
          },
        },
        thresholds: {
          resolutionWindows: {
            accuracyRate: {
              criticalBelow: 0.4,
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
          stakePoints: 20,
          payoutPoints: 30,
          createdAt: '2026-02-01T10:00:00.000Z',
          resolvedAt: '2026-02-01T11:00:00.000Z',
          netPoints: 10,
        },
        market: {
          trustTier: 'trusted',
          minStakePoints: 20,
          maxStakePoints: 300,
          dailyStakeCapPoints: 1000,
          dailyStakeUsedPoints: 150,
          dailyStakeRemainingPoints: 850,
          dailySubmissionCap: 8,
          dailySubmissionsUsed: 2,
          dailySubmissionsRemaining: 6,
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
          stakePoints: 20,
          payoutPoints: 30,
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
          stakePoints: 18,
          payoutPoints: 0,
          createdAt: '2026-02-01T12:00:00.000Z',
          resolvedAt: null,
        },
      ],
    };

    await page.addInitScript(() => {
      window.localStorage.setItem('finishit_token', 'e2e-token');
      window.localStorage.setItem(
        'finishit_user',
        JSON.stringify({
          user: {
            id: 'observer-e2e',
            email: 'observer@example.com',
          },
        }),
      );
    });

    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const method = route.request().method();
      const path = requestUrl.pathname;

      if (method === 'GET' && path === '/api/auth/me') {
        return route.fulfill(
          withJson({
            user: {
              id: 'observer-e2e',
              email: 'observer@example.com',
            },
          }),
        );
      }

      if (method === 'GET' && path === '/api/observers/me/profile') {
        return route.fulfill(withJson(observerProfilePayload));
      }

      if (method === 'GET' && path === '/api/observers/observer-e2e/profile') {
        return route.fulfill(
          withJson({
            observer: {
              id: 'observer-e2e',
              handle: 'observer-e2e',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            counts: {
              followingStudios: 0,
              watchlistDrafts: 0,
            },
            predictions: observerProfilePayload.predictions,
            followingStudios: [],
            watchlistHighlights: [],
            recentPredictions: observerProfilePayload.recentPredictions,
          }),
        );
      }

      if (method === 'GET' && path === '/api/observers/digest') {
        return route.fulfill(withJson([]));
      }

      if (method === 'GET' && path === '/api/observers/me/preferences') {
        return route.fulfill(
          withJson({
            digest: {
              unseenOnly: false,
              followingOnly: false,
              updatedAt: '2026-02-01T10:00:00.000Z',
            },
          }),
        );
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        const payload = route.request().postDataJSON() as {
          eventType?: string;
          metadata?: Record<string, unknown>;
        };
        telemetryPayloads.push(payload);
        return route.fulfill(withJson({ ok: true }));
      }

      return route.fulfill(withJson({}));
    });

    await navigateWithRetry(page, '/observer/profile');
    await expect(
      page.getByRole('heading', { name: /My observer profile/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: /Pending \(1\)/i }).click();
    await page.getByRole('button', { name: /^Net$/i }).click();

    await expect
      .poll(async () =>
        page.evaluate(() =>
          window.localStorage.getItem('finishit:observer-prediction-filter:self'),
        ),
      )
      .toBe('pending');
    await expect
      .poll(async () =>
        page.evaluate(() =>
          window.localStorage.getItem('finishit:observer-prediction-sort:self'),
        ),
      )
      .toBe('net_desc');

    await navigateWithRetry(page, '/observers/observer-e2e');
    await expect(
      page.getByRole('heading', { name: /Observer profile/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: /Resolved \(1\)/i }).click();
    await page.getByRole('button', { name: /^Stake$/i }).click();

    await expect
      .poll(async () =>
        page.evaluate(() =>
          window.localStorage.getItem(
            'finishit:observer-prediction-filter:public',
          ),
        ),
      )
      .toBe('resolved');
    await expect
      .poll(async () =>
        page.evaluate(() =>
          window.localStorage.getItem('finishit:observer-prediction-sort:public'),
        ),
      )
      .toBe('stake_desc');

    await navigateWithRetry(page, '/observer/profile');
    await expect(
      page.getByRole('button', { name: /Pending \(1\)/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^Net$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await navigateWithRetry(page, '/observers/observer-e2e');
    await expect(
      page.getByRole('button', { name: /Resolved \(1\)/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^Stake$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await expect.poll(() => telemetryPayloads.length).toBeGreaterThanOrEqual(4);
    expect(
      telemetryPayloads.filter(
        (payload) =>
          payload.eventType === 'observer_prediction_filter_change' &&
          payload.metadata?.scope === 'self',
      ),
    ).toHaveLength(1);
    expect(
      telemetryPayloads.filter(
        (payload) =>
          payload.eventType === 'observer_prediction_sort_change' &&
          payload.metadata?.scope === 'self',
      ),
    ).toHaveLength(1);
    expect(
      telemetryPayloads.filter(
        (payload) =>
          payload.eventType === 'observer_prediction_filter_change' &&
          payload.metadata?.scope === 'public',
      ),
    ).toHaveLength(1);
    expect(
      telemetryPayloads.filter(
        (payload) =>
          payload.eventType === 'observer_prediction_sort_change' &&
          payload.metadata?.scope === 'public',
      ),
    ).toHaveLength(1);
  });

  test('opens public observer profile from private profile link', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('finishit_token', 'e2e-token');
      window.localStorage.setItem(
        'finishit_user',
        JSON.stringify({
          user: {
            id: 'observer-e2e',
            email: 'observer@example.com',
          },
        }),
      );
    });

    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const method = route.request().method();
      const path = requestUrl.pathname;

      if (method === 'GET' && path === '/api/auth/me') {
        return route.fulfill(
          withJson({
            user: {
              id: 'observer-e2e',
              email: 'observer@example.com',
            },
          }),
        );
      }

      if (method === 'GET' && path === '/api/observers/me/profile') {
        return route.fulfill(
          withJson({
            observer: {
              id: 'observer-e2e',
              email: 'observer@example.com',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            counts: {
              followingStudios: 1,
              watchlistDrafts: 1,
              digestUnseen: 0,
            },
            predictions: {
              correct: 1,
              total: 1,
              rate: 1,
              netPoints: 8,
              market: {
                trustTier: 'proven',
                minStakePoints: 30,
                maxStakePoints: 500,
                dailyStakeCapPoints: 1300,
                dailyStakeUsedPoints: 200,
                dailyStakeRemainingPoints: 1100,
                dailySubmissionCap: 10,
                dailySubmissionsUsed: 4,
                dailySubmissionsRemaining: 6,
              },
            },
            followingStudios: [],
            watchlistHighlights: [],
            recentPredictions: [],
          }),
        );
      }

      if (method === 'GET' && path === '/api/observers/observer-e2e/profile') {
        return route.fulfill(
          withJson({
            observer: {
              id: 'observer-e2e',
              handle: 'observer-e2e',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            counts: {
              followingStudios: 1,
              watchlistDrafts: 1,
            },
            predictions: {
              correct: 1,
              total: 1,
              rate: 1,
              netPoints: 8,
              market: {
                trustTier: 'proven',
                minStakePoints: 30,
                maxStakePoints: 500,
                dailyStakeCapPoints: 1300,
                dailyStakeUsedPoints: 200,
                dailyStakeRemainingPoints: 1100,
                dailySubmissionCap: 10,
                dailySubmissionsUsed: 4,
                dailySubmissionsRemaining: 6,
              },
            },
            followingStudios: [],
            watchlistHighlights: [],
            recentPredictions: [],
          }),
        );
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill(withJson({ ok: true }));
      }

      return route.fulfill(withJson({}));
    });

    await navigateWithRetry(page, '/observer/profile');

    const publicLink = page.getByRole('link', { name: /Open public profile/i });
    await expect(publicLink).toBeVisible();
    await publicLink.click();

    await expect(page).toHaveURL(/\/observers\/observer-e2e$/);
    await expect(
      page.getByRole('heading', { name: /Observer profile/i }),
    ).toBeVisible();
  });

  test('renders public observer profile and supports resync', async ({
    page,
  }) => {
    let profileRequests = 0;

    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const method = route.request().method();
      const path = requestUrl.pathname;

      if (method === 'GET' && path === '/api/observers/observer-e2e/profile') {
        profileRequests += 1;
        return route.fulfill(
          withJson({
            observer: {
              id: 'observer-e2e',
              handle: 'observer-e2e',
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
              market: {
                trustTier: 'trusted',
                minStakePoints: 20,
                maxStakePoints: 400,
                dailyStakeCapPoints: 1000,
                dailyStakeUsedPoints: 180,
                dailyStakeRemainingPoints: 820,
                dailySubmissionCap: 8,
                dailySubmissionsUsed: 3,
                dailySubmissionsRemaining: 5,
              },
            },
            followingStudios: [
              {
                id: 'studio-e2e-1',
                studioName: 'Studio One',
                impact: 12,
                signal: 71,
                followerCount: 10,
                followedAt: '2026-02-01T10:00:00.000Z',
              },
            ],
            watchlistHighlights: [
              {
                draftId: 'draft-e2e-1',
                draftTitle: 'Watchlist Draft',
                updatedAt: '2026-02-01T10:00:00.000Z',
                glowUpScore: 18.5,
                studioId: 'studio-e2e-1',
                studioName: 'Studio One',
              },
            ],
            recentPredictions: [
              {
                id: 'pred-e2e-1',
                pullRequestId: 'pr-e2e-1',
                draftId: 'draft-e2e-1',
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
          }),
        );
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill(withJson({ ok: true }));
      }

      return route.fulfill(withJson({}));
    });

    await navigateWithRetry(page, '/observers/observer-e2e');

    await expect(
      page.getByRole('heading', { name: /Observer profile/i }),
    ).toBeVisible();
    await expect(page.getByText(/Observer summary/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Following studios/i }),
    ).toBeVisible();
    await expect(page.getByText(/Watchlist highlights/i)).toBeVisible();
    await expect(page.getByText(/Recent predictions/i)).toBeVisible();
    await expect(
      page.getByText(/Prediction tier:\s*Trusted \|\s*Max stake:\s*400/i),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /^Studio One$/i }),
    ).toBeVisible();

    const resyncButton = page.getByRole('button', { name: /Resync now/i });
    await expect(resyncButton).toBeVisible();
    await resyncButton.click();

    await expect.poll(() => profileRequests).toBeGreaterThanOrEqual(2);
  });
});
