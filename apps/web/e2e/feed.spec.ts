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

    test('filters battles by decision status chips', async ({ page }) => {
        await page.route('**/api/**', async (route) => {
            const requestUrl = new URL(route.request().url());
            const path = requestUrl.pathname;
            const method = route.request().method();

            if (method === 'GET' && path === '/api/feeds/battles') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: 'battle-pending-e2e',
                            title: 'Battle Pending E2E',
                            leftLabel: 'Studio A',
                            rightLabel: 'Studio B',
                            leftVote: 51,
                            rightVote: 49,
                            glowUpScore: 12.4,
                            prCount: 6,
                            fixCount: 2,
                            decision: 'pending',
                        },
                        {
                            id: 'battle-changes-e2e',
                            title: 'Battle Changes E2E',
                            leftLabel: 'Studio C',
                            rightLabel: 'Studio D',
                            leftVote: 48,
                            rightVote: 52,
                            glowUpScore: 11.1,
                            prCount: 5,
                            fixCount: 3,
                            decision: 'changes_requested',
                        },
                        {
                            id: 'battle-merged-e2e',
                            title: 'Battle Merged E2E',
                            leftLabel: 'Studio E',
                            rightLabel: 'Studio F',
                            leftVote: 57,
                            rightVote: 43,
                            glowUpScore: 14.2,
                            prCount: 8,
                            fixCount: 4,
                            decision: 'merged',
                        },
                    ]),
                });
            }

            if (method === 'POST' && path === '/api/telemetry/ux') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await page.goto('/feed');
        await page.getByRole('button', { name: /Battles/i }).click();
        await expect(page).toHaveURL(/tab=Battles/);

        await expect(page.getByText('Battle Pending E2E')).toBeVisible();
        await expect(page.getByText('Battle Changes E2E')).toBeVisible();
        await expect(page.getByText('Battle Merged E2E')).toBeVisible();

        await page.getByRole('button', { name: /^Pending$/i }).click();
        await expect(page.getByText('Battle Pending E2E')).toBeVisible();
        await expect(page.getByText('Battle Changes E2E')).toHaveCount(0);
        await expect(page.getByText('Battle Merged E2E')).toHaveCount(0);

        await page.getByRole('button', { name: /Changes requested/i }).click();
        await expect(page.getByText('Battle Pending E2E')).toHaveCount(0);
        await expect(page.getByText('Battle Changes E2E')).toBeVisible();
        await expect(page.getByText('Battle Merged E2E')).toHaveCount(0);

        await page.getByRole('button', { name: /^Merged$/i }).click();
        await expect(page.getByText('Battle Pending E2E')).toHaveCount(0);
        await expect(page.getByText('Battle Changes E2E')).toHaveCount(0);
        await expect(page.getByText('Battle Merged E2E')).toBeVisible();

        await page.getByRole('button', { name: /All battles/i }).click();
        await expect(page.getByText('Battle Pending E2E')).toBeVisible();
        await expect(page.getByText('Battle Changes E2E')).toBeVisible();
        await expect(page.getByText('Battle Merged E2E')).toBeVisible();
    });

    test('quick scopes switch feed tabs and update query', async ({ page }) => {
        await page.goto('/feed');

        await page.getByRole('button', { name: /^Live$/i }).click();
        await expect(page).toHaveURL(/tab=Live(?:\+|%20)Drafts/);

        await page.getByRole('button', { name: /^Top 24h$/i }).click();
        await expect(page).toHaveURL(/tab=Hot(?:\+|%20)Now/);

        await page.getByRole('button', { name: /^GlowUp$/i }).click();
        await expect(page).toHaveURL(/tab=GlowUps/);

        await page.getByRole('button', { name: /^Battle radar$/i }).click();
        await expect(page).toHaveURL(/tab=Battles/);

        await page.getByRole('button', { name: /^Following$/i }).click();
        await expect(page).toHaveURL(/tab=For(?:\+|%20)You/);
    });
});
