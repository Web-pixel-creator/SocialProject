import { type Page, expect, test } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const DRAFT_ID = 'draft-pr-e2e';
const PR_ID = 'pr-e2e-review';

const json = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

interface PullRequestReviewMockOptions {
  decisionResponseBody?: unknown;
  decisionStatus?: number;
  fixRequests?: unknown[];
  reviewResponseBody?: unknown;
}

const installPullRequestReviewApiMocks = async (
  page: Page,
  options: PullRequestReviewMockOptions = {},
) => {
  const {
    decisionResponseBody = { ok: true },
    decisionStatus = 200,
    fixRequests = [
      {
        category: 'Layout',
        criticId: 'critic-e2e',
        description: 'Fix spacing between sections',
        id: 'fix-1',
      },
      {
        category: 'Typography',
        criticId: 'critic-e2e',
        description: 'Adjust heading contrast',
        id: 'fix-2',
      },
    ],
    reviewResponseBody = {
      afterImageUrl: 'https://example.com/after.png',
      authorStudio: 'Studio A',
      beforeImageUrl: 'https://example.com/before.png',
      draft: {
        authorId: 'author-e2e',
        currentVersion: 1,
        glowUpScore: 2.4,
        id: DRAFT_ID,
        status: 'draft',
      },
      makerStudio: 'Studio B',
      metrics: {
        currentGlowUp: 2.4,
        glowUpDelta: 0.8,
        impactDelta: 3,
        predictedGlowUp: 3.2,
      },
      pullRequest: {
        addressedFixRequests: ['fix-1'],
        description: 'Improve landing hierarchy',
        draftId: DRAFT_ID,
        id: PR_ID,
        makerId: 'maker-e2e',
        proposedVersion: 2,
        severity: 'minor',
        status: 'pending',
      },
    },
  } = options;

  let decisionCalls = 0;
  let reviewState = reviewResponseBody;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const method = request.method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === `/api/pull-requests/${PR_ID}`) {
      return route.fulfill(json(reviewState));
    }

    if (method === 'GET' && path === `/api/drafts/${DRAFT_ID}/fix-requests`) {
      return route.fulfill(json(fixRequests));
    }

    if (method === 'POST' && path === `/api/pull-requests/${PR_ID}/decide`) {
      decisionCalls += 1;
      const payload = (request.postDataJSON() ?? {}) as { decision?: string };

      if (
        decisionStatus >= 200 &&
        decisionStatus < 300 &&
        reviewState !== null &&
        typeof reviewState === 'object'
      ) {
        const current = reviewState as {
          pullRequest?: Record<string, unknown>;
        };
        const pullRequest = current.pullRequest ?? {};
        const nextStatus =
          payload.decision === 'merge'
            ? 'merged'
            : payload.decision === 'reject'
              ? 'rejected'
              : payload.decision === 'request_changes'
                ? 'changes_requested'
                : pullRequest.status;
        reviewState = {
          ...current,
          pullRequest: {
            ...pullRequest,
            status: nextStatus,
          },
        };
      }

      return route.fulfill(
        json(decisionResponseBody, decisionStatus),
      );
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(json({ ok: true }));
    }

    return route.fulfill(json({}));
  });

  return {
    getDecisionCalls: () => decisionCalls,
  };
};

const navigateToPullRequestReview = async (page: Page, id: string) => {
  await navigateWithRetry(page, `/pull-requests/${id}`, {
    gotoOptions: { waitUntil: 'domcontentloaded' },
  });
};

test.describe('Pull request review page', () => {
  test('renders review data and applies merge decision', async ({ page }) => {
    await installPullRequestReviewApiMocks(page);
    await navigateToPullRequestReview(page, PR_ID);

    await expect(page.getByText(/^PR Review$/i)).toBeVisible();
    await expect(page.getByText(/Studio B\s*->\s*Studio A/i)).toBeVisible();
    await expect(page.getByText(/Improve landing hierarchy/i)).toBeVisible();

    const mergeRequest = page.waitForRequest((request) => {
      if (
        request.method() !== 'POST' ||
        !request.url().includes(`/api/pull-requests/${PR_ID}/decide`)
      ) {
        return false;
      }
      const payload = request.postDataJSON() as { decision?: string } | null;
      return payload?.decision === 'merge';
    });

    await page.getByRole('button', { name: /Merge/i }).click();
    await mergeRequest;
    await expect(page.getByText(/^merged$/i)).toBeVisible();
  });

  test('requires rejection reason before reject decision submit', async ({
    page,
  }) => {
    const reviewApi = await installPullRequestReviewApiMocks(page);
    await navigateToPullRequestReview(page, PR_ID);

    await page.getByRole('button', { name: /Reject/i }).click();
    await expect(page.getByText(/Rejection reason is required/i)).toBeVisible();
    await expect(reviewApi.getDecisionCalls()).toBe(0);
  });

  test('shows decision error when reject request fails', async ({ page }) => {
    await installPullRequestReviewApiMocks(page, {
      decisionResponseBody: { message: 'Decision API failed' },
      decisionStatus: 500,
    });
    await navigateToPullRequestReview(page, PR_ID);

    await page
      .getByPlaceholder(/Rejection reason/i)
      .fill('Need stronger evidence before merge');
    await page.getByRole('button', { name: /Reject/i }).click();
    await expect(page.getByText(/Decision API failed/i)).toBeVisible();
    await expect(page.getByText(/^pending$/i)).toBeVisible();
  });

  test('shows not-found state when review payload is empty', async ({
    page,
  }) => {
    await installPullRequestReviewApiMocks(page, {
      reviewResponseBody: null,
    });
    await navigateToPullRequestReview(page, PR_ID);
    await expect(page.getByText(/Pull request not found/i)).toBeVisible();
  });
});

