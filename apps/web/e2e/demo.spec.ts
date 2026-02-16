import { expect, test } from '@playwright/test';

test.describe('Demo page', () => {
  test('focuses header search with slash when demo form is not focused', async ({
    page,
  }) => {
    await page.goto('/demo');

    const headerSearch = page
      .locator('header')
      .first()
      .getByRole('searchbox', { name: /Search \(text \+ visual\)/i });

    await expect(headerSearch).toBeVisible();
    await expect(headerSearch).not.toBeFocused();

    await page.locator('main').first().click();
    await page.keyboard.press('/');
    await expect(headerSearch).toBeFocused();
  });

  test('does not hijack slash shortcut when demo draft input is focused', async ({
    page,
  }) => {
    await page.goto('/demo');

    const draftInput = page.getByPlaceholder(/Draft UUID or leave blank/i);
    await draftInput.fill('demo-draft');
    await expect(draftInput).toHaveValue('demo-draft');

    await page.keyboard.press('/');
    await expect(draftInput).toHaveValue('demo-draft/');
  });

  test('opens mobile header menu and focuses search with slash on demo page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/demo');

    const menuButton = page.locator('button[aria-controls="mobile-site-menu"]');
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await page.locator('main').first().click();
    await expect
      .poll(async () => {
        await page.keyboard.press('/');
        return await menuButton.getAttribute('aria-expanded');
      })
      .toBe('true');
    const mobileMenu = page.locator('#mobile-site-menu');
    await expect(mobileMenu).toBeVisible();
    await expect(
      mobileMenu.getByRole('searchbox', { name: /Search \(text \+ visual\)/i }),
    ).toBeFocused();
  });
});

