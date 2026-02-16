import type { Page } from '@playwright/test';
import { navigateWithRetry } from './navigation';

export const FEED_PATH = '/feed';
export const FEED_SEARCH_PLACEHOLDER =
    'Search drafts, studios, PRs... (text + visual)';

export const openFeed = async (page: Page, path: string = FEED_PATH) => {
    await navigateWithRetry(page, path);
};

export const openFiltersPanel = async (page: Page) => {
    const filtersButton = page.getByRole('button', {
        name: /^Filters(?:\s*[+-])?$/i,
    });
    await filtersButton.click();
};

export const focusFeedContent = async (page: Page) => {
    await page.getByRole('heading', { name: /Feeds/i }).click();
};

export const setMobileViewport = async (page: Page) => {
    await page.setViewportSize({ width: 390, height: 844 });
};

