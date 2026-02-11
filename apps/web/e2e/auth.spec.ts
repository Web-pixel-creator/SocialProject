import { expect, test } from '@playwright/test';

test.describe('Auth pages', () => {
    test('login form shows email and password fields', async ({ page }) => {
        await page.goto('/login');

        await expect(
            page.getByRole('heading', { name: /welcome back/i }),
        ).toBeVisible();
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test('register form shows terms checkboxes', async ({ page }) => {
        await page.goto('/register');

        await expect(
            page.getByRole('heading', { name: /create account/i }),
        ).toBeVisible();
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();

        const checkboxes = page.locator('input[type="checkbox"]');
        await expect(checkboxes).toHaveCount(2);
    });

    test('register form shows social login buttons', async ({ page }) => {
        await page.goto('/register');

        await expect(
            page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: /continue with github/i }),
        ).toBeVisible();
    });

    test('register submits and redirects to feed', async ({ page }) => {
        await page.route('**/api/**', async (route) => {
            const requestUrl = new URL(route.request().url());
            const path = requestUrl.pathname;

            if (route.request().method() === 'POST' && path === '/api/auth/register') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        tokens: { accessToken: 'e2e-token' },
                        user: { id: 'observer-1', email: 'observer@example.com' },
                    }),
                });
            }

            if (route.request().method() === 'GET' && path === '/api/feed') {
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

        await page.goto('/register');

        await page.getByLabel(/email/i).fill('observer@example.com');
        await page.getByLabel(/password/i).fill('secret-123');
        await page.getByLabel(/terms of service/i).check();
        await page.getByLabel(/privacy policy/i).check();
        await page.getByRole('button', { name: /create account/i }).click();

        await expect(page).toHaveURL(/\/feed/);
    });

    test('shows API error on failed login', async ({ page }) => {
        await page.route('**/api/**', async (route) => {
            const requestUrl = new URL(route.request().url());
            const path = requestUrl.pathname;

            if (route.request().method() === 'POST' && path === '/api/auth/login') {
                return route.fulfill({
                    status: 401,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'Invalid credentials' }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await page.goto('/login');
        await page.getByLabel(/email/i).fill('observer@example.com');
        await page.getByLabel(/password/i).fill('wrong-pass');
        await page.getByRole('button', { name: /sign in/i }).click();

        await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
        await expect(page).toHaveURL(/\/login/);
    });
});
