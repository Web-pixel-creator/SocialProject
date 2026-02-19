import { expect, test } from '@playwright/test';

const withJson = (body: unknown) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status: 200,
});

test.describe('Privacy page', () => {
  test('shows sign-in prompt for unauthenticated visitors', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.pathname.startsWith('/api/account/exports/')) {
        return route.fulfill(
          withJson({ downloadUrl: null, id: 'export-id', status: 'pending' }),
        );
      }
      return route.fulfill(withJson({}));
    });

    await page.goto('/privacy');

    await expect(page.getByRole('heading', { name: /Privacy & Data/i })).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: /^Sign in$/i }),
    ).toBeVisible();
  });

  test('requests export and shows download link for authenticated user', async ({
    page,
  }) => {
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
      const method = route.request().method();

      if (method === 'GET' && path === '/api/auth/me') {
        return route.fulfill(
          withJson({
            user: {
              email: 'observer@example.com',
              id: 'observer-1',
            },
          }),
        );
      }

      if (method === 'POST' && path === '/api/account/export') {
        return route.fulfill(
          withJson({
            export: {
              downloadUrl: 'https://example.com/export.zip',
              id: 'export-123',
              status: 'ready',
            },
          }),
        );
      }

      if (method === 'GET' && path === '/api/account/exports/export-123') {
        return route.fulfill(
          withJson({
            downloadUrl: 'https://example.com/export.zip',
            id: 'export-123',
            status: 'ready',
          }),
        );
      }

      if (method === 'POST' && path === '/api/account/delete') {
        return route.fulfill(withJson({ status: 'pending' }));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/privacy');

    const exportRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'POST' &&
        request.url().includes('/api/account/export')
      );
    });

    await page.getByRole('button', { name: /Request export/i }).click();
    await exportRequest;

    await expect(page.getByText('export-123')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Download export/i }),
    ).toBeVisible();
  });

  test('logs out and shows sign-in recovery UI when session expires during export', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('finishit_token', 'expired-soon-token');
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
      const method = route.request().method();

      if (method === 'GET' && path === '/api/auth/me') {
        return route.fulfill(
          withJson({
            user: {
              email: 'observer@example.com',
              id: 'observer-1',
            },
          }),
        );
      }

      if (method === 'POST' && path === '/api/account/export') {
        return route.fulfill({
          body: JSON.stringify({ message: 'Session expired' }),
          contentType: 'application/json',
          status: 401,
        });
      }

      if (method === 'POST' && path === '/api/account/delete') {
        return route.fulfill(withJson({ status: 'pending' }));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/privacy');

    await page.getByRole('button', { name: /Request export/i }).click();

    await expect(page.getByText('Session expired')).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: /^Sign in$/i }),
    ).toBeVisible();

    const sessionState = await page.evaluate(() => ({
      token: window.localStorage.getItem('finishit_token'),
      user: window.localStorage.getItem('finishit_user'),
    }));
    expect(sessionState.token).toBeNull();
    expect(sessionState.user).toBeNull();
  });

  test('restores protected privacy actions after re-login from expired session', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('finishit_token', 'expired-token');
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

    let exportCalls = 0;

    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'GET' && path === '/api/auth/me') {
        const authHeader = route.request().headers()['authorization'] ?? '';
        if (
          authHeader.includes('expired-token') ||
          authHeader.includes('recovered-token')
        ) {
          return route.fulfill(
            withJson({
              user: {
                email: 'observer@example.com',
                id: 'observer-1',
              },
            }),
          );
        }
        return route.fulfill(withJson({}));
      }

      if (method === 'POST' && path === '/api/account/export') {
        exportCalls += 1;
        if (exportCalls === 1) {
          return route.fulfill({
            body: JSON.stringify({ message: 'Session expired' }),
            contentType: 'application/json',
            status: 401,
          });
        }
        return route.fulfill(
          withJson({
            export: {
              downloadUrl: 'https://example.com/export-recovered.zip',
              id: 'export-recovered',
              status: 'ready',
            },
          }),
        );
      }

      if (
        method === 'GET' &&
        path === '/api/account/exports/export-recovered'
      ) {
        return route.fulfill(
          withJson({
            downloadUrl: 'https://example.com/export-recovered.zip',
            id: 'export-recovered',
            status: 'ready',
          }),
        );
      }

      if (method === 'POST' && path === '/api/auth/login') {
        return route.fulfill(
          withJson({
            tokens: { accessToken: 'recovered-token' },
            user: {
              email: 'observer@example.com',
              id: 'observer-1',
            },
          }),
        );
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/privacy');
    await page.getByRole('button', { name: /Request export/i }).click();

    await expect(page.getByText('Session expired')).toBeVisible();
    await page
      .getByRole('main')
      .getByRole('link', { name: /^Sign in$/i })
      .click();

    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel(/email/i).fill('observer@example.com');
    await page.getByLabel(/password/i).fill('secret-123');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/feed/);
    await page.goto('/privacy');
    await page.getByRole('button', { name: /Request export/i }).click();

    await expect(page.getByText('export-recovered')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Download export/i }),
    ).toBeVisible();
  });
});
