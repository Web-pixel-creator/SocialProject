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

const buildPlaceholderSvg = (width: number, height: number, variant: string) => {
  const normalizedVariant = variant.toLowerCase();
  const accent =
    normalizedVariant.includes('after') || normalizedVariant.includes('version+b')
      ? '#f59e0b'
      : '#38bdf8';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mock placeholder">
      <rect width="${width}" height="${height}" fill="#111827" />
      <rect x="${Math.max(12, Math.floor(width * 0.08))}" y="${Math.max(
        12,
        Math.floor(height * 0.1),
      )}" width="${Math.max(32, Math.floor(width * 0.84))}" height="${Math.max(20, Math.floor(height * 0.16))}" rx="16" fill="${accent}" opacity="0.9" />
      <rect x="${Math.max(12, Math.floor(width * 0.08))}" y="${Math.max(
        44,
        Math.floor(height * 0.36),
      )}" width="${Math.max(40, Math.floor(width * 0.72))}" height="${Math.max(14, Math.floor(height * 0.1))}" rx="10" fill="#e5e7eb" opacity="0.24" />
      <rect x="${Math.max(12, Math.floor(width * 0.08))}" y="${Math.max(
        64,
        Math.floor(height * 0.54),
      )}" width="${Math.max(28, Math.floor(width * 0.56))}" height="${Math.max(12, Math.floor(height * 0.08))}" rx="8" fill="#e5e7eb" opacity="0.18" />
    </svg>
  `.trim();
};

const blockBackendRequests = async (page: Page) => {
  await page.route('**/api/**', (route) => {
    void route.abort();
  });
};

const mockPlaceholderImages = async (page: Page) => {
  await page.route('https://placehold.co/**', async (route) => {
    const url = new URL(route.request().url());
    const sizeMatch = url.pathname.match(/\/(\d+)x(\d+)/);
    const width = Number(sizeMatch?.[1] ?? 300);
    const height = Number(sizeMatch?.[2] ?? 200);
    const variant = url.searchParams.get('text') ?? 'placeholder';

    await route.fulfill({
      body: buildPlaceholderSvg(width, height, variant),
      contentType: 'image/svg+xml',
      status: 200,
    });
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

    const pendingImages = Array.from(document.images).filter((image) => !image.complete);

    await Promise.all(
      pendingImages.map(
        (image) =>
          new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          }),
      ),
    );
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
      await expect(page.getByText(/Loading\.\.\./i)).toHaveCount(0);
      await expect
        .poll(async () => {
          const [gridCount, emptyCount] = await Promise.all([
            page.getByTestId('feed-items-grid').count(),
            page.getByText(/Feed is quiet right now/i).count(),
          ]);
          return gridCount > 0 || emptyCount > 0;
        })
        .toBe(true);
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
    name: 'commissions-desktop',
    path: '/commissions',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /commissions/i }),
      ).toBeVisible();
      await expect(
        page.getByText(/request ai studios to fulfill creative briefs/i),
      ).toBeVisible();
    },
  },
  {
    name: 'privacy-desktop',
    path: '/privacy',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /privacy & data/i }),
      ).toBeVisible();
      await expect(
        page.getByText(
          /manage exports, deletion requests, and review retention windows/i,
        ),
      ).toBeVisible();
    },
  },
  {
    name: 'demo-desktop',
    path: '/demo',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /one-click demo flow/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /run demo/i })).toBeVisible();
      await expect(page.getByText(/track every change/i)).toBeVisible();
    },
  },
  {
    name: 'legal-terms-desktop',
    path: '/legal/terms',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /terms of service/i }),
      ).toBeVisible();
      await expect(
        page.getByText(/creative collaboration platform/i),
      ).toBeVisible();
    },
  },
  {
    name: 'legal-privacy-desktop',
    path: '/legal/privacy',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /privacy policy/i }),
      ).toBeVisible();
      await expect(
        page.getByText(/request an export or deletion/i),
      ).toBeVisible();
    },
  },
  {
    name: 'legal-refund-desktop',
    path: '/legal/refund',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /refund policy/i }),
      ).toBeVisible();
      await expect(page.getByText(/held in escrow/i)).toBeVisible();
    },
  },
  {
    name: 'legal-content-desktop',
    path: '/legal/content',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /content policy/i }),
      ).toBeVisible();
      await expect(page.getByText(/constructive creative critique/i)).toBeVisible();
    },
  },
  {
    name: 'login-desktop',
    path: '/login',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /welcome back/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /^Sign in$/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
    },
  },
  {
    name: 'register-desktop',
    path: '/register',
    viewport: { width: 1440, height: 900 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /create account/i }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /create account/i }).first(),
      ).toBeVisible();
      await expect(page.getByText(/terms of service/i)).toBeVisible();
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
  {
    name: 'commissions-mobile',
    path: '/commissions',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /commissions/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
    },
  },
  {
    name: 'privacy-mobile',
    path: '/privacy',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /privacy & data/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
    },
  },
  {
    name: 'demo-mobile',
    path: '/demo',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /one-click demo flow/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /run demo/i })).toBeVisible();
    },
  },
  {
    name: 'legal-terms-mobile',
    path: '/legal/terms',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /terms of service/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
      await expect(
        page.getByText(/creative collaboration platform/i),
      ).toBeVisible();
    },
  },
  {
    name: 'legal-privacy-mobile',
    path: '/legal/privacy',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /privacy policy/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
      await expect(
        page.getByText(/request an export or deletion/i),
      ).toBeVisible();
    },
  },
  {
    name: 'legal-refund-mobile',
    path: '/legal/refund',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /refund policy/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
      await expect(page.getByText(/held in escrow/i)).toBeVisible();
    },
  },
  {
    name: 'legal-content-mobile',
    path: '/legal/content',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /content policy/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
      await expect(page.getByText(/constructive creative critique/i)).toBeVisible();
    },
  },
  {
    name: 'login-mobile',
    path: '/login',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /welcome back/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Sign in$/i })).toBeVisible();
    },
  },
  {
    name: 'register-mobile',
    path: '/register',
    viewport: { width: 390, height: 844 },
    waitForReady: async (page) => {
      await expect(
        page.getByRole('heading', { name: /create account/i }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
      await expect(page.getByText(/terms of service/i)).toBeVisible();
    },
  },
];

test.describe('Visual smoke', () => {
  for (const scenario of scenarios) {
    test(`matches ${scenario.name} baseline`, async ({ page }) => {
      await blockBackendRequests(page);
      await mockPlaceholderImages(page);
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
