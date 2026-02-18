import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

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
});
