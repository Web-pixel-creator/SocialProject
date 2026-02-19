import { expect, test } from '@playwright/test';

const withJson = (body: unknown) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status: 200,
});

const withError = (status: number, body: unknown) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

test.describe('Search page', () => {
  test('renders text search results', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'GET' && path === '/api/search') {
        return route.fulfill(
          withJson([
            {
              id: 'draft-search-1',
              score: 9.1,
              title: 'Landing page redesign v2',
              type: 'draft',
            },
          ]),
        );
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill(withJson({ ok: true }));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/search?q=landing&type=draft');

    await expect(page.getByRole('heading', { name: /^Search$/i })).toBeVisible();
    await expect(page.getByText('Landing page redesign v2')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Landing page redesign v2/i }),
    ).toHaveAttribute('href', '/drafts/draft-search-1');
  });

  test('focuses keyword search with slash shortcut in text mode', async ({
    page,
  }) => {
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'GET' && path === '/api/search') {
        return route.fulfill(withJson([]));
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill(withJson({ ok: true }));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/search');

    await page.getByRole('heading', { name: /^Search$/i }).click();
    const keywordInput = page.getByPlaceholder(/Search by keyword/i);
    await page.keyboard.press('/');
    await expect(keywordInput).toBeFocused();
  });

  test('focuses keyword search with slash on mobile without opening header menu', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'GET' && path === '/api/search') {
        return route.fulfill(withJson([]));
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill(withJson({ ok: true }));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/search');
    await page.getByRole('heading', { name: /^Search$/i }).click();

    const keywordInput = page.getByPlaceholder(/Search by keyword/i);
    const menuButton = page.locator('button[aria-controls="mobile-site-menu"]');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('/');
    await expect(keywordInput).toBeFocused();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('does not hijack slash when visual draft input is focused', async ({
    page,
  }) => {
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'GET' && path === '/api/search') {
        return route.fulfill(withJson([]));
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill(withJson({ ok: true }));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/search?mode=visual');

    const draftIdInput = page.getByPlaceholder(/Draft ID \(optional\)/i);
    await draftIdInput.fill('seed-draft');
    await expect(draftIdInput).toHaveValue('seed-draft');

    await page.keyboard.press('/');
    await expect(draftIdInput).toHaveValue('seed-draft/');
    await expect(draftIdInput).toBeFocused();
  });

  test('uses auto scroll for similar-entrypoint when reduced motion is enabled', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      type WindowWithScrollProbe = Window & {
        __finishitLastSearchScrollTo?: Record<string, unknown> | null;
      };
      const win = window as WindowWithScrollProbe;
      win.__finishitLastSearchScrollTo = null;
      window.scrollTo = ((optionsOrX?: number | ScrollToOptions) => {
        if (typeof optionsOrX === 'object') {
          win.__finishitLastSearchScrollTo = optionsOrX;
          return;
        }
        win.__finishitLastSearchScrollTo = {
          left: optionsOrX ?? 0,
          top: 0,
        };
      }) as typeof window.scrollTo;
    });

    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'GET' && path === '/api/search') {
        return route.fulfill(withJson([]));
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill(withJson({ ok: true }));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/search?from=similar');
    await expect(page.getByRole('heading', { name: /^Search$/i })).toBeVisible();

    const lastScrollToOptions = await page.evaluate(() => {
      type WindowWithScrollProbe = Window & {
        __finishitLastSearchScrollTo?: Record<string, unknown> | null;
      };
      const win = window as WindowWithScrollProbe;
      return win.__finishitLastSearchScrollTo ?? null;
    });

    expect(lastScrollToOptions).toEqual(
      expect.objectContaining({
        behavior: 'auto',
        top: 0,
      }),
    );
  });

  test('runs visual search and renders results', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'POST' && path === '/api/search/visual') {
        return route.fulfill(
          withJson([
            {
              id: 'draft-visual-1',
              score: 8.6,
              title: 'Visual similarity result',
              type: 'draft',
            },
          ]),
        );
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill(withJson({ ok: true }));
      }

      if (method === 'GET' && path === '/api/search') {
        return route.fulfill(withJson([]));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/search?mode=visual&draftId=draft-visual-seed');

    const visualDraftIdInput = page.getByRole('textbox', {
      name: /Draft ID \(optional\)/i,
    });
    await expect(visualDraftIdInput).toHaveValue('draft-visual-seed');
    await expect.poll(() => page.url()).toContain('draftId=draft-visual-seed');

    const visualSearchRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'POST' &&
        request.url().includes('/api/search/visual')
      );
    });

    await page.getByRole('button', { name: /^Run visual search$/i }).click();
    await visualSearchRequest;

    await expect(page.getByText('Visual similarity result')).toBeVisible();
  });

  test('keeps last text results visible when follow-up search fails', async ({
    page,
  }) => {
    let searchRequestCount = 0;

    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'GET' && path === '/api/search') {
        searchRequestCount += 1;
        if (searchRequestCount === 1) {
          return route.fulfill(
            withJson([
              {
                id: 'draft-stable-1',
                score: 9.3,
                title: 'Stable baseline result',
                type: 'draft',
              },
            ]),
          );
        }
        return route.fulfill(
          withError(503, {
            message: 'Search unavailable',
          }),
        );
      }

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill(withJson({ ok: true }));
      }

      return route.fulfill(withJson({}));
    });

    await page.goto('/search?q=stable');

    await expect(page.getByText('Stable baseline result')).toBeVisible();

    await page.getByPlaceholder(/Search by keyword/i).fill('broken');
    await expect(page.getByText('Search unavailable')).toBeVisible();
    await expect(page.getByText('Stable baseline result')).toBeVisible();
  });
});
