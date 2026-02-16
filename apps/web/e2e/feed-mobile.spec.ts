import { expect, test } from '@playwright/test';
import {
    FEED_SEARCH_PLACEHOLDER,
    focusFeedContent,
    openFeed,
    setMobileViewport,
} from './utils/feed';

test.describe('Feed mobile behavior', () => {
    test.beforeEach(async ({ page }) => {
        await setMobileViewport(page);
        await openFeed(page);
    });

    test('shows observer rail panel controls on mobile viewport', async ({
        page,
    }) => {
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
        const feedSearch = page.getByPlaceholder(FEED_SEARCH_PLACEHOLDER);
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
        const observerModeChip = page
            .locator('.observer-feed-header')
            .getByText(/Observer mode/i)
            .first();
        const rightRailShell = page.getByTestId('feed-right-rail-shell');

        await expect(observerModeChip).toBeVisible();
        await expect(rightRailShell).toHaveClass(/\bobserver-right-rail-shell\b/);
        await expect(rightRailShell).toHaveAttribute('aria-hidden', 'false');
        await expect(rightRailShell).toBeVisible();
        await expect(
            page.getByRole('button', { name: /Focus mode/i }),
        ).toHaveCount(0);
    });

    test('opens and closes feed mobile menu without inline language switcher', async ({
        page,
    }) => {
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

        await mobileDialog.getByRole('button', { name: /Close/i }).click();
        await expect(mobileDialog).toHaveCount(0);
    });

    test('restores focus to mobile menu trigger after closing navigation dialog', async ({
        page,
    }) => {
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
});

