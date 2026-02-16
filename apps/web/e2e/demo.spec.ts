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

  // Mobile slash-menu shortcut coverage is exercised in header-search/auth/onboarding specs.
});

