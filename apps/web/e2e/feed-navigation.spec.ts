import { expect, test } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';
import {
    FEED_SEARCH_PLACEHOLDER,
    focusFeedContent,
    openFeed,
    openFiltersPanel,
} from './utils/feed';

test.describe('Feed navigation and filters', () => {
    test.beforeEach(async ({ page }) => {
        await openFeed(page);
    });

    test('renders the feed page with header', async ({ page }) => {
        await expect(page.locator('header').first()).toBeVisible();
    });

    test('shows tab bar with default All tab', async ({ page }) => {
        const allTab = page.getByRole('button', { name: /^All$/i });
        await expect(allTab).toBeVisible();
    });

    test('switches to Battles tab', async ({ page }) => {
        const battlesTab = page.getByRole('button', { name: /^Battles$/i });
        await battlesTab.click();
        await expect(page).toHaveURL(/tab=Battles/);
    });

    test('toggles studio follow state from Studios tab', async ({ page }) => {
        const studioId = 'studio-follow-feed-e2e';

        await page.route('**/api/**', async (route) => {
            const requestUrl = new URL(route.request().url());
            const path = requestUrl.pathname;
            const method = route.request().method();

            if (method === 'GET' && path === '/api/feeds/studios') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: studioId,
                            studioName: 'Studio Follow Feed E2E',
                            impact: 88.4,
                            signal: 77.2,
                            followerCount: 10,
                            isFollowing: false,
                        },
                    ]),
                });
            }

            if (method === 'POST' && path === `/api/studios/${studioId}/follow`) {
                return route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        studioId,
                        isFollowing: true,
                        followerCount: 11,
                    }),
                });
            }

            if (method === 'DELETE' && path === `/api/studios/${studioId}/follow`) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        removed: true,
                        followerCount: 10,
                    }),
                });
            }

            if (method === 'POST' && path === '/api/telemetry/ux') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await openFeed(page);
        await page.getByTestId('feed-more-summary').click();
        await page.getByRole('button', { name: /^Studios$/i }).click();
        await expect(page).toHaveURL(/tab=Studios/);

        await expect(
            page.getByRole('heading', { name: 'Studio Follow Feed E2E' }),
        ).toBeVisible();
        await expect(page.getByText(/Followers:\s*10/i)).toBeVisible();

        const followButton = page.getByRole('button', { name: /^Follow$/i });
        await expect(followButton).toHaveAttribute('aria-pressed', 'false');

        const followRequest = page.waitForRequest((request) => {
            return (
                request.method() === 'POST' &&
                request.url().includes(`/api/studios/${studioId}/follow`)
            );
        });

        await followButton.click();
        await followRequest;

        const followingButton = page.getByRole('button', { name: /^Following$/i });
        await expect(followingButton).toBeVisible();
        await expect(followingButton).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText(/Followers:\s*11/i)).toBeVisible();

        const unfollowRequest = page.waitForRequest((request) => {
            return (
                request.method() === 'DELETE' &&
                request.url().includes(`/api/studios/${studioId}/follow`)
            );
        });

        await followingButton.click();
        await unfollowRequest;

        await expect(page.getByRole('button', { name: /^Follow$/i })).toBeVisible();
        await expect(
            page.getByRole('button', { name: /^Follow$/i }),
        ).toHaveAttribute('aria-pressed', 'false');
        await expect(page.getByText(/Followers:\s*10/i)).toBeVisible();
    });

    test('reverts studio follow toggle in Studios tab when request fails', async ({
        page,
    }) => {
        const studioId = 'studio-follow-feed-failure-e2e';

        await page.route('**/api/**', async (route) => {
            const requestUrl = new URL(route.request().url());
            const path = requestUrl.pathname;
            const method = route.request().method();

            if (method === 'GET' && path === '/api/feeds/studios') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: studioId,
                            studioName: 'Studio Follow Failure E2E',
                            impact: 55.5,
                            signal: 66.6,
                            followerCount: 10,
                            isFollowing: false,
                        },
                    ]),
                });
            }

            if (method === 'POST' && path === `/api/studios/${studioId}/follow`) {
                return route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'AUTH_REQUIRED' }),
                });
            }

            if (method === 'POST' && path === '/api/telemetry/ux') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await openFeed(page);
        await page.getByTestId('feed-more-summary').click();
        await page.getByRole('button', { name: /^Studios$/i }).click();
        await expect(page).toHaveURL(/tab=Studios/);
        await expect(
            page.getByRole('heading', { name: 'Studio Follow Failure E2E' }),
        ).toBeVisible();

        const followButton = page.getByRole('button', { name: /^Follow$/i });
        await expect(followButton).toHaveAttribute('aria-pressed', 'false');
        await expect(page.getByText(/Followers:\s*10/i)).toBeVisible();

        const followRequest = page.waitForRequest((request) => {
            return (
                request.method() === 'POST' &&
                request.url().includes(`/api/studios/${studioId}/follow`)
            );
        });

        await followButton.click();
        await followRequest;

        await expect(followButton).toHaveAttribute('aria-pressed', 'false');
        await expect(page.getByText(/Followers:\s*10/i)).toBeVisible();
    });

    test('opens draft detail page from card CTA link', async ({ page }) => {
        const draftId = '00000000-0000-0000-0000-00000000e2e1';

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
                            id: draftId,
                            type: 'draft',
                            title: 'Draft open detail e2e',
                            glowUpScore: 9.2,
                        },
                    ]),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await openFeed(page);
        const openDetailLink = page
            .getByRole('link', { name: /Open detail/i })
            .first();
        await expect(openDetailLink).toBeVisible();
        await openDetailLink.click();
        await expect(page).toHaveURL(new RegExp(`/drafts/${draftId}$`));
    });

    test('syncs all-feed filters to query params', async ({ page }) => {
        await openFiltersPanel(page);

        const sortSelect = page.getByRole('combobox').nth(0);
        const statusSelect = page.getByRole('combobox').nth(1);
        const rangeSelect = page.getByRole('combobox').nth(2);
        const intentSelect = page.getByRole('combobox').nth(3);

        await sortSelect.selectOption('impact');
        await statusSelect.selectOption('draft');
        await rangeSelect.selectOption('7d');
        await intentSelect.selectOption('needs_help');

        await expect(page).toHaveURL(/sort=impact/);
        await expect(page).toHaveURL(/status=draft/);
        await expect(page).toHaveURL(/range=7d/);
        await expect(page).toHaveURL(/intent=needs_help/);
    });

    test('hydrates all-feed filters from query params', async ({ page }) => {
        await navigateWithRetry(
            page,
            '/feed?sort=impact&status=draft&range=7d&intent=needs_help',
        );
        await openFiltersPanel(page);

        const sortSelect = page.getByRole('combobox').nth(0);
        const statusSelect = page.getByRole('combobox').nth(1);
        const rangeSelect = page.getByRole('combobox').nth(2);
        const intentSelect = page.getByRole('combobox').nth(3);

        await expect(sortSelect).toHaveValue('impact');
        await expect(statusSelect).toHaveValue('draft');
        await expect(rangeSelect).toHaveValue('7d');
        await expect(intentSelect).toHaveValue('needs_help');
    });

    test('quick reset chips clear status, sort and range in order', async ({
        page,
    }) => {
        const readQueryParam = async (name: string) =>
            await page.evaluate((key) => {
                return new URL(window.location.href).searchParams.get(key);
            }, name);

        await navigateWithRetry(page, '/feed?sort=impact&status=release&range=7d');

        const allStatusesButton = page.getByRole('button', {
            name: /^All statuses$/i,
        });
        await expect(allStatusesButton).toBeVisible();
        await allStatusesButton.click();

        await expect.poll(() => readQueryParam('status')).toBe(null);
        await expect.poll(() => readQueryParam('sort')).toBe('impact');
        await expect.poll(() => readQueryParam('range')).toBe('7d');

        const recencyButton = page.getByRole('button', { name: /^Recency$/i });
        await expect(recencyButton).toBeVisible();
        await recencyButton.click();

        await expect.poll(() => readQueryParam('sort')).toBe(null);
        await expect.poll(() => readQueryParam('range')).toBe('7d');

        const last30DaysButton = page.getByRole('button', {
            name: /^Last 30 days$/i,
        });
        await expect(last30DaysButton).toBeVisible();
        await last30DaysButton.click();

        await expect.poll(() => readQueryParam('range')).toBe(null);
        await expect(page).toHaveURL(/\/feed$/);
    });

    test('following quick reset chips clear only status and sort', async ({
        page,
    }) => {
        const readQueryParam = async (name: string) =>
            await page.evaluate((key) => {
                return new URL(window.location.href).searchParams.get(key);
            }, name);

        await navigateWithRetry(page, '/feed?tab=Following&sort=impact&status=release');

        await expect(
            page.getByRole('button', { name: /^All statuses$/i }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: /^Recency$/i }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: /^Last 30 days$/i }),
        ).toHaveCount(0);
        await expect(
            page.getByRole('button', { name: /^All intents$/i }),
        ).toHaveCount(0);

        await page.getByRole('button', { name: /^All statuses$/i }).click();
        await expect.poll(() => readQueryParam('status')).toBe(null);
        await expect.poll(() => readQueryParam('sort')).toBe('impact');
        await expect.poll(() => readQueryParam('tab')).toBe('Following');

        await page.getByRole('button', { name: /^Recency$/i }).click();
        await expect.poll(() => readQueryParam('sort')).toBe(null);
        await expect.poll(() => readQueryParam('tab')).toBe('Following');
        await expect(page).toHaveURL(/\/feed\?tab=Following$/);
    });

    test('renders following feed items with subscribed-studio context badge', async ({
        page,
    }) => {
        const defaultDraftId = 'feed-default-e2e-0001';
        const followingDraftId = 'feed-following-e2e-0002';

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
                            id: defaultDraftId,
                            type: 'draft',
                            glowUpScore: 7.2,
                        },
                    ]),
                });
            }

            if (method === 'GET' && path === '/api/feeds/following') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: followingDraftId,
                            type: 'release',
                            glowUpScore: 14.8,
                        },
                    ]),
                });
            }

            if (method === 'POST' && path === '/api/telemetry/ux') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await openFeed(page);

        await expect(
            page.locator(`a[href="/drafts/${defaultDraftId}"]:visible`),
        ).toHaveCount(1);

        const followingRequest = page.waitForRequest((request) => {
            return (
                request.method() === 'GET' &&
                request.url().includes('/api/feeds/following')
            );
        });
        await page.getByTestId('feed-more-summary').click();
        await page.getByRole('button', { name: /^Following$/i }).click();
        await followingRequest;
        await expect(page).toHaveURL(/tab=Following/);

        await expect(
            page.locator(`a[href="/drafts/${followingDraftId}"]:visible`),
        ).toHaveCount(1);
        await expect(
            page.getByText(/^From studios you follow$/i).first(),
        ).toBeVisible();
        await expect(
            page.locator(`a[href="/drafts/${defaultDraftId}"]:visible`),
        ).toHaveCount(0);
    });

    test('removes following draft card after unfollowing its studio', async ({
        page,
    }) => {
        const studioId = 'studio-following-card-e2e';
        const followingDraftId = 'feed-following-unfollow-e2e';

        await page.route('**/api/**', async (route) => {
            const requestUrl = new URL(route.request().url());
            const path = requestUrl.pathname;
            const method = route.request().method();

            if (method === 'GET' && path === '/api/feed') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
            }

            if (method === 'GET' && path === '/api/feeds/following') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: followingDraftId,
                            type: 'draft',
                            title: 'Following Draft Card E2E',
                            authorStudioId: studioId,
                            authorStudioName: 'Following Studio E2E',
                            glowUpScore: 11.4,
                        },
                    ]),
                });
            }

            if (method === 'DELETE' && path === `/api/studios/${studioId}/follow`) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        removed: true,
                        isFollowing: false,
                        followerCount: 9,
                    }),
                });
            }

            if (method === 'POST' && path === '/api/telemetry/ux') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await openFeed(page);

        const followingRequest = page.waitForRequest((request) => {
            return (
                request.method() === 'GET' &&
                request.url().includes('/api/feeds/following')
            );
        });
        await page.getByTestId('feed-more-summary').click();
        await page.getByRole('button', { name: /^Following$/i }).click();
        await followingRequest;
        await expect(page).toHaveURL(/tab=Following/);

        const followingDraftLink = page.locator(
            `a[href="/drafts/${followingDraftId}"]:visible`,
        );
        await expect(followingDraftLink).toHaveCount(1);

        const unfollowRequest = page.waitForRequest((request) => {
            return (
                request.method() === 'DELETE' &&
                request.url().includes(`/api/studios/${studioId}/follow`)
            );
        });
        await page.getByRole('button', { name: /Unfollow studio/i }).click();
        await unfollowRequest;

        await expect(followingDraftLink).toHaveCount(0);
    });

    test('focuses feed search with slash shortcut', async ({ page }) => {
        const feedSearch = page.getByPlaceholder(FEED_SEARCH_PLACEHOLDER);
        await expect(feedSearch).not.toBeFocused();
        await focusFeedContent(page);

        await page.keyboard.press('/');

        await expect(feedSearch).toBeFocused();
    });

    test('toggles filters panel with Shift+F on filterable tabs', async ({
        page,
    }) => {
        const filtersButton = page.getByRole('button', { name: /^Filters/i });
        await expect(filtersButton).toHaveAttribute('aria-expanded', 'false');
        await focusFeedContent(page);

        await page.keyboard.press('Shift+F');
        await expect(filtersButton).toHaveAttribute('aria-expanded', 'true');

        await page.keyboard.press('Shift+F');
        await expect(filtersButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('ignores Shift+F on tabs without filters panel', async ({ page }) => {
        await page.getByTestId('feed-more-summary').click();
        await page.getByRole('button', { name: /^Progress$/i }).click();
        await expect(page).toHaveURL(/tab=Progress/);
        await expect(page.getByRole('button', { name: /^Filters/i })).toHaveCount(0);
        await focusFeedContent(page);

        await page.keyboard.press('Shift+F');

        await expect(page.getByRole('button', { name: /^Filters/i })).toHaveCount(0);
    });

    test('filters battles by decision status chips', async ({ page }) => {
        await page.route('**/api/**', async (route) => {
            const requestUrl = new URL(route.request().url());
            const path = requestUrl.pathname;
            const method = route.request().method();

            if (method === 'GET' && path === '/api/feeds/battles') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: 'battle-pending-e2e',
                            title: 'Battle Pending E2E',
                            leftLabel: 'Studio A',
                            rightLabel: 'Studio B',
                            leftVote: 51,
                            rightVote: 49,
                            glowUpScore: 12.4,
                            prCount: 6,
                            fixCount: 2,
                            decision: 'pending',
                        },
                        {
                            id: 'battle-changes-e2e',
                            title: 'Battle Changes E2E',
                            leftLabel: 'Studio C',
                            rightLabel: 'Studio D',
                            leftVote: 48,
                            rightVote: 52,
                            glowUpScore: 11.1,
                            prCount: 5,
                            fixCount: 3,
                            decision: 'changes_requested',
                        },
                        {
                            id: 'battle-merged-e2e',
                            title: 'Battle Merged E2E',
                            leftLabel: 'Studio E',
                            rightLabel: 'Studio F',
                            leftVote: 57,
                            rightVote: 43,
                            glowUpScore: 14.2,
                            prCount: 8,
                            fixCount: 4,
                            decision: 'merged',
                        },
                    ]),
                });
            }

            if (method === 'POST' && path === '/api/telemetry/ux') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await openFeed(page);
        await page.getByRole('button', { name: /^Battles$/i }).click();
        await expect(page).toHaveURL(/tab=Battles/);
        await openFiltersPanel(page);

        await expect(page.getByText('Battle Pending E2E')).toBeVisible();
        await expect(page.getByText('Battle Changes E2E')).toBeVisible();
        await expect(page.getByText('Battle Merged E2E')).toBeVisible();

        await page.getByRole('button', { name: /^Pending$/i }).click();
        await expect(page.getByText('Battle Pending E2E')).toBeVisible();
        await expect(page.getByText('Battle Changes E2E')).toHaveCount(0);
        await expect(page.getByText('Battle Merged E2E')).toHaveCount(0);

        await page.getByRole('button', { name: /Changes requested/i }).click();
        await expect(page.getByText('Battle Pending E2E')).toHaveCount(0);
        await expect(page.getByText('Battle Changes E2E')).toBeVisible();
        await expect(page.getByText('Battle Merged E2E')).toHaveCount(0);

        await page.getByRole('button', { name: /^Merged$/i }).click();
        await expect(page.getByText('Battle Pending E2E')).toHaveCount(0);
        await expect(page.getByText('Battle Changes E2E')).toHaveCount(0);
        await expect(page.getByText('Battle Merged E2E')).toBeVisible();

        await page.getByRole('button', { name: /^All battles$/i }).click();
        await expect(page.getByText('Battle Pending E2E')).toBeVisible();
        await expect(page.getByText('Battle Changes E2E')).toBeVisible();
        await expect(page.getByText('Battle Merged E2E')).toBeVisible();
    });

    test('updates battle vote controls and user vote label', async ({ page }) => {
        await page.route('**/api/**', async (route) => {
            const requestUrl = new URL(route.request().url());
            const path = requestUrl.pathname;
            const method = route.request().method();

            if (method === 'GET' && path === '/api/feeds/battles') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: 'battle-vote-e2e',
                            title: 'Battle Vote E2E',
                            leftLabel: 'Design',
                            rightLabel: 'Function',
                            leftVote: 50,
                            rightVote: 50,
                            glowUpScore: 10.2,
                            prCount: 4,
                            fixCount: 2,
                            decision: 'pending',
                        },
                    ]),
                });
            }

            if (method === 'POST' && path === '/api/telemetry/ux') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await openFeed(page);
        await page.getByRole('button', { name: /^Battles$/i }).click();
        await expect(page).toHaveURL(/tab=Battles/);
        await expect(page.getByText('Battle Vote E2E')).toBeVisible();

        const voteDesignButton = page.getByRole('button', {
            name: /^Vote Design$/i,
        });
        const voteFunctionButton = page.getByRole('button', {
            name: /^Vote Function$/i,
        });
        await expect(voteDesignButton).toHaveAttribute('aria-pressed', 'false');
        await expect(voteFunctionButton).toHaveAttribute('aria-pressed', 'false');

        await voteDesignButton.click();
        await expect(voteDesignButton).toHaveAttribute('aria-pressed', 'true');
        await expect(voteFunctionButton).toHaveAttribute('aria-pressed', 'false');
        await expect(page.getByText(/^Your vote:\s*Design$/i)).toBeVisible();

        await voteFunctionButton.click();
        await expect(voteDesignButton).toHaveAttribute('aria-pressed', 'false');
        await expect(voteFunctionButton).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText(/^Your vote:\s*Function$/i)).toBeVisible();
    });

    test('submits battle prediction and shows market summary in card', async ({
        page,
    }) => {
        const draftId = '11111111-2222-3333-4444-555555555555';
        const pullRequestId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

        await page.route('**/api/**', async (route) => {
            const requestUrl = new URL(route.request().url());
            const path = requestUrl.pathname;
            const method = route.request().method();

            if (method === 'GET' && path === '/api/feeds/battles') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: draftId,
                            title: 'Battle Prediction E2E',
                            leftLabel: 'Design',
                            rightLabel: 'Function',
                            leftVote: 55,
                            rightVote: 45,
                            glowUpScore: 11.4,
                            prCount: 5,
                            fixCount: 2,
                            decision: 'pending',
                        },
                    ]),
                });
            }

            if (method === 'POST' && path === `/api/drafts/${draftId}/predict`) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        pullRequestId,
                        predictedOutcome: 'merge',
                        stakePoints: 30,
                    }),
                });
            }

            if (
                method === 'GET' &&
                path === `/api/pull-requests/${pullRequestId}/predictions`
            ) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        pullRequestId,
                        market: {
                            totalStakePoints: 140,
                            mergeOdds: 0.65,
                            rejectOdds: 0.35,
                            mergePayoutMultiplier: 1.54,
                            rejectPayoutMultiplier: 2.86,
                        },
                    }),
                });
            }

            if (method === 'POST' && path === '/api/telemetry/ux') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await openFeed(page);
        await page.getByRole('button', { name: /^Battles$/i }).click();
        await expect(page.getByText('Battle Prediction E2E')).toBeVisible();

        const stakeInput = page.getByLabel(/^Stake$/i);
        await stakeInput.fill('30');

        const predictionRequest = page.waitForRequest((request) => {
            return (
                request.method() === 'POST' &&
                request.url().includes(`/api/drafts/${draftId}/predict`)
            );
        });
        const summaryRequest = page.waitForRequest((request) => {
            return (
                request.method() === 'GET' &&
                request
                    .url()
                    .includes(`/api/pull-requests/${pullRequestId}/predictions`)
            );
        });

        await page.getByRole('button', { name: /^Predict merge$/i }).click();
        await predictionRequest;
        await summaryRequest;
    });

    test('primary and more tabs switch feed and update query', async ({
        page,
    }) => {
        await page.getByRole('button', { name: /^Live Drafts$/i }).click();
        await expect(page).toHaveURL(/tab=Live(?:\+|%20)Drafts/);

        await page.getByRole('button', { name: /^Hot Now$/i }).click();
        await expect(page).toHaveURL(/tab=Hot(?:\+|%20)Now/);

        await page.getByRole('button', { name: /^Battles$/i }).click();
        await expect(page).toHaveURL(/tab=Battles/);

        await page.getByRole('button', { name: /^For You$/i }).click();
        await expect(page).toHaveURL(/tab=For(?:\+|%20)You/);

        await page.locator('summary').filter({ hasText: /^More$/i }).click();
        await page.getByRole('button', { name: /^GlowUps$/i }).click();
        await expect(page).toHaveURL(/tab=GlowUps/);
    });

    test('opens More menu via keyboard and selects tab', async ({ page }) => {
        const moreSummary = page.getByTestId('feed-more-summary');
        const moreDetails = page.getByTestId('feed-more-details');

        await moreSummary.focus();
        await moreSummary.press('Enter');
        await expect
            .poll(() =>
                moreDetails.evaluate((element) => {
                    return (element as HTMLDetailsElement).open;
                }),
            )
            .toBe(true);

        const glowUpsTab = page.getByRole('button', { name: /^GlowUps$/i });
        await expect(glowUpsTab).toBeVisible();

        await glowUpsTab.focus();
        await glowUpsTab.press('Enter');

        await expect(page).toHaveURL(/tab=GlowUps/);
    });

    test('closes desktop More menu with Escape', async ({ page }) => {
        const moreSummary = page.getByTestId('feed-more-summary');
        const moreDetails = page.getByTestId('feed-more-details');

        await moreSummary.focus();
        await moreSummary.press('Enter');
        await expect
            .poll(() =>
                moreDetails.evaluate((element) => {
                    return (element as HTMLDetailsElement).open;
                }),
            )
            .toBe(true);

        await moreSummary.press('Escape');
        await expect
            .poll(() =>
                moreDetails.evaluate((element) => {
                    return (element as HTMLDetailsElement).open;
                }),
            )
            .toBe(false);
    });

    test('closes desktop More menu on outside click', async ({ page }) => {
        const moreSummary = page.getByTestId('feed-more-summary');
        const moreDetails = page.getByTestId('feed-more-details');

        await moreSummary.click();
        await expect
            .poll(() =>
                moreDetails.evaluate((element) => {
                    return (element as HTMLDetailsElement).open;
                }),
            )
            .toBe(true);

        await page.getByRole('heading', { name: /Feeds/i }).click();

        await expect
            .poll(() =>
                moreDetails.evaluate((element) => {
                    return (element as HTMLDetailsElement).open;
                }),
            )
            .toBe(false);
    });

    test('keeps focus-visible ring classes on feed tab controls', async ({
        page,
    }) => {
        const allTab = page.getByRole('button', { name: /^All$/i });
        const moreSummary = page.getByTestId('feed-more-summary');

        await expect(allTab).toHaveClass(/focus-visible:ring-2/);
        await expect(moreSummary).toHaveClass(/focus-visible:ring-2/);
    });

    test('shows back-to-top button after scroll and returns to top', async ({
        page,
    }) => {
        await page.evaluate(() => {
            document.body.style.minHeight = '3000px';
            window.scrollTo({ top: 720 });
            window.dispatchEvent(new Event('scroll'));
        });

        const backToTopButton = page.getByTestId('feed-back-to-top');
        await expect(backToTopButton).toBeVisible();

        await backToTopButton.click();
        await expect
            .poll(() => page.evaluate(() => window.scrollY))
            .toBeLessThan(20);
    });

    test('uses auto scroll behavior for back-to-top when reduced motion is enabled', async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => {
            document.body.style.minHeight = '3000px';
            window.scrollTo({ top: 720 });
            window.dispatchEvent(new Event('scroll'));
        });

        const backToTopButton = page.getByTestId('feed-back-to-top');
        await expect(backToTopButton).toBeVisible();

        await page.evaluate(() => {
            type WindowWithScrollProbe = Window & {
                __finishitLastScrollToOptions?: Record<string, unknown> | null;
                __finishitOriginalScrollTo?: typeof window.scrollTo;
            };
            const win = window as WindowWithScrollProbe;
            win.__finishitLastScrollToOptions = null;
            win.__finishitOriginalScrollTo = window.scrollTo;
            window.scrollTo = ((optionsOrX?: number | ScrollToOptions) => {
                if (typeof optionsOrX === 'object') {
                    win.__finishitLastScrollToOptions = optionsOrX;
                    return;
                }
                win.__finishitLastScrollToOptions = {
                    left: optionsOrX ?? 0,
                    top: 0,
                };
            }) as typeof window.scrollTo;
        });

        await backToTopButton.click();

        const lastScrollToOptions = await page.evaluate(() => {
            type WindowWithScrollProbe = Window & {
                __finishitLastScrollToOptions?: Record<string, unknown> | null;
            };
            const win = window as WindowWithScrollProbe;
            return win.__finishitLastScrollToOptions ?? null;
        });
        expect(lastScrollToOptions).toEqual(
            expect.objectContaining({
                behavior: 'auto',
                top: 0,
            }),
        );

        await page.evaluate(() => {
            type WindowWithScrollProbe = Window & {
                __finishitOriginalScrollTo?: typeof window.scrollTo;
            };
            const win = window as WindowWithScrollProbe;
            if (win.__finishitOriginalScrollTo) {
                window.scrollTo = win.__finishitOriginalScrollTo;
                delete win.__finishitOriginalScrollTo;
            }
        });
    });

    test('applies observer offset class to back-to-top button in observer layout', async ({
        page,
    }) => {
        await page.evaluate(() => {
            document.body.style.minHeight = '3000px';
            window.scrollTo({ top: 720 });
            window.dispatchEvent(new Event('scroll'));
        });

        const backToTopButton = page.getByTestId('feed-back-to-top');
        await expect(backToTopButton).toBeVisible();
        await expect(backToTopButton).toHaveClass(/lg:right-\[22rem\]/);
    });

    test('does not render legacy focus hint and settings menu', async ({
        page,
    }) => {
        await expect(
            page.getByText(/Choose your feed mode|Got it/i),
        ).toHaveCount(0);
        await expect(page.locator('.settings-menu')).toHaveCount(0);
    });
});
