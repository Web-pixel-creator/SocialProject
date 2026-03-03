/* biome-ignore-all lint/performance/useTopLevelRegex: Inline regex keeps Playwright locator assertions readable in this e2e spec. */
/* biome-ignore-all lint/suspicious/useAwait: Route mock handlers intentionally return sync fulfill calls. */
import { expect, test } from '@playwright/test';
import { openFeed } from './utils/feed';
import { navigateWithRetry } from './utils/navigation';

const switchRightRailToRadar = async (
  page: Parameters<typeof test>[0]['page'],
) => {
  const radarTab = page.getByTestId('feed-right-rail-tab-radar');
  await radarTab.click();
  await expect(radarTab).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.observer-right-rail')).toBeVisible();
};

test.describe('Feed observer rail', () => {
  test.beforeEach(async ({ page }) => {
    await openFeed(page);
  });

  test('renders observer-only mode with rail visible and no focus toggle', async ({
    page,
  }) => {
    const observerModeChip = page
      .locator('.observer-feed-header')
      .getByText(/Observer mode/i)
      .first();
    const observerRailShell = page.getByTestId('feed-right-rail-shell');

    await expect(observerModeChip).toBeVisible();
    await expect(page.getByRole('button', { name: /Focus mode/i })).toHaveCount(
      0,
    );
    await expect(observerRailShell).toHaveClass(
      /\bobserver-right-rail-shell\b/,
    );
    await expect(observerRailShell).toHaveAttribute('aria-hidden', 'false');
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem('finishit-feed-view-mode'),
        ),
      )
      .toBeNull();
  });

  test('persists right-rail section tab after reload', async ({ page }) => {
    const storageKey = 'finishit-feed-right-rail-view';
    await page.evaluate(
      (key) => window.localStorage.removeItem(key),
      storageKey,
    );
    await page.reload();

    const liveTab = page.getByTestId('feed-right-rail-tab-live');
    const studioTab = page.getByTestId('feed-right-rail-tab-studio');
    const radarTab = page.getByTestId('feed-right-rail-tab-radar');

    await expect(liveTab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('live-studio-sessions-rail')).toBeVisible();

    await studioTab.click();
    await expect(page.getByTestId('swarm-sessions-rail')).toBeVisible();
    await expect(studioTab).toHaveAttribute('aria-pressed', 'true');

    await expect
      .poll(() =>
        page.evaluate((key) => window.localStorage.getItem(key), storageKey),
      )
      .toBe('studio');

    await page.reload();
    await expect(studioTab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('swarm-sessions-rail')).toBeVisible();
    await expect(page.getByTestId('creator-studios-rail')).toBeVisible();
    await expect(page.getByTestId('live-studio-sessions-rail')).toHaveCount(0);
    await expect(radarTab).toHaveAttribute('aria-pressed', 'false');
  });

  test('supports keyboard navigation across primary feed tabs', async ({
    page,
  }) => {
    const primaryTabs = page.getByTestId('feed-primary-tabs');
    const allTab = primaryTabs.getByRole('button', { name: /^All$/i });
    const hotNowTab = primaryTabs.getByRole('button', { name: /Hot now/i });
    const forYouTab = primaryTabs.getByRole('button', { name: /For you/i });

    await expect(allTab).toHaveAttribute('aria-pressed', 'true');
    await allTab.focus();
    await expect(allTab).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expect(hotNowTab).toBeFocused();
    await expect(hotNowTab).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('End');
    await expect(forYouTab).toBeFocused();
    await expect(forYouTab).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Home');
    await expect(allTab).toBeFocused();
    await expect(allTab).toHaveAttribute('aria-pressed', 'true');
  });

  test('supports keyboard navigation inside desktop more tabs list', async ({
    page,
  }) => {
    const moreSummary = page.getByTestId('feed-more-summary');
    await moreSummary.click();

    const progressTab = page.getByTestId('feed-more-tab-progress');
    const changesTab = page.getByTestId('feed-more-tab-changes');
    const archiveTab = page.getByTestId('feed-more-tab-archive');

    await progressTab.focus();
    await expect(progressTab).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(changesTab).toBeFocused();

    await page.keyboard.press('End');
    await expect(archiveTab).toBeFocused();

    await page.keyboard.press('Home');
    await expect(progressTab).toBeFocused();
  });

  test('restores focus to mobile filters toggle after escape', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFeed(page);

    const filtersToggle = page.getByTestId('feed-filters-toggle');
    await filtersToggle.click();
    await expect(page.getByRole('dialog', { name: /Filters/i })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Filters/i })).toHaveCount(0);
    await expect(filtersToggle).toBeFocused();
  });

  test('supports mobile more keyboard navigation and restores focus after escape', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFeed(page);

    const moreToggle = page.getByTestId('feed-mobile-more-toggle');
    await moreToggle.click();
    await expect(page.getByRole('dialog', { name: /More/i })).toBeVisible();

    const progressTab = page.getByTestId('feed-more-tab-progress');
    const changesTab = page.getByTestId('feed-more-tab-changes');
    const archiveTab = page.getByTestId('feed-more-tab-archive');

    await progressTab.focus();
    await expect(progressTab).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(changesTab).toBeFocused();

    await page.keyboard.press('End');
    await expect(archiveTab).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /More/i })).toHaveCount(0);
    await expect(moreToggle).toBeFocused();
  });

  test('persists desktop observer rail panel visibility after reload', async ({
    page,
  }) => {
    await page.evaluate(() =>
      window.localStorage.removeItem('finishit-observer-rail-panels'),
    );
    await page.reload();
    await switchRightRailToRadar(page);

    const desktopControls = page.getByTestId('observer-rail-desktop-controls');
    await expect(desktopControls).toBeVisible();

    const showAllButton = desktopControls.getByRole('button', {
      name: /Show all/i,
    });
    const hideAllButton = desktopControls.getByRole('button', {
      name: /Hide all/i,
    });

    await expect(showAllButton).toBeVisible();
    await expect(hideAllButton).toBeVisible();

    await hideAllButton.click();
    await expect(showAllButton).toBeEnabled();
    await expect(hideAllButton).toBeDisabled();

    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem('finishit-observer-rail-panels'),
        ),
      )
      .toContain('"battles":false');

    await page.reload();

    const desktopControlsAfterReload = page.getByTestId(
      'observer-rail-desktop-controls',
    );
    await expect(
      desktopControlsAfterReload.getByRole('button', {
        name: /Show all/i,
      }),
    ).toBeEnabled();
    await expect(
      desktopControlsAfterReload.getByRole('button', {
        name: /Hide all/i,
      }),
    ).toBeDisabled();
    await expect(
      page
        .locator('.observer-right-rail')
        .getByRole('button', {
          name: /Restore defaults/i,
        })
        .first(),
    ).toBeVisible();
  });

  test('restores hide-all panel visibility state after reload', async ({
    page,
  }) => {
    await page.evaluate(() =>
      window.localStorage.removeItem('finishit-observer-rail-panels'),
    );
    await page.reload();
    await switchRightRailToRadar(page);

    const desktopControls = page.getByTestId('observer-rail-desktop-controls');
    await expect(desktopControls).toBeVisible();

    await desktopControls.getByRole('button', { name: /Hide all/i }).click();

    await expect(
      desktopControls.getByRole('button', { name: /Show all/i }),
    ).toBeEnabled();
    await expect(
      desktopControls.getByRole('button', { name: /Hide all/i }),
    ).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem('finishit-observer-rail-panels'),
        ),
      )
      .toContain('"battles":false');
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem('finishit-observer-rail-panels'),
        ),
      )
      .toContain('"activity":false');
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem('finishit-observer-rail-panels'),
        ),
      )
      .toContain('"glowUps":false');
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem('finishit-observer-rail-panels'),
        ),
      )
      .toContain('"studios":false');

    await page.reload();

    const desktopControlsAfterReload = page.getByTestId(
      'observer-rail-desktop-controls',
    );
    await expect(
      desktopControlsAfterReload.getByRole('button', {
        name: /Show all/i,
      }),
    ).toBeEnabled();
    await expect(
      desktopControlsAfterReload.getByRole('button', {
        name: /Hide all/i,
      }),
    ).toBeDisabled();
  });

  test('uses flat observer rail panel toggles without close or more gates', async ({
    page,
  }) => {
    await switchRightRailToRadar(page);
    const desktopControls = page.getByTestId('observer-rail-desktop-controls');
    await expect(desktopControls).toBeVisible();

    await expect(
      desktopControls.getByRole('button', { name: /^Close$/i }),
    ).toHaveCount(0);
    await expect(
      desktopControls.getByRole('button', { name: /^More$/i }),
    ).toHaveCount(0);

    await expect(
      desktopControls.getByRole('button', { name: /Show all/i }),
    ).toBeVisible();
    await expect(
      desktopControls.getByRole('button', { name: /Hide all/i }),
    ).toBeVisible();
    await expect(
      desktopControls.getByRole('button', { name: /Trending battles/i }),
    ).toHaveCount(0);
    await expect(
      desktopControls.getByRole('button', { name: /Live activity stream/i }),
    ).toHaveCount(0);
    await expect(
      desktopControls.getByRole('button', { name: /Top GlowUps/i }),
    ).toHaveCount(0);
    await expect(
      desktopControls.getByRole('button', { name: /Top studios/i }),
    ).toHaveCount(0);
  });

  test('shows all rail widgets when pressing show all', async ({ page }) => {
    await switchRightRailToRadar(page);
    const desktopControls = page.getByTestId('observer-rail-desktop-controls');
    await expect(desktopControls).toBeVisible();

    const showAllButton = desktopControls.getByRole('button', {
      name: /Show all/i,
    });
    const hideAllButton = desktopControls.getByRole('button', {
      name: /Hide all/i,
    });

    await hideAllButton.click();
    await expect(showAllButton).toBeEnabled();
    await showAllButton.click();

    await expect(
      page
        .locator('.observer-right-rail')
        .getByRole('heading', { name: /Top GlowUps/i }),
    ).toBeVisible();
    await expect(
      page
        .locator('.observer-right-rail')
        .getByRole('heading', { name: /Top studios/i }),
    ).toBeVisible();
    await expect(showAllButton).toBeDisabled();
    await expect(hideAllButton).toBeEnabled();
  });

  test('supports keyboard toggling for desktop observer panel controls', async ({
    page,
  }) => {
    await switchRightRailToRadar(page);
    const desktopControls = page.getByTestId('observer-rail-desktop-controls');
    await expect(desktopControls).toBeVisible();

    const hideAllButton = desktopControls.getByRole('button', {
      name: /Hide all/i,
    });
    const showAllButton = desktopControls.getByRole('button', {
      name: /Show all/i,
    });
    const visiblePanelsBadge = page
      .locator('.observer-right-rail')
      .locator('span')
      .filter({ hasText: /Panels/i })
      .first();

    await expect(hideAllButton).toBeEnabled();
    await hideAllButton.press('Enter');
    await expect(visiblePanelsBadge).toContainText(/0\s*\/\s*4/i);
    await expect(showAllButton).toBeEnabled();
    await expect(hideAllButton).toBeDisabled();

    await expect(showAllButton).toBeEnabled();
    await showAllButton.press('Space');
    await expect(visiblePanelsBadge).toContainText(/4\s*\/\s*4/i);
    await expect(showAllButton).toBeDisabled();
    await expect(hideAllButton).toBeEnabled();
  });

  test('updates visible panels counter and restores defaults after hide all', async ({
    page,
  }) => {
    await switchRightRailToRadar(page);
    const rightRail = page.locator('.observer-right-rail');
    const visiblePanelsBadge = rightRail
      .locator('span')
      .filter({ hasText: /Panels:/i })
      .first();
    const desktopControls = page.getByTestId('observer-rail-desktop-controls');
    await expect(desktopControls).toBeVisible();

    const hideAllButton = desktopControls.getByRole('button', {
      name: /Hide all/i,
    });
    const showAllButton = desktopControls.getByRole('button', {
      name: /Show all/i,
    });

    await expect(visiblePanelsBadge).toContainText(/2\s*\/\s*4/i);

    await hideAllButton.click();

    await expect(visiblePanelsBadge).toContainText(/0\s*\/\s*4/i);
    await expect(showAllButton).toBeEnabled();
    await expect(hideAllButton).toBeDisabled();

    await rightRail
      .getByRole('button', {
        name: /Restore defaults/i,
      })
      .first()
      .click();

    await expect(visiblePanelsBadge).toContainText(/2\s*\/\s*4/i);
    await expect(showAllButton).toBeEnabled();
    await expect(hideAllButton).toBeEnabled();
  });

  test('respects reduced motion preference for live indicators', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await navigateWithRetry(page, '/feed');

    const liveDot = page.locator('.observer-feed-header .icon-breathe').first();
    await expect(liveDot).toBeVisible();

    const animationState = await liveDot.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        animationName: styles.animationName,
        animationDurationSeconds: Number.parseFloat(styles.animationDuration),
      };
    });

    expect(animationState.animationName).toBe('none');
    expect(Number.isNaN(animationState.animationDurationSeconds)).toBe(false);
    expect(animationState.animationDurationSeconds).toBeLessThan(0.001);
  });

  test('shows fallback rail status and default widgets when rail feeds fail', async ({
    page,
  }) => {
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }

      if (method === 'GET' && path === '/api/feed') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      if (
        method === 'GET' &&
        [
          '/api/feeds/battles',
          '/api/feeds/glowups',
          '/api/feeds/studios',
          '/api/feeds/live-drafts',
          '/api/feeds/hot-now',
          '/api/feeds/changes',
        ].includes(path)
      ) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'rail endpoint failed' }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await navigateWithRetry(page, '/feed');
    await switchRightRailToRadar(page);

    const rightRail = page.locator('.observer-right-rail');
    await expect(rightRail.getByText(/Fallback data/i).first()).toBeVisible();

    const trendingBattlesHeading = rightRail
      .getByRole('heading', { name: /Trending battles/i })
      .filter({ visible: true })
      .first();
    await expect(trendingBattlesHeading).toBeVisible();
    const trendingBattlesPanel = trendingBattlesHeading.locator(
      'xpath=ancestor::section[1]',
    );
    await expect(
      trendingBattlesPanel.getByText(/Design vs Function/i),
    ).toBeVisible();

    const liveDraftTile = rightRail
      .getByText(/Live drafts/i)
      .first()
      .locator('..');
    await expect(liveDraftTile).toContainText('128');
    const prPendingTile = rightRail
      .getByText(/PR pending/i)
      .first()
      .locator('..');
    await expect(prPendingTile).toContainText('57');
  });

  test('renders RU localized live-session fallback copy when live session API fails', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('finishit-language', 'ru');
    });
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }

      if (method === 'GET' && path === '/api/live-sessions') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'live-sessions unavailable' }),
        });
      }

      if (method === 'GET' && path === '/api/feed') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await navigateWithRetry(page, '/feed');

    const liveSessionsRail = page
      .locator('.observer-right-rail-shell section')
      .first();
    await expect(
      liveSessionsRail.getByRole('heading', {
        name: /Живые сессии студий/i,
      }),
    ).toBeVisible();
    await expect(
      liveSessionsRail.getByText(/Живой разбор промпта/i),
    ).toBeVisible();
    await expect(
      liveSessionsRail.getByText(
        /Аудитория склоняется к слиянию после последнего прохода агентов/i,
      ),
    ).toBeVisible();
  });

  test('opens followed studio profile and following feed from rail links', async ({
    page,
  }) => {
    const studioId = 'studio-followed-rail-e2e';
    await page.route('**/api/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      const method = route.request().method();

      if (method === 'POST' && path === '/api/telemetry/ux') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }

      if (method === 'GET' && path === '/api/me/following') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: studioId,
              studioName: 'Followed Studio Rail',
              impact: 90,
              signal: 84,
            },
          ]),
        });
      }

      if (method === 'GET' && path === '/api/feed') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await navigateWithRetry(page, '/feed');
    await switchRightRailToRadar(page);

    const rightRail = page.locator('.observer-right-rail');
    const studioLink = rightRail.getByRole('link', {
      name: /Followed Studio Rail/i,
    });
    await expect(studioLink).toHaveAttribute('href', `/studios/${studioId}`);

    await studioLink.click();
    await expect(page).toHaveURL(new RegExp(`/studios/${studioId}$`));

    await navigateWithRetry(page, '/feed');
    await switchRightRailToRadar(page);
    const openFollowingFeedLink = rightRail.getByRole('link', {
      name: /Open following feed/i,
    });
    await expect(openFollowingFeedLink).toHaveAttribute(
      'href',
      '/feed?tab=Following',
    );

    await openFollowingFeedLink.click();
    await expect(page).toHaveURL(/\/feed\?tab=Following/);
  });
});

test.describe('Feed observer rail realtime reconnect fault injection', () => {
  test('recovers from resync-required state after reconnect success', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      type Handler = (payload: unknown) => void;
      interface SocketEmitRecord {
        event: string;
        payload: unknown;
      }
      type WindowWithRealtimeHarness = Window & {
        __finishitSocketHarness?: {
          emitted: SocketEmitRecord[];
          trigger: (event: string, payload: unknown) => void;
        };
        __finishitSocketMock?: {
          emit: (event: string, payload?: unknown) => void;
          off: (event: string, cb: Handler) => void;
          on: (event: string, cb: Handler) => void;
        };
      };

      const handlers: Record<string, Handler[]> = {};
      const emitted: SocketEmitRecord[] = [];
      const socketMock = {
        emit: (event: string, payload?: unknown) => {
          emitted.push({ event, payload: payload ?? null });
        },
        off: (event: string, cb: Handler) => {
          handlers[event] = (handlers[event] ?? []).filter(
            (handler) => handler !== cb,
          );
        },
        on: (event: string, cb: Handler) => {
          handlers[event] = handlers[event] ?? [];
          handlers[event].push(cb);
        },
      };

      const win = window as WindowWithRealtimeHarness;
      win.__finishitSocketMock = socketMock;
      win.__finishitSocketHarness = {
        emitted,
        trigger: (event: string, payload: unknown) => {
          for (const handler of handlers[event] ?? []) {
            handler(payload);
          }
        },
      };
    });

    await openFeed(page);
    await switchRightRailToRadar(page);

    const rightRail = page.locator('.observer-right-rail');
    await expect(rightRail).toBeVisible();
    await expect(
      rightRail.getByText(/Resyncing realtime stream/i),
    ).toBeVisible();

    await page.evaluate(() => {
      const win = window as Window & {
        __finishitSocketHarness?: {
          trigger: (event: string, payload: unknown) => void;
        };
      };
      win.__finishitSocketHarness?.trigger('resync', {
        scope: 'feed:live',
        resyncRequired: true,
        events: [],
      });
    });

    const resyncNowButton = rightRail.getByRole('button', {
      name: /Resync now/i,
    });
    await expect(rightRail.getByText(/Resync required/i)).toBeVisible();
    await expect(resyncNowButton).toBeVisible();

    await resyncNowButton.click();
    await expect(
      rightRail.getByText(/Resyncing realtime stream/i),
    ).toBeVisible();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const win = window as Window & {
            __finishitSocketHarness?: {
              emitted: Array<{ event: string; payload: unknown }>;
            };
          };
          const emitted = win.__finishitSocketHarness?.emitted ?? [];
          return emitted.filter((entry) => entry.event === 'resync').length;
        }),
      )
      .toBeGreaterThanOrEqual(2);

    const lastResyncPayload = await page.evaluate(() => {
      const win = window as Window & {
        __finishitSocketHarness?: {
          emitted: Array<{ event: string; payload: unknown }>;
        };
      };
      const emitted = win.__finishitSocketHarness?.emitted ?? [];
      const resyncEvents = emitted.filter((entry) => entry.event === 'resync');
      return resyncEvents.at(-1)?.payload ?? null;
    });
    expect(lastResyncPayload).toEqual(
      expect.objectContaining({ scope: 'feed:live' }),
    );

    await page.evaluate(() => {
      const win = window as Window & {
        __finishitSocketHarness?: {
          trigger: (event: string, payload: unknown) => void;
        };
      };
      win.__finishitSocketHarness?.trigger('connect', {});
      win.__finishitSocketHarness?.trigger('resync', {
        scope: 'feed:live',
        events: [
          {
            id: 'rt-reconnect-1',
            scope: 'feed:live',
            type: 'draft_activity',
            sequence: 7,
            payload: { draftId: '00000000-0000-0000-0000-000000000777' },
          },
        ],
        latestSequence: 7,
      });
    });

    await expect(rightRail.getByText(/Resync required/i)).toHaveCount(0);
    await expect(
      rightRail.getByRole('button', { name: /Resync now/i }),
    ).toHaveCount(0);
    await expect(rightRail.getByText(/Resync completed/i)).toBeVisible();
    await expect(
      rightRail.locator('li:visible').filter({ hasText: /Draft activity:/i }),
    ).toHaveCount(1);
  });
});
