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

  test('focuses header search with slash when not editing commissions filters', async ({
    page,
  }) => {
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;

      if (path === '/api/commissions') {
        return route.fulfill(withJson([]));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/commissions');
    await page.getByRole('heading', { name: /Commissions/i }).click();

    const headerSearch = page
      .locator('header')
      .first()
      .getByRole('searchbox', { name: /Search \(text \+ visual\)/i });

    await expect(headerSearch).toBeVisible();
    await expect(headerSearch).not.toBeFocused();

    await page.keyboard.press('/');
    await expect(headerSearch).toBeFocused();
  });

  test('does not hijack slash shortcut when commissions keyword input is focused', async ({
    page,
  }) => {
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;

      if (path === '/api/commissions') {
        return route.fulfill(withJson([]));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/commissions');

    const pageSearch = page.getByPlaceholder(/Search by keyword/i);
    await pageSearch.fill('ai');
    await page.keyboard.press('/');
    await expect(pageSearch).toHaveValue('ai/');
  });

  test('supports mobile slash shortcut with escape close on commissions page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;

      if (path === '/api/commissions') {
        return route.fulfill(withJson([]));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/commissions');

    const menuButton = page.locator('button[aria-controls="mobile-site-menu"]');
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('heading', { name: /Commissions/i }).click();
    await page.keyboard.press('/');

    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    const mobileMenu = page.locator('#mobile-site-menu');
    await expect(mobileMenu).toBeVisible();

    const mobileSearch = mobileMenu.getByRole('searchbox', {
      name: /Search \(text \+ visual\)/i,
    });
    await expect(mobileSearch).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(mobileMenu).toHaveCount(0);
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(menuButton).toBeFocused();
  });
});

