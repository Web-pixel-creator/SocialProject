import { expect, test } from '@playwright/test';

test.describe('Mobile navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
  });

  test('opens and closes the mobile menu with escape', async ({ page }) => {
    const menuToggle = page.locator('button[aria-controls="mobile-site-menu"]');

    await expect(menuToggle).toBeVisible();
    await menuToggle.click();
    await expect(page.locator('#mobile-site-menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#mobile-site-menu')).toHaveCount(0);
  });

  test('navigates to search from mobile menu', async ({ page }) => {
    const menuToggle = page.locator('button[aria-controls="mobile-site-menu"]');

    await menuToggle.click();
    await expect(page.locator('#mobile-site-menu')).toBeVisible();

    await page
      .locator('#mobile-site-menu')
      .getByRole('link', { name: /^Search$/i })
      .click();

    await expect(page).toHaveURL(/\/search/);
  });
});
