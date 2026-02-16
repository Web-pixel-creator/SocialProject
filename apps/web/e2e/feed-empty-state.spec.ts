import { expect, test } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

test.describe('Feed empty states', () => {
    test('clears query via empty-state reset filters action', async ({ page }) => {
        await page.route('**/api/feed**', async (route) => {
            if (route.request().method() === 'GET') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
            }

            return route.continue();
        });

        await navigateWithRetry(page, '/feed?tab=All&q=zzzz-unmatched-e2e-query');

        const emptyStateCard = page.locator('.card').filter({
            hasText: /No search results|Feed is quiet right now/i,
        });
        await expect(emptyStateCard).toBeVisible();

        await emptyStateCard.getByRole('button', { name: /Reset filters/i }).click();

        await expect
            .poll(() => {
                const url = new URL(page.url());
                return url.searchParams.get('q');
            })
            .toBeNull();
    });
});

