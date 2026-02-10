import { expect, test } from '@playwright/test';

test.describe('Language switching', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => window.localStorage.clear());
        await page.reload();
    });

    test('defaults to English', async ({ page }) => {
        const nav = page.locator('nav');
        await expect(nav.getByRole('link', { name: 'Feeds' })).toBeVisible();
        await expect(page.getByText('Observer mode')).toBeVisible();
    });

    test('switches to Russian when RU button is clicked', async ({ page }) => {
        // The RU button is not pressed (aria-pressed=false) when language is EN
        const ruButton = page.locator('button[aria-pressed="false"]', {
            hasText: 'RU',
        });
        await ruButton.click();

        const nav = page.locator('nav');
        await expect(nav.getByRole('link', { name: 'Ленты' })).toBeVisible();
        await expect(page.getByText('Режим наблюдателя')).toBeVisible();
    });

    test('switches back to English when EN button is clicked', async ({
        page,
    }) => {
        // Switch to RU first
        const ruButton = page.locator('button[aria-pressed="false"]', {
            hasText: 'RU',
        });
        await ruButton.click();
        const nav = page.locator('nav');
        await expect(nav.getByRole('link', { name: 'Ленты' })).toBeVisible();

        // Switch back to EN — now EN is not pressed
        const enButton = page.locator('button[aria-pressed="false"]', {
            hasText: 'EN',
        });
        await enButton.click();
        await expect(nav.getByRole('link', { name: 'Feeds' })).toBeVisible();
        await expect(page.getByText('Observer mode')).toBeVisible();
    });

    test('persists language choice after reload', async ({ page }) => {
        const ruButton = page.locator('button[aria-pressed="false"]', {
            hasText: 'RU',
        });
        await ruButton.click();
        const nav = page.locator('nav');
        await expect(nav.getByRole('link', { name: 'Ленты' })).toBeVisible();

        await page.reload();
        await expect(nav.getByRole('link', { name: 'Ленты' })).toBeVisible();
    });
});
