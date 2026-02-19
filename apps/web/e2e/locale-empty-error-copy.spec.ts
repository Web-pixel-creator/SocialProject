import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

type LocaleCode = 'en' | 'ru';

const DRAFT_ID = 'draft-locale-copy-states';
const PR_ID = 'pr-locale-copy-states';

const withJson = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

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

const expectLocalized = async (
  expected: Locator,
  forbidden: Locator,
  description: string,
) => {
  await expect(expected, `${description} should use active locale copy`).toBeVisible();
  expect(
    await isVisibleSafe(forbidden),
    `${description} should not show opposite locale copy`,
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

const installFeedEmptyMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const pathName = requestUrl.pathname;

    if (method === 'GET' && pathName === '/api/feed') {
      return route.fulfill(withJson([]));
    }

    if (method === 'GET' && pathName === '/api/feeds/battles') {
      return route.fulfill(withJson([]));
    }

    if (method === 'POST' && pathName === '/api/telemetry/ux') {
      return route.fulfill(withJson({ ok: true }));
    }

    return route.fulfill(withJson({}));
  });
};

const installSearchEmptyMocks = async (page: Page) => {
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

const installPullRequestReviewMocks = async (page: Page) => {
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
            glowUpScore: 4.1,
            id: DRAFT_ID,
            status: 'draft',
          },
          makerStudio: 'Studio Beta',
          metrics: {
            currentGlowUp: 4.1,
            glowUpDelta: 0.4,
            impactDelta: 1,
            predictedGlowUp: 4.5,
          },
          pullRequest: {
            addressedFixRequests: [],
            description: 'Locale copy validation PR',
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

const installPrivacyMocks = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('finishit_token', 'locale-empty-token');
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
            downloadUrl: 'https://example.com/export-locale-empty.zip',
            id: 'export-locale-empty',
            status: 'ready',
          },
        }),
      );
    }

    if (method === 'GET' && pathName === '/api/account/exports/export-locale-empty') {
      return route.fulfill(
        withJson({
          downloadUrl: 'https://example.com/export-locale-empty.zip',
          id: 'export-locale-empty',
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

test.describe('Locale empty/error/helper copy quality (EN/RU)', () => {
  test('feed empty-state helper copy is localized without mixed language fragments', async ({
    page,
  }) => {
    await installFeedEmptyMocks(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await navigateWithRetry(page, '/feed?tab=All&q=locale-empty-query');

    for (const locale of ['en', 'ru'] as const) {
      const otherLocale = oppositeLocale(locale);
      await switchLanguage(page, locale);

      await expectLocalized(
        page.getByText(exactText(t(locale, 'feedTabs.empty.title.search'))).first(),
        page
          .getByText(exactText(t(otherLocale, 'feedTabs.empty.title.search')))
          .first(),
        `feed empty title (${locale})`,
      );
      await expectLocalized(
        page.getByText(exactText(t(locale, 'feedTabs.empty.search'))).first(),
        page.getByText(exactText(t(otherLocale, 'feedTabs.empty.search'))).first(),
        `feed empty helper (${locale})`,
      );
      await expectLocalized(
        page.getByRole('button', {
          name: exactText(t(locale, 'feedTabs.emptyAction.clearSearch')),
        }),
        page.getByRole('button', {
          name: exactText(t(otherLocale, 'feedTabs.emptyAction.clearSearch')),
        }),
        `feed empty CTA (${locale})`,
      );
    }
  });

  test('search empty-state helper copy is localized without mixed language fragments', async ({
    page,
  }) => {
    await installSearchEmptyMocks(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await navigateWithRetry(page, '/search');

    for (const locale of ['en', 'ru'] as const) {
      const otherLocale = oppositeLocale(locale);
      await switchLanguage(page, locale);

      await expectLocalized(
        page.getByText(exactText(t(locale, 'search.states.noResultsYet'))).first(),
        page.getByText(exactText(t(otherLocale, 'search.states.noResultsYet'))).first(),
        `search empty helper (${locale})`,
      );
      await expectLocalized(
        page
          .getByRole('button', {
            name: exactText(t(locale, 'search.actions.resetFilters')),
          })
          .first(),
        page
          .getByRole('button', {
            name: exactText(t(otherLocale, 'search.actions.resetFilters')),
          })
          .first(),
        `search reset button (${locale})`,
      );
      await expectLocalized(
        page
          .getByPlaceholder(exactText(t(locale, 'search.placeholders.keyword')))
          .first(),
        page
          .getByPlaceholder(exactText(t(otherLocale, 'search.placeholders.keyword')))
          .first(),
        `search keyword helper (${locale})`,
      );
    }
  });

  test('pull request validation error copy is localized without mixed language fragments', async ({
    page,
  }) => {
    await installPullRequestReviewMocks(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await navigateWithRetry(page, `/pull-requests/${PR_ID}`);

    for (const locale of ['en', 'ru'] as const) {
      const otherLocale = oppositeLocale(locale);
      await switchLanguage(page, locale);
      await page
        .getByRole('button', {
          name: exactText(t(locale, 'pullRequestReview.decision.actions.reject')),
        })
        .first()
        .click();

      await expectLocalized(
        page
          .getByText(exactText(t(locale, 'pullRequestReview.errors.rejectionReasonRequired')))
          .first(),
        page
          .getByText(exactText(t(otherLocale, 'pullRequestReview.errors.rejectionReasonRequired')))
          .first(),
        `pull request validation error (${locale})`,
      );
    }
  });

  test('privacy helper and action copy is localized without mixed language fragments', async ({
    page,
  }) => {
    await installPrivacyMocks(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await navigateWithRetry(page, '/privacy');

    for (const locale of ['en', 'ru'] as const) {
      const otherLocale = oppositeLocale(locale);
      await switchLanguage(page, locale);

      await expectLocalized(
        page.getByText(exactText(t(locale, 'privacy.retention.note'))).first(),
        page.getByText(exactText(t(otherLocale, 'privacy.retention.note'))).first(),
        `privacy retention helper (${locale})`,
      );
      await expectLocalized(
        page.getByRole('button', {
          name: exactText(t(locale, 'privacy.actions.requestExport')),
        }),
        page.getByRole('button', {
          name: exactText(t(otherLocale, 'privacy.actions.requestExport')),
        }),
        `privacy request export button (${locale})`,
      );
      await expectLocalized(
        page.getByRole('button', {
          name: exactText(t(locale, 'privacy.actions.requestDeletion')),
        }),
        page.getByRole('button', {
          name: exactText(t(otherLocale, 'privacy.actions.requestDeletion')),
        }),
        `privacy request deletion button (${locale})`,
      );
    }
  });
});
