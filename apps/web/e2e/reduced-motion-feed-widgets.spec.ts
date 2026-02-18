import { expect, test, type Locator, type Page } from '@playwright/test';
import { openFeed } from './utils/feed';

const DRAFT_ID = 'draft-hover-e2e-motion';
const BATTLE_ID = 'battle-hover-e2e-motion';
const BATTLE_TITLE = 'Battle hover reduced motion';

const withJson = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

const installFeedMotionWidgetMocks = async (page: Page) => {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path === '/api/feed') {
      return route.fulfill(
        withJson([
          {
            glowUpScore: 8.6,
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
            glowUpScore: 9.7,
            id: BATTLE_ID,
            leftLabel: 'Design',
            leftVote: 52,
            prCount: 4,
            rightLabel: 'Function',
            rightVote: 48,
            title: BATTLE_TITLE,
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

const readTransform = async (locator: Locator) => {
  return await locator.evaluate((element) => {
    return window.getComputedStyle(element).transform;
  });
};

const expectHoverTransform = async (
  locator: Locator,
  shouldMove: boolean,
): Promise<void> => {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  await locator.hover();

  if (shouldMove) {
    await expect
      .poll(async () => {
        return await readTransform(locator);
      })
      .not.toBe('none');
    return;
  }

  await expect
    .poll(async () => {
      return await readTransform(locator);
    })
    .toBe('none');
};

test.describe('Reduced motion on feed route widgets', () => {
  test('keeps card hover lift animation in normal motion mode', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await installFeedMotionWidgetMocks(page);
    await openFeed(page);

    const draftHeading = `Draft ${DRAFT_ID.slice(0, 8)}`;
    const draftCard = page
      .locator('article')
      .filter({ hasText: new RegExp(draftHeading, 'i') })
      .first();
    await expectHoverTransform(draftCard, true);

    await page.getByRole('button', { name: /^Battles$/i }).click();
    await expect(page).toHaveURL(/tab=Battles/);

    const battleCard = page
      .locator('article')
      .filter({ hasText: new RegExp(BATTLE_TITLE, 'i') })
      .first();
    await expectHoverTransform(battleCard, true);
  });

  test('disables card hover lift animation when reduced motion is enabled', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installFeedMotionWidgetMocks(page);
    await openFeed(page);

    const draftHeading = `Draft ${DRAFT_ID.slice(0, 8)}`;
    const draftCard = page
      .locator('article')
      .filter({ hasText: new RegExp(draftHeading, 'i') })
      .first();
    await expectHoverTransform(draftCard, false);

    await page.getByRole('button', { name: /^Battles$/i }).click();
    await expect(page).toHaveURL(/tab=Battles/);

    const battleCard = page
      .locator('article')
      .filter({ hasText: new RegExp(BATTLE_TITLE, 'i') })
      .first();
    await expectHoverTransform(battleCard, false);
  });
});
