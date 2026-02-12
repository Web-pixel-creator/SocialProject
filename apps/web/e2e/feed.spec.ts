import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.describe('Feed page', () => {
    const openFiltersPanel = async (page: Page) => {
        const filtersButton = page.getByRole('button', {
            name: /Filters/i,
        });
        await filtersButton.click();
    };

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
        const battlesTab = page.getByRole('button', { name: /^Battles$/i });
        await battlesTab.click();
        await expect(page).toHaveURL(/tab=Battles/);
    });

    test('syncs all-feed filters to query params', async ({ page }) => {
        await openFiltersPanel(page);

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
        await openFiltersPanel(page);

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
        await page.getByRole('button', { name: /^Battles$/i }).click();
        await expect(page).toHaveURL(/tab=Battles/);
        await openFiltersPanel(page);

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

    test('primary and more tabs switch feed and update query', async ({
        page,
    }) => {
        await page.goto('/feed');

        await page.getByRole('button', { name: /^Live Drafts$/i }).click();
        await expect(page).toHaveURL(/tab=Live(?:\+|%20)Drafts/);

        await page.getByRole('button', { name: /^Hot Now$/i }).click();
        await expect(page).toHaveURL(/tab=Hot(?:\+|%20)Now/);

        await page.getByRole('button', { name: /^Battles$/i }).click();
        await expect(page).toHaveURL(/tab=Battles/);

        await page.getByRole('button', { name: /^For You$/i }).click();
        await expect(page).toHaveURL(/tab=For(?:\+|%20)You/);

        await page
            .locator('summary')
            .filter({ hasText: /^More$/i })
            .click();
        await page.getByRole('button', { name: /^GlowUps$/i }).click();
        await expect(page).toHaveURL(/tab=GlowUps/);
    });

    test('switches between observer and focus modes and persists preference', async ({
        page,
    }) => {
        const mainShell = page.locator('main.feed-shell');
        const observerModeButton = page.getByRole('button', {
            name: /Observer mode/i,
        });
        const focusModeButton = page.getByRole('button', {
            name: /Focus mode/i,
        });

        await expect(observerModeButton).toHaveAttribute('aria-pressed', 'true');
        await expect(mainShell).not.toHaveClass(/feed-shell-focus/);

        await focusModeButton.click();
        await expect(focusModeButton).toHaveAttribute('aria-pressed', 'true');
        await expect(mainShell).toHaveClass(/feed-shell-focus/);
        await expect
            .poll(
                async () =>
                    await page.evaluate(() =>
                        window.localStorage.getItem('finishit-feed-view-mode'),
                    ),
            )
            .toBe('focus');

        await observerModeButton.click();
        await expect(observerModeButton).toHaveAttribute('aria-pressed', 'true');
        await expect(mainShell).not.toHaveClass(/feed-shell-focus/);
        await expect
            .poll(
                async () =>
                    await page.evaluate(() =>
                        window.localStorage.getItem('finishit-feed-view-mode'),
                    ),
            )
            .toBe('observer');
    });

    test('persists desktop observer rail panel visibility after reload', async ({
        page,
    }) => {
        await page.evaluate(() =>
            window.localStorage.removeItem('finishit-observer-rail-panels'),
        );
        await page.reload();

        const desktopControls = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        await expect(desktopControls).toBeVisible();

        const glowUpsToggle = desktopControls.getByRole('button', {
            name: /Top GlowUps/i,
        });
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'true');

        await glowUpsToggle.click();
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'false');

        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-observer-rail-panels'),
                ),
            )
            .toContain('"glowUps":false');

        await page.reload();

        const desktopControlsAfterReload = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        const glowUpsToggleAfterReload = desktopControlsAfterReload.getByRole(
            'button',
            {
                name: /Top GlowUps/i,
            },
        );
        await expect(glowUpsToggleAfterReload).toHaveAttribute(
            'aria-pressed',
            'false',
        );
    });

    test('shows and applies mobile observer rail panel controls', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/feed');

        const mobileControls = page.getByTestId('observer-rail-mobile-controls');
        await expect(mobileControls).toBeVisible();

        const trendingButton = mobileControls.getByRole('button', {
            name: /Trending battles/i,
        });
        const activityButton = mobileControls.getByRole('button', {
            name: /Live activity stream/i,
        });
        const glowUpsButton = mobileControls.getByRole('button', {
            name: /Top GlowUps/i,
        });
        const studiosButton = mobileControls.getByRole('button', {
            name: /Top studios/i,
        });

        await mobileControls.getByRole('button', { name: /Hide all/i }).click();
        await expect(trendingButton).toHaveAttribute('aria-pressed', 'false');
        await expect(activityButton).toHaveAttribute('aria-pressed', 'false');
        await expect(glowUpsButton).toHaveAttribute('aria-pressed', 'false');
        await expect(studiosButton).toHaveAttribute('aria-pressed', 'false');

        await mobileControls.getByRole('button', { name: /Show all/i }).click();
        await expect(trendingButton).toHaveAttribute('aria-pressed', 'true');
        await expect(activityButton).toHaveAttribute('aria-pressed', 'true');
        await expect(glowUpsButton).toHaveAttribute('aria-pressed', 'true');
        await expect(studiosButton).toHaveAttribute('aria-pressed', 'true');
    });

    test('shows language switcher inside feed mobile menu', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/feed');

        await page
            .locator('.observer-feed-header')
            .getByRole('button', { name: /^Menu$/i })
            .click();
        const mobileDialog = page.getByRole('dialog', {
            name: /Observer navigation/i,
        });
        await expect(mobileDialog).toBeVisible();

        const ruButton = mobileDialog.getByRole('button', {
            name: /Switch language to RU/i,
        });
        await ruButton.click();
        await expect
            .poll(
                async () =>
                    await page.evaluate(() =>
                        window.localStorage.getItem('finishit-language'),
                    ),
            )
            .toBe('ru');
        await expect
            .poll(
                async () => await page.evaluate(() => document.documentElement.lang),
            )
            .toBe('ru');
    });
});
