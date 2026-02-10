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
});
