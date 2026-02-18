import { expect, test, type Locator, type Page } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const DRAFT_ID = 'draft-focus-visible-e2e';
const PR_ID = 'pr-focus-visible-e2e';

const withJson = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

interface FocusState {
  active: boolean;
  boxShadow: string;
  focusVisible: boolean;
  hasVisualIndicator: boolean;
  outlineStyle: string;
  outlineWidth: string;
}

const readFocusState = async (locator: Locator): Promise<FocusState> => {
  return await locator.evaluate((element) => {
    const node = element as HTMLElement;
    const style = window.getComputedStyle(node);
    const outlineWidth = style.outlineWidth;
    const outlineStyle = style.outlineStyle;
    const boxShadow = style.boxShadow;
    const hasVisualIndicator =
      boxShadow !== 'none' ||
      (outlineStyle !== 'none' && outlineWidth !== '0px');

    return {
      active: document.activeElement === node,
      boxShadow,
      focusVisible: node.matches(':focus-visible'),
      hasVisualIndicator,
      outlineStyle,
      outlineWidth,
    };
  });
};

const tabUntilFocusVisible = async (
  page: Page,
  locator: Locator,
  description: string,
  maxTabs = 180,
) => {
  await expect(locator).toBeVisible();

  for (let step = 0; step < maxTabs; step += 1) {
    const state = await readFocusState(locator);
    if (state.active && state.focusVisible && state.hasVisualIndicator) {
      return;
    }
    await page.keyboard.press('Tab');
  }

  const activeElement = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active) {
      return 'null';
    }
    const id = active.id || 'no-id';
    const className =
      typeof active.className === 'string'
        ? active.className.split(/\s+/).slice(0, 6).join('.')
        : '';
    return `${active.tagName.toLowerCase()}#${id}.${className}`;
  });
  const finalState = await readFocusState(locator);

  expect(
    finalState.active &&
      finalState.focusVisible &&
      finalState.hasVisualIndicator,
    `Expected visible keyboard focus on ${description}. activeElement=${activeElement} finalState=${JSON.stringify(
      finalState,
    )}`,
  ).toBe(true);
};

const installFeedFocusMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === '/api/feed') {
      return route.fulfill(
        withJson([
          {
            glowUpScore: 8.4,
            id: DRAFT_ID,
            type: 'draft',
            updatedAt: '2026-02-18T10:00:00.000Z',
          },
        ]),
      );
    }

    if (method === 'GET' && path === '/api/feeds/battles') {
      return route.fulfill(
        withJson([
          {
            decision: 'pending',
            fixCount: 2,
            glowUpScore: 9.2,
            id: 'battle-focus-visible-e2e',
            leftLabel: 'Design',
            leftVote: 51,
            prCount: 4,
            rightLabel: 'Function',
            rightVote: 49,
            title: 'Battle focus-visible',
          },
        ]),
      );
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson([]));
  });
};

const installSearchFocusMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === '/api/search') {
      return route.fulfill(withJson([]));
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

const installDraftDetailFocusMocks = async (page: Page) => {
  const now = new Date().toISOString();

  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === `/api/drafts/${DRAFT_ID}`) {
      return route.fulfill(
        withJson({
          draft: {
            currentVersion: 2,
            glowUpScore: 2.1,
            id: DRAFT_ID,
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

    if (method === 'GET' && path === `/api/drafts/${DRAFT_ID}/fix-requests`) {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === `/api/drafts/${DRAFT_ID}/pull-requests`) {
      return route.fulfill(
        withJson([
          {
            description: 'Pending PR for focus-visible checks',
            id: PR_ID,
            makerId: 'maker-focus-e2e',
            status: 'pending',
          },
        ]),
      );
    }

    if (method === 'GET' && path === `/api/drafts/${DRAFT_ID}/arc`) {
      return route.fulfill(withJson(null));
    }

    if (method === 'GET' && path === `/api/pull-requests/${PR_ID}/predictions`) {
      return route.fulfill(
        withJson({
          accuracy: { correct: 4, rate: 0.5, total: 8 },
          consensus: { merge: 2, reject: 1, total: 3 },
          observerPrediction: null,
          pullRequestId: PR_ID,
          pullRequestStatus: 'pending',
        }),
      );
    }

    if (method === 'GET' && path === '/api/observers/watchlist') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === '/api/observers/digest') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && path === '/api/search/similar') {
      return route.fulfill(withJson([]));
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

const installPullRequestReviewFocusMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === `/api/pull-requests/${PR_ID}`) {
      return route.fulfill(
        withJson({
          afterImageUrl: 'https://example.com/after.png',
          authorStudio: 'Studio A',
          beforeImageUrl: 'https://example.com/before.png',
          draft: {
            authorId: 'author-focus-e2e',
            currentVersion: 1,
            glowUpScore: 2.2,
            id: DRAFT_ID,
            status: 'draft',
          },
          makerStudio: 'Studio B',
          metrics: {
            currentGlowUp: 2.2,
            glowUpDelta: 0.6,
            impactDelta: 3,
            predictedGlowUp: 2.8,
          },
          pullRequest: {
            addressedFixRequests: [],
            description: 'Focus-visible review payload',
            draftId: DRAFT_ID,
            id: PR_ID,
            makerId: 'maker-focus-e2e',
            proposedVersion: 2,
            severity: 'minor',
            status: 'pending',
          },
        }),
      );
    }

    if (method === 'GET' && path === `/api/drafts/${DRAFT_ID}/fix-requests`) {
      return route.fulfill(withJson([]));
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    if (method === 'POST' && path === `/api/pull-requests/${PR_ID}/decide`) {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

test.describe('Keyboard focus-visible on critical controls', () => {
  test('feed controls show visible keyboard focus', async ({ page }) => {
    await installFeedFocusMocks(page);
    await navigateWithRetry(page, '/feed');
    await expect(page.getByRole('heading', { name: /Feeds/i })).toBeVisible();

    await tabUntilFocusVisible(
      page,
      page.getByRole('button', { name: /^All$/i }).first(),
      'feed All tab',
    );
    await tabUntilFocusVisible(
      page,
      page.getByPlaceholder(/Search drafts, studios, PRs/i).first(),
      'feed search input',
    );
    await tabUntilFocusVisible(
      page,
      page.getByRole('button', { name: /^Filters/i }).first(),
      'feed Filters button',
    );
  });

  test('search controls show visible keyboard focus', async ({ page }) => {
    await installSearchFocusMocks(page);
    await navigateWithRetry(page, '/search');
    await expect(page.getByRole('heading', { name: /^Search$/i })).toBeVisible();

    await tabUntilFocusVisible(
      page,
      page.getByRole('button', { name: /Text search/i }).first(),
      'search Text mode button',
    );
    await tabUntilFocusVisible(
      page,
      page.getByPlaceholder(/Search by keyword/i).first(),
      'search keyword input',
    );
    await tabUntilFocusVisible(
      page,
      page.getByRole('button', { name: /Reset filters/i }).first(),
      'search Reset filters button',
    );
  });

  test('draft detail controls show visible keyboard focus', async ({
    page,
  }) => {
    await installDraftDetailFocusMocks(page);
    await navigateWithRetry(page, `/drafts/${DRAFT_ID}`);
    await expect(
      page.getByRole('heading', { name: new RegExp(DRAFT_ID, 'i') }),
    ).toBeVisible();

    await tabUntilFocusVisible(
      page,
      page.getByRole('button', { name: /Run demo flow/i }).first(),
      'draft detail Run demo flow button',
    );
    await tabUntilFocusVisible(
      page,
      page.getByRole('button', { name: /Predict merge/i }).first(),
      'draft detail Predict merge button',
    );
    await tabUntilFocusVisible(
      page,
      page.getByRole('button', { name: /Follow chain/i }).first(),
      'draft detail Follow chain button',
    );
  });

  test('pull request review controls show visible keyboard focus', async ({
    page,
  }) => {
    await installPullRequestReviewFocusMocks(page);
    await navigateWithRetry(page, `/pull-requests/${PR_ID}`);
    await expect(
      page.getByRole('heading', { name: new RegExp(PR_ID, 'i') }),
    ).toBeVisible();

    await tabUntilFocusVisible(
      page,
      page.getByPlaceholder(/Add feedback/i).first(),
      'pull request feedback textarea',
    );
    await tabUntilFocusVisible(
      page,
      page.getByRole('button', { name: /Merge/i }).first(),
      'pull request Merge button',
    );
    await tabUntilFocusVisible(
      page,
      page.getByRole('button', { name: /Request changes/i }).first(),
      'pull request Request changes button',
    );
    await tabUntilFocusVisible(
      page,
      page.getByRole('button', { name: /Reject/i }).first(),
      'pull request Reject button',
    );
  });
});
