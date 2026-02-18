import { expect, test, type Locator, type Page } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const DRAFT_ID = 'draft-locale-e2e';
const PR_ID = 'pr-locale-e2e';

const withJson = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

type LocaleCode = 'en' | 'ru';

const COPY = {
  en: {
    draftDetail: {
      follow: 'Follow chain',
      predictMerge: 'Predict merge',
      runDemo: 'Run demo flow',
    },
    feed: {
      all: 'All',
      battles: 'Battles',
      filters: 'Filters',
      forYou: 'For You',
      heading: 'Feeds',
      hotNow: 'Hot Now',
      liveDrafts: 'Live Drafts',
    },
    prReview: {
      merge: 'Merge',
      reject: 'Reject',
      requestChanges: 'Request changes',
    },
    search: {
      heading: 'Search',
      keywordPlaceholder: 'Search by keyword',
      resetFilters: 'Reset filters',
      textMode: 'Text search',
      visualMode: 'Visual search',
    },
  },
  ru: {
    draftDetail: {
      follow: 'Следовать по цепочке',
      predictMerge: 'Прогнозировать слияние',
      runDemo: 'Запустить демонстрационный процесс',
    },
    feed: {
      all: 'Все',
      battles: 'Баттлы',
      filters: 'Фильтры',
      forYou: 'Для вас',
      heading: 'Ленты',
      hotNow: 'Горячее сейчас',
      liveDrafts: 'Живые драфты',
    },
    prReview: {
      merge: 'Слить',
      reject: 'Отклонить',
      requestChanges: 'Запросить изменения',
    },
    search: {
      heading: 'Поиск',
      keywordPlaceholder: 'Поиск по ключевому слову',
      resetFilters: 'Сбросить фильтры',
      textMode: 'Текстовый поиск',
      visualMode: 'Визуальный поиск',
    },
  },
} as const;

const assertNoHorizontalOverflow = async (page: Page) => {
  const pageWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth + 1);
};

const assertWithinViewport = async (
  page: Page,
  locator: Locator,
  description: string,
) => {
  await expect(locator, `${description} should be visible`).toBeVisible();

  const [box, viewportWidth] = await Promise.all([
    locator.boundingBox(),
    page.evaluate(() => window.innerWidth),
  ]);

  expect(box, `${description} should have a bounding box`).not.toBeNull();

  const safeBox = box!;
  expect(safeBox.width, `${description} width should be > 0`).toBeGreaterThan(0);
  expect(safeBox.height, `${description} height should be > 0`).toBeGreaterThan(0);
  expect(safeBox.x, `${description} should not start outside viewport`).toBeGreaterThanOrEqual(
    0,
  );
  expect(
    safeBox.x + safeBox.width,
    `${description} should not end outside viewport`,
  ).toBeLessThanOrEqual(viewportWidth + 1);
};

const switchLanguage = async (page: Page, language: LocaleCode) => {
  const currentLanguage = await page.evaluate(() => document.documentElement.lang);
  if (currentLanguage === language) {
    return;
  }

  const controlLabel = language.toUpperCase();
  const languageButton = page
    .locator('button')
    .filter({ hasText: new RegExp(`^${controlLabel}$`, 'i') })
    .first();
  await expect(languageButton).toBeVisible();
  await languageButton.click();

  await expect
    .poll(async () => {
      return await page.evaluate(() => document.documentElement.lang);
    })
    .toBe(language);
};

const installFeedLocaleMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === '/api/feed') {
      return route.fulfill(
        withJson([
          {
            glowUpScore: 8.1,
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
            glowUpScore: 9.1,
            id: 'battle-locale-e2e',
            leftLabel: 'Design',
            leftVote: 52,
            prCount: 4,
            rightLabel: 'Function',
            rightVote: 48,
            title: 'Battle locale checks',
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

const installSearchLocaleMocks = async (page: Page) => {
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

const installDraftDetailLocaleMocks = async (page: Page) => {
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
            glowUpScore: 2.3,
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
            description: 'Pending PR for locale checks',
            id: PR_ID,
            makerId: 'maker-locale-e2e',
            status: 'pending',
          },
        ]),
      );
    }

    if (method === 'GET' && path === `/api/drafts/${DRAFT_ID}/arc`) {
      return route.fulfill(withJson(null));
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

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

const installPullRequestReviewLocaleMocks = async (page: Page) => {
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
            authorId: 'author-locale-e2e',
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
            description: 'Locale-focused review payload',
            draftId: DRAFT_ID,
            id: PR_ID,
            makerId: 'maker-locale-e2e',
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

test.describe('Locale critical controls layout regression (EN/RU)', () => {
  test('feed critical action rows avoid clipping in EN and RU', async ({
    page,
  }) => {
    await installFeedLocaleMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await navigateWithRetry(page, '/feed');
    await expect(page.getByRole('heading', { name: /Feeds|Ленты/i })).toBeVisible();

    for (const locale of ['en', 'ru'] as const) {
      await switchLanguage(page, locale);
      const labels = COPY[locale].feed;

      await assertWithinViewport(
        page,
        page.getByRole('heading', { name: new RegExp(labels.heading, 'i') }).first(),
        `feed heading (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(`^${labels.all}$`, 'i') }).first(),
        `feed All tab (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.hotNow, 'i') }).first(),
        `feed Hot tab (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.liveDrafts, 'i') }).first(),
        `feed Live Drafts tab (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.battles, 'i') }).first(),
        `feed Battles tab (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.forYou, 'i') }).first(),
        `feed For You tab (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByTestId('feed-more-summary'),
        `feed More control (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.filters, 'i') }).first(),
        `feed Filters button (${locale})`,
      );
      await assertNoHorizontalOverflow(page);
    }
  });

  test('search critical action rows avoid clipping in EN and RU', async ({
    page,
  }) => {
    await installSearchLocaleMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await navigateWithRetry(page, '/search');
    await expect(page.getByRole('heading', { name: /Search|Поиск/i })).toBeVisible();

    for (const locale of ['en', 'ru'] as const) {
      await switchLanguage(page, locale);
      const labels = COPY[locale].search;

      await assertWithinViewport(
        page,
        page.getByRole('heading', { name: new RegExp(labels.heading, 'i') }).first(),
        `search heading (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.textMode, 'i') }).first(),
        `search Text mode button (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.visualMode, 'i') }).first(),
        `search Visual mode button (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByPlaceholder(new RegExp(labels.keywordPlaceholder, 'i')).first(),
        `search keyword input (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.resetFilters, 'i') }).first(),
        `search reset filters button (${locale})`,
      );
      await assertNoHorizontalOverflow(page);
    }
  });

  test('draft detail critical controls avoid clipping in EN and RU', async ({
    page,
  }) => {
    await installDraftDetailLocaleMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await navigateWithRetry(page, `/drafts/${DRAFT_ID}`);
    await expect(page.getByText(new RegExp(DRAFT_ID, 'i')).first()).toBeVisible();

    for (const locale of ['en', 'ru'] as const) {
      await switchLanguage(page, locale);
      const labels = COPY[locale].draftDetail;

      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.runDemo, 'i') }).first(),
        `draft Run demo flow button (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', {
          name: new RegExp(labels.predictMerge, 'i'),
        }).first(),
        `draft Predict merge button (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.follow, 'i') }).first(),
        `draft Follow chain button (${locale})`,
      );
      await assertNoHorizontalOverflow(page);
    }
  });

  test('pull request review critical controls avoid clipping in EN and RU', async ({
    page,
  }) => {
    await installPullRequestReviewLocaleMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await navigateWithRetry(page, `/pull-requests/${PR_ID}`);
    await expect(page.getByText(new RegExp(PR_ID, 'i')).first()).toBeVisible();

    for (const locale of ['en', 'ru'] as const) {
      await switchLanguage(page, locale);
      const labels = COPY[locale].prReview;

      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.merge, 'i') }).first(),
        `pull request Merge button (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', {
          name: new RegExp(labels.requestChanges, 'i'),
        }).first(),
        `pull request Request changes button (${locale})`,
      );
      await assertWithinViewport(
        page,
        page.getByRole('button', { name: new RegExp(labels.reject, 'i') }).first(),
        `pull request Reject button (${locale})`,
      );
      await assertNoHorizontalOverflow(page);
    }
  });
});
