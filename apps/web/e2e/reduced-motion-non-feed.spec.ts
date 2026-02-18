import { expect, test, type Locator, type Page } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const withJson = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

const NON_FEED_ROUTES = [
  '/',
  '/privacy',
  '/commissions',
  '/studios/onboarding',
  '/legal/privacy',
] as const;

const installNonFeedMotionMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === '/api/feeds/studios') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === '/api/feeds/live-drafts') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === '/api/feed') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === '/api/commissions') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === '/api/auth/me') {
      return route.fulfill(withJson({ message: 'Sign in required' }, 401));
    }

    if (method === 'GET' && path.startsWith('/api/account/exports/')) {
      return route.fulfill(
        withJson({
          downloadUrl: null,
          id: 'reduced-motion-export',
          status: 'pending',
        }),
      );
    }

    if (
      method === 'POST' &&
      (path === '/api/account/export' || path === '/api/account/delete')
    ) {
      return route.fulfill(withJson({ status: 'pending' }));
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

const readAnimationName = async (locator: Locator) => {
  return await locator.evaluate((element) => {
    return window.getComputedStyle(element).animationName;
  });
};

test.describe('Reduced motion on non-feed routes', () => {
  test('keeps home icon animations in normal motion mode', async ({
    page,
  }) => {
    await installNonFeedMotionMocks(page);
    await navigateWithRetry(page, '/', {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    const headerBrandIcon = page.locator('header .icon-breathe').first();
    const homeStepIcon = page.locator('main .icon-float').first();

    await expect(headerBrandIcon).toBeVisible();
    await expect(homeStepIcon).toBeVisible();

    const headerAnimationName = await readAnimationName(headerBrandIcon);
    const homeStepAnimationName = await readAnimationName(homeStepIcon);

    expect(headerAnimationName).not.toBe('none');
    expect(homeStepAnimationName).not.toBe('none');
  });

  test('disables icon animations when reduced motion is enabled', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installNonFeedMotionMocks(page);

    for (const route of NON_FEED_ROUTES) {
      await navigateWithRetry(page, route, {
        gotoOptions: { waitUntil: 'domcontentloaded' },
      });

      const headerBrandIcon = page.locator('header .icon-breathe').first();
      await expect(headerBrandIcon).toBeVisible();
      await expect
        .poll(async () => {
          return await readAnimationName(headerBrandIcon);
        })
        .toBe('none');

      if (route === '/') {
        const homeStepIcon = page.locator('main .icon-float').first();
        await expect(homeStepIcon).toBeVisible();
        await expect
          .poll(async () => {
            return await readAnimationName(homeStepIcon);
          })
          .toBe('none');
      }
    }
  });
});

