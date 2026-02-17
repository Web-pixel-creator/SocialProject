import { type Page, expect, test } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const COMMISSION_ID = 'commission-detail-e2e';

const json = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

interface CommissionDetailMockOptions {
  detailResponseBody?: unknown;
  detailStatus?: number;
}

const installCommissionDetailApiMocks = async (
  page: Page,
  options: CommissionDetailMockOptions = {},
) => {
  const {
    detailResponseBody = {
      currency: 'USD',
      description: 'AI storyboard pack for the launch campaign',
      id: COMMISSION_ID,
      paymentStatus: 'in_escrow',
      responses: [
        {
          createdAt: '2026-02-17T10:00:00.000Z',
          draftId: 'draft-response-1',
          draftTitle: 'Storyboard v2',
          id: 'response-1',
          studioId: 'studio-1',
          studioName: 'Aurora Studio',
        },
      ],
      rewardAmount: 250,
      status: 'pending',
      winnerDraftId: 'draft-winner-1',
    },
    detailStatus = 200,
  } = options;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const method = request.method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === `/api/commissions/${COMMISSION_ID}`) {
      return route.fulfill(json(detailResponseBody, detailStatus));
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(json({ ok: true }));
    }

    return route.fulfill(json({}));
  });
};

test.describe('Commission detail page', () => {
  test('renders commission summary and responses list', async ({ page }) => {
    await installCommissionDetailApiMocks(page);
    await navigateWithRetry(page, `/commissions/${COMMISSION_ID}`, {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    await expect(
      page.getByRole('heading', { name: new RegExp(`Commission ${COMMISSION_ID}`) }),
    ).toBeVisible();
    await expect(
      page.getByText(/Reward:\s*250 USD \| in_escrow/i),
    ).toBeVisible();
    await expect(
      page.getByText(/AI storyboard pack for the launch campaign/i),
    ).toBeVisible();
    await expect(page.getByText(/Winner draft:\s*draft-winner-1/i)).toBeVisible();
    await expect(page.getByText('Storyboard v2')).toBeVisible();
    await expect(page.getByText(/Response by:\s*Aurora Studio/i)).toBeVisible();
  });

  test('shows no responses state when responses are empty', async ({ page }) => {
    await installCommissionDetailApiMocks(page, {
      detailResponseBody: {
        currency: 'USD',
        description: 'Brand refresh commission',
        id: COMMISSION_ID,
        paymentStatus: 'released',
        responses: [],
        rewardAmount: 100,
        status: 'released',
      },
    });
    await navigateWithRetry(page, `/commissions/${COMMISSION_ID}`, {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    await expect(page.getByText(/Brand refresh commission/i)).toBeVisible();
    await expect(page.getByText(/No responses yet/i)).toBeVisible();
  });

  test('shows not-found fallback when API returns null payload', async ({
    page,
  }) => {
    await installCommissionDetailApiMocks(page, {
      detailResponseBody: null,
    });
    await navigateWithRetry(page, `/commissions/${COMMISSION_ID}`, {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    await expect(page.getByText(/Commission not found/i)).toBeVisible();
  });

  test('shows detail load error when API request fails', async ({ page }) => {
    await installCommissionDetailApiMocks(page, {
      detailResponseBody: { message: 'Commission detail API failed' },
      detailStatus: 500,
    });
    await navigateWithRetry(page, `/commissions/${COMMISSION_ID}`, {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    await expect(
      page.getByText(/Commission detail API failed/i),
    ).toBeVisible();
  });
});
