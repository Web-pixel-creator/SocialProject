import { type Page, expect, test } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const draftId = 'draft-e2e';
const pullRequestId = 'pr-pending-e2e';

const json = (body: unknown) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status: 200,
});

interface DraftDetailMockOptions {
  digestEntries?: unknown[];
  digestSeenDelayMs?: number;
  digestStatus?: number;
  predictionStatus?: number;
  predictionSummaryStatus?: number;
  predictionSummaryAfterSubmit?: unknown;
  predictionSummaryResponseBody?: unknown;
  predictionResponseBody?: unknown;
  telemetryPayloadLog?: Array<Record<string, unknown>>;
  watchlistPersistDelayMs?: number;
  watchlistPersistStatus?: number;
  watchlistEntries?: unknown[];
  watchlistStatus?: number;
}

const installDraftDetailApiMocks = async (
  page: Page,
  options: DraftDetailMockOptions = {},
) => {
  const now = new Date().toISOString();
  const {
    digestEntries = [],
    digestSeenDelayMs = 0,
    digestStatus = 200,
    predictionStatus = 200,
    predictionSummaryStatus = 200,
    predictionSummaryAfterSubmit = null,
    predictionSummaryResponseBody = {
      accuracy: { correct: 4, rate: 0.5, total: 8 },
      consensus: { merge: 2, reject: 1, total: 3 },
      observerPrediction: null,
      pullRequestId,
      pullRequestStatus: 'pending',
    },
    predictionResponseBody = { ok: true },
    telemetryPayloadLog,
    watchlistPersistDelayMs = 0,
    watchlistPersistStatus = 200,
    watchlistEntries = [],
    watchlistStatus = 200,
  } = options;
  let predictionSummaryState = predictionSummaryResponseBody;

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
      return route.fulfill({
        body: JSON.stringify(
          watchlistStatus === 200
            ? watchlistEntries
            : { message: 'Sign in required' },
        ),
        contentType: 'application/json',
        status: watchlistStatus,
      });
    }

    if (
      (method === 'POST' || method === 'DELETE') &&
      path === `/api/observers/watchlist/${draftId}`
    ) {
      if (watchlistPersistDelayMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, watchlistPersistDelayMs);
        });
      }
      return route.fulfill({
        body: JSON.stringify(
          watchlistPersistStatus === 200
            ? { ok: true }
            : { message: 'Sign in required' },
        ),
        contentType: 'application/json',
        status: watchlistPersistStatus,
      });
    }

    if (method === 'GET' && path === '/api/observers/digest') {
      return route.fulfill({
        body: JSON.stringify(
          digestStatus === 200 ? digestEntries : { message: 'Sign in required' },
        ),
        contentType: 'application/json',
        status: digestStatus,
      });
    }

    if (
      method === 'POST' &&
      path.startsWith('/api/observers/digest/') &&
      path.endsWith('/seen')
    ) {
      if (digestSeenDelayMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, digestSeenDelayMs);
        });
      }
      return route.fulfill(json({ ok: true }));
    }

    if (method === 'GET' && path === `/api/pull-requests/${pullRequestId}/predictions`) {
      return route.fulfill({
        body: JSON.stringify(
          predictionSummaryStatus === 200
            ? predictionSummaryState
            : { message: 'Sign in required' },
        ),
        contentType: 'application/json',
        status: predictionSummaryStatus,
      });
    }

    if (method === 'GET' && path === '/api/search/similar') {
      return route.fulfill(json([]));
    }

    if (method === 'POST' && path === `/api/pull-requests/${pullRequestId}/predict`) {
      const payload = (request.postDataJSON() ?? {}) as {
        outcome?: string;
        predictedOutcome?: string;
        stakePoints?: number;
      };
      if (predictionSummaryAfterSubmit !== null) {
        predictionSummaryState = predictionSummaryAfterSubmit;
      } else if (
        predictionSummaryState !== null &&
        typeof predictionSummaryState === 'object'
      ) {
        const currentSummary = predictionSummaryState as Record<string, unknown>;
        predictionSummaryState = {
          ...currentSummary,
          observerPrediction: {
            isCorrect: null,
            predictedOutcome:
              payload.predictedOutcome ?? payload.outcome ?? 'merge',
            stakePoints: payload.stakePoints ?? 10,
            resolvedOutcome: null,
          },
        };
      }
      return route.fulfill({
        body: JSON.stringify(predictionResponseBody),
        contentType: 'application/json',
        status: predictionStatus,
      });
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      if (telemetryPayloadLog) {
        const payload = request.postDataJSON();
        if (payload && typeof payload === 'object') {
          telemetryPayloadLog.push(payload as Record<string, unknown>);
        }
      }
      return route.fulfill(json({ ok: true }));
    }

    return route.fulfill(json({}));
  });
};

const navigateToDraftDetail = async (page: Page, id: string) => {
  await navigateWithRetry(page, `/drafts/${id}`, {
    gotoOptions: { waitUntil: 'domcontentloaded' },
  });
};

test.describe('Draft detail page', () => {
  test('renders version timeline and submits prediction', async ({ page }) => {
    await installDraftDetailApiMocks(page);
    await navigateToDraftDetail(page, draftId);

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
    await expect(page.getByText(/Your prediction:\s*merge/i)).toBeVisible();
  });

  test('shows prediction submit error when API fails', async ({ page }) => {
    await installDraftDetailApiMocks(page, {
      predictionStatus: 500,
      predictionResponseBody: { message: 'Prediction service unavailable' },
    });
    await navigateToDraftDetail(page, draftId);

    const predictRejectButton = page.getByRole('button', {
      name: /Predict reject/i,
    });
    await expect(predictRejectButton).toBeVisible();
    await predictRejectButton.click();

    await expect(
      page.getByText(/Prediction service unavailable/i),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/drafts/${draftId}`));
  });

  test('disables prediction submit when daily submission cap is reached', async ({
    page,
  }) => {
    await installDraftDetailApiMocks(page, {
      predictionSummaryResponseBody: {
        accuracy: { correct: 4, rate: 0.5, total: 8 },
        consensus: { merge: 2, reject: 1, total: 3 },
        market: {
          dailyStakeCapPoints: 1000,
          dailyStakeUsedPoints: 200,
          dailySubmissionCap: 3,
          dailySubmissionsUsed: 3,
          maxStakePoints: 300,
          minStakePoints: 5,
        },
        observerPrediction: null,
        pullRequestId,
        pullRequestStatus: 'pending',
      },
    });
    await navigateToDraftDetail(page, draftId);

    await expect(
      page.getByText(/Daily prediction submission cap reached\./i),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Predict merge/i }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /Predict reject/i }),
    ).toBeDisabled();
    await expect(page.getByLabel(/^Stake$/i)).toBeDisabled();
  });

  test('disables prediction submit when daily stake cap would be exceeded', async ({
    page,
  }) => {
    await installDraftDetailApiMocks(page, {
      predictionSummaryResponseBody: {
        accuracy: { correct: 4, rate: 0.5, total: 8 },
        consensus: { merge: 2, reject: 1, total: 3 },
        market: {
          dailyStakeCapPoints: 1000,
          dailyStakeUsedPoints: 995,
          dailySubmissionCap: 25,
          dailySubmissionsUsed: 3,
          maxStakePoints: 300,
          minStakePoints: 5,
        },
        observerPrediction: null,
        pullRequestId,
        pullRequestStatus: 'pending',
      },
    });
    await navigateToDraftDetail(page, draftId);

    const predictMergeButton = page.getByRole('button', {
      name: /Predict merge/i,
    });
    await expect(
      page.getByText(/Daily stake cap reached for current stake\./i),
    ).toBeVisible();
    await expect(predictMergeButton).toBeDisabled();
    await expect(page.getByLabel(/^Stake$/i)).toBeDisabled();
  });

  test('shows auth-required observer states when protected endpoints return unauthorized', async ({
    page,
  }) => {
    await installDraftDetailApiMocks(page, {
      digestStatus: 401,
      predictionSummaryStatus: 401,
      watchlistStatus: 401,
    });
    await navigateToDraftDetail(page, draftId);

    await expect(
      page.getByText(/Sign in as observer to follow drafts/i),
    ).toBeVisible();
    await expect(
      page.getByText(/Sign in as observer to see digest updates/i),
    ).toBeVisible();
    await expect(
      page.getByText(/Sign in as observer to submit predictions/i),
    ).toBeVisible();

    await expect(
      page.getByRole('button', { name: /Predict merge/i }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Mark seen/i })).toHaveCount(
      0,
    );
  });

  test('switches selected version in timeline', async ({ page }) => {
    await installDraftDetailApiMocks(page);
    await navigateToDraftDetail(page, draftId);

    await expect(page.getByText(/Selected version:\s*v2/i)).toBeVisible();
    await page.getByRole('button', { name: 'v1' }).click();
    await expect(page.getByText(/Selected version:\s*v1/i)).toBeVisible();
  });

  test('toggles follow state and activity hint', async ({ page }) => {
    await installDraftDetailApiMocks(page, {
      watchlistEntries: [],
    });
    await navigateToDraftDetail(page, draftId);

    await expect(
      page.getByText(/Follow the chain to see updates here/i),
    ).toBeVisible();

    const followRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'POST' &&
        request.url().includes(`/api/observers/watchlist/${draftId}`)
      );
    });

    await page.getByRole('button', { name: /Follow chain/i }).click();
    await followRequest;

    await expect(page.getByRole('button', { name: /Following/i })).toBeVisible();
    await expect(
      page.getByText(/Updates appear when this draft changes/i),
    ).toBeVisible();

    const unfollowRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'DELETE' &&
        request.url().includes(`/api/observers/watchlist/${draftId}`)
      );
    });

    await page.getByRole('button', { name: /Following/i }).click();
    await unfollowRequest;
    await expect(page.getByRole('button', { name: /Follow chain/i })).toBeVisible();
  });

  test('supports keyboard activation for follow and digest controls', async ({
    page,
  }) => {
    const now = new Date().toISOString();
    await installDraftDetailApiMocks(page, {
      digestEntries: [
        {
          createdAt: now,
          draftId,
          id: 'digest-entry-keyboard',
          isSeen: false,
          latestMilestone: 'v2 published',
          observerId: 'observer-e2e',
          summary: 'Keyboard entry',
          title: 'Keyboard digest',
          updatedAt: now,
        },
      ],
      watchlistEntries: [],
    });
    await navigateToDraftDetail(page, draftId);

    const followButton = page.getByRole('button', { name: /Follow chain/i });
    await followButton.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /Following/i })).toBeVisible();

    const followingButton = page.getByRole('button', { name: /Following/i });
    await followingButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Follow chain/i })).toBeVisible();

    const markSeenRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'POST' &&
        request.url().includes('/api/observers/digest/digest-entry-keyboard/seen')
      );
    });
    const markSeenButton = page.getByRole('button', { name: /Mark seen/i });
    await markSeenButton.focus();
    await page.keyboard.press('Enter');
    await markSeenRequest;

    await expect(page.getByText(/Unseen 0/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Mark seen/i })).toHaveCount(0);
  });

  test('shows pending state for follow and digest actions while requests are in-flight', async ({
    page,
  }) => {
    const now = new Date().toISOString();
    await installDraftDetailApiMocks(page, {
      digestEntries: [
        {
          createdAt: now,
          draftId,
          id: 'digest-entry-pending',
          isSeen: false,
          latestMilestone: 'v2 published',
          observerId: 'observer-e2e',
          summary: 'Pending entry',
          title: 'Pending digest',
          updatedAt: now,
        },
      ],
      digestSeenDelayMs: 500,
      watchlistPersistDelayMs: 500,
      watchlistEntries: [],
    });
    await navigateToDraftDetail(page, draftId);

    const followButton = page.getByRole('button', { name: /Follow chain/i });
    await expect(followButton).toHaveAttribute('aria-busy', 'false');
    await followButton.click();
    await expect(followButton).toHaveAttribute('aria-busy', 'true');
    await expect(followButton).toBeDisabled();
    await expect(page.getByRole('button', { name: /Following/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Following/i })).toHaveAttribute(
      'aria-busy',
      'false',
    );

    const markSeenRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'POST' &&
        request.url().includes('/api/observers/digest/digest-entry-pending/seen')
      );
    });
    const markSeenButton = page.getByRole('button', { name: /Mark seen/i });
    await expect(markSeenButton).toHaveAttribute('aria-busy', 'false');
    await markSeenButton.click();
    await expect(markSeenButton).toHaveAttribute('aria-busy', 'true');
    await expect(markSeenButton).toBeDisabled();
    await markSeenRequest;
    await expect(page.getByText(/Unseen 0/i)).toBeVisible();
  });

  test('marks observer digest entries as seen', async ({ page }) => {
    const now = new Date().toISOString();
    await installDraftDetailApiMocks(page, {
      digestEntries: [
        {
          createdAt: now,
          draftId,
          id: 'digest-entry-1',
          isSeen: false,
          latestMilestone: 'v2 published',
          observerId: 'observer-e2e',
          summary: 'Preview feedback landed',
          title: 'New draft digest',
          updatedAt: now,
        },
      ],
    });
    await navigateToDraftDetail(page, draftId);

    await expect(page.getByText(/Unseen 1/i)).toBeVisible();

    const markSeenRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'POST' &&
        request.url().includes('/api/observers/digest/digest-entry-1/seen')
      );
    });

    await page.getByRole('button', { name: /Mark seen/i }).click();
    await markSeenRequest;

    await expect(page.getByText(/Unseen 0/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Mark seen/i })).toHaveCount(0);
  });

  test('sends telemetry for follow and digest actions', async ({ page }) => {
    const now = new Date().toISOString();
    const telemetryPayloadLog: Array<Record<string, unknown>> = [];

    await installDraftDetailApiMocks(page, {
      digestEntries: [
        {
          createdAt: now,
          draftId,
          id: 'digest-entry-telemetry',
          isSeen: false,
          latestMilestone: 'v2 published',
          observerId: 'observer-e2e',
          summary: 'Telemetry entry',
          title: 'Telemetry digest',
          updatedAt: now,
        },
      ],
      telemetryPayloadLog,
      watchlistEntries: [],
    });
    await navigateToDraftDetail(page, draftId);

    await page.getByRole('button', { name: /Follow chain/i }).click();
    await page.getByRole('button', { name: /Following/i }).click();

    const markSeenRequest = page.waitForRequest((request) => {
      return (
        request.method() === 'POST' &&
        request.url().includes('/api/observers/digest/digest-entry-telemetry/seen')
      );
    });
    await page.getByRole('button', { name: /Mark seen/i }).click();
    await markSeenRequest;

    await expect
      .poll(() => {
        return telemetryPayloadLog.map((payload) => {
          const eventType = payload.eventType;
          const source = payload.source;
          const payloadDraftId = payload.draftId;
          return `${String(eventType)}:${String(source)}:${String(payloadDraftId)}`;
        });
      })
      .toContain(`digest_open:draft_detail:${draftId}`);

    const telemetrySignatures = telemetryPayloadLog.map((payload) => {
      const eventType = payload.eventType;
      const source = payload.source;
      const payloadDraftId = payload.draftId;
      return `${String(eventType)}:${String(source)}:${String(payloadDraftId)}`;
    });

    expect(telemetrySignatures).toContain(
      `watchlist_follow:draft_detail:${draftId}`,
    );
    expect(telemetrySignatures).toContain(
      `watchlist_unfollow:draft_detail:${draftId}`,
    );
  });
});
