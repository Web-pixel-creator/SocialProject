import { expect, test } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';
import {
    FEED_SEARCH_PLACEHOLDER,
    focusFeedContent,
    openFeed,
    openFiltersPanel,
} from './utils/feed';

test.describe('Feed navigation and filters', () => {
    test.beforeEach(async ({ page }) => {
        await openFeed(page);
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
        await navigateWithRetry(
            page,
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

    test('quick reset chips clear status, sort and range in order', async ({
        page,
    }) => {
        const readQueryParam = async (name: string) =>
            await page.evaluate((key) => {
                return new URL(window.location.href).searchParams.get(key);
            }, name);

        await navigateWithRetry(page, '/feed?sort=impact&status=release&range=7d');

        const allStatusesButton = page.getByRole('button', {
            name: /^All statuses$/i,
        });
        await expect(allStatusesButton).toBeVisible();
        await allStatusesButton.click();

        await expect.poll(() => readQueryParam('status')).toBe(null);
        await expect.poll(() => readQueryParam('sort')).toBe('impact');
        await expect.poll(() => readQueryParam('range')).toBe('7d');

        const recencyButton = page.getByRole('button', { name: /^Recency$/i });
        await expect(recencyButton).toBeVisible();
        await recencyButton.click();

        await expect.poll(() => readQueryParam('sort')).toBe(null);
        await expect.poll(() => readQueryParam('range')).toBe('7d');

        const last30DaysButton = page.getByRole('button', {
            name: /^Last 30 days$/i,
        });
        await expect(last30DaysButton).toBeVisible();
        await last30DaysButton.click();

        await expect.poll(() => readQueryParam('range')).toBe(null);
        await expect(page).toHaveURL(/\/feed$/);
    });

    test('focuses feed search with slash shortcut', async ({ page }) => {
        const feedSearch = page.getByPlaceholder(FEED_SEARCH_PLACEHOLDER);
        await expect(feedSearch).not.toBeFocused();
        await focusFeedContent(page);

        await page.keyboard.press('/');

        await expect(feedSearch).toBeFocused();
    });

    test('toggles filters panel with Shift+F on filterable tabs', async ({
        page,
    }) => {
        const filtersButton = page.getByRole('button', { name: /^Filters/i });
        await expect(filtersButton).toHaveAttribute('aria-expanded', 'false');
        await focusFeedContent(page);

        await page.keyboard.press('Shift+F');
        await expect(filtersButton).toHaveAttribute('aria-expanded', 'true');

        await page.keyboard.press('Shift+F');
        await expect(filtersButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('ignores Shift+F on tabs without filters panel', async ({ page }) => {
        await page.locator('summary').filter({ hasText: /^More$/i }).click();
        await page.getByRole('button', { name: /^Progress$/i }).click();
        await expect(page).toHaveURL(/tab=Progress/);
        await expect(page.getByRole('button', { name: /^Filters/i })).toHaveCount(0);
        await focusFeedContent(page);

        await page.keyboard.press('Shift+F');

        await expect(page.getByRole('button', { name: /^Filters/i })).toHaveCount(0);
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

        await openFeed(page);
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

        await page.getByRole('button', { name: /^All battles$/i }).click();
        await expect(page.getByText('Battle Pending E2E')).toBeVisible();
        await expect(page.getByText('Battle Changes E2E')).toBeVisible();
        await expect(page.getByText('Battle Merged E2E')).toBeVisible();
    });

    test('primary and more tabs switch feed and update query', async ({
        page,
    }) => {
        await page.getByRole('button', { name: /^Live Drafts$/i }).click();
        await expect(page).toHaveURL(/tab=Live(?:\+|%20)Drafts/);

        await page.getByRole('button', { name: /^Hot Now$/i }).click();
        await expect(page).toHaveURL(/tab=Hot(?:\+|%20)Now/);

        await page.getByRole('button', { name: /^Battles$/i }).click();
        await expect(page).toHaveURL(/tab=Battles/);

        await page.getByRole('button', { name: /^For You$/i }).click();
        await expect(page).toHaveURL(/tab=For(?:\+|%20)You/);

        await page.locator('summary').filter({ hasText: /^More$/i }).click();
        await page.getByRole('button', { name: /^GlowUps$/i }).click();
        await expect(page).toHaveURL(/tab=GlowUps/);
    });

    test('opens More menu via keyboard and selects tab', async ({ page }) => {
        const moreSummary = page.locator('summary').filter({ hasText: /^More$/i });

        await moreSummary.focus();
        await expect(moreSummary).toBeFocused();
        await page.keyboard.press('Enter');

        const glowUpsTab = page.getByRole('button', { name: /^GlowUps$/i });
        await expect(glowUpsTab).toBeVisible();

        await glowUpsTab.focus();
        await expect(glowUpsTab).toBeFocused();
        await page.keyboard.press('Enter');

        await expect(page).toHaveURL(/tab=GlowUps/);
    });

    test('closes desktop More menu with Escape', async ({ page }) => {
        const moreSummary = page.getByTestId('feed-more-summary');
        const moreDetails = page.getByTestId('feed-more-details');

        await moreSummary.focus();
        await moreSummary.press('Enter');
        await expect
            .poll(() =>
                moreDetails.evaluate((element) => {
                    return (element as HTMLDetailsElement).open;
                }),
            )
            .toBe(true);

        await moreSummary.press('Escape');
        await expect
            .poll(() =>
                moreDetails.evaluate((element) => {
                    return (element as HTMLDetailsElement).open;
                }),
            )
            .toBe(false);
    });

    test('closes desktop More menu on outside click', async ({ page }) => {
        const moreSummary = page.getByTestId('feed-more-summary');
        const moreDetails = page.getByTestId('feed-more-details');

        await moreSummary.click();
        await expect
            .poll(() =>
                moreDetails.evaluate((element) => {
                    return (element as HTMLDetailsElement).open;
                }),
            )
            .toBe(true);

        await page.getByRole('heading', { name: /Feeds/i }).click();

        await expect
            .poll(() =>
                moreDetails.evaluate((element) => {
                    return (element as HTMLDetailsElement).open;
                }),
            )
            .toBe(false);
    });

    test('keeps focus-visible ring classes on feed tab controls', async ({
        page,
    }) => {
        const allTab = page.getByRole('button', { name: /^All$/i });
        const moreSummary = page.getByTestId('feed-more-summary');

        await expect(allTab).toHaveClass(/focus-visible:ring-2/);
        await expect(moreSummary).toHaveClass(/focus-visible:ring-2/);
    });

    test('shows back-to-top button after scroll and returns to top', async ({
        page,
    }) => {
        await page.evaluate(() => {
            document.body.style.minHeight = '3000px';
            window.scrollTo({ top: 720 });
            window.dispatchEvent(new Event('scroll'));
        });

        const backToTopButton = page.getByRole('button', {
            name: /Back to top/i,
        });
        await expect(backToTopButton).toBeVisible();

        await backToTopButton.click();
        await expect
            .poll(() => page.evaluate(() => window.scrollY))
            .toBeLessThan(20);
    });

    test('applies observer offset class to back-to-top button in observer layout', async ({
        page,
    }) => {
        await page.evaluate(() => {
            document.body.style.minHeight = '3000px';
            window.scrollTo({ top: 720 });
            window.dispatchEvent(new Event('scroll'));
        });

        const backToTopButton = page.getByRole('button', {
            name: /Back to top/i,
        });
        await expect(backToTopButton).toBeVisible();
        await expect(backToTopButton).toHaveClass(/lg:right-\[22rem\]/);
    });

    test('does not render legacy focus hint and settings menu', async ({
        page,
    }) => {
        await expect(
            page.getByText(/Choose your feed mode|Got it/i),
        ).toHaveCount(0);
        await expect(page.locator('.settings-menu')).toHaveCount(0);
    });
});

