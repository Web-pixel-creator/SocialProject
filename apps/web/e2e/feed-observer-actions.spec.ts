import { expect, test, type Page } from '@playwright/test';
import { openFeed } from './utils/feed';

const DRAFT_ID = '00000000-0000-0000-0000-000000000123';
const BATTLE_ID = '00000000-0000-0000-0000-000000000456';

const routeObserverActionsApi = async (
    page: Page,
    options?: {
        watchlist?: unknown[];
        engagements?: unknown[];
        persistStatusCode?: 200 | 401 | 403;
        persistDelayMs?: number;
        battles?: unknown[];
        persistRequestLog?: Array<{ method: string; path: string }>;
        telemetryPayloadLog?: Array<Record<string, unknown>>;
    },
) => {
    const watchlist = options?.watchlist ?? [];
    const engagements = options?.engagements ?? [];
    const persistDelayMs = options?.persistDelayMs ?? 0;
    const persistStatusCode = options?.persistStatusCode ?? 403;
    const persistRequestLog = options?.persistRequestLog;
    const telemetryPayloadLog = options?.telemetryPayloadLog;
    const battles =
        options?.battles ??
        [
            {
                id: BATTLE_ID,
                title: 'Observer actions battle e2e',
                leftLabel: 'Design',
                rightLabel: 'Function',
                leftVote: 52,
                rightVote: 48,
                glowUpScore: 11.4,
                prCount: 5,
                fixCount: 3,
                decision: 'pending',
            },
        ];

    await page.route('**/api/**', async (route) => {
        const requestUrl = new URL(route.request().url());
        const path = requestUrl.pathname;
        const method = route.request().method();

        if (method === 'GET' && path === '/api/feed') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        id: DRAFT_ID,
                        type: 'draft',
                        glowUpScore: 8.6,
                    },
                ]),
            });
        }

        if (method === 'GET' && path === '/api/feeds/battles') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(battles),
            });
        }

        if (method === 'GET' && path === '/api/auth/me') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    user: {
                        id: '11111111-1111-1111-1111-111111111111',
                        email: 'observer-e2e@example.com',
                    },
                }),
            });
        }

        if (method === 'GET' && path === '/api/observers/watchlist') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(watchlist),
            });
        }

        if (method === 'GET' && path === '/api/observers/engagements') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(engagements),
            });
        }

        if (method === 'POST' && path === '/api/telemetry/ux') {
            if (telemetryPayloadLog) {
                const payload = route.request().postDataJSON();
                if (payload && typeof payload === 'object') {
                    telemetryPayloadLog.push(payload as Record<string, unknown>);
                }
            }
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true }),
            });
        }

        if (
            path.startsWith('/api/observers/watchlist/') ||
            path.endsWith('/save') ||
            path.endsWith('/rate')
        ) {
            if (persistDelayMs > 0) {
                await new Promise((resolve) => {
                    setTimeout(resolve, persistDelayMs);
                });
            }
            if (persistRequestLog) {
                persistRequestLog.push({ method, path });
            }
            return route.fulfill({
                status: persistStatusCode,
                contentType: 'application/json',
                body: JSON.stringify({
                    error:
                        persistStatusCode === 200 ? undefined : 'AUTH_REQUIRED',
                }),
            });
        }

        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
        });
    });
};

const openObserverActionsPanel = async (
    page: Page,
    options?: { expandMore?: boolean },
) => {
    const expandMore = options?.expandMore ?? true;
    const firstCard = page.locator('article.card').first();
    await expect(firstCard).toBeVisible();

    const detailsSummary = firstCard.locator('details summary').first();
    await expect(detailsSummary).toBeVisible();
    await detailsSummary.click();

    const observerSection = firstCard
        .locator('section')
        .filter({ hasText: /Observer actions|Действия наблюдателя/i })
        .first();
    await expect(observerSection).toBeVisible();

    if (expandMore) {
        await observerSection.getByRole('button', { name: /^More$/i }).click();
    }
    return observerSection;
};

test.describe('Feed observer actions persistence', () => {
    test('persists follow/rate/save for guest fallback after reload', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem('finishit-feed-density', 'comfort');
        });
        await routeObserverActionsApi(page, { persistStatusCode: 403 });
        await openFeed(page);

        const observerSection = await openObserverActionsPanel(page);

        const followButton = observerSection.getByRole('button', {
            name: /^Follow$/i,
        });
        const rateButton = observerSection.getByRole('button', {
            name: /^Rate$/i,
        });
        const saveButton = observerSection.getByRole('button', {
            name: /^Save$/i,
        });

        await followButton.click();
        await rateButton.click();
        await saveButton.click();

        await expect(followButton).toHaveAttribute('aria-pressed', 'true');
        await expect(rateButton).toHaveAttribute('aria-pressed', 'true');
        await expect(saveButton).toHaveAttribute('aria-pressed', 'true');

        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem(
                        'finishit-feed-followed-draft-ids',
                    ),
                ),
            )
            .toContain(DRAFT_ID);
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-feed-rated-draft-ids'),
                ),
            )
            .toContain(DRAFT_ID);
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-feed-saved-draft-ids'),
                ),
            )
            .toContain(DRAFT_ID);

        await page.reload();
        const observerSectionAfterReload = await openObserverActionsPanel(page);

        await expect(
            observerSectionAfterReload.getByRole('button', {
                name: /^Follow$/i,
            }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(
            observerSectionAfterReload.getByRole('button', { name: /^Rate$/i }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(
            observerSectionAfterReload.getByRole('button', { name: /^Save$/i }),
        ).toHaveAttribute('aria-pressed', 'true');
    });

    test('hydrates follow/rate/save state from observer API when token exists', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem('finishit-feed-density', 'comfort');
            window.localStorage.setItem('finishit_token', 'e2e-token');
        });
        await routeObserverActionsApi(page, {
            persistStatusCode: 200,
            watchlist: [{ draftId: DRAFT_ID }],
            engagements: [{ draftId: DRAFT_ID, isSaved: true, isRated: true }],
        });

        await openFeed(page);
        const observerSection = await openObserverActionsPanel(page);

        await expect(
            observerSection.getByRole('button', { name: /^Follow$/i }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(
            observerSection.getByRole('button', { name: /^Rate$/i }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(
            observerSection.getByRole('button', { name: /^Save$/i }),
        ).toHaveAttribute('aria-pressed', 'true');
    });

    test('calls persistence and telemetry endpoints for follow/rate/save toggles', async ({
        page,
    }) => {
        const persistRequestLog: Array<{ method: string; path: string }> = [];
        const telemetryPayloadLog: Array<Record<string, unknown>> = [];

        await page.addInitScript(() => {
            window.localStorage.setItem('finishit-feed-density', 'comfort');
            window.localStorage.setItem('finishit_token', 'e2e-token');
        });
        await routeObserverActionsApi(page, {
            persistStatusCode: 200,
            persistRequestLog,
            telemetryPayloadLog,
        });
        await openFeed(page);

        const observerSection = await openObserverActionsPanel(page);
        const followButton = observerSection.getByRole('button', {
            name: /^Follow$/i,
        });
        const rateButton = observerSection.getByRole('button', {
            name: /^Rate$/i,
        });
        const saveButton = observerSection.getByRole('button', {
            name: /^Save$/i,
        });

        await followButton.click();
        await rateButton.click();
        await saveButton.click();
        await followButton.click();
        await rateButton.click();
        await saveButton.click();

        await expect(followButton).toHaveAttribute('aria-pressed', 'false');
        await expect(rateButton).toHaveAttribute('aria-pressed', 'false');
        await expect(saveButton).toHaveAttribute('aria-pressed', 'false');

        await expect
            .poll(() => persistRequestLog.length)
            .toBeGreaterThanOrEqual(6);

        const persistSignatures = persistRequestLog.map((entry) => {
            return `${entry.method} ${entry.path}`;
        });
        expect(persistSignatures).toContain(
            `POST /api/observers/watchlist/${DRAFT_ID}`,
        );
        expect(persistSignatures).toContain(
            `DELETE /api/observers/watchlist/${DRAFT_ID}`,
        );
        expect(persistSignatures).toContain(
            `POST /api/observers/engagements/${DRAFT_ID}/rate`,
        );
        expect(persistSignatures).toContain(
            `DELETE /api/observers/engagements/${DRAFT_ID}/rate`,
        );
        expect(persistSignatures).toContain(
            `POST /api/observers/engagements/${DRAFT_ID}/save`,
        );
        expect(persistSignatures).toContain(
            `DELETE /api/observers/engagements/${DRAFT_ID}/save`,
        );

        await expect
            .poll(() => {
                const toggleEvents = telemetryPayloadLog.filter((payload) => {
                    const eventType = payload.eventType;
                    const action = payload.action;
                    return (
                        eventType === 'watchlist_follow' ||
                        eventType === 'watchlist_unfollow' ||
                        action === 'rate_on' ||
                        action === 'rate_off' ||
                        action === 'save_on' ||
                        action === 'save_off'
                    );
                });
                return toggleEvents.length;
            })
            .toBeGreaterThanOrEqual(6);

        const telemetrySignatures = telemetryPayloadLog.map((payload) => {
            const eventType = payload.eventType;
            const action = payload.action;
            const draftId = payload.draftId;
            return `${String(eventType)}:${String(action)}:${String(draftId)}`;
        });
        expect(telemetrySignatures).toContain(
            `watchlist_follow:undefined:${DRAFT_ID}`,
        );
        expect(telemetrySignatures).toContain(
            `watchlist_unfollow:undefined:${DRAFT_ID}`,
        );
        expect(telemetrySignatures).toContain(
            `feed_card_open:rate_on:${DRAFT_ID}`,
        );
        expect(telemetrySignatures).toContain(
            `feed_card_open:rate_off:${DRAFT_ID}`,
        );
        expect(telemetrySignatures).toContain(
            `feed_card_open:save_on:${DRAFT_ID}`,
        );
        expect(telemetrySignatures).toContain(
            `feed_card_open:save_off:${DRAFT_ID}`,
        );
    });

    test('supports keyboard activation for observer actions', async ({
        page,
    }) => {
        const persistRequestLog: Array<{ method: string; path: string }> = [];

        await page.addInitScript(() => {
            window.localStorage.setItem('finishit-feed-density', 'comfort');
        });
        await routeObserverActionsApi(page, {
            persistRequestLog,
            persistStatusCode: 200,
        });
        await openFeed(page);

        const observerSection = await openObserverActionsPanel(page, {
            expandMore: false,
        });
        const moreButton = observerSection.getByRole('button', {
            name: /^More$/i,
        });
        await moreButton.focus();
        await page.keyboard.press('Enter');

        const followButton = observerSection.getByRole('button', {
            name: /^Follow$/i,
        });

        await expect(followButton).toBeVisible();

        await followButton.focus();
        await page.keyboard.press('Enter');
        await expect(followButton).toHaveAttribute('aria-pressed', 'true');

        await expect
            .poll(() => {
                const signatures = persistRequestLog.map((entry) => {
                    return `${entry.method} ${entry.path}`;
                });
                return signatures;
            })
            .toEqual(
                expect.arrayContaining([
                    `POST /api/observers/watchlist/${DRAFT_ID}`,
                ]),
            );
    });

    test('shows pending state while follow persistence request is in-flight', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem('finishit-feed-density', 'comfort');
            window.localStorage.setItem('finishit_token', 'e2e-token');
        });
        await routeObserverActionsApi(page, {
            persistDelayMs: 500,
            persistStatusCode: 200,
        });
        await openFeed(page);

        const observerSection = await openObserverActionsPanel(page);
        const followButton = observerSection.getByRole('button', {
            name: /^Follow$/i,
        });

        await expect(followButton).toHaveAttribute('aria-busy', 'false');
        await followButton.click();
        await expect(followButton).toHaveAttribute('aria-busy', 'true');
        await expect(followButton).toBeDisabled();
        await expect(followButton).toHaveAttribute('aria-pressed', 'true');
        await expect(followButton).toHaveAttribute('aria-busy', 'false');
        await expect(followButton).toBeEnabled();
    });

    test('navigates to draft and compare views from observer actions', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem('finishit-feed-density', 'comfort');
        });
        await routeObserverActionsApi(page, { persistStatusCode: 403 });
        await openFeed(page);

        const observerSection = await openObserverActionsPanel(page, {
            expandMore: false,
        });
        await observerSection.getByRole('button', { name: /^Watch$/i }).click();
        await expect(page).toHaveURL(new RegExp(`/drafts/${DRAFT_ID}$`));

        await openFeed(page);
        const observerSectionAfterReturn = await openObserverActionsPanel(page, {
            expandMore: false,
        });
        await observerSectionAfterReturn
            .getByRole('button', { name: /^Compare$/i })
            .click();
        await expect(page).toHaveURL(
            new RegExp(`/drafts/${DRAFT_ID}\\?view=compare$`),
        );
    });

    test('toggles secondary observer actions with More button', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem('finishit-feed-density', 'comfort');
        });
        await routeObserverActionsApi(page, { persistStatusCode: 403 });
        await openFeed(page);

        const observerSection = await openObserverActionsPanel(page, {
            expandMore: false,
        });
        const moreButton = observerSection.getByRole('button', {
            name: /^More$/i,
        });

        await expect(
            observerSection.getByRole('button', { name: /^Rate$/i }),
        ).toHaveCount(0);
        await moreButton.click();
        await expect(
            observerSection.getByRole('button', { name: /^Follow$/i }),
        ).toBeVisible();
        await expect(
            observerSection.getByRole('button', { name: /^Rate$/i }),
        ).toBeVisible();
        await expect(
            observerSection.getByRole('button', { name: /^Save$/i }),
        ).toBeVisible();

        await moreButton.click();
        await expect(
            observerSection.getByRole('button', { name: /^Rate$/i }),
        ).toHaveCount(0);
    });

    test('persists follow/rate/save for battle cards in Battles tab', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem('finishit-feed-density', 'comfort');
        });
        await routeObserverActionsApi(page, { persistStatusCode: 403 });
        await openFeed(page);

        await page.getByRole('button', { name: /^Battles$/i }).click();
        await expect(page).toHaveURL(/tab=Battles/);

        const observerSection = await openObserverActionsPanel(page);
        const followButton = observerSection.getByRole('button', {
            name: /^Follow$/i,
        });
        const rateButton = observerSection.getByRole('button', {
            name: /^Rate$/i,
        });
        const saveButton = observerSection.getByRole('button', {
            name: /^Save$/i,
        });

        await followButton.click();
        await rateButton.click();
        await saveButton.click();

        await expect(followButton).toHaveAttribute('aria-pressed', 'true');
        await expect(rateButton).toHaveAttribute('aria-pressed', 'true');
        await expect(saveButton).toHaveAttribute('aria-pressed', 'true');

        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem(
                        'finishit-feed-followed-draft-ids',
                    ),
                ),
            )
            .toContain(BATTLE_ID);
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-feed-rated-draft-ids'),
                ),
            )
            .toContain(BATTLE_ID);
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window.localStorage.getItem('finishit-feed-saved-draft-ids'),
                ),
            )
            .toContain(BATTLE_ID);
    });

    test('navigates to battle draft and compare views from observer actions', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem('finishit-feed-density', 'comfort');
        });
        await routeObserverActionsApi(page, { persistStatusCode: 403 });
        await openFeed(page);

        await page.getByRole('button', { name: /^Battles$/i }).click();
        await expect(page).toHaveURL(/tab=Battles/);

        const observerSection = await openObserverActionsPanel(page, {
            expandMore: false,
        });
        await observerSection.getByRole('button', { name: /^Watch$/i }).click();
        await expect(page).toHaveURL(new RegExp(`/drafts/${BATTLE_ID}$`));

        await openFeed(page);
        await page.getByRole('button', { name: /^Battles$/i }).click();
        const observerSectionAfterReturn = await openObserverActionsPanel(page, {
            expandMore: false,
        });
        await observerSectionAfterReturn
            .getByRole('button', { name: /^Compare$/i })
            .click();
        await expect(page).toHaveURL(
            new RegExp(`/drafts/${BATTLE_ID}\\?view=compare$`),
        );
    });
});
