import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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

    test('quick reset chips clear status, sort and range in order', async ({
        page,
    }) => {
        const readQueryParam = async (name: string) =>
            await page.evaluate((key) => {
                return new URL(window.location.href).searchParams.get(key);
            }, name);

        await page.goto('/feed?sort=impact&status=release&range=7d');

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

        await page.getByRole('button', { name: /^All battles$/i }).click();
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
        await page.keyboard.press('Enter');
        await expect
            .poll(() =>
                moreDetails.evaluate((element) => {
                    return (element as HTMLDetailsElement).open;
                }),
            )
            .toBe(true);

        await page.keyboard.press('Escape');
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

    test('supports keyboard toggling for observer and focus modes', async ({
        page,
    }) => {
        const observerModeButton = page.getByRole('button', {
            name: /Observer mode/i,
        });
        const focusModeButton = page.getByRole('button', {
            name: /Focus mode/i,
        });
        const observerRailShell = page.getByTestId('feed-right-rail-shell');

        await focusModeButton.focus();
        await expect(focusModeButton).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(focusModeButton).toHaveAttribute('aria-pressed', 'true');
        await expect(observerRailShell).toHaveClass(
            /observer-right-rail-shell-collapsed/,
        );

        await observerModeButton.focus();
        await expect(observerModeButton).toBeFocused();
        await page.keyboard.press('Space');
        await expect(observerModeButton).toHaveAttribute('aria-pressed', 'true');
        await expect(observerRailShell).toHaveClass(
            /observer-right-rail-shell-open/,
        );
    });

    test('restores focus mode from localStorage after reload', async ({
        page,
    }) => {
        const focusModeButton = page.getByRole('button', { name: /Focus mode/i });
        const observerRailShell = page.getByTestId('feed-right-rail-shell');

        await focusModeButton.click();
        await expect(observerRailShell).toHaveClass(
            /observer-right-rail-shell-collapsed/,
        );

        await page.reload();

        await expect(focusModeButton).toHaveAttribute('aria-pressed', 'true');
        await expect(observerRailShell).toHaveClass(
            /observer-right-rail-shell-collapsed/,
        );
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

        const battlesToggle = desktopControls.getByRole('button', {
            name: /Trending battles/i,
        });
        const activityToggle = desktopControls.getByRole('button', {
            name: /Live activity stream/i,
        });
        const glowUpsToggle = desktopControls.getByRole('button', {
            name: /Top GlowUps/i,
        });
        const studiosToggle = desktopControls.getByRole('button', {
            name: /Top studios/i,
        });

        await expect(battlesToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(activityToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(studiosToggle).toHaveAttribute('aria-pressed', 'false');

        await page.reload();

        const desktopControlsAfterReload = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        await expect(
            desktopControlsAfterReload.getByRole('button', {
                name: /Trending battles/i,
            }),
        ).toHaveAttribute('aria-pressed', 'false');
        await expect(
            desktopControlsAfterReload.getByRole('button', {
                name: /Live activity stream/i,
            }),
        ).toHaveAttribute('aria-pressed', 'false');
        await expect(
            desktopControlsAfterReload.getByRole('button', {
                name: /Top GlowUps/i,
            }),
        ).toHaveAttribute('aria-pressed', 'false');
        await expect(
            desktopControlsAfterReload.getByRole('button', {
                name: /Top studios/i,
            }),
        ).toHaveAttribute('aria-pressed', 'false');
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
            desktopControls.getByRole('button', { name: /Trending battles/i }),
        ).toBeVisible();
        await expect(
            desktopControls.getByRole('button', { name: /Live activity stream/i }),
        ).toBeVisible();
        await expect(
            desktopControls.getByRole('button', { name: /Top GlowUps/i }),
        ).toBeVisible();
        await expect(
            desktopControls.getByRole('button', { name: /Top studios/i }),
        ).toBeVisible();
    });

    test('toggles glowups and studios panels independently', async ({ page }) => {
        const desktopControls = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        await expect(desktopControls).toBeVisible();

        const glowUpsToggle = desktopControls.getByRole('button', {
            name: /Top GlowUps/i,
        });
        const studiosToggle = desktopControls.getByRole('button', {
            name: /Top studios/i,
        });

        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(studiosToggle).toHaveAttribute('aria-pressed', 'true');

        await glowUpsToggle.click();
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(studiosToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(
            page
                .locator('.observer-right-rail')
                .getByRole('heading', { name: /Top GlowUps/i }),
        ).toHaveCount(0);
        await expect(
            page
                .locator('.observer-right-rail')
                .getByRole('heading', { name: /Top studios/i }),
        ).toBeVisible();

        await studiosToggle.click();
        await expect(studiosToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(
            page
                .locator('.observer-right-rail')
                .getByRole('heading', { name: /Top studios/i }),
        ).toHaveCount(0);

        await glowUpsToggle.click();
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(
            page
                .locator('.observer-right-rail')
                .getByRole('heading', { name: /Top GlowUps/i }),
        ).toBeVisible();
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
        const glowUpsToggle = desktopControls.getByRole('button', {
            name: /Top GlowUps/i,
        });
        const battlesToggle = desktopControls.getByRole('button', {
            name: /Trending battles/i,
        });
        const activityToggle = desktopControls.getByRole('button', {
            name: /Live activity stream/i,
        });
        const studiosToggle = desktopControls.getByRole('button', {
            name: /Top studios/i,
        });

        await hideAllButton.focus();
        await expect(hideAllButton).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(battlesToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(activityToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(studiosToggle).toHaveAttribute('aria-pressed', 'false');

        await showAllButton.focus();
        await expect(showAllButton).toBeFocused();
        await page.keyboard.press('Space');
        await expect(battlesToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(activityToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(studiosToggle).toHaveAttribute('aria-pressed', 'true');

        await glowUpsToggle.focus();
        await expect(glowUpsToggle).toBeFocused();
        await page.keyboard.press('Space');
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'false');
    });

    test('updates visible panels counter and restores defaults after hide all', async ({
        page,
    }) => {
        const rightRail = page.locator('.observer-right-rail');
        const visiblePanelsBadge = rightRail
            .locator('span')
            .filter({ hasText: /Visible panels:/i })
            .first();
        const desktopControls = page.getByTestId(
            'observer-rail-desktop-controls',
        );
        await expect(desktopControls).toBeVisible();

        const hideAllButton = desktopControls.getByRole('button', {
            name: /Hide all/i,
        });
        const battlesToggle = desktopControls.getByRole('button', {
            name: /Trending battles/i,
        });
        const activityToggle = desktopControls.getByRole('button', {
            name: /Live activity stream/i,
        });
        const glowUpsToggle = desktopControls.getByRole('button', {
            name: /Top GlowUps/i,
        });
        const studiosToggle = desktopControls.getByRole('button', {
            name: /Top studios/i,
        });

        await expect(visiblePanelsBadge).toContainText(/4\s*\/\s*4/i);

        await hideAllButton.click();

        await expect(visiblePanelsBadge).toContainText(/0\s*\/\s*4/i);
        await expect(battlesToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(activityToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(studiosToggle).toHaveAttribute('aria-pressed', 'false');

        await rightRail
            .getByRole('button', { name: /Restore defaults/i })
            .first()
            .click();

        await expect(visiblePanelsBadge).toContainText(/4\s*\/\s*4/i);
        await expect(battlesToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(activityToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(glowUpsToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(studiosToggle).toHaveAttribute('aria-pressed', 'true');
    });

    test('respects reduced motion preference for live indicators', async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/feed');

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

    test('applies observer offset class to back-to-top button only in observer mode', async ({
        page,
    }) => {
        const focusModeButton = page.getByRole('button', { name: /Focus mode/i });
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

        await focusModeButton.click();
        await page.evaluate(() => {
            window.scrollTo({ top: 720 });
            window.dispatchEvent(new Event('scroll'));
        });

        const backToTopButtonInFocus = page.getByRole('button', {
            name: /Back to top/i,
        });
        await expect(backToTopButtonInFocus).toBeVisible();
        await expect(backToTopButtonInFocus).not.toHaveClass(
            /lg:right-\[22rem\]/,
        );
    });

    test('shows view-mode hint only once after dismiss', async ({ page }) => {
        await page.evaluate(() =>
            window.localStorage.removeItem('finishit-feed-view-hint-seen'),
        );
        await page.reload();

        const hintTitle = page.getByText(
            /Choose your feed mode|Выберите режим ленты/i,
        );
        const dismissButton = page.getByRole('button', {
            name: /Got it|Понятно/i,
        });

        await expect(hintTitle).toBeVisible();
        await dismissButton.click();
        await expect(hintTitle).toHaveCount(0);

        await expect
            .poll(
                async () =>
                    await page.evaluate(() =>
                        window.localStorage.getItem(
                            'finishit-feed-view-hint-seen',
                        ),
                    ),
            )
            .toBe('1');

        await page.reload();
        await expect(
            page.getByText(/Choose your feed mode|Выберите режим ленты/i),
        ).toHaveCount(0);
    });

    test('switches language from desktop settings menu', async ({ page }) => {
        await page.evaluate(() =>
            window.localStorage.removeItem('finishit-language'),
        );
        await page.reload();

        const settingsSummary = page.locator('.settings-menu summary');
        await settingsSummary.click();

        const ruButton = page
            .locator('.settings-menu')
            .getByRole('button', { name: /Switch language to RU/i });
        await expect(ruButton).toBeVisible();
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

    test('shows observer rail panel controls on mobile viewport', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/feed');

        const mobileControls = page.getByTestId('observer-rail-mobile-controls');
        const rightRailShell = page.getByTestId('feed-right-rail-shell');
        await expect(rightRailShell).toBeVisible();
        await expect(mobileControls).toBeVisible();

        const studiosToggle = mobileControls.getByRole('button', {
            name: /Top studios/i,
        });
        await expect(studiosToggle).toHaveAttribute('aria-pressed', 'true');
        await studiosToggle.click();
        await expect(studiosToggle).toHaveAttribute('aria-pressed', 'false');

        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-observer-rail-panels'),
                ),
            )
            .toContain('"studios":false');
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

        await page.goto('/feed?tab=All&q=zzzz-unmatched-e2e-query');

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
