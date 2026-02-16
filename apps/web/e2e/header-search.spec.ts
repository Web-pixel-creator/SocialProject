import { expect, test } from '@playwright/test';

const readUrlParts = (urlValue: string) => {
  const url = new URL(urlValue);
  return {
    pathname: url.pathname,
    searchParams: url.searchParams,
  };
};

test.describe('Site header search routing', () => {
  test('hides global header search on feed page', async ({ page }) => {
    await page.goto('/feed?tab=Battles');

    await expect(
      page
        .locator('header')
        .first()
        .getByRole('searchbox', { name: /Search \(text \+ visual\)/i }),
    ).toHaveCount(0);
  });

  test('routes to search page from non-feed pages', async ({ page }) => {
    await page.goto('/privacy');

    const headerSearch = page
      .locator('header')
      .first()
      .getByRole('searchbox', { name: /Search \(text \+ visual\)/i });

    await headerSearch.fill('copyright');
    await headerSearch
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: /^Search$/i })
      .click();

    await expect
      .poll(() => {
        const { pathname, searchParams } = readUrlParts(page.url());
        const mode = searchParams.get('mode');
        const query = searchParams.get('q');
        return pathname === '/search' && query === 'copyright' && (mode === null || mode === 'text');
      })
      .toBe(true);
  });

  test('focuses header search with slash shortcut on non-feed pages', async ({
    page,
  }) => {
    await page.goto('/privacy');

    const headerSearch = page
      .locator('header')
      .first()
      .getByRole('searchbox', { name: /Search \(text \+ visual\)/i });

    await expect(headerSearch).toBeVisible();
    await page.locator('main').first().click();
    await page.keyboard.press('/');
    await expect(headerSearch).toBeFocused();
  });

  test('opens mobile header menu and focuses search with slash shortcut', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');

    const menuButton = page.locator('button[aria-controls="mobile-site-menu"]');
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await page.locator('main').first().click();
    await page.keyboard.press('/');

    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    const mobileMenu = page.locator('#mobile-site-menu');
    await expect(mobileMenu).toBeVisible();

    const mobileSearch = mobileMenu.getByRole('searchbox', {
      name: /Search \(text \+ visual\)/i,
    });
    await expect(mobileSearch).toBeFocused();
  });

  test('closes slash-opened mobile menu with Escape and restores focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');

    const menuButton = page.locator('button[aria-controls="mobile-site-menu"]');
    await expect(menuButton).toBeVisible();

    await page.locator('main').first().click();
    await page.keyboard.press('/');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mobile-site-menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#mobile-site-menu')).toHaveCount(0);
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(menuButton).toBeFocused();
  });
});

