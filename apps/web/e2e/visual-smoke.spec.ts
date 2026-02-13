import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

interface VisualScenario {
    name: string;
    path: string;
    viewport: {
        height: number;
        width: number;
    };
    waitForReady: (page: Page) => Promise<void>;
}

const captureScreenshot = async (
    page: Page,
    testInfo: TestInfo,
    scenarioName: string,
) => {
    const screenshotPath = testInfo.outputPath(`${scenarioName}.png`);
    await page.screenshot({ fullPage: true, path: screenshotPath });
    await testInfo.attach(`${scenarioName}.png`, {
        contentType: 'image/png',
        path: screenshotPath,
    });
};

const scenarios: VisualScenario[] = [
    {
        name: 'home-desktop',
        path: '/',
        viewport: { width: 1440, height: 900 },
        waitForReady: async (page) => {
            await expect(
                page.getByRole('heading', {
                    name: /watch ai finish what ai started/i,
                }),
            ).toBeVisible();
        },
    },
    {
        name: 'feed-desktop',
        path: '/feed',
        viewport: { width: 1440, height: 900 },
        waitForReady: async (page) => {
            await expect(
                page.getByRole('heading', { name: /feeds/i }),
            ).toBeVisible();
            await expect(
                page.getByRole('button', { name: /^All$/i }),
            ).toBeVisible();
        },
    },
    {
        name: 'search-desktop',
        path: '/search',
        viewport: { width: 1440, height: 900 },
        waitForReady: async (page) => {
            await expect(
                page.getByRole('heading', { name: /search/i }),
            ).toBeVisible();
        },
    },
    {
        name: 'home-mobile',
        path: '/',
        viewport: { width: 390, height: 844 },
        waitForReady: async (page) => {
            await expect(
                page.getByRole('heading', {
                    name: /watch ai finish what ai started/i,
                }),
            ).toBeVisible();
        },
    },
    {
        name: 'feed-mobile',
        path: '/feed',
        viewport: { width: 390, height: 844 },
        waitForReady: async (page) => {
            await expect(
                page.getByRole('heading', { name: /feeds/i }),
            ).toBeVisible();
            await expect(page.getByTestId('feed-right-rail-shell')).toBeVisible();
        },
    },
    {
        name: 'search-mobile',
        path: '/search',
        viewport: { width: 390, height: 844 },
        waitForReady: async (page) => {
            await expect(
                page.getByRole('heading', { name: /search/i }),
            ).toBeVisible();
        },
    },
];

test.describe('Visual smoke', () => {
    for (const scenario of scenarios) {
        test(`captures ${scenario.name}`, async ({ page }, testInfo) => {
            await page.setViewportSize(scenario.viewport);
            await page.goto(scenario.path);
            await scenario.waitForReady(page);
            await captureScreenshot(page, testInfo, scenario.name);
        });
    }
});
