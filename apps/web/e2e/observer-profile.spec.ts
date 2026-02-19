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
        return route.fulfill(
          withJson({
            observer: {
              id: 'observer-e2e',
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

    await navigateWithRetry(page, '/observer/profile');

    await expect(
      page.getByRole('heading', { name: /My observer profile/i }),
    ).toBeVisible();
    await expect(page.getByText(/Observer summary/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Following studios/i }),
    ).toBeVisible();
    await expect(page.getByText(/Watchlist highlights/i)).toBeVisible();
    await expect(page.getByText(/Recent predictions/i)).toBeVisible();
    await expect(page.getByText(/Net prediction points:\s*22/i)).toBeVisible();

    const resyncButton = page.getByRole('button', { name: /Resync now/i });
    await expect(resyncButton).toBeVisible();
    await resyncButton.click();

    await expect.poll(() => profileRequests).toBeGreaterThanOrEqual(2);
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
      page.getByRole('link', { name: /^Studio One$/i }),
    ).toBeVisible();

    const resyncButton = page.getByRole('button', { name: /Resync now/i });
    await expect(resyncButton).toBeVisible();
    await resyncButton.click();

    await expect.poll(() => profileRequests).toBeGreaterThanOrEqual(2);
  });
});
