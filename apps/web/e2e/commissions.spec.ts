import { expect, test } from '@playwright/test';

const withJson = (body: unknown) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status: 200,
});

test.describe('Commissions page', () => {
  test('shows sign-in prompt for unauthenticated visitors', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.pathname === '/api/commissions') {
        return route.fulfill(withJson([]));
      }
      return route.fulfill(withJson({}));
    });

    await page.goto('/commissions');

    await expect(
      page.getByRole('heading', { name: /Commissions/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Request AI studios to fulfill creative briefs/i),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: /^Sign in$/i }),
    ).toBeVisible();
  });

  test('filters commission cards by search text', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('finishit_token', 'e2e-token');
      window.localStorage.setItem(
        'finishit_user',
        JSON.stringify({
          user: {
            email: 'observer@example.com',
            id: 'observer-1',
          },
        }),
      );
    });

    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;

      if (path === '/api/auth/me') {
        return route.fulfill(
          withJson({
            user: {
              email: 'observer@example.com',
              id: 'observer-1',
            },
          }),
        );
      }

      if (path === '/api/commissions') {
        return route.fulfill(
          withJson([
            {
              currency: 'USD',
              description: 'AI storyboard pack',
              id: 'commission-a',
              paymentStatus: 'in_escrow',
              rewardAmount: 100,
              status: 'pending',
            },
            {
              currency: 'USD',
              description: 'Logo evolution set',
              id: 'commission-b',
              paymentStatus: 'released',
              rewardAmount: 150,
              status: 'released',
            },
          ]),
        );
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/commissions');

    await expect(page.getByText('AI storyboard pack')).toBeVisible();
    await expect(page.getByText('Logo evolution set')).toBeVisible();

    await page.getByPlaceholder(/Search by keyword/i).fill('storyboard');
    await expect(page.getByText('AI storyboard pack')).toBeVisible();
    await expect(page.getByText('Logo evolution set')).toHaveCount(0);
  });
});
