import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

interface VisualScenario {
  name: string;
  path: string;
  viewport: {
    height: number;
    width: number;
  };
  waitForReady: (page: Page) => Promise<void>;
  mask?: (page: Page) => Locator[];
}

const screenshotOptions = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  fullPage: true,
  maxDiffPixelRatio: 0.02,
  scale: 'css' as const,
};

const hideDevOverlaysCss = `
  nextjs-portal,
  [data-nextjs-dialog],
  [data-nextjs-dialog-overlay],
  [data-nextjs-toast-wrapper],
  [data-nextjs-dev-tools-button],
  [data-nextjs-dev-tools] {
    display: none !important;
    visibility: hidden !important;
  }
`;

const blockBackendRequests = async (page: Page) => {
  await page.route('**/api/**', (route) => {
    void route.abort();
  });
};

const stabilizePage = async (page: Page) => {
  await page.addStyleTag({ content: hideDevOverlaysCss });
  await page.evaluate(async () => {
    if (!('fonts' in document)) {
      return;
    }

    try {
      await document.fonts.ready;
    } catch {
      // Ignore font loading errors; baseline still captures fallback text rendering.
    }
  });
  await page.waitForTimeout(150);
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
      await expect(page.getByText(/how it works/i)).toBeVisible();
    },
  },
  {
    name: 'feed-desktop',
    path: '/feed',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(page.getByRole('heading', { name: /feeds/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^All$/i })).toBeVisible();
      await expect(page.getByTestId('feed-items-grid')).toBeVisible();
      await expect(page.getByText(/Loading\.\.\./i)).toHaveCount(0);
    },
  },
  {
    name: 'search-desktop',
    path: '/search',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(page.getByRole('heading', { name: /search/i })).toBeVisible();
      await expect(page.getByPlaceholder(/search by keyword/i)).toBeVisible();
      await expect(page.getByText(/no results yet/i)).toBeVisible();
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
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
    },
  },
  {
    name: 'feed-mobile',
    path: '/feed',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(page.getByRole('heading', { name: /feeds/i })).toBeVisible();
      await expect(page.getByLabel('Menu')).toBeVisible();
      await expect(page.getByText(/Results:/i)).toBeVisible();
      await expect(page.getByText(/Loading\.\.\./i)).toHaveCount(0);
    },
  },
  {
    name: 'search-mobile',
    path: '/search',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(page.getByRole('heading', { name: /search/i })).toBeVisible();
      await expect(page.getByPlaceholder(/search by keyword/i)).toBeVisible();
      await expect(page.getByText(/no results yet/i)).toBeVisible();
    },
  },
];

test.describe('Visual smoke', () => {
  for (const scenario of scenarios) {
    test(`matches ${scenario.name} baseline`, async ({ page }) => {
      await blockBackendRequests(page);
      await page.setViewportSize(scenario.viewport);
      await navigateWithRetry(page, scenario.path);
      await scenario.waitForReady(page);
      await stabilizePage(page);
      await expect(page).toHaveScreenshot(
        `${scenario.name}.png`,
        scenario.mask
          ? { ...screenshotOptions, mask: scenario.mask(page) }
          : screenshotOptions,
      );
    });
  }
});
