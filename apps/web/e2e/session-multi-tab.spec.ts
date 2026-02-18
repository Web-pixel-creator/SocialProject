import { expect, test } from '@playwright/test';

const withJson = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

test.describe('Session multi-tab consistency', () => {
  test('logout in first tab invalidates protected actions in second tab', async ({
    context,
  }) => {
    let exportRequestCount = 0;
    let deleteRequestCount = 0;

    await context.addInitScript(() => {
      window.localStorage.setItem('finishit-language', 'en');
      window.localStorage.setItem('finishit_token', 'e2e-shared-token');
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

    await context.route('**/api/**', async (route) => {
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
        exportRequestCount += 1;
        return route.fulfill(
          withJson({
            export: {
              downloadUrl: 'https://example.com/export.zip',
              id: `export-${exportRequestCount}`,
              status: 'ready',
            },
          }),
        );
      }

      if (method === 'GET' && path.startsWith('/api/account/exports/')) {
        return route.fulfill(
          withJson({
            downloadUrl: 'https://example.com/export.zip',
            id: path.split('/').at(-1) ?? 'export-1',
            status: 'ready',
          }),
        );
      }

      if (method === 'POST' && path === '/api/account/delete') {
        deleteRequestCount += 1;
        return route.fulfill(withJson({ status: 'pending' }));
      }

      return route.fulfill(withJson({}));
    });

    const firstTab = await context.newPage();
    const secondTab = await context.newPage();

    await Promise.all([firstTab.goto('/privacy'), secondTab.goto('/privacy')]);

    const exportButtonSecondTab = secondTab.getByRole('button', {
      name: /request export/i,
    });
    const deleteButtonSecondTab = secondTab.getByRole('button', {
      name: /request deletion/i,
    });

    await expect(exportButtonSecondTab).toBeEnabled();
    await expect(deleteButtonSecondTab).toBeEnabled();

    await exportButtonSecondTab.click();
    await expect.poll(() => exportRequestCount).toBe(1);

    await firstTab
      .getByRole('button', { name: /sign out|выйти/i })
      .first()
      .click();

    const signInPromptFirstTab = firstTab
      .getByRole('main')
      .getByRole('link', { name: /^sign in$|^войти$/i });
    const signInPromptSecondTab = secondTab
      .getByRole('main')
      .getByRole('link', { name: /^sign in$|^войти$/i });

    await expect(signInPromptFirstTab).toBeVisible();
    await expect(signInPromptSecondTab).toBeVisible();
    await expect(deleteButtonSecondTab).toBeDisabled();

    await secondTab.waitForTimeout(250);
    expect(exportRequestCount).toBe(1);
    expect(deleteRequestCount).toBe(0);

    const secondTabSession = await secondTab.evaluate(() => ({
      token: window.localStorage.getItem('finishit_token'),
      user: window.localStorage.getItem('finishit_user'),
    }));

    expect(secondTabSession.token).toBeNull();
    expect(secondTabSession.user).toBeNull();
  });
});
