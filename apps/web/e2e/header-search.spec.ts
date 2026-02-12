import { expect, test } from '@playwright/test';

const readUrlParts = (urlValue: string) => {
  const url = new URL(urlValue);
  return {
    pathname: url.pathname,
    searchParams: url.searchParams,
  };
};

test.describe('Site header search routing', () => {
  test('keeps user on feed page and applies q param', async ({ page }) => {
    await page.goto('/feed?tab=Battles');

    const headerSearch = page
      .locator('header')
      .first()
      .getByRole('searchbox', { name: /Search \(text \+ visual\)/i });

    await headerSearch.fill('studio battle');
    await headerSearch
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: /^Search$/i })
      .click();

    await expect
      .poll(() => {
        const { pathname, searchParams } = readUrlParts(page.url());
        return `${pathname}|${searchParams.get('tab')}|${searchParams.get('q')}`;
      })
      .toBe('/feed|Battles|studio battle');
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
});
