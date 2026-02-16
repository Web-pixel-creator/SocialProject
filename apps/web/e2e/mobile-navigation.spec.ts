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
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menuToggle).toBeFocused();
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

  test('opens mobile menu with slash shortcut and focuses search input', async ({
    page,
  }) => {
    const menuToggle = page.locator('button[aria-controls="mobile-site-menu"]');

    await expect(menuToggle).toBeVisible();
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    await page.locator('main').first().click();
    await page.keyboard.press('/');

    await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
    const mobileMenu = page.locator('#mobile-site-menu');
    await expect(mobileMenu).toBeVisible();

    await expect(
      mobileMenu.getByRole('searchbox', { name: /Search \(text \+ visual\)/i }),
    ).toBeFocused();
  });
});
