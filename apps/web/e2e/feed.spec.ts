import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

test.describe('Feed page', () => {
    const openFiltersPanel = async (page: Page) => {
        const filtersButton = page.getByRole('button', {
            name: /^Filters(?:\s*[+-])?$/i,
        });
        await filtersButton.click();
    };
    const focusFeedContent = async (page: Page) => {
        await page.getByRole('heading', { name: /Feeds/i }).click();
    };

    test.beforeEach(async ({ page }) => {
        await navigateWithRetry(page, '/feed');
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
        await navigateWithRetry(page, 
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
        const feedSearch = page.getByPlaceholder(
            'Search drafts, studios, PRs... (text + visual)',
        );
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
        await page
            .locator('summary')
            .filter({ hasText: /^More$/i })
            .click();
        await page.getByRole('button', { name: /^Progress$/i }).click();
        await expect(page).toHaveURL(/tab=Progress/);
        await expect(page.getByRole('button', { name: /^Filters/i })).toHaveCount(
            0,
        );
        await focusFeedContent(page);

        await page.keyboard.press('Shift+F');

        await expect(page.getByRole('button', { name: /^Filters/i })).toHaveCount(
            0,
        );
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

        await navigateWithRetry(page, '/feed');
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
        await navigateWithRetry(page, '/feed');

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

    test('opens More menu via keyboard and selects tab', async ({ page }) => {
        const moreSummary = page
            .locator('summary')
            .filter({ hasText: /^More$/i });

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

    test('renders observer-only mode with rail visible and no focus toggle', async ({
        page,
    }) => {
        const observerModeChip = page
            .locator('.observer-feed-header')
            .getByText(/Observer mode/i)
            .first();
        const observerRailShell = page.getByTestId('feed-right-rail-shell');

        await expect(observerModeChip).toBeVisible();
        await expect(
            page.getByRole('button', { name: /Focus mode/i }),
        ).toHaveCount(0);
        await expect(observerRailShell).toHaveClass(
            /observer-right-rail-shell-open/,
        );
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-feed-view-mode'),
                ),
            )
            .toBeNull();
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

        const showAllButton = desktopControls.getByRole('button', {
            name: /Show all/i,
        });
        const hideAllButton = desktopControls.getByRole('button', {
            name: /Hide all/i,
        });

        await expect(showAllButton).toBeVisible();
        await expect(hideAllButton).toBeVisible();

        await hideAllButton.click();
        await expect(showAllButton).toBeEnabled();
        await expect(hideAllButton).toBeDisabled();

        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-observer-rail-panels'),
                ),
            )
            .toContain('"battles":false');

        await page.reload();

        const desktopControlsAfterReload = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        await expect(
            desktopControlsAfterReload.getByRole('button', {
                name: /Show all/i,
            }),
        ).toBeEnabled();
        await expect(
            desktopControlsAfterReload.getByRole('button', {
                name: /Hide all/i,
            }),
        ).toBeDisabled();
        await expect(
            page
                .locator('.observer-right-rail')
                .getByRole('button', {
                    name: /Restore defaults/i,
                })
                .first(),
        ).toBeVisible();
    });

    test('restores hide-all panel visibility state after reload', async ({
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

        await desktopControls.getByRole('button', { name: /Hide all/i }).click();

        await expect(
            desktopControls.getByRole('button', { name: /Show all/i }),
        ).toBeEnabled();
        await expect(
            desktopControls.getByRole('button', { name: /Hide all/i }),
        ).toBeDisabled();
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-observer-rail-panels'),
                ),
            )
            .toContain('"battles":false');
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-observer-rail-panels'),
                ),
            )
            .toContain('"activity":false');
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-observer-rail-panels'),
                ),
            )
            .toContain('"glowUps":false');
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-observer-rail-panels'),
                ),
            )
            .toContain('"studios":false');

        await page.reload();

        const desktopControlsAfterReload = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        await expect(
            desktopControlsAfterReload.getByRole('button', {
                name: /Show all/i,
            }),
        ).toBeEnabled();
        await expect(
            desktopControlsAfterReload.getByRole('button', {
                name: /Hide all/i,
            }),
        ).toBeDisabled();
    });

    test('uses flat observer rail panel toggles without close or more gates', async ({
        page,
    }) => {
        const desktopControls = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        await expect(desktopControls).toBeVisible();

        await expect(
            desktopControls.getByRole('button', { name: /^Close$/i }),
        ).toHaveCount(0);
        await expect(
            desktopControls.getByRole('button', { name: /^More$/i }),
        ).toHaveCount(0);

        await expect(
            desktopControls.getByRole('button', {
                name: /Show all/i,
            }),
        ).toBeVisible();
        await expect(
            desktopControls.getByRole('button', {
                name: /Hide all/i,
            }),
        ).toBeVisible();
        await expect(
            desktopControls.getByRole('button', { name: /Trending battles/i }),
        ).toHaveCount(0);
        await expect(
            desktopControls.getByRole('button', { name: /Live activity stream/i }),
        ).toHaveCount(0);
        await expect(
            desktopControls.getByRole('button', { name: /Top GlowUps/i }),
        ).toHaveCount(0);
        await expect(
            desktopControls.getByRole('button', { name: /Top studios/i }),
        ).toHaveCount(0);
    });

    test('shows all rail widgets when pressing show all', async ({ page }) => {
        const desktopControls = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        await expect(desktopControls).toBeVisible();

        const showAllButton = desktopControls.getByRole('button', {
            name: /Show all/i,
        });
        const hideAllButton = desktopControls.getByRole('button', {
            name: /Hide all/i,
        });

        await hideAllButton.click();
        await expect(showAllButton).toBeEnabled();
        await showAllButton.click();

        await expect(
            page
                .locator('.observer-right-rail')
                .getByRole('heading', { name: /Top GlowUps/i }),
        ).toBeVisible();
        await expect(
            page
                .locator('.observer-right-rail')
                .getByRole('heading', { name: /Top studios/i }),
        ).toBeVisible();
        await expect(showAllButton).toBeDisabled();
        await expect(hideAllButton).toBeEnabled();
    });

    test('supports keyboard toggling for desktop observer panel controls', async ({
        page,
    }) => {
        const desktopControls = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        await expect(desktopControls).toBeVisible();

        const hideAllButton = desktopControls.getByRole('button', {
            name: /Hide all/i,
        });
        const showAllButton = desktopControls.getByRole('button', {
            name: /Show all/i,
        });
        const visiblePanelsBadge = page
            .locator('.observer-right-rail')
            .locator('span')
            .filter({ hasText: /Panels/i })
            .first();

        await hideAllButton.focus();
        await expect(hideAllButton).toBeFocused();
        await expect(hideAllButton).toBeEnabled();
        await hideAllButton.press('Enter');
        await expect(visiblePanelsBadge).toContainText(/0\s*\/\s*4/i);
        await expect(showAllButton).toBeEnabled();
        await expect(hideAllButton).toBeDisabled();

        await showAllButton.focus();
        await expect(showAllButton).toBeFocused();
        await expect(showAllButton).toBeEnabled();
        await showAllButton.press('Space');
        await expect(visiblePanelsBadge).toContainText(/4\s*\/\s*4/i);
        await expect(showAllButton).toBeDisabled();
        await expect(hideAllButton).toBeEnabled();
    });

    test('updates visible panels counter and restores defaults after hide all', async ({
        page,
    }) => {
        const rightRail = page.locator('.observer-right-rail');
        const visiblePanelsBadge = rightRail
            .locator('span')
            .filter({ hasText: /Panels:/i })
            .first();
        const desktopControls = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        await expect(desktopControls).toBeVisible();

        const hideAllButton = desktopControls.getByRole('button', {
            name: /Hide all/i,
        });
        const showAllButton = desktopControls.getByRole('button', {
            name: /Show all/i,
        });

        await expect(visiblePanelsBadge).toContainText(/2\s*\/\s*4/i);

        await hideAllButton.click();

        await expect(visiblePanelsBadge).toContainText(/0\s*\/\s*4/i);
        await expect(showAllButton).toBeEnabled();
        await expect(hideAllButton).toBeDisabled();

        await rightRail
            .getByRole('button', {
                name: /Restore defaults/i,
            })
            .first()
            .click();

        await expect(visiblePanelsBadge).toContainText(/2\s*\/\s*4/i);
        await expect(showAllButton).toBeEnabled();
        await expect(hideAllButton).toBeEnabled();
    });

    test('respects reduced motion preference for live indicators', async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await navigateWithRetry(page, '/feed');

        const liveDot = page.locator('.observer-feed-header .icon-breathe').first();
        await expect(liveDot).toBeVisible();

        const animationState = await liveDot.evaluate((element) => {
            const styles = window.getComputedStyle(element);
            return {
                animationName: styles.animationName,
                animationDurationSeconds: Number.parseFloat(
                    styles.animationDuration,
                ),
            };
        });

        expect(animationState.animationName).toBe('none');
        expect(Number.isNaN(animationState.animationDurationSeconds)).toBe(
            false,
        );
        expect(animationState.animationDurationSeconds).toBeLessThan(0.001);
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
            page.getByText(
                /Choose your feed mode|Got it/i,
            ),
        ).toHaveCount(0);
        await expect(page.locator('.settings-menu')).toHaveCount(0);
    });
    test('shows observer rail panel controls on mobile viewport', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await navigateWithRetry(page, '/feed');

        const mobileControls = page.getByTestId('observer-rail-mobile-controls');
        const rightRailShell = page.getByTestId('feed-right-rail-shell');
        await expect(rightRailShell).toBeVisible();
        await expect(mobileControls).toBeVisible();

        const showAllButton = mobileControls.getByRole('button', {
            name: /Show all/i,
        });
        const hideAllButton = mobileControls.getByRole('button', {
            name: /Hide all/i,
        });
        await expect(showAllButton).toBeVisible();
        await expect(hideAllButton).toBeVisible();

        await hideAllButton.click();
        await expect(showAllButton).toBeEnabled();
        await expect(hideAllButton).toBeDisabled();
        await expect(
            page
                .locator('.observer-right-rail')
                .getByText(/No rail widgets selected/i)
                .first(),
        ).toBeVisible();

        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-observer-rail-panels'),
                ),
            )
            .toContain('"studios":false');
    });

    test('supports slash and Shift+F shortcuts on mobile feed controls', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await navigateWithRetry(page, '/feed');

        const feedSearch = page.getByPlaceholder(
            'Search drafts, studios, PRs... (text + visual)',
        );
        await expect(feedSearch).toBeVisible();
        await expect(feedSearch).not.toBeFocused();

        await focusFeedContent(page);
        await page.keyboard.press('/');
        await expect(feedSearch).toBeFocused();

        await focusFeedContent(page);
        const filtersButton = page
            .locator('button[aria-expanded]')
            .filter({ hasText: /Filters/i })
            .first();
        await expect(filtersButton).toHaveAttribute('aria-expanded', 'false');

        await page.keyboard.press('Shift+F');
        await expect(filtersButton).toHaveAttribute('aria-expanded', 'true');

        const filtersDialog = page.getByRole('dialog', { name: /Filters/i });
        const filtersCloseButton = filtersDialog.getByRole('button', {
            name: /Close/i,
        });
        await expect(filtersCloseButton).toBeFocused();

        await page.keyboard.press('Shift+F');
        await expect(filtersDialog).toHaveCount(0);
        await expect(filtersButton).toBeFocused();
        await expect(filtersButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('keeps right rail visible on mobile observer layout', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await navigateWithRetry(page, '/feed');

        const observerModeChip = page
            .locator('.observer-feed-header')
            .getByText(/Observer mode/i)
            .first();
        const rightRailShell = page.getByTestId('feed-right-rail-shell');

        await expect(observerModeChip).toBeVisible();
        await expect(rightRailShell).toHaveClass(
            /observer-right-rail-shell-open/,
        );
        await expect(rightRailShell).toBeVisible();
        await expect(
            page.getByRole('button', { name: /Focus mode/i }),
        ).toHaveCount(0);
    });

    test('opens and closes feed mobile menu without inline language switcher', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await navigateWithRetry(page, '/feed');

        await page
            .locator('.observer-feed-header')
            .getByRole('button', { name: /Menu/i })
            .click();
        const mobileDialog = page.getByRole('dialog', {
            name: /Observer navigation/i,
        });
        await expect(mobileDialog).toBeVisible();
        await expect(
            mobileDialog.getByRole('button', {
                name: /Switch language/i,
            }),
        ).toHaveCount(0);

        await mobileDialog
            .getByRole('button', { name: /Close/i })
            .click();
        await expect(mobileDialog).toHaveCount(0);
    });

    test('restores focus to mobile menu trigger after closing navigation dialog', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await navigateWithRetry(page, '/feed');

        const menuButton = page
            .locator('.observer-feed-header')
            .getByRole('button', { name: /Menu/i });
        await menuButton.click();

        const mobileDialog = page.getByRole('dialog', {
            name: /Observer navigation/i,
        });
        const closeButton = mobileDialog.getByRole('button', { name: /Close/i });

        await expect(closeButton).toBeFocused();
        await closeButton.click();
        await expect(mobileDialog).toHaveCount(0);
        await expect(menuButton).toBeFocused();
    });

    test('restores focus to mobile More and Filters triggers after closing overlays', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await navigateWithRetry(page, '/feed');

        const moreButton = page
            .locator('button[aria-expanded]')
            .filter({ hasText: /More/i })
            .first();
        await expect(moreButton).toBeVisible();
        await moreButton.click();

        const moreDialog = page.getByRole('dialog', { name: /More/i });
        const moreCloseButton = moreDialog.getByRole('button', { name: /Close/i });
        await expect(moreCloseButton).toBeFocused();
        await moreCloseButton.click();
        await expect(moreDialog).toHaveCount(0);
        await expect(moreButton).toBeFocused();

        const filtersButton = page
            .locator('button[aria-expanded]')
            .filter({ hasText: /Filters/i })
            .first();
        await expect(filtersButton).toBeVisible();
        await filtersButton.click();

        const filtersDialog = page.getByRole('dialog', { name: /Filters/i });
        const filtersCloseButton = filtersDialog.getByRole('button', {
            name: /Close/i,
        });
        await expect(filtersCloseButton).toBeFocused();
        await filtersCloseButton.click();
        await expect(filtersDialog).toHaveCount(0);
        await expect(filtersButton).toBeFocused();
    });

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


