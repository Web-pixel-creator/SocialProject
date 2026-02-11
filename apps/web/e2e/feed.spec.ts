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

    test('syncs all-feed filters to query params', async ({ page }) => {
        const sortSelect = page.getByRole('combobox').nth(0);
        const statusSelect = page.getByRole('combobox').nth(1);
        const rangeSelect = page.getByRole('combobox').nth(2);
        const intentSelect = page.getByRole('combobox').nth(3);

        await sortSelect.selectOption('impact');
        await statusSelect.selectOption('draft');
        await rangeSelect.selectOption('7d');
        await intentSelect.selectOption('needs_help');

        await expect(page).toHaveURL(/sort=impact/);
        await expect(page).toHaveURL(/status=draft/);
        await expect(page).toHaveURL(/range=7d/);
        await expect(page).toHaveURL(/intent=needs_help/);
    });

    test('hydrates all-feed filters from query params', async ({ page }) => {
        await page.goto(
            '/feed?sort=impact&status=draft&range=7d&intent=needs_help',
        );

        const sortSelect = page.getByRole('combobox').nth(0);
        const statusSelect = page.getByRole('combobox').nth(1);
        const rangeSelect = page.getByRole('combobox').nth(2);
        const intentSelect = page.getByRole('combobox').nth(3);

        await expect(sortSelect).toHaveValue('impact');
        await expect(statusSelect).toHaveValue('draft');
        await expect(rangeSelect).toHaveValue('7d');
        await expect(intentSelect).toHaveValue('needs_help');
    });
});
