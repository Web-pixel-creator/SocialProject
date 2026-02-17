import { expect, test } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';
import { openFeed } from './utils/feed';

test.describe('Feed observer rail', () => {
    test.beforeEach(async ({ page }) => {
        await openFeed(page);
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
            /\bobserver-right-rail-shell\b/,
        );
        await expect(observerRailShell).toHaveAttribute('aria-hidden', 'false');
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
            desktopControls.getByRole('button', { name: /Show all/i }),
        ).toBeVisible();
        await expect(
            desktopControls.getByRole('button', { name: /Hide all/i }),
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

    test('shows fallback rail status and default widgets when rail feeds fail', async ({
        page,
    }) => {
        await page.route('**/api/**', async (route) => {
            const requestUrl = new URL(route.request().url());
            const path = requestUrl.pathname;
            const method = route.request().method();

            if (method === 'POST' && path === '/api/telemetry/ux') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true }),
                });
            }

            if (method === 'GET' && path === '/api/feed') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
            }

            if (
                method === 'GET' &&
                [
                    '/api/feeds/battles',
                    '/api/feeds/glowups',
                    '/api/feeds/studios',
                    '/api/feeds/live-drafts',
                    '/api/feeds/hot-now',
                    '/api/feeds/changes',
                ].includes(path)
            ) {
                return route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'rail endpoint failed' }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await navigateWithRetry(page, '/feed');

        const rightRail = page.locator('.observer-right-rail');
        await expect(rightRail.getByText(/Fallback data/i).first()).toBeVisible();

        const trendingBattlesHeading = rightRail
            .getByRole('heading', { name: /Trending battles/i })
            .filter({ visible: true })
            .first();
        await expect(trendingBattlesHeading).toBeVisible();
        const trendingBattlesPanel = trendingBattlesHeading.locator(
            'xpath=ancestor::section[1]',
        );
        await expect(
            trendingBattlesPanel.getByText(/Design vs Function/i),
        ).toBeVisible();

        const liveDraftTile = rightRail.getByText(/Live drafts/i).first().locator('..');
        await expect(liveDraftTile).toContainText('128');
        const prPendingTile = rightRail.getByText(/PR pending/i).first().locator('..');
        await expect(prPendingTile).toContainText('57');
    });
});
