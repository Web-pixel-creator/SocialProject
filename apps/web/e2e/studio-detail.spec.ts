import { type Page, expect, test } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const STUDIO_ID = 'studio-e2e';

const json = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

interface StudioDetailMockOptions {
  followResponseBody?: unknown;
  followStatus?: number;
  ledgerResponseBody?: unknown;
  ledgerStatus?: number;
  metricsResponseBody?: unknown;
  metricsStatus?: number;
  studioResponseBody?: unknown;
  studioStatus?: number;
  unfollowResponseBody?: unknown;
  unfollowStatus?: number;
}

const installStudioDetailApiMocks = async (
  page: Page,
  options: StudioDetailMockOptions = {},
) => {
  const {
    followResponseBody = { ok: true },
    followStatus = 200,
    ledgerResponseBody = [
      {
        description: 'Merged major update',
        draftId: 'draft-1',
        draftTitle: 'Studio PR Draft',
        id: 'entry-1',
        impactDelta: 5,
        kind: 'pr_merged',
        occurredAt: '2026-02-08T12:00:00.000Z',
        severity: 'major',
      },
      {
        description: 'Needs refinement',
        draftId: 'draft-2',
        draftTitle: 'Studio Fix Draft',
        id: 'entry-2',
        impactDelta: 0,
        kind: 'fix_request',
        occurredAt: '2026-02-08T12:00:00.000Z',
        severity: null,
      },
    ],
    ledgerStatus = 200,
    metricsResponseBody = { impact: 21, signal: 80 },
    metricsStatus = 200,
    studioResponseBody = {
      personality: 'Precise reviewer',
      studioName: 'Studio Ledger',
    },
    studioStatus = 200,
    unfollowResponseBody = { removed: true },
    unfollowStatus = 200,
  } = options;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const method = request.method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === `/api/studios/${STUDIO_ID}`) {
      return route.fulfill(json(studioResponseBody, studioStatus));
    }

    if (method === 'GET' && path === `/api/studios/${STUDIO_ID}/metrics`) {
      return route.fulfill(json(metricsResponseBody, metricsStatus));
    }

    if (method === 'GET' && path === `/api/studios/${STUDIO_ID}/ledger`) {
      return route.fulfill(json(ledgerResponseBody, ledgerStatus));
    }

    if (method === 'POST' && path === `/api/studios/${STUDIO_ID}/follow`) {
      return route.fulfill(json(followResponseBody, followStatus));
    }

    if (method === 'DELETE' && path === `/api/studios/${STUDIO_ID}/follow`) {
      return route.fulfill(json(unfollowResponseBody, unfollowStatus));
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(json({ ok: true }));
    }

    return route.fulfill(json({}));
  });
};

test.describe('Studio detail page', () => {
  test('renders studio profile, metrics and ledger entries', async ({ page }) => {
    await installStudioDetailApiMocks(page);
    await navigateWithRetry(page, `/studios/${STUDIO_ID}`, {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    await expect(
      page.getByRole('heading', { name: /Studio Ledger/i }),
    ).toBeVisible();
    await expect(page.getByText(/Impact 21\.0 \| Signal 80\.0/i)).toBeVisible();
    await expect(page.getByText(/Precise reviewer/i)).toBeVisible();
    await expect(page.getByText(/Impact ledger/i)).toBeVisible();
    await expect(page.getByText(/PR merged/i)).toBeVisible();
    await expect(page.getByText(/Fix request/i)).toBeVisible();
    await expect(page.getByText(/Studio PR Draft/i)).toBeVisible();
    await expect(page.getByText(/Impact \+5/i)).toBeVisible();
  });

  test('toggles studio follow state from profile header', async ({ page }) => {
    await installStudioDetailApiMocks(page, {
      ledgerResponseBody: [],
      studioResponseBody: {
        follower_count: 3,
        id: STUDIO_ID,
        is_following: false,
        personality: 'Precise reviewer',
        studioName: 'Studio Follow Header',
      },
    });

    await navigateWithRetry(page, `/studios/${STUDIO_ID}`, {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    await expect(
      page.getByRole('heading', { name: /Studio Follow Header/i }),
    ).toBeVisible();

    const followButton = page.getByRole('button', { name: /^Follow$/i });
    await expect(followButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText(/Followers:\s*3/i)).toBeVisible();

    const followRequest = page.waitForRequest((request) => {
      const requestUrl = new URL(request.url());
      return (
        request.method() === 'POST' &&
        requestUrl.pathname === `/api/studios/${STUDIO_ID}/follow`
      );
    });

    await followButton.click();
    await followRequest;

    const followingButton = page.getByRole('button', { name: /^Following$/i });
    await expect(followingButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/Followers:\s*4/i)).toBeVisible();

    const unfollowRequest = page.waitForRequest((request) => {
      const requestUrl = new URL(request.url());
      return (
        request.method() === 'DELETE' &&
        requestUrl.pathname === `/api/studios/${STUDIO_ID}/follow`
      );
    });

    await followingButton.click();
    await unfollowRequest;

    await expect(page.getByRole('button', { name: /^Follow$/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByText(/Followers:\s*3/i)).toBeVisible();
  });

  test('reverts follow toggle when profile follow request fails', async ({
    page,
  }) => {
    await installStudioDetailApiMocks(page, {
      followResponseBody: { error: 'AUTH_REQUIRED' },
      followStatus: 500,
      ledgerResponseBody: [],
      studioResponseBody: {
        follower_count: 3,
        id: STUDIO_ID,
        is_following: false,
        personality: 'Precise reviewer',
        studioName: 'Studio Follow Header',
      },
    });

    await navigateWithRetry(page, `/studios/${STUDIO_ID}`, {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    const followButton = page.getByRole('button', { name: /^Follow$/i });
    await expect(followButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText(/Followers:\s*3/i)).toBeVisible();

    const followRequest = page.waitForRequest((request) => {
      const requestUrl = new URL(request.url());
      return (
        request.method() === 'POST' &&
        requestUrl.pathname === `/api/studios/${STUDIO_ID}/follow`
      );
    });

    await followButton.click();
    await followRequest;

    await expect(followButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText(/Followers:\s*3/i)).toBeVisible();
  });

  test('keeps page available when studio endpoint fails but metrics load', async ({
    page,
  }) => {
    await installStudioDetailApiMocks(page, {
      ledgerResponseBody: [],
      metricsResponseBody: { impact: 44, signal: 81 },
      studioResponseBody: { message: 'Studio endpoint unavailable' },
      studioStatus: 500,
    });
    await navigateWithRetry(page, `/studios/${STUDIO_ID}`, {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    await expect(
      page.getByRole('heading', { name: /Studio studio-e2e/i }),
    ).toBeVisible();
    await expect(page.getByText(/Impact 44\.0 \| Signal 81\.0/i)).toBeVisible();
    await expect(
      page.getByText(/No recent contributions yet/i),
    ).toBeVisible();
    await expect(page.getByText(/Studio endpoint unavailable/i)).toHaveCount(0);
  });

  test('shows load error when studio profile is unavailable', async ({ page }) => {
    await installStudioDetailApiMocks(page, {
      ledgerResponseBody: { message: 'Ledger load failed' },
      ledgerStatus: 500,
      metricsResponseBody: { message: 'Metrics load failed' },
      metricsStatus: 500,
      studioResponseBody: { message: 'Studio load failed' },
      studioStatus: 500,
    });
    await navigateWithRetry(page, `/studios/${STUDIO_ID}`, {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    await expect(
      page.getByText(/Studio load failed|Failed to load studio/i),
    ).toBeVisible();
  });

  test('shows missing studio id error and skips studio API requests', async ({
    page,
  }) => {
    let studioApiCalls = 0;
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      if (path.startsWith('/api/studios/')) {
        studioApiCalls += 1;
      }
      return route.fulfill(json({}));
    });

    await navigateWithRetry(page, '/studios/undefined', {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });
    await expect(page.getByText(/Studio id missing/i)).toBeVisible();
    expect(studioApiCalls).toBe(0);
  });
});
