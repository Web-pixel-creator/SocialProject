import { expect, test, type Page } from '@playwright/test';
import { FEED_SEARCH_PLACEHOLDER, openFeed } from './utils/feed';

const DETAIL_DRAFT_ID = 'draft-browser-compat-e2e';
const DETAIL_PR_ID = 'pr-browser-compat-e2e';
const DETAIL_COMMISSION_ID = 'commission-browser-compat-e2e';

const DETAIL_ROUTE_ASSERTIONS = [
  {
    path: `/drafts/${DETAIL_DRAFT_ID}`,
    readyText: DETAIL_DRAFT_ID,
  },
  {
    path: `/pull-requests/${DETAIL_PR_ID}`,
    readyText: DETAIL_PR_ID,
  },
  {
    path: `/commissions/${DETAIL_COMMISSION_ID}`,
    readyText: DETAIL_COMMISSION_ID,
  },
] as const;

const withJson = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

const installDetailRouteMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === `/api/drafts/${DETAIL_DRAFT_ID}`) {
      return route.fulfill(
        withJson({
          draft: {
            currentVersion: 2,
            glowUpScore: 1.9,
            id: DETAIL_DRAFT_ID,
            status: 'ready_for_review',
            updatedAt: '2026-02-18T10:00:00.000Z',
          },
          versions: [
            { imageUrl: 'https://example.com/v1.png', versionNumber: 1 },
            { imageUrl: 'https://example.com/v2.png', versionNumber: 2 },
          ],
        }),
      );
    }

    if (method === 'GET' && path === `/api/drafts/${DETAIL_DRAFT_ID}/fix-requests`) {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === `/api/drafts/${DETAIL_DRAFT_ID}/pull-requests`) {
      return route.fulfill(
        withJson([
          {
            description: 'Pending PR for browser-compat smoke',
            id: DETAIL_PR_ID,
            makerId: 'maker-browser-compat',
            status: 'pending',
          },
        ]),
      );
    }

    if (method === 'GET' && path === `/api/drafts/${DETAIL_DRAFT_ID}/arc`) {
      return route.fulfill(withJson(null));
    }

    if (method === 'GET' && path === '/api/observers/watchlist') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === '/api/observers/digest') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === '/api/search/similar') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === `/api/pull-requests/${DETAIL_PR_ID}/predictions`) {
      return route.fulfill(
        withJson({
          accuracy: { correct: 4, rate: 0.5, total: 8 },
          consensus: { merge: 2, reject: 1, total: 3 },
          observerPrediction: null,
          pullRequestId: DETAIL_PR_ID,
          pullRequestStatus: 'pending',
        }),
      );
    }

    if (method === 'GET' && path === `/api/pull-requests/${DETAIL_PR_ID}`) {
      return route.fulfill(
        withJson({
          afterImageUrl: 'https://example.com/after.png',
          authorStudio: 'Studio A',
          beforeImageUrl: 'https://example.com/before.png',
          draft: {
            authorId: 'author-browser-compat',
            currentVersion: 2,
            glowUpScore: 2.4,
            id: DETAIL_DRAFT_ID,
            status: 'draft',
          },
          makerStudio: 'Studio B',
          metrics: {
            currentGlowUp: 2.4,
            glowUpDelta: 0.8,
            impactDelta: 3,
            predictedGlowUp: 3.2,
          },
          pullRequest: {
            addressedFixRequests: [],
            description: 'Improve hierarchy and spacing',
            draftId: DETAIL_DRAFT_ID,
            id: DETAIL_PR_ID,
            makerId: 'maker-browser-compat',
            proposedVersion: 3,
            severity: 'minor',
            status: 'pending',
          },
        }),
      );
    }

    if (method === 'GET' && path === `/api/commissions/${DETAIL_COMMISSION_ID}`) {
      return route.fulfill(
        withJson({
          currency: 'USD',
          description: 'Browser compat detail page smoke commission',
          id: DETAIL_COMMISSION_ID,
          paymentStatus: 'in_escrow',
          responses: [],
          rewardAmount: 180,
          status: 'pending',
        }),
      );
    }

    if (method === 'GET' && path === '/api/auth/me') {
      return route.fulfill(withJson({ message: 'Sign in required' }, 401));
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

test.describe('Cross-browser compatibility smoke', () => {
  test('renders feed controls and keeps slash shortcut behavior', async ({
    page,
  }) => {
    await openFeed(page);

    await expect(page.getByRole('heading', { name: /^Feeds$/i })).toBeVisible();

    const feedSearch = page.getByPlaceholder(FEED_SEARCH_PLACEHOLDER);
    await expect(feedSearch).toBeVisible();

    await page.getByRole('heading', { name: /^Feeds$/i }).click();
    await page.keyboard.press('/');
    await expect(feedSearch).toBeFocused();

    const desktopControls = page.getByTestId('observer-rail-desktop-controls');
    await expect(desktopControls).toBeVisible();
    await expect(desktopControls.getByRole('button')).toHaveCount(2);
  });

  test('keeps search keyboard flow consistent', async ({ page }) => {
    await page.goto('/search');

    await expect(page.getByRole('heading', { name: /^Search$/i })).toBeVisible();

    const keywordInput = page.getByPlaceholder(/Search by keyword/i);
    await expect(keywordInput).toBeVisible();

    await page.getByRole('heading', { name: /^Search$/i }).click();
    await page.keyboard.press('/');
    await expect(keywordInput).toBeFocused();
  });

  test('renders login form fields', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible();
  });

  test('keeps top header sticky after feed scroll', async ({ page }) => {
    await openFeed(page);

    const topHeader = page.locator('header').first();
    await expect(topHeader).toBeVisible();

    await page.evaluate(() => {
      window.scrollTo({ top: 900 });
      window.dispatchEvent(new Event('scroll'));
    });

    const headerTop = await topHeader.evaluate((element) =>
      element.getBoundingClientRect().top,
    );
    expect(headerTop).toBeGreaterThanOrEqual(0);
    expect(headerTop).toBeLessThan(32);
  });

  test('keeps back-to-top button clear of right rail fixed area', async ({
    page,
  }) => {
    await openFeed(page);

    await page.evaluate(() => {
      document.body.style.minHeight = '3400px';
      window.scrollTo({ top: 960 });
      window.dispatchEvent(new Event('scroll'));
    });

    const backToTopButton = page.getByRole('button', {
      name: /Back to top/i,
    });
    await expect(backToTopButton).toBeVisible();

    const rightRail = page.locator('.observer-right-rail').first();
    await expect(rightRail).toBeVisible();

    const buttonBox = await backToTopButton.boundingBox();
    const railBox = await rightRail.boundingBox();

    expect(buttonBox).not.toBeNull();
    expect(railBox).not.toBeNull();

    const safeButtonBox = buttonBox!;
    const safeRailBox = railBox!;
    expect(safeButtonBox.x + safeButtonBox.width).toBeLessThanOrEqual(
      safeRailBox.x,
    );
  });

  test('keeps top header sticky after non-feed page scroll', async ({
    page,
  }) => {
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'GET' && path === '/api/commissions') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      if (method === 'GET' && path === '/api/auth/me') {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Sign in required' }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.goto('/commissions');
    await expect(
      page.getByRole('heading', { name: /Commissions/i }),
    ).toBeVisible();

    const topHeader = page.locator('header').first();
    await expect(topHeader).toBeVisible();

    await page.evaluate(() => {
      window.scrollTo({ top: 900 });
      window.dispatchEvent(new Event('scroll'));
    });

    const headerTop = await topHeader.evaluate((element) => {
      return element.getBoundingClientRect().top;
    });
    expect(headerTop).toBeGreaterThanOrEqual(0);
    expect(headerTop).toBeLessThan(32);
  });

  test('keeps mobile non-feed menu inside viewport without horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');
    await expect(
      page.getByRole('heading', { name: /Privacy & Data/i }),
    ).toBeVisible();

    const menuButton = page.locator('button[aria-controls="mobile-site-menu"]');
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const mobileMenu = page.locator('#mobile-site-menu');
    await expect(mobileMenu).toBeVisible();

    const [menuBox, viewportWidth, pageWidths] = await Promise.all([
      mobileMenu.boundingBox(),
      page.evaluate(() => window.innerWidth),
      page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    ]);

    expect(menuBox).not.toBeNull();

    const safeMenuBox = menuBox!;
    expect(safeMenuBox.x).toBeGreaterThanOrEqual(0);
    expect(safeMenuBox.x + safeMenuBox.width).toBeLessThanOrEqual(
      viewportWidth + 1,
    );
    expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth + 1);
  });

  test('keeps detail page header sticky after scroll', async ({ page }) => {
    await installDetailRouteMocks(page);

    for (const route of DETAIL_ROUTE_ASSERTIONS) {
      await page.goto(route.path);
      await expect(page.getByText(new RegExp(route.readyText, 'i')).first()).toBeVisible();

      const topHeader = page.locator('header').first();
      await expect(topHeader).toBeVisible();

      await page.evaluate(() => {
        window.scrollTo({ top: 900 });
        window.dispatchEvent(new Event('scroll'));
      });

      const headerTop = await topHeader.evaluate((element) => {
        return element.getBoundingClientRect().top;
      });
      expect(headerTop).toBeGreaterThanOrEqual(0);
      expect(headerTop).toBeLessThan(32);
    }
  });

  test('keeps mobile detail page menu inside viewport without horizontal overflow', async ({
    page,
  }) => {
    await installDetailRouteMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of DETAIL_ROUTE_ASSERTIONS) {
      await page.goto(route.path);
      await expect(page.getByText(new RegExp(route.readyText, 'i')).first()).toBeVisible();

      const menuButton = page.locator(
        'button[aria-controls="mobile-site-menu"]',
      );
      await expect(menuButton).toBeVisible();
      await menuButton.click();

      const mobileMenu = page.locator('#mobile-site-menu');
      await expect(mobileMenu).toBeVisible();

      const [menuBox, viewportWidth, pageWidths] = await Promise.all([
        mobileMenu.boundingBox(),
        page.evaluate(() => window.innerWidth),
        page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        })),
      ]);

      expect(menuBox).not.toBeNull();
      const safeMenuBox = menuBox!;
      expect(safeMenuBox.x).toBeGreaterThanOrEqual(0);
      expect(safeMenuBox.x + safeMenuBox.width).toBeLessThanOrEqual(
        viewportWidth + 1,
      );
      expect(pageWidths.scrollWidth).toBeLessThanOrEqual(
        pageWidths.clientWidth + 1,
      );
    }
  });
});
