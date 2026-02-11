import { type Page, expect, test } from '@playwright/test';

const draftId = 'draft-e2e';
const pullRequestId = 'pr-pending-e2e';

const json = (body: unknown) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status: 200,
});

const installDraftDetailApiMocks = async (page: Page) => {
  const now = new Date().toISOString();

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const method = request.method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === `/api/drafts/${draftId}`) {
      return route.fulfill(
        json({
          draft: {
            currentVersion: 2,
            glowUpScore: 1.7,
            id: draftId,
            status: 'ready_for_review',
            updatedAt: now,
          },
          versions: [
            { imageUrl: 'https://example.com/v1.png', versionNumber: 1 },
            { imageUrl: 'https://example.com/v2.png', versionNumber: 2 },
          ],
        }),
      );
    }

    if (method === 'GET' && path === `/api/drafts/${draftId}/fix-requests`) {
      return route.fulfill(json([]));
    }

    if (method === 'GET' && path === `/api/drafts/${draftId}/pull-requests`) {
      return route.fulfill(
        json([
          {
            description: 'Pending PR for E2E prediction',
            id: pullRequestId,
            makerId: 'maker-e2e',
            status: 'pending',
          },
        ]),
      );
    }

    if (method === 'GET' && path === `/api/drafts/${draftId}/arc`) {
      return route.fulfill(json(null));
    }

    if (method === 'GET' && path === '/api/observers/watchlist') {
      return route.fulfill(json([]));
    }

    if (method === 'GET' && path === '/api/observers/digest') {
      return route.fulfill(json([]));
    }

    if (method === 'GET' && path === `/api/pull-requests/${pullRequestId}/predictions`) {
      return route.fulfill(
        json({
          accuracy: { correct: 4, rate: 0.5, total: 8 },
          consensus: { merge: 2, reject: 1, total: 3 },
          observerPrediction: null,
          pullRequestId,
          pullRequestStatus: 'pending',
        }),
      );
    }

    if (method === 'GET' && path === '/api/search/similar') {
      return route.fulfill(json([]));
    }

    if (method === 'POST' && path === `/api/pull-requests/${pullRequestId}/predict`) {
      return route.fulfill(json({ ok: true }));
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(json({ ok: true }));
    }

    return route.fulfill(json({}));
  });
};

test.describe('Draft detail page', () => {
  test('renders version timeline and submits prediction', async ({ page }) => {
    await installDraftDetailApiMocks(page);
    await page.goto(`/drafts/${draftId}`);

    await expect(
      page.getByRole('heading', { name: /Version timeline/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'v2' })).toBeVisible();

    const predictMergeButton = page.getByRole('button', {
      name: /Predict merge/i,
    });
    await expect(predictMergeButton).toBeVisible();

    const predictionRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'POST' &&
        request.url().includes(`/api/pull-requests/${pullRequestId}/predict`)
      );
    });

    await predictMergeButton.click();
    await predictionRequest;
  });
});
