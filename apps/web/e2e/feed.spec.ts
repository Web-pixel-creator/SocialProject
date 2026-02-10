import { expect, test } from '@playwright/test';

test.describe('Feed page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/feed');
    });

    test('renders the feed page with header', async ({ page }) => {
        await expect(page.locator('header').first()).toBeVisible();
    });

    test('shows tab bar with default All tab', async ({ page }) => {
        const allTab = page.getByRole('button', { name: /^All$/i });
        await expect(allTab).toBeVisible();
    });

    test('switches to Battles tab', async ({ page }) => {
        const battlesTab = page.getByRole('button', { name: /Battles/i });
        await battlesTab.click();
        await expect(page).toHaveURL(/tab=Battles/);
    });
});
