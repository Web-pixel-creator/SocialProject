import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const DRAFT_ID = 'draft-a11y-e2e';
const PR_ID = 'pr-a11y-e2e';
const COMMISSION_ID = 'commission-a11y-e2e';
const STUDIO_ID = 'studio-a11y-e2e';
const withJson = (body: unknown, status = 200) => ({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
});
const LEGAL_A11Y_ROUTES = [
    { heading: /Terms of Service/i, route: '/legal/terms' },
    { heading: /Privacy Policy/i, route: '/legal/privacy' },
    { heading: /Refund Policy/i, route: '/legal/refund' },
    { heading: /Content Policy/i, route: '/legal/content' },
];

const buildViolationMessage = (
    route: string,
    violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
) =>
    [
        `Accessibility violations for route: ${route}`,
        ...violations.map((violation) => {
            const targets = violation.nodes
                .map((node) => node.target.join(' > '))
                .slice(0, 3)
                .join(' | ');
            return `${violation.id}: ${violation.help} [${targets}]`;
        }),
    ].join('\n');

const assertNoSemanticA11yViolations = async (page: Page, route: string) => {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
        .disableRules(['color-contrast'])
        .analyze();

    expect(
        results.violations,
        buildViolationMessage(route, results.violations),
    ).toEqual([]);
};

const installStaticRouteA11yMocks = async (page: Page) => {
    await page.route('**/api/**', async (route) => {
        const requestUrl = new URL(route.request().url());
        const method = route.request().method();
        const path = requestUrl.pathname;

        if (method === 'GET' && path === '/api/auth/me') {
            return route.fulfill(
                withJson(
                    {
                        message: 'Sign in required',
                    },
                    401,
                ),
            );
        }

        if (method === 'GET' && path === '/api/commissions') {
            return route.fulfill(withJson([]));
        }

        if (method === 'GET' && path.startsWith('/api/account/exports/')) {
            return route.fulfill(
                withJson({
                    downloadUrl: null,
                    id: 'a11y-export',
                    status: 'pending',
                }),
            );
        }

        if (
            method === 'POST' &&
            (path === '/api/account/export' || path === '/api/account/delete')
        ) {
            return route.fulfill(withJson({ status: 'pending' }));
        }

        if (method === 'POST' && path === '/api/telemetry/ux') {
            return route.fulfill(withJson({ ok: true }));
        }

        return route.fulfill(withJson({}));
    });
};

const installDraftDetailA11yMocks = async (page: Page) => {
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
            return route.fulfill(withJson([]));
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

        if (method === 'POST' && path === '/api/telemetry/ux') {
            return route.fulfill(withJson({ ok: true }));
        }

        return route.fulfill(withJson({}));
    });
};

const installPullRequestA11yMocks = async (page: Page) => {
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
                        authorId: 'author-a11y',
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
                        addressedFixRequests: [],
                        description: 'Improve hierarchy and spacing.',
                        draftId: DRAFT_ID,
                        id: PR_ID,
                        makerId: 'maker-a11y',
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

        return route.fulfill(withJson({}));
    });
};

const installCommissionDetailA11yMocks = async (page: Page) => {
    await page.route('**/api/**', async (route) => {
        const requestUrl = new URL(route.request().url());
        const method = route.request().method();
        const path = requestUrl.pathname;

        if (method === 'GET' && path === `/api/commissions/${COMMISSION_ID}`) {
            return route.fulfill(
                withJson({
                    currency: 'USD',
                    description: 'Accessibility commission detail payload',
                    id: COMMISSION_ID,
                    paymentStatus: 'in_escrow',
                    responses: [
                        {
                            createdAt: '2026-02-18T10:00:00.000Z',
                            draftId: 'draft-a11y-response',
                            draftTitle: 'A11y response',
                            id: 'response-a11y',
                            studioId: STUDIO_ID,
                            studioName: 'A11y Studio',
                        },
                    ],
                    rewardAmount: 200,
                    status: 'pending',
                    winnerDraftId: 'draft-a11y-winner',
                }),
            );
        }

        if (method === 'POST' && path === '/api/telemetry/ux') {
            return route.fulfill(withJson({ ok: true }));
        }

        return route.fulfill(withJson({}));
    });
};

const installStudioDetailA11yMocks = async (page: Page) => {
    await page.route('**/api/**', async (route) => {
        const requestUrl = new URL(route.request().url());
        const method = route.request().method();
        const path = requestUrl.pathname;

        if (method === 'GET' && path === `/api/studios/${STUDIO_ID}`) {
            return route.fulfill(
                withJson({
                    id: STUDIO_ID,
                    personality: 'Accessibility-first reviewer',
                    studioName: 'Studio A11y',
                }),
            );
        }

        if (method === 'GET' && path === `/api/studios/${STUDIO_ID}/metrics`) {
            return route.fulfill(
                withJson({
                    impact: 33,
                    signal: 77,
                }),
            );
        }

        if (method === 'GET' && path === `/api/studios/${STUDIO_ID}/ledger`) {
            return route.fulfill(
                withJson([
                    {
                        description: 'Merged accessibility improvements',
                        draftId: DRAFT_ID,
                        draftTitle: 'A11y studio draft',
                        id: 'ledger-a11y-1',
                        impactDelta: 4,
                        kind: 'pr_merged',
                        occurredAt: '2026-02-18T11:00:00.000Z',
                        severity: 'minor',
                    },
                ]),
            );
        }

        if (method === 'POST' && path === '/api/telemetry/ux') {
            return route.fulfill(withJson({ ok: true }));
        }

        return route.fulfill(withJson({}));
    });
};

test.describe('Accessibility smoke', () => {
    test('feed page has no semantic accessibility violations', async ({
        page,
    }) => {
        await navigateWithRetry(page, '/feed');
        await expect(page.getByRole('heading', { name: /Feeds/i })).toBeVisible();
        await assertNoSemanticA11yViolations(page, '/feed');
    });

    test('search page has no semantic accessibility violations', async ({
        page,
    }) => {
        await navigateWithRetry(page, '/search');
        await expect(page.getByRole('heading', { name: /Search/i })).toBeVisible();
        await assertNoSemanticA11yViolations(page, '/search');
    });

    test('login page has no semantic accessibility violations', async ({
        page,
    }) => {
        await navigateWithRetry(page, '/login');
        await expect(
            page.getByRole('heading', { name: /welcome back/i }),
        ).toBeVisible();
        await assertNoSemanticA11yViolations(page, '/login');
    });

    test('draft detail page has no semantic accessibility violations', async ({
        page,
    }) => {
        await installDraftDetailA11yMocks(page);
        await navigateWithRetry(page, `/drafts/${DRAFT_ID}`);
        await expect(page.getByRole('heading', { name: new RegExp(DRAFT_ID, 'i') })).toBeVisible();
        await assertNoSemanticA11yViolations(page, `/drafts/${DRAFT_ID}`);
    });

    test('pull request review page has no semantic accessibility violations', async ({
        page,
    }) => {
        await installPullRequestA11yMocks(page);
        await navigateWithRetry(page, `/pull-requests/${PR_ID}`);
        await expect(page.getByRole('heading', { name: new RegExp(PR_ID, 'i') })).toBeVisible();
        await assertNoSemanticA11yViolations(page, `/pull-requests/${PR_ID}`);
    });

    test('privacy page has no semantic accessibility violations', async ({
        page,
    }) => {
        await installStaticRouteA11yMocks(page);
        await navigateWithRetry(page, '/privacy');
        await expect(
            page.getByRole('heading', { name: /Privacy & Data/i }),
        ).toBeVisible();
        await assertNoSemanticA11yViolations(page, '/privacy');
    });

    test('commissions page has no semantic accessibility violations', async ({
        page,
    }) => {
        await installStaticRouteA11yMocks(page);
        await navigateWithRetry(page, '/commissions');
        await expect(
            page.getByRole('heading', { name: /Commissions/i }),
        ).toBeVisible();
        await assertNoSemanticA11yViolations(page, '/commissions');
    });

    test('studio onboarding page has no semantic accessibility violations', async ({
        page,
    }) => {
        await installStaticRouteA11yMocks(page);
        await navigateWithRetry(page, '/studios/onboarding');
        await expect(
            page.getByRole('heading', { name: /Set up your AI studio/i }),
        ).toBeVisible();
        await assertNoSemanticA11yViolations(page, '/studios/onboarding');
    });

    test('legal pages have no semantic accessibility violations', async ({
        page,
    }) => {
        await installStaticRouteA11yMocks(page);
        for (const { heading, route } of LEGAL_A11Y_ROUTES) {
            await navigateWithRetry(page, route);
            await expect(page.getByRole('heading', { name: heading })).toBeVisible();
            await assertNoSemanticA11yViolations(page, route);
        }
    });

    test('register page has no semantic accessibility violations', async ({
        page,
    }) => {
        await navigateWithRetry(page, '/register');
        await expect(
            page.getByRole('heading', { name: /create account/i }),
        ).toBeVisible();
        await assertNoSemanticA11yViolations(page, '/register');
    });

    test('demo page has no semantic accessibility violations', async ({
        page,
    }) => {
        await navigateWithRetry(page, '/demo');
        await expect(page.locator('main h1').first()).toBeVisible();
        await assertNoSemanticA11yViolations(page, '/demo');
    });

    test('commission detail page has no semantic accessibility violations', async ({
        page,
    }) => {
        await installCommissionDetailA11yMocks(page);
        await navigateWithRetry(page, `/commissions/${COMMISSION_ID}`);
        await expect(
            page.getByRole('heading', { name: new RegExp(COMMISSION_ID, 'i') }),
        ).toBeVisible();
        await assertNoSemanticA11yViolations(page, `/commissions/${COMMISSION_ID}`);
    });

    test('studio detail page has no semantic accessibility violations', async ({
        page,
    }) => {
        await installStudioDetailA11yMocks(page);
        await navigateWithRetry(page, `/studios/${STUDIO_ID}`);
        await expect(
            page.getByRole('heading', { name: /Studio A11y/i }),
        ).toBeVisible();
        await assertNoSemanticA11yViolations(page, `/studios/${STUDIO_ID}`);
    });

    test('admin ux page has no semantic accessibility violations', async ({
        page,
    }) => {
        await navigateWithRetry(page, '/admin/ux');
        await expect(
            page.getByRole('heading', { name: /Admin UX Metrics/i }),
        ).toBeVisible();
        await assertNoSemanticA11yViolations(page, '/admin/ux');
    });
});
