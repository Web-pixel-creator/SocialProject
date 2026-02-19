import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const DRAFT_ID = 'draft-locale-copy-e2e';
const PR_ID = 'pr-locale-copy-e2e';

const withJson = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

type LocaleCode = 'en' | 'ru';

const escapeRegex = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const exactText = (value: string) => {
  return new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, 'iu');
};

const resolveMessagesPath = (localeFile: 'en.json' | 'ru.json') => {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'src', 'messages', localeFile),
    path.join(cwd, 'apps', 'web', 'src', 'messages', localeFile),
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error(`Unable to resolve locale file: ${localeFile}`);
  }
  return resolved;
};

const MESSAGES: Record<LocaleCode, Record<string, string>> = {
  en: JSON.parse(readFileSync(resolveMessagesPath('en.json'), 'utf8')) as Record<
    string,
    string
  >,
  ru: JSON.parse(readFileSync(resolveMessagesPath('ru.json'), 'utf8')) as Record<
    string,
    string
  >,
};

const t = (locale: LocaleCode, key: string) => {
  const value = MESSAGES[locale][key];
  if (!value) {
    throw new Error(`Missing translation key "${key}" for locale "${locale}"`);
  }
  return value;
};

const oppositeLocale = (locale: LocaleCode): LocaleCode => {
  return locale === 'en' ? 'ru' : 'en';
};

const isVisibleSafe = async (locator: Locator) => {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
};

const expectLocalizedControl = async (
  expected: Locator,
  forbidden: Locator,
  label: string,
) => {
  await expect(expected, `${label} should use active locale copy`).toBeVisible();
  expect(
    await isVisibleSafe(forbidden),
    `${label} should not show opposite locale copy`,
  ).toBeFalsy();
};

const switchLanguage = async (page: Page, locale: LocaleCode) => {
  const currentLocale = await page.evaluate(() => document.documentElement.lang);
  if (currentLocale === locale) {
    return;
  }

  const localeControl = page
    .locator('button')
    .filter({
      hasText: new RegExp(`^${locale.toUpperCase()}$`, 'i'),
    })
    .first();

  await expect(localeControl).toBeVisible();
  await localeControl.click();

  await expect
    .poll(async () => {
      return await page.evaluate(() => document.documentElement.lang);
    })
    .toBe(locale);
};

const installFeedApiMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const pathName = requestUrl.pathname;

    if (method === 'GET' && pathName === '/api/feed') {
      return route.fulfill(
        withJson([
          {
            glowUpScore: 8.7,
            id: DRAFT_ID,
            type: 'draft',
            updatedAt: '2026-02-19T10:00:00.000Z',
          },
        ]),
      );
    }

    if (method === 'GET' && pathName === '/api/feeds/battles') {
      return route.fulfill(
        withJson([
          {
            decision: 'pending',
            fixCount: 2,
            glowUpScore: 6.4,
            id: 'battle-locale-copy',
            leftLabel: 'Design',
            leftVote: 51,
            prCount: 4,
            rightLabel: 'Function',
            rightVote: 49,
            title: 'Locale copy battle',
          },
        ]),
      );
    }

    if (method === 'POST' && pathName === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

const installSearchApiMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const pathName = requestUrl.pathname;

    if (method === 'GET' && pathName === '/api/search') {
      return route.fulfill(withJson([]));
    }

    if (method === 'POST' && pathName === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

const installDraftDetailApiMocks = async (page: Page) => {
  const now = new Date().toISOString();

  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const pathName = requestUrl.pathname;

    if (method === 'GET' && pathName === `/api/drafts/${DRAFT_ID}`) {
      return route.fulfill(
        withJson({
          draft: {
            currentVersion: 2,
            glowUpScore: 5.8,
            id: DRAFT_ID,
            status: 'ready_for_review',
            updatedAt: now,
          },
          versions: [
            { imageUrl: 'https://example.com/draft-v1.png', versionNumber: 1 },
            { imageUrl: 'https://example.com/draft-v2.png', versionNumber: 2 },
          ],
        }),
      );
    }

    if (method === 'GET' && pathName === `/api/drafts/${DRAFT_ID}/fix-requests`) {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && pathName === `/api/drafts/${DRAFT_ID}/pull-requests`) {
      return route.fulfill(
        withJson([
          {
            description: 'Locale copy PR',
            id: PR_ID,
            makerId: 'maker-locale-copy',
            status: 'pending',
          },
        ]),
      );
    }

    if (method === 'GET' && pathName === `/api/drafts/${DRAFT_ID}/arc`) {
      return route.fulfill(withJson(null));
    }

    if (method === 'GET' && pathName === '/api/observers/watchlist') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && pathName === '/api/observers/digest') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && pathName === '/api/search/similar') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && pathName === `/api/pull-requests/${PR_ID}/predictions`) {
      return route.fulfill(
        withJson({
          accuracy: { correct: 0, rate: 0, total: 0 },
          consensus: { merge: 0, reject: 0, total: 0 },
          observerPrediction: null,
          pullRequestId: PR_ID,
          pullRequestStatus: 'pending',
        }),
      );
    }

    if (method === 'POST' && pathName === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

const installPullRequestReviewApiMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const pathName = requestUrl.pathname;

    if (method === 'GET' && pathName === `/api/pull-requests/${PR_ID}`) {
      return route.fulfill(
        withJson({
          afterImageUrl: 'https://example.com/after.png',
          authorStudio: 'Studio Alpha',
          beforeImageUrl: 'https://example.com/before.png',
          draft: {
            authorId: 'author-locale-copy',
            currentVersion: 1,
            glowUpScore: 3.2,
            id: DRAFT_ID,
            status: 'draft',
          },
          makerStudio: 'Studio Beta',
          metrics: {
            currentGlowUp: 3.2,
            glowUpDelta: 0.6,
            impactDelta: 2,
            predictedGlowUp: 3.8,
          },
          pullRequest: {
            addressedFixRequests: [],
            description: 'Locale review payload',
            draftId: DRAFT_ID,
            id: PR_ID,
            makerId: 'maker-locale-copy',
            proposedVersion: 2,
            severity: 'minor',
            status: 'pending',
          },
        }),
      );
    }

    if (method === 'GET' && pathName === `/api/drafts/${DRAFT_ID}/fix-requests`) {
      return route.fulfill(withJson([]));
    }

    if (method === 'POST' && pathName === `/api/pull-requests/${PR_ID}/decide`) {
      return route.fulfill(withJson({ ok: true }));
    }

    if (method === 'POST' && pathName === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

const installPrivacyApiMocks = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('finishit_token', 'locale-copy-token');
    window.localStorage.setItem(
      'finishit_user',
      JSON.stringify({
        user: {
          email: 'observer@example.com',
          id: 'observer-locale-copy',
        },
      }),
    );
  });

  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const pathName = requestUrl.pathname;

    if (method === 'GET' && pathName === '/api/auth/me') {
      return route.fulfill(
        withJson({
          user: {
            email: 'observer@example.com',
            id: 'observer-locale-copy',
          },
        }),
      );
    }

    if (method === 'POST' && pathName === '/api/account/export') {
      return route.fulfill(
        withJson({
          export: {
            downloadUrl: 'https://example.com/export-locale-copy.zip',
            id: 'export-locale-copy',
            status: 'ready',
          },
        }),
      );
    }

    if (
      method === 'GET' &&
      pathName === '/api/account/exports/export-locale-copy'
    ) {
      return route.fulfill(
        withJson({
          downloadUrl: 'https://example.com/export-locale-copy.zip',
          id: 'export-locale-copy',
          status: 'ready',
        }),
      );
    }

    if (method === 'POST' && pathName === '/api/account/delete') {
      return route.fulfill(withJson({ status: 'pending' }));
    }

    return route.fulfill(withJson({}));
  });
};

test.describe('Locale copy quality (EN/RU)', () => {
  test('feed uses translated critical controls without mixed locale labels', async ({
    page,
  }) => {
    await installFeedApiMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await navigateWithRetry(page, '/feed');
    await expect(page.getByRole('heading', { name: /Feeds|Ленты/i })).toBeVisible();

    for (const locale of ['en', 'ru'] as const) {
      const otherLocale = oppositeLocale(locale);
      await switchLanguage(page, locale);

      await expectLocalizedControl(
        page.getByRole('heading', { name: exactText(t(locale, 'header.feeds')) }).first(),
        page
          .getByRole('heading', { name: exactText(t(otherLocale, 'header.feeds')) })
          .first(),
        `feed heading (${locale})`,
      );

      for (const key of [
        'feed.all',
        'feedTabs.tab.hotNow',
        'feedTabs.tab.liveDrafts',
        'feedTabs.tab.battles',
        'feedTabs.tab.forYou',
        'feedTabs.filters.toggle',
      ]) {
        await expectLocalizedControl(
          page.getByRole('button', { name: exactText(t(locale, key)) }).first(),
          page.getByRole('button', { name: exactText(t(otherLocale, key)) }).first(),
          `feed control ${key} (${locale})`,
        );
      }

      await expectLocalizedControl(
        page.getByText(new RegExp(`^${escapeRegex(t(locale, 'feedTabs.shown'))}:`, 'iu')).first(),
        page
          .getByText(new RegExp(`^${escapeRegex(t(otherLocale, 'feedTabs.shown'))}:`, 'iu'))
          .first(),
        `feed results chip (${locale})`,
      );
    }
  });

  test('search uses translated controls and placeholders without mixed labels', async ({
    page,
  }) => {
    await installSearchApiMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await navigateWithRetry(page, '/search');
    await expect(page.getByRole('heading', { name: /Search|Поиск/i })).toBeVisible();

    for (const locale of ['en', 'ru'] as const) {
      const otherLocale = oppositeLocale(locale);
      await switchLanguage(page, locale);

      await expectLocalizedControl(
        page.getByRole('heading', { name: exactText(t(locale, 'header.search')) }).first(),
        page
          .getByRole('heading', { name: exactText(t(otherLocale, 'header.search')) })
          .first(),
        `search heading (${locale})`,
      );

      for (const key of ['search.mode.text', 'search.mode.visual', 'search.actions.resetFilters']) {
        await expectLocalizedControl(
          page.getByRole('button', { name: exactText(t(locale, key)) }).first(),
          page.getByRole('button', { name: exactText(t(otherLocale, key)) }).first(),
          `search control ${key} (${locale})`,
        );
      }

      await expectLocalizedControl(
        page.getByPlaceholder(exactText(t(locale, 'search.placeholders.keyword'))).first(),
        page
          .getByPlaceholder(exactText(t(otherLocale, 'search.placeholders.keyword')))
          .first(),
        `search keyword placeholder (${locale})`,
      );
    }
  });

  test('draft detail uses translated observer actions without mixed labels', async ({
    page,
  }) => {
    await installDraftDetailApiMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await navigateWithRetry(page, `/drafts/${DRAFT_ID}`);
    await expect(page.getByText(new RegExp(DRAFT_ID, 'i'))).toBeVisible();

    for (const locale of ['en', 'ru'] as const) {
      const otherLocale = oppositeLocale(locale);
      await switchLanguage(page, locale);

      for (const key of [
        'draftDetail.actions.runDemoFlow',
        'prediction.predictMerge',
        'draftDetail.follow.follow',
      ]) {
        await expectLocalizedControl(
          page.getByRole('button', { name: exactText(t(locale, key)) }).first(),
          page.getByRole('button', { name: exactText(t(otherLocale, key)) }).first(),
          `draft detail control ${key} (${locale})`,
        );
      }
    }
  });

  test('pull request review uses translated decision actions without mixed labels', async ({
    page,
  }) => {
    await installPullRequestReviewApiMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await navigateWithRetry(page, `/pull-requests/${PR_ID}`);
    await expect(page.getByText(new RegExp(PR_ID, 'i'))).toBeVisible();

    for (const locale of ['en', 'ru'] as const) {
      const otherLocale = oppositeLocale(locale);
      await switchLanguage(page, locale);

      for (const key of [
        'pullRequestReview.decision.actions.merge',
        'pullRequestReview.decision.actions.reject',
        'pullRequestReview.decision.actions.requestChanges',
      ]) {
        await expectLocalizedControl(
          page.getByRole('button', { name: exactText(t(locale, key)) }).first(),
          page.getByRole('button', { name: exactText(t(otherLocale, key)) }).first(),
          `pull request review control ${key} (${locale})`,
        );
      }
    }
  });

  test('privacy uses translated protected actions without mixed labels', async ({
    page,
  }) => {
    await installPrivacyApiMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await navigateWithRetry(page, '/privacy');
    await expect(
      page.getByRole('heading', { name: /Privacy & Data|Конфиденциальность и данные/i }),
    ).toBeVisible();

    for (const locale of ['en', 'ru'] as const) {
      const otherLocale = oppositeLocale(locale);
      await switchLanguage(page, locale);

      await expectLocalizedControl(
        page
          .getByRole('heading', { name: exactText(t(locale, 'privacy.header.title')) })
          .first(),
        page
          .getByRole('heading', {
            name: exactText(t(otherLocale, 'privacy.header.title')),
          })
          .first(),
        `privacy heading (${locale})`,
      );

      for (const key of ['privacy.actions.requestExport', 'privacy.actions.requestDeletion']) {
        await expectLocalizedControl(
          page.getByRole('button', { name: exactText(t(locale, key)) }).first(),
          page.getByRole('button', { name: exactText(t(otherLocale, key)) }).first(),
          `privacy control ${key} (${locale})`,
        );
      }
    }
  });
});
