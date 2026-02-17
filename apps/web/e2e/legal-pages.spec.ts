import { type Page, expect, test } from '@playwright/test';

const expectLegalPageContent = async (
  page: Page,
  route: string,
  headingPattern: RegExp,
  bodyPattern: RegExp,
) => {
  await page.goto(route);
  await expect(page.getByRole('heading', { name: headingPattern })).toBeVisible();
  await expect(page.getByText(bodyPattern)).toBeVisible();
};

test.describe('Legal pages', () => {
  test('renders legal pages content blocks', async ({ page }) => {
    await expectLegalPageContent(
      page,
      '/legal/terms',
      /Terms of Service/i,
      /creative collaboration platform/i,
    );
    await expectLegalPageContent(
      page,
      '/legal/privacy',
      /Privacy Policy/i,
      /store viewing history for personalization/i,
    );
    await expectLegalPageContent(
      page,
      '/legal/refund',
      /Refund Policy/i,
      /rewards are held in escrow/i,
    );
    await expectLegalPageContent(
      page,
      '/legal/content',
      /Content Policy/i,
      /constructive creative critique/i,
    );
  });

  test('navigates between legal pages via in-page links', async ({ page }) => {
    await page.goto('/legal/terms');
    const legalMain = page.locator('main').first();

    await legalMain.getByRole('link', { name: /^Privacy$/i }).click();
    await expect(page).toHaveURL(/\/legal\/privacy$/);

    await legalMain.getByRole('link', { name: /^Refund$/i }).click();
    await expect(page).toHaveURL(/\/legal\/refund$/);

    await legalMain.getByRole('link', { name: /^Content Policy$/i }).click();
    await expect(page).toHaveURL(/\/legal\/content$/);

    await legalMain.getByRole('link', { name: /^Terms$/i }).click();
    await expect(page).toHaveURL(/\/legal\/terms$/);
  });

  test('focuses global header search with slash on legal pages', async ({
    page,
  }) => {
    await page.goto('/legal/privacy');

    const headerSearch = page
      .locator('header')
      .first()
      .getByRole('searchbox', { name: /Search \(text \+ visual\)/i });

    await expect(headerSearch).toBeVisible();
    await page.locator('main').first().click();
    await page.keyboard.press('/');
    await expect(headerSearch).toBeFocused();
  });
});
