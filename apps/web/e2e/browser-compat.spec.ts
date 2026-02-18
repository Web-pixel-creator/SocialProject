import { expect, test } from '@playwright/test';
import { FEED_SEARCH_PLACEHOLDER, openFeed } from './utils/feed';

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
});
