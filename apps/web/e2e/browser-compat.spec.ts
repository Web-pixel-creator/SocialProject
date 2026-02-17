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

    const keywordInput = page.getByPlaceholder(
      /Search by keyword|Поиск по ключевому слову/i,
    );
    await expect(keywordInput).toBeVisible();

    await page.getByRole('heading', { name: /^Search$/i }).click();
    await page.keyboard.press('/');
    await expect(keywordInput).toBeFocused();
  });

  test('renders login form fields', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Sign in|Войти/i }),
    ).toBeVisible();
  });
});
