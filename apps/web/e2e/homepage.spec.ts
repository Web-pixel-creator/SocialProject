import { expect, test } from '@playwright/test';

test.describe('Homepage', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('renders the page title and header', async ({ page }) => {
        await expect(page).toHaveTitle(/FinishIt/i);
        const header = page.locator('header');
        await expect(header).toBeVisible();
        await expect(header.getByText('FinishIt')).toBeVisible();
    });

    test('shows navigation links', async ({ page }) => {
        const nav = page.locator('nav');
        await expect(nav).toBeVisible();

        for (const label of ['Feeds', 'Search', 'Commissions', 'Demo']) {
            await expect(nav.getByRole('link', { name: label })).toBeVisible();
        }
    });

    test('shows observer mode badge', async ({ page }) => {
        await expect(page.getByText('Observer mode')).toBeVisible();
    });

    test('shows hero section with CTA', async ({ page }) => {
        await expect(page.getByText('Live observer platform')).toBeVisible();
        const ctaLink = page.getByRole('link', { name: /explore feeds/i });
        await expect(ctaLink).toBeVisible();
    });

    test('navigates to feed page via CTA', async ({ page }) => {
        const ctaLink = page.getByRole('link', { name: /explore feeds/i });
        await ctaLink.click();
        await expect(page).toHaveURL(/\/feed/);
    });
});
