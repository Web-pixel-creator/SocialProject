import { expect, test } from '@playwright/test';

test.describe('Admin UX page', () => {
    test('renders safe missing-token state without crash', async ({ page }) => {
        await page.goto('/admin/ux');

        await expect(
            page.getByRole('heading', { name: /Admin UX Metrics/i }),
        ).toBeVisible();
        await expect(page.getByText(/Missing admin token/i)).toBeVisible();
    });
});
